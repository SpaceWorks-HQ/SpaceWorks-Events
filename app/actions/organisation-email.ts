"use server";

import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { getMembership } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { ORG_SMTP_PASSWORD_SLOT, organisationTransport } from "@/lib/email/transporter";
import { PrivateAddressError } from "@/lib/net/publicAddress";
import { noticeEach } from "@/lib/notices";
import { encryptOrgSecret } from "@/lib/orgSecrets";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const email = z.string().trim().toLowerCase().max(254).email();
/** Blank means "none" for optional text, and "keep the stored value" for the password. */
const blank = <T extends z.ZodTypeAny>(schema: T) => z.preprocess((value) => (typeof value === "string" && value.trim() === "" ? undefined : value), schema.optional());
const HOST = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i;

const saveSchema = z.object({
  organisationSlug: z.string().trim().min(1).max(120),
  fromName: blank(z.string().trim().max(100).refine((value) => !/[\r\n<>"]/.test(value), { message: "The sender name can't contain line breaks, quotes or angle brackets." })),
  replyTo: blank(email),
  useOwnServer: z.boolean(),
  fromAddress: blank(email),
  smtpHost: blank(z.string().trim().toLowerCase().regex(HOST, "Enter the mail server's host name, for example smtp.example.com.")),
  smtpPort: z.coerce.number().int().refine((port) => [25, 465, 587, 2525].includes(port), { message: "Use port 587, 465, 2525 or 25." }).optional(),
  smtpSecure: z.boolean().optional(),
  smtpUser: blank(z.string().trim().max(254)),
  smtpPassword: blank(z.string().max(512)),
}).strict();
const slugSchema = z.object({ organisationSlug: z.string().trim().min(1).max(120) }).strict();

type OwnerAccess = { error: string; } | { userId: string; email: string | null; organisation: { id: string; slug: string; }; };

/** Email settings are the owner's, like payments, after a fresh sign-in for any change. */
async function requireOwner(organisationSlug: string): Promise<OwnerAccess> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };
  const organisation = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true } });
  if (!organisation) return { error: "Organisation not found." };
  const membership = await getMembership(session.user.id, organisation.id);
  if (membership?.role !== "OWNER") return { error: "Only the organisation owner can manage email settings." };
  if (!(await hasRecentAuthentication())) return { error: "For security, sign in again before changing email settings." };
  if (await isActionRateLimited("paymentSettings", session.user.id)) return { error: "Too many changes. Try again later." };
  const user = await prisma.user.findUnique({ where: { id: session.user.id }, select: { email: true } });
  return { userId: session.user.id, email: user?.email ?? null, organisation };
}

/** Connect and log in to the server as saved; never sends anything. */
async function checkServer(organisationId: string) {
  const row = await prisma.organisationEmailSettings.findUnique({ where: { organisationId } });
  if (!row?.smtpHost || !row.smtpPort) return "Enter the server's host and port first.";
  try {
    const transporter = await organisationTransport({ organisationId, host: row.smtpHost, port: row.smtpPort, secure: row.smtpSecure, user: row.smtpUser, passwordEncrypted: row.smtpPasswordEncrypted });
    await transporter.verify();
    transporter.close();
    return null;
  } catch (error) {
    if (error instanceof PrivateAddressError) return error.message;
    // Never echo the server's reply: it can contain the username or internal details.
    return "Couldn't connect and sign in to that server. Check the host, port, security setting, username and password.";
  }
}

export async function saveOrganisationEmail(input: unknown): Promise<ActionResult> {
  const parsed = saveSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Check the email settings." };
  const access = await requireOwner(parsed.data.organisationSlug);
  if ("error" in access) return { ok: false, error: access.error };
  const organisationId = access.organisation.id;
  const data = parsed.data;
  const existing = await prisma.organisationEmailSettings.findUnique({ where: { organisationId } });

  const server = {
    fromAddress: data.fromAddress ?? null,
    smtpHost: data.smtpHost ?? null,
    smtpPort: data.smtpPort ?? null,
    smtpSecure: data.smtpPort === 465 ? true : (data.smtpSecure ?? false),
    smtpUser: data.smtpUser ?? null,
  };
  const serverChanged = !existing || data.smtpPassword !== undefined
    || (Object.keys(server) as Array<keyof typeof server>).some((key) => existing[key] !== server[key]);
  if (data.useOwnServer && (!server.fromAddress || !server.smtpHost || !server.smtpPort)) {
    return { ok: false, error: "Enter the sending address, server host and port to use your own server." };
  }
  const values = {
    fromName: data.fromName ?? null,
    replyTo: data.replyTo ?? null,
    ...server,
    ...(data.smtpPassword !== undefined ? { smtpPasswordEncrypted: encryptOrgSecret(organisationId, ORG_SMTP_PASSWORD_SLOT, data.smtpPassword) } : {}),
    // Changed server details must pass a new test before mail goes through them.
    ...(serverChanged ? { verifiedAt: null } : {}),
    useOwnServer: false,
  };
  await prisma.organisationEmailSettings.upsert({ where: { organisationId }, create: { organisationId, ...values }, update: values });

  let useOwnServer = false;
  if (data.useOwnServer) {
    const verified = !serverChanged && existing?.verifiedAt ? null : await checkServer(organisationId);
    if (verified) {
      revalidatePath(`/dashboard/${access.organisation.slug}/settings/email`);
      return { ok: false, error: `Saved, but email still goes through the platform: ${verified}` };
    }
    await prisma.organisationEmailSettings.update({ where: { organisationId }, data: { useOwnServer: true, verifiedAt: existing?.verifiedAt && !serverChanged ? existing.verifiedAt : new Date() } });
    useOwnServer = true;
  }
  await recordAuditEvent({
    action: "EMAIL_SETTINGS_UPDATED", actorUserId: access.userId, organisationId, targetType: "Organisation", targetId: organisationId,
    metadata: { useOwnServer, serverChanged, passwordChanged: data.smtpPassword !== undefined },
  });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/email`);
  revalidatePath(`/dashboard/${access.organisation.slug}/settings`);
  return { ok: true };
}

/** Queue a test email to the owner, sent exactly as the organisation's event email is. */
export async function sendOrganisationTestEmail(input: unknown): Promise<ActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an organisation." };
  const access = await requireOwner(parsed.data.organisationSlug);
  if ("error" in access) return { ok: false, error: access.error };
  if (!access.email) return { ok: false, error: "Your account has no email address to send the test to." };
  await noticeEach(prisma, [access.email], {
    organisationId: access.organisation.id,
    subject: "Test email from your organisation",
    lines: ["This is how your guests receive email from you: tickets, reminders and updates.", "Check the sender's name, and reply to it to check where replies go."],
  });
  return { ok: true };
}

/** Back to the platform server; the saved details are kept for later. */
export async function stopOwnEmailServer(input: unknown): Promise<ActionResult> {
  const parsed = slugSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose an organisation." };
  const access = await requireOwner(parsed.data.organisationSlug);
  if ("error" in access) return { ok: false, error: access.error };
  await prisma.organisationEmailSettings.updateMany({ where: { organisationId: access.organisation.id }, data: { useOwnServer: false } });
  await recordAuditEvent({ action: "EMAIL_SETTINGS_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "Organisation", targetId: access.organisation.id, metadata: { useOwnServer: false } });
  revalidatePath(`/dashboard/${access.organisation.slug}/settings/email`);
  return { ok: true };
}

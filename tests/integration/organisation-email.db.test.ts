import { randomUUID } from "node:crypto";
import { EventStatus, MembershipRole } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const identity = vi.hoisted(() => ({ id: "" }));
const mail = vi.hoisted(() => ({ transports: [] as Array<Record<string, unknown>>, sent: [] as Array<Record<string, unknown>>, verify: vi.fn() }));
vi.mock("@/lib/auth", () => ({ auth: async () => (identity.id ? { user: { id: identity.id } } : null) }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: async () => false }));
vi.mock("@/lib/reauth", () => ({ hasRecentAuthentication: async () => true }));
vi.mock("next/cache", () => ({ revalidatePath: () => undefined, revalidateTag: () => undefined, updateTag: () => undefined }));
// No real DNS in tests: the organisation's host "resolves" to a public documentation address.
vi.mock("@/lib/net/publicAddress", () => ({ resolvePublicAddress: async () => "203.0.113.10", PrivateAddressError: class extends Error {} }));
vi.mock("nodemailer", () => ({
  default: {
    createTransport: (options: Record<string, unknown>) => {
      mail.transports.push(options);
      return {
        sendMail: async (message: Record<string, unknown>) => {
          mail.sent.push({ ...message, via: options.host ?? options.service });
          return { accepted: [message.to], rejected: [], messageId: "<x@test>" };
        },
        verify: mail.verify,
        close: () => undefined,
      };
    },
  },
}));

import { saveOrganisationEmail } from "@/app/actions/organisation-email";
import { prisma } from "@/lib/db";
import { deliverOutboxBatch, enqueuePasswordReset, enqueueRsvpConfirmation } from "@/lib/outbox";

const suffix = randomUUID().replace(/-/g, "").slice(0, 12);
const organisationSlug = `mailers-${suffix}`;
let owner = "";
let organisationId = "";
let checkInToken = "";

async function deliverTo(to: string) {
  // Other suites can leave older mail queued: put this test's first in line.
  await prisma.outboxMessage.updateMany({ where: { status: "PENDING", payload: { path: ["to"], equals: to } }, data: { createdAt: new Date(0) } });
  await deliverOutboxBatch(5);
  return mail.sent.filter((message) => message.to === to);
}

beforeAll(async () => {
  vi.stubEnv("MFA_ENCRYPTION_KEY", process.env.MFA_ENCRYPTION_KEY || Buffer.alloc(32, 7).toString("base64"));
  vi.stubEnv("SMTP_HOST", "smtp.platform.test");
  vi.stubEnv("EMAIL_FROM", "Space Works Events <noreply@platform.test>");
  owner = (await prisma.user.create({ data: { name: "Owner", email: `owner-${suffix}@example.test`, emailVerified: new Date() } })).id;
  organisationId = (await prisma.organisation.create({ data: { name: "Mail Makers", slug: organisationSlug } })).id;
  await prisma.membership.create({ data: { userId: owner, organisationId, role: MembershipRole.OWNER } });
  const event = await prisma.event.create({ data: {
    organisationId, title: "Mail night", slug: `mail-${suffix}`, timezone: "UTC", status: EventStatus.PUBLISHED,
    startDateTime: new Date(Date.now() + 86_400_000 * 5), endDateTime: new Date(Date.now() + 86_400_000 * 5 + 3_600_000),
  } });
  checkInToken = (await prisma.rSVP.create({ data: { eventId: event.id, guestEmail: `guest-${suffix}@example.test`, attendeeKey: `guest:guest-${suffix}@example.test` } })).checkInToken;
});

beforeEach(() => {
  mail.sent.length = 0;
  mail.transports.length = 0;
  mail.verify.mockReset();
});

afterAll(async () => {
  vi.unstubAllEnvs();
  identity.id = "";
  await prisma.outboxMessage.deleteMany({ where: { payload: { path: ["to"], string_contains: suffix } } });
  await prisma.organisation.deleteMany({ where: { id: organisationId } });
  await prisma.user.deleteMany({ where: { id: owner } });
});

describe("organisation email", () => {
  it("sends a guest's ticket under the organisation's name and reply-to, through the platform server", async () => {
    identity.id = owner;
    expect(await saveOrganisationEmail({ organisationSlug, fromName: "Mail Makers Team", replyTo: `hello-${suffix}@example.test`, useOwnServer: false })).toEqual({ ok: true });
    await enqueueRsvpConfirmation(prisma, { to: `guest-${suffix}@example.test`, eventTitle: "Mail night", status: "CONFIRMED", checkInToken });
    const [message] = await deliverTo(`guest-${suffix}@example.test`);
    expect(message).toMatchObject({ from: { name: "Mail Makers Team", address: "noreply@platform.test" }, replyTo: `hello-${suffix}@example.test`, via: "smtp.platform.test" });
  });

  it("always sends password resets from the platform, whatever the organisation set", async () => {
    await enqueuePasswordReset(prisma, { to: `owner-${suffix}@example.test`, resetUrl: "http://localhost:3000/reset-password?token=x", expiresAt: new Date(Date.now() + 3_600_000).toISOString() });
    const [message] = await deliverTo(`owner-${suffix}@example.test`);
    expect(message).toMatchObject({ from: "Space Works Events <noreply@platform.test>", via: "smtp.platform.test" });
    expect(message).not.toHaveProperty("replyTo");
  });

  it("turns the own server on only after it connects, then sends the organisation's email through it", async () => {
    identity.id = owner;
    const server = { organisationSlug, fromName: "", replyTo: "", useOwnServer: true, fromAddress: `events-${suffix}@example.test`, smtpHost: "mail.example.org", smtpPort: 587, smtpUser: "events", smtpPassword: "app-password" };
    mail.verify.mockRejectedValueOnce(new Error("535 auth failed for events"));
    const refused = await saveOrganisationEmail({ ...server, smtpHost: "smtp.example.com" });
    expect(refused).toMatchObject({ ok: false });
    expect(JSON.stringify(refused)).not.toContain("535");
    expect((await prisma.organisationEmailSettings.findUniqueOrThrow({ where: { organisationId } })).useOwnServer).toBe(false);

    mail.verify.mockResolvedValueOnce(true);
    expect(await saveOrganisationEmail(server)).toEqual({ ok: true });
    const saved = await prisma.organisationEmailSettings.findUniqueOrThrow({ where: { organisationId } });
    expect(saved).toMatchObject({ useOwnServer: true, smtpHost: "mail.example.org" });
    expect(saved.smtpPasswordEncrypted).not.toContain("app-password");

    await enqueueRsvpConfirmation(prisma, { to: `guest-${suffix}@example.test`, eventTitle: "Mail night", status: "CONFIRMED", checkInToken });
    const [message] = await deliverTo(`guest-${suffix}@example.test`);
    expect(message).toMatchObject({ from: { name: "Mail Makers", address: `events-${suffix}@example.test` } });
    const own = mail.transports.find((options) => (options.tls as { servername?: string; } | undefined)?.servername === "mail.example.org");
    // Connected by the checked public address, with TLS checked against the host name.
    expect(own).toMatchObject({ host: "203.0.113.10", port: 587, auth: { user: "events", pass: "app-password" } });
  });

  it("refuses anyone but the owner", async () => {
    const member = (await prisma.user.create({ data: { name: "Member", email: `member-${suffix}@example.test`, emailVerified: new Date() } })).id;
    await prisma.membership.create({ data: { userId: member, organisationId, role: MembershipRole.ADMIN } });
    identity.id = member;
    expect(await saveOrganisationEmail({ organisationSlug, useOwnServer: false })).toMatchObject({ ok: false, error: expect.stringContaining("owner") });
    identity.id = "";
    await prisma.user.delete({ where: { id: member } });
  });
});

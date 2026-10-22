"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath as nextRevalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { recordAuditEvent } from "@/lib/audit";
import { isActionRateLimited } from "@/lib/actionRateLimit";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { getMembership, hasRoleAtLeast } from "@/lib/permissions";
import { hasRecentAuthentication } from "@/lib/reauth";
import { encryptOrgSecret } from "@/lib/orgSecrets";
import { parseChatConfig } from "@/lib/chat/config";
import { CHAT_EVENTS, CHAT_KINDS, type ChatKind } from "@/lib/chat/events";
import { chatSecretSlot, loadChatChannel } from "@/lib/chat/notify";
import { ChatDeliveryError, sendChatMessage } from "@/lib/chat/send";
import { PrivateAddressError } from "@/lib/net/publicAddress";
import type { ActionResult } from "./org";

const revalidatePath = trackedRevalidation(nextRevalidatePath);

const slug = z.string().trim().min(1).max(120);
const channelId = z.string().trim().regex(/^[a-z0-9]{10,40}$/);
const events = z.array(z.enum(CHAT_EVENTS)).max(CHAT_EVENTS.length).transform((list) => [...new Set(list)]);
const addSchema = z.object({ organisationSlug: slug, kind: z.enum(CHAT_KINDS), name: z.string().trim().min(1).max(80), config: z.unknown(), events }).strict();
const updateSchema = z.object({ organisationSlug: slug, channelId, events: events.optional(), enabled: z.boolean().optional() }).strict();
const idSchema = z.object({ organisationSlug: slug, channelId }).strict();

type Access = { error: string; } | { userId: string; organisation: { id: string; slug: string; name: string; }; };

/** Owners and admins manage chat channels; a fresh sign-in for anything that stores or sends a secret. */
async function requireAdmin(organisationSlug: string, options: { recentSignIn: boolean; }): Promise<Access> {
  const session = await auth();
  if (!session?.user?.id) return { error: "You must be signed in." };
  const organisation = await prisma.organisation.findUnique({ where: { slug: organisationSlug }, select: { id: true, slug: true, name: true } });
  if (!organisation) return { error: "Organisation not found." };
  const membership = await getMembership(session.user.id, organisation.id);
  if (!membership || !hasRoleAtLeast(membership.role, "ADMIN")) return { error: "Only owners and admins can manage chat notifications." };
  if (options.recentSignIn && !(await hasRecentAuthentication())) return { error: "For security, sign in again before connecting a chat." };
  if (await isActionRateLimited("paymentSettings", session.user.id)) return { error: "Too many changes. Try again later." };
  return { userId: session.user.id, organisation };
}

const refresh = (orgSlug: string) => revalidatePath(`/dashboard/${orgSlug}/settings/chat`);

export async function addChatChannel(input: unknown): Promise<ActionResult<{ id: string; }>> {
  const parsed = addSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a chat app, a name and what it should hear about." };
  const config = parseChatConfig(parsed.data.kind as ChatKind, parsed.data.config);
  if (!config.ok) return { ok: false, error: config.error };
  const access = await requireAdmin(parsed.data.organisationSlug, { recentSignIn: true });
  if ("error" in access) return { ok: false, error: access.error };
  if ((await prisma.chatChannel.count({ where: { organisationId: access.organisation.id } })) >= 20) return { ok: false, error: "An organisation can connect up to 20 chats." };
  // The id is chosen first: the secret is bound to it.
  const id = `c${randomBytes(12).toString("hex")}`;
  await prisma.chatChannel.create({
    data: {
      id, organisationId: access.organisation.id, kind: parsed.data.kind, name: parsed.data.name, events: parsed.data.events,
      secretEncrypted: encryptOrgSecret(access.organisation.id, chatSecretSlot(id), JSON.stringify(config.config)),
    },
  });
  await recordAuditEvent({ action: "CHAT_CHANNEL_ADDED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "ChatChannel", targetId: id, metadata: { kind: parsed.data.kind } });
  refresh(access.organisation.slug);
  return { ok: true, data: { id } };
}

export async function updateChatChannel(input: unknown): Promise<ActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Check the chat settings." };
  const access = await requireAdmin(parsed.data.organisationSlug, { recentSignIn: false });
  if ("error" in access) return { ok: false, error: access.error };
  const { count } = await prisma.chatChannel.updateMany({
    where: { id: parsed.data.channelId, organisationId: access.organisation.id },
    data: { ...(parsed.data.events ? { events: parsed.data.events } : {}), ...(parsed.data.enabled !== undefined ? { enabled: parsed.data.enabled } : {}) },
  });
  if (count === 0) return { ok: false, error: "That chat was removed." };
  await recordAuditEvent({ action: "CHAT_CHANNEL_UPDATED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "ChatChannel", targetId: parsed.data.channelId, metadata: { enabled: parsed.data.enabled ?? null } });
  refresh(access.organisation.slug);
  return { ok: true };
}

export async function removeChatChannel(input: unknown): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a chat to remove." };
  const access = await requireAdmin(parsed.data.organisationSlug, { recentSignIn: false });
  if ("error" in access) return { ok: false, error: access.error };
  await prisma.chatChannel.deleteMany({ where: { id: parsed.data.channelId, organisationId: access.organisation.id } });
  await recordAuditEvent({ action: "CHAT_CHANNEL_REMOVED", actorUserId: access.userId, organisationId: access.organisation.id, targetType: "ChatChannel", targetId: parsed.data.channelId });
  refresh(access.organisation.slug);
  return { ok: true };
}

/** Send a test message now, so the person setting it up sees whether it works. */
export async function testChatChannel(input: unknown): Promise<ActionResult> {
  const parsed = idSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a chat to test." };
  const access = await requireAdmin(parsed.data.organisationSlug, { recentSignIn: true });
  if ("error" in access) return { ok: false, error: access.error };
  const channel = await loadChatChannel(parsed.data.channelId, access.organisation.id);
  if (!channel) return { ok: false, error: "That chat is switched off or was removed." };
  try {
    await sendChatMessage(channel.kind, channel.config, `Test from Space Works Events: ${access.organisation.name}'s notifications will appear here.`);
  } catch (error) {
    if (error instanceof PrivateAddressError) return { ok: false, error: error.message };
    // Never echo the service's reply: it can contain the token or internal details.
    return { ok: false, error: error instanceof ChatDeliveryError && error.permanent ? "The chat service refused the message. Check the webhook address or token, and that the bot can post there." : "Couldn't reach the chat service. Try again in a minute." };
  }
  await prisma.chatChannel.updateMany({ where: { id: channel.id }, data: { lastDeliveredAt: new Date() } });
  return { ok: true };
}

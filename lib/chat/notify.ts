import "server-only";

import type { ChatChannelKind, Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { decryptOrgSecret } from "@/lib/orgSecrets";
import { parseChatConfig, type ChatConfig } from "./config";
import type { ChatEvent, ChatKind } from "./events";

type Client = Prisma.TransactionClient | typeof prisma;

export const CHAT_MESSAGE_KIND = "chat-message";
export const chatSecretSlot = (channelId: string) => `ChatChannel.${channelId}`;

/**
 * Queue a notification to every enabled channel of the organisation that
 * listens for `event`. It goes out with the outbox, in the caller's
 * transaction, so it's sent only if the change it describes was saved.
 */
export async function notifyChat(client: Client, organisationId: string, event: ChatEvent, text: string) {
  const channels = await client.chatChannel.findMany({
    where: { organisationId, enabled: true, events: { has: event } },
    select: { id: true },
  });
  if (channels.length === 0) return 0;
  await client.outboxMessage.createMany({
    data: channels.map((channel) => ({ kind: CHAT_MESSAGE_KIND, payload: { channelId: channel.id, organisationId, text: text.slice(0, 1500) } })),
  });
  return channels.length;
}

/** For callers that know the event or series date but not its organisation and title. */
export async function notifyChatAbout(client: Client, target: { eventId: string; } | { eventInstanceId: string; }, event: ChatEvent, text: (title: string) => string) {
  const owner = "eventId" in target
    ? await client.event.findUnique({ where: { id: target.eventId }, select: { title: true, organisationId: true } })
    : await client.eventInstance.findUnique({ where: { id: target.eventInstanceId }, select: { series: { select: { title: true, organisationId: true } } } }).then((date) => date?.series ?? null);
  if (!owner) return 0;
  return notifyChat(client, owner.organisationId, event, text(owner.title));
}

/** The channel's decrypted settings, for sending. Null when it's gone, off, or no longer valid. */
export async function loadChatChannel(channelId: string, organisationId: string) {
  const channel = await prisma.chatChannel.findFirst({ where: { id: channelId, organisationId }, select: { id: true, kind: true, enabled: true, secretEncrypted: true } });
  if (!channel?.enabled) return null;
  let raw: unknown;
  try {
    raw = JSON.parse(decryptOrgSecret(organisationId, chatSecretSlot(channel.id), channel.secretEncrypted));
  } catch {
    return null;
  }
  const parsed = parseChatConfig(channel.kind as ChatKind, raw);
  return parsed.ok ? { id: channel.id, kind: channel.kind as ChatChannelKind & ChatKind, config: parsed.config as ChatConfig[ChatKind] } : null;
}

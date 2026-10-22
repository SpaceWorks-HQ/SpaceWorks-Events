import "server-only";

import { prisma } from "@/lib/db";
import { ChatDeliveryError, sendChatMessage } from "./send";
import { loadChatChannel } from "./notify";

export type ChatMessagePayload = { channelId: string; organisationId: string; text: string; };

export function asChatMessagePayload(value: unknown): ChatMessagePayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const p = value as Record<string, unknown>;
  const id = (v: unknown) => typeof v === "string" && /^[a-z0-9]{10,40}$/.test(v);
  return id(p.channelId) && id(p.organisationId) && typeof p.text === "string" && p.text.length > 0 && p.text.length <= 1500
    ? { channelId: p.channelId as string, organisationId: p.organisationId as string, text: p.text }
    : null;
}

/**
 * Send one queued chat message. "dropped" when the channel was removed or
 * switched off meanwhile. A refusal that retrying can't fix (a deleted
 * webhook, a wrong token) is thrown as permanent so the outbox gives up.
 */
export async function deliverChatMessage(payload: ChatMessagePayload): Promise<"sent" | "dropped" | "permanent"> {
  const channel = await loadChatChannel(payload.channelId, payload.organisationId);
  if (!channel) return "dropped";
  try {
    await sendChatMessage(channel.kind, channel.config, payload.text);
  } catch (error) {
    await prisma.chatChannel.updateMany({ where: { id: channel.id }, data: { lastFailedAt: new Date() } });
    if (error instanceof ChatDeliveryError && error.permanent) return "permanent";
    throw error instanceof ChatDeliveryError ? error : new ChatDeliveryError("Couldn't reach the chat service.", false);
  }
  await prisma.chatChannel.updateMany({ where: { id: channel.id }, data: { lastDeliveredAt: new Date() } });
  return "sent";
}

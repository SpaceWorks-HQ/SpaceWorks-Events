import { prisma } from "@/lib/db";
import { requireOrgRole } from "@/lib/permissions";
import { decryptOrgSecret } from "@/lib/orgSecrets";
import { describeChatTarget, parseChatConfig } from "@/lib/chat/config";
import type { ChatEvent, ChatKind } from "@/lib/chat/events";
import { chatSecretSlot } from "@/lib/chat/notify";

export type ChatChannelView = {
  id: string;
  kind: ChatKind;
  name: string;
  /** Where it posts, without the secret part: a host, a chat id or the last digits of numbers. */
  target: string;
  events: ChatEvent[];
  enabled: boolean;
  lastDeliveredAt: string | null;
  lastFailedAt: string | null;
};

/** Owners and admins. Webhook paths and tokens never leave the server. */
export async function loadChatSettingsView({ params }: { params: Promise<{ orgSlug: string; }>; }) {
  const { orgSlug } = await params;
  const { organisation } = await requireOrgRole(orgSlug, "ADMIN");
  const rows = await prisma.chatChannel.findMany({ where: { organisationId: organisation.id }, orderBy: { createdAt: "asc" } });
  const channels: ChatChannelView[] = rows.map((row) => {
    let target = "Connection details can't be read; remove and add it again.";
    try {
      const parsed = parseChatConfig(row.kind as ChatKind, JSON.parse(decryptOrgSecret(organisation.id, chatSecretSlot(row.id), row.secretEncrypted)));
      if (parsed.ok) target = describeChatTarget(row.kind as ChatKind, parsed.config);
    } catch {
      // Left as the message above.
    }
    return {
      id: row.id, kind: row.kind as ChatKind, name: row.name, target, events: row.events as ChatEvent[], enabled: row.enabled,
      lastDeliveredAt: row.lastDeliveredAt?.toISOString() ?? null, lastFailedAt: row.lastFailedAt?.toISOString() ?? null,
    };
  });
  return { organisation: { slug: organisation.slug, name: organisation.name }, channels };
}

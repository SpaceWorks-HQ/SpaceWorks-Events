import { z } from "zod";
import type { ChatKind } from "./events";

/**
 * What each kind of channel needs, checked before it is saved (and again
 * before every send). Webhook addresses are fixed hosts for Slack and
 * Discord; Mattermost is self-hosted, so its host is checked to be public
 * when it is used (lib/chat/send.ts).
 */
const https = (pattern: RegExp, message: string) => z.string().trim().max(500).url().regex(pattern, message);

export const chatConfigSchemas = {
  SLACK: z.object({
    url: https(/^https:\/\/hooks\.slack\.com\/(services|workflows|triggers)\/[A-Za-z0-9/_-]+$/, "Paste the incoming webhook address from Slack (https://hooks.slack.com/…)."),
  }).strict(),
  DISCORD: z.object({
    url: https(/^https:\/\/(discord|discordapp)\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/, "Paste the webhook address from the Discord channel's Integrations settings."),
  }).strict(),
  MATTERMOST: z.object({
    url: https(/^https:\/\/[a-z0-9.-]+(:\d{2,5})?\/hooks\/[A-Za-z0-9]+$/i, "Paste the incoming webhook address from Mattermost (https://your-server/hooks/…)."),
  }).strict(),
  TELEGRAM: z.object({
    token: z.string().trim().regex(/^\d{5,15}:[A-Za-z0-9_-]{30,64}$/, "Paste the bot token from @BotFather."),
    chatId: z.string().trim().regex(/^(-?\d{1,20}|@[A-Za-z0-9_]{5,32})$/, "Enter the chat id (a number, negative for groups) or @channelname."),
  }).strict(),
  WHATSAPP: z.object({
    phoneNumberId: z.string().trim().regex(/^\d{6,20}$/, "Enter the phone number ID from WhatsApp Manager (API setup)."),
    token: z.string().trim().min(20).max(1024),
    to: z.array(z.string().trim().regex(/^\+?\d{8,15}$/, "Enter numbers in international form, for example +919876543210.")).min(1).max(5),
    /** Business-initiated messages need an approved template with one body variable. */
    template: z.string().trim().regex(/^[a-z0-9_]{1,512}$/, "Template names use lower-case letters, digits and underscores.").optional(),
    language: z.string().trim().regex(/^[a-z]{2}(_[A-Z]{2})?$/).optional(),
  }).strict(),
} satisfies Record<ChatKind, z.ZodTypeAny>;

export type ChatConfig = {
  SLACK: z.infer<typeof chatConfigSchemas.SLACK>;
  DISCORD: z.infer<typeof chatConfigSchemas.DISCORD>;
  MATTERMOST: z.infer<typeof chatConfigSchemas.MATTERMOST>;
  TELEGRAM: z.infer<typeof chatConfigSchemas.TELEGRAM>;
  WHATSAPP: z.infer<typeof chatConfigSchemas.WHATSAPP>;
};

export function parseChatConfig<K extends ChatKind>(kind: K, value: unknown): { ok: true; config: ChatConfig[K]; } | { ok: false; error: string; } {
  const parsed = chatConfigSchemas[kind].safeParse(value);
  return parsed.success ? { ok: true, config: parsed.data as ChatConfig[K] } : { ok: false, error: parsed.error.issues[0]?.message ?? "Check the connection details." };
}

/** Where a channel posts, safe to show again: the host only, never the secret path or token. */
export function describeChatTarget(kind: ChatKind, config: ChatConfig[ChatKind]) {
  if ("url" in config) return new URL(config.url).host;
  if (kind === "TELEGRAM") return `chat ${(config as ChatConfig["TELEGRAM"]).chatId}`;
  const numbers = (config as ChatConfig["WHATSAPP"]).to;
  return numbers.map((number) => `…${number.slice(-4)}`).join(", ");
}

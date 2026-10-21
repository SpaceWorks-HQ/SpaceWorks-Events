"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus } from "lucide-react";
import { addChatChannel } from "@/app/actions/chat-channels";
import { Button } from "@/components/ui/button";
import { Callout, Card } from "@/components/ui/display";
import { Dropdown, Field, Input, PasswordInput } from "@/components/ui/field";
import { CHAT_EVENTS, CHAT_KIND_LABELS, CHAT_KINDS, type ChatEvent, type ChatKind } from "@/lib/chat/events";
import { ChatEventsPicker } from "./ChatEventsPicker";

const HELP: Record<ChatKind, string> = {
  SLACK: "In Slack: Apps → Incoming Webhooks → Add to a channel, then copy the webhook URL.",
  DISCORD: "In Discord: the channel's settings → Integrations → Webhooks → New Webhook → Copy Webhook URL.",
  MATTERMOST: "In Mattermost: Integrations → Incoming Webhooks → Add, then copy its URL. Your server must be reachable on the internet.",
  TELEGRAM: "Create a bot with @BotFather and copy its token. Add the bot to your group, then use the group's chat id (or @channelname for a channel where the bot is an admin).",
  WHATSAPP: "In Meta's WhatsApp Manager: API setup gives the phone number ID and a permanent access token. Messages outside a 24-hour conversation need an approved template with one body variable.",
};

export function AddChatChannelForm({ organisationSlug }: { organisationSlug: string; }) {
  const router = useRouter();
  const [kind, setKind] = useState<ChatKind>("SLACK");
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [phoneNumberId, setPhoneNumberId] = useState("");
  const [numbers, setNumbers] = useState("");
  const [template, setTemplate] = useState("");
  const [events, setEvents] = useState<ChatEvent[]>([...CHAT_EVENTS]);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string; } | null>(null);
  const [pending, startTransition] = useTransition();

  function config() {
    if (kind === "TELEGRAM") return { token, chatId };
    if (kind === "WHATSAPP") return { phoneNumberId, token, to: numbers.split(/[\s,]+/).filter(Boolean), ...(template.trim() ? { template: template.trim(), language: "en" } : {}) };
    return { url };
  }

  function add() {
    startTransition(async () => {
      setNotice(null);
      const result = await addChatChannel({ organisationSlug, kind, name: name.trim() || CHAT_KIND_LABELS[kind], config: config(), events });
      if (!result.ok) {
        setNotice({ tone: "danger", text: result.error });
        return;
      }
      setUrl(""); setToken(""); setChatId(""); setPhoneNumberId(""); setNumbers(""); setTemplate(""); setName("");
      setNotice({ tone: "success", text: "Connected. Send a test from the list above to check it." });
      router.refresh();
    });
  }

  return (
    <Card as="section" aria-labelledby="add-chat-title" className="flex flex-col gap-5 rounded-xl">
      <h2 id="add-chat-title" className="text-h4 text-ink">Connect a chat</h2>
      {notice ? <Callout tone={notice.tone} role={notice.tone === "success" ? "status" : "alert"}>{notice.text}</Callout> : null}
      <form className="flex flex-col gap-4" onSubmit={(event) => { event.preventDefault(); add(); }}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Chat app">
            <Dropdown value={kind} onChange={(event) => setKind(event.target.value as ChatKind)}>
              {CHAT_KINDS.map((option) => <option key={option} value={option}>{CHAT_KIND_LABELS[option]}</option>)}
            </Dropdown>
          </Field>
          <Field label="Name" helperText="So your team can tell chats apart, for example “#events”.">
            <Input value={name} maxLength={80} onChange={(event) => setName(event.target.value)} placeholder={CHAT_KIND_LABELS[kind]} />
          </Field>
        </div>
        <p className="text-caption text-ink-muted">{HELP[kind]}</p>
        {kind === "SLACK" || kind === "DISCORD" || kind === "MATTERMOST" ? (
          <Field label="Webhook URL" helperText="Stored encrypted and never shown again.">
            <PasswordInput value={url} onChange={(event) => setUrl(event.target.value.trim())} autoComplete="off" />
          </Field>
        ) : null}
        {kind === "TELEGRAM" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Bot token" helperText="Stored encrypted and never shown again."><PasswordInput value={token} onChange={(event) => setToken(event.target.value.trim())} autoComplete="off" /></Field>
            <Field label="Chat id"><Input value={chatId} onChange={(event) => setChatId(event.target.value.trim())} placeholder="-1001234567890" /></Field>
          </div>
        ) : null}
        {kind === "WHATSAPP" ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Phone number ID"><Input inputMode="numeric" value={phoneNumberId} onChange={(event) => setPhoneNumberId(event.target.value.trim())} /></Field>
              <Field label="Access token" helperText="Stored encrypted and never shown again."><PasswordInput value={token} onChange={(event) => setToken(event.target.value.trim())} autoComplete="off" /></Field>
            </div>
            <Field label="Send to" helperText="Up to five numbers in international form, separated by commas.">
              <Input value={numbers} onChange={(event) => setNumbers(event.target.value)} placeholder="+919876543210" />
            </Field>
            <Field label="Message template (optional)" helperText="An approved template with one body variable. Without one, only numbers that messaged you in the last 24 hours receive messages.">
              <Input value={template} onChange={(event) => setTemplate(event.target.value.trim())} placeholder="event_update" />
            </Field>
          </>
        ) : null}
        <ChatEventsPicker value={events} onChange={setEvents} disabled={pending} />
        <div>
          <Button type="submit" disabled={pending || events.length === 0}>
            <Plus aria-hidden className="size-4" />
            {pending ? "Connecting…" : "Connect chat"}
          </Button>
        </div>
      </form>
    </Card>
  );
}

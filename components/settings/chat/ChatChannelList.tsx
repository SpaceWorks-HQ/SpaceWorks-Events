"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Send, Trash2 } from "lucide-react";
import { removeChatChannel, testChatChannel, updateChatChannel } from "@/app/actions/chat-channels";
import { Button } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, Chip, EmptyState } from "@/components/ui/display";
import { CHAT_KIND_LABELS, type ChatEvent } from "@/lib/chat/events";
import type { ChatChannelView } from "@/lib/views/app__dashboard__orgSlug__settings__chat__page";
import { ChatEventsPicker } from "./ChatEventsPicker";

function ChatChannelRow({ organisationSlug, channel }: { organisationSlug: string; channel: ChatChannelView; }) {
  const router = useRouter();
  const [events, setEvents] = useState<ChatEvent[]>(channel.events);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string; } | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (action: () => Promise<{ ok: boolean; error?: string; }>, success: string) => startTransition(async () => {
    setNotice(null);
    const result = await action();
    setNotice(result.ok ? { tone: "success", text: success } : { tone: "danger", text: result.error ?? "Something went wrong." });
    router.refresh();
  });

  const failedLast = channel.lastFailedAt && (!channel.lastDeliveredAt || channel.lastFailedAt > channel.lastDeliveredAt);
  return (
    <Card className="flex flex-col gap-4 rounded-xl">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-label text-ink">{channel.name}</p>
          <p className="text-caption text-ink-muted">{CHAT_KIND_LABELS[channel.kind]} · {channel.target}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {failedLast ? <Chip tone="danger">Last message failed</Chip> : channel.lastDeliveredAt ? <Chip tone="success">Working</Chip> : <Chip tone="neutral">Not tested yet</Chip>}
          <Button type="button" variant="secondary" size="sm" disabled={pending || !channel.enabled} onClick={() => run(() => testChatChannel({ organisationSlug, channelId: channel.id }), "Test message sent.")}>
            <Send aria-hidden className="size-4" />
            Send test
          </Button>
          <Button
            type="button"
            variant="dangerQuiet"
            size="sm"
            disabled={pending}
            onClick={() => {
              if (window.confirm(`Disconnect ${channel.name}? It stops receiving notifications.`)) run(() => removeChatChannel({ organisationSlug, channelId: channel.id }), "Disconnected.");
            }}
          >
            <Trash2 aria-hidden className="size-4" />
            Remove
          </Button>
        </div>
      </div>
      {notice ? <Callout tone={notice.tone} role={notice.tone === "success" ? "status" : "alert"}>{notice.text}</Callout> : null}
      <SwitchRow
        label="Send notifications"
        description="Off keeps the chat connected without sending anything."
        checked={channel.enabled}
        disabled={pending}
        onCheckedChange={(enabled) => run(() => updateChatChannel({ organisationSlug, channelId: channel.id, enabled }), enabled ? "Notifications on." : "Notifications off.")}
      />
      <ChatEventsPicker value={events} onChange={setEvents} disabled={pending} />
      {events.join() !== channel.events.join() ? (
        <div>
          <Button type="button" size="sm" disabled={pending} onClick={() => run(() => updateChatChannel({ organisationSlug, channelId: channel.id, events }), "Saved.")}>Save notifications</Button>
        </div>
      ) : null}
    </Card>
  );
}

export function ChatChannelList({ organisationSlug, channels }: { organisationSlug: string; channels: ChatChannelView[]; }) {
  if (channels.length === 0) {
    return <EmptyState title="No chats connected">Connect Slack, Discord, Mattermost, Telegram or WhatsApp below.</EmptyState>;
  }
  return (
    <ul className="flex flex-col gap-4">
      {channels.map((channel) => <li key={channel.id}><ChatChannelRow organisationSlug={organisationSlug} channel={channel} /></li>)}
    </ul>
  );
}

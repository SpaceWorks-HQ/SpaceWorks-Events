"use client";

import { CheckboxField } from "@/components/ui/choice";
import { CHAT_EVENT_LABELS, CHAT_EVENTS, type ChatEvent } from "@/lib/chat/events";

/** Which notifications a chat receives. */
export function ChatEventsPicker({ value, onChange, disabled }: { value: ChatEvent[]; onChange: (events: ChatEvent[]) => void; disabled?: boolean; }) {
  return (
    <fieldset className="grid gap-3 sm:grid-cols-2">
      <legend className="sr-only">Notifications</legend>
      {CHAT_EVENTS.map((event) => (
        <CheckboxField
          key={event}
          label={CHAT_EVENT_LABELS[event].label}
          description={CHAT_EVENT_LABELS[event].description}
          checked={value.includes(event)}
          disabled={disabled}
          onCheckedChange={(checked) => onChange(checked === true ? [...value, event] : value.filter((item) => item !== event))}
        />
      ))}
    </fieldset>
  );
}

"use client";

import type { Dispatch, SetStateAction } from "react";
import { Field, Input } from "@/components/ui/field";

export function AttendeeFields({ seats, attendees, setAttendees }: {
  seats: number;
  attendees: Array<{ name: string; email: string }>;
  setAttendees: Dispatch<SetStateAction<Array<{ name: string; email: string }>>>;
}) {
  return (
    <div className="flex flex-col gap-3">
      <p className="text-caption text-ink-muted">Who else is coming? Optional now; you can add them after ordering, and each gets their own ticket.</p>
      {Array.from({ length: seats - 1 }, (_, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-2">
          <Field label={`Ticket ${index + 2}: name`} optional>
            <Input value={attendees[index]?.name ?? ""} maxLength={200} onChange={(event) => setAttendees((current) => { const next = [...current]; next[index] = { name: event.target.value, email: next[index]?.email ?? "" }; return next; })} />
          </Field>
          <Field label={`Ticket ${index + 2}: email`} optional>
            <Input type="email" value={attendees[index]?.email ?? ""} onChange={(event) => setAttendees((current) => { const next = [...current]; next[index] = { name: next[index]?.name ?? "", email: event.target.value }; return next; })} />
          </Field>
        </div>
      ))}
    </div>
  );
}

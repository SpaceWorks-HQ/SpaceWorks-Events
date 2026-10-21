"use client";

import type { ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Input } from "@/components/ui/field";
import { OTHER_MAX_LENGTH } from "@/lib/registrationFields";

/* ---------- Small pieces ---------- */

export function LabelText({ field }: { field: RegistrationFieldDefinition }) {
  return (
    <>
      {field.label}
      {field.required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}
    </>
  );
}

export function HelpText({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="whitespace-pre-line text-caption text-ink-muted">{children}</p>;
}

export function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-caption text-danger-fg">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

export function ids(baseId: string) {
  return { control: `${baseId}-control`, help: `${baseId}-help`, hint: `${baseId}-hint`, counter: `${baseId}-counter`, error: `${baseId}-error`, other: `${baseId}-other` };
}

export function describedBy(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ") || undefined;
}

/** Text box for an "Other" answer, shown under the choices once "Other" is picked. */
export function OtherInput({ id, field, text, invalid, onText }: { id: string; field: RegistrationFieldDefinition; text: string; invalid: boolean; onText: (text: string) => void }) {
  return (
    <div className="motion-safe:animate-[yy-fade-in_180ms_ease-out_both]">
      <label htmlFor={id} className="sr-only">{`${field.label}: your other answer`}</label>
      <Input
        id={id}
        value={text}
        onChange={(event) => onText(event.target.value)}
        maxLength={OTHER_MAX_LENGTH}
        placeholder="Type your answer"
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Download } from "lucide-react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { CheckboxField, FilterChip, RadioCard, RadioGroup } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input, Dropdown, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";

function OptionalTag({ optional }: { optional: boolean }) {
  return optional ? <span className="ml-1.5 font-normal text-ink-muted">Optional</span> : null;
}

function FeedbackQuestion({ field, value, onChange }: { field: RegistrationFieldDefinition; value: unknown; onChange: (value: unknown) => void }) {
  const optional = !field.required;
  switch (field.type) {
    case "TEXTAREA":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Textarea rows={4} value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "NUMBER":
    case "DATE":
    case "EMAIL":
    case "PHONE":
    case "TEXT":
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Input type={field.type === "TEXT" ? "text" : field.type === "PHONE" ? "tel" : field.type.toLowerCase()} value={typeof value === "string" || typeof value === "number" ? value : ""} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "CHECKBOX":
      return <CheckboxField label={field.required ? `${field.label} *` : field.label} checked={Boolean(value)} onCheckedChange={(checked) => onChange(checked === true)} />;
    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label text-ink">{field.label}<OptionalTag optional={optional} /></legend>
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <FilterChip key={option} selected={isSelected} onClick={() => onChange(isSelected ? selected.filter((item) => item !== option) : [...selected, option])}>
                  {option}
                </FilterChip>
              );
            })}
          </div>
        </fieldset>
      );
    }
    case "RADIO":
      return (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="mb-1.5 text-label text-ink">{field.label}<OptionalTag optional={optional} /></legend>
          <RadioGroup
            value={typeof value === "string" ? value : ""}
            onValueChange={onChange}
            required={field.required}
            className={cn("grid gap-2", field.options.length <= 5 ? "grid-cols-[repeat(auto-fit,minmax(64px,1fr))]" : "grid-cols-2 sm:grid-cols-3")}
          >
            {field.options.map((option) => (
              <RadioCard key={option} value={option} label={option} />
            ))}
          </RadioGroup>
        </fieldset>
      );
    default:
      return (
        <Field label={field.label} optional={optional} required={field.required}>
          <Dropdown value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)}>
            <option value="">—</option>
            {field.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
          </Dropdown>
        </Field>
      );
  }
}

export function PublicFeedbackForm(props: { orgSlug: string; eventSlug: string; fields: RegistrationFieldDefinition[]; thankYouMessage: string; certificateEnabled: boolean }) {
  const [email, setEmail] = useState("");
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [error, setError] = useState<string | null>(null);
  const [certificateToken, setCertificateToken] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [pending, startTransition] = useTransition();
  const setAnswer = (key: string, value: unknown) => setAnswers((current) => ({ ...current, [key]: value }));

  if (done) {
    return (
      <div role="status" className="flex flex-col items-start gap-4">
        <p className="text-body-l text-ink">{props.thankYouMessage}</p>
        {certificateToken ? (
          <Button asChild variant="accent" size="lg">
            <a href={`/api/feedback/certificate/${certificateToken}`}>
              <Download aria-hidden className="size-[18px]" />
              Download certificate (JPG)
            </a>
          </Button>
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        startTransition(async () => {
          const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ orgSlug: props.orgSlug, eventSlug: props.eventSlug, ...(props.certificateEnabled ? { email } : {}), answers }) });
          const result = (await response.json().catch(() => ({}))) as { ok?: boolean; error?: string; data?: { certificateToken?: string | null } };
          if (!response.ok || !result.ok) {
            setError(result.error ?? "Could not submit feedback.");
            return;
          }
          setCertificateToken(result.data?.certificateToken ?? null);
          setDone(true);
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {props.fields.map((field) => (
        <FeedbackQuestion key={field.key} field={field} value={answers[field.key]} onChange={(value) => setAnswer(field.key, value)} />
      ))}
      {props.certificateEnabled ? (
        <Field label="Email you registered with" required helperText="Used only to match your registration and put your name on the certificate.">
          <Input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
        </Field>
      ) : (
        <p className="text-caption text-ink-muted">This response is not linked to your account or registration. Avoid including identifying information if you want it to remain anonymous.</p>
      )}
      <Button type="submit" variant="accent" size="lg" fullWidth disabled={pending}>
        {pending ? "Sending…" : props.certificateEnabled ? "Send feedback & get certificate" : "Send feedback"}
      </Button>
    </form>
  );
}

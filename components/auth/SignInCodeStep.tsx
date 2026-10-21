"use client";

import type { FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** The second step of a password sign-in: an authenticator code, or a code from an email. */
export function SignInCodeStep({ title, description, label, helperText, value, onChange, numeric, error, loading, onSubmit, onBack }: {
  title: string;
  description: string;
  label: string;
  helperText?: string;
  value: string;
  onChange: (value: string) => void;
  /** Six digits only (the emailed code); otherwise free text, for recovery codes. */
  numeric?: boolean;
  error: string | null;
  loading: boolean;
  onSubmit: (event: FormEvent) => void;
  onBack: () => void;
}) {
  return (
    <form className="flex flex-col gap-5" onSubmit={onSubmit}>
      <div className="flex flex-col gap-1.5">
        <h2 className="text-h2 text-ink">{title}</h2>
        <p className="text-body-ui text-ink-secondary">{description}</p>
      </div>

      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}

      <Field label={label} required helperText={helperText}>
        <Input
          autoFocus
          value={value}
          autoComplete="one-time-code"
          {...(numeric ? { inputMode: "numeric" as const, className: "font-medium tabular-nums text-lg tracking-[0.3em]" } : {})}
          onChange={(event) => onChange(numeric ? event.target.value.replace(/\D/g, "").slice(0, 6) : event.target.value)}
        />
      </Field>

      <Button type="submit" variant="primary" size="lg" fullWidth disabled={loading || (numeric ? value.length !== 6 : !value)}>
        {loading ? "Verifying…" : "Verify and sign in"}
      </Button>

      <Button variant="quiet" className="self-center" disabled={loading} onClick={onBack}>
        Use a different account
      </Button>
    </form>
  );
}

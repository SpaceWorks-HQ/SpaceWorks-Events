"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { verifyStepUpMfa } from "@/app/actions/mfa-step-up";

/** Staff who signed in without an authenticator code (Google) confirm one before the dashboard. */
export function MfaStepUpPrompt({ next }: { next: string; }) {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-[440px] py-10 sm:py-16">
      <form
        className="flex flex-col gap-5 rounded-xl border border-line bg-panel p-6 sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            const result = await verifyStepUpMfa({ code });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace(next);
            router.refresh();
          });
        }}
      >
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-muted text-ink">
          <ShieldCheck className="size-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-ink">Confirm it&apos;s you</h1>
          <p className="text-body-ui text-ink-secondary">Organisation dashboards need a code from your authenticator app. You&apos;ll be asked again after 12 hours.</p>
        </div>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Six-digit authenticator code" required>
          <Input
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            className="font-medium tabular-nums text-lg tracking-[0.3em]"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            value={code}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending} loadingLabel="Verifying…" disabled={code.length !== 6}>
          Verify and continue
        </Button>
      </form>
    </div>
  );
}

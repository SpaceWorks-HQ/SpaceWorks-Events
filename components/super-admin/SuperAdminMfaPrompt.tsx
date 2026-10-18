"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { verifySuperAdminMfa } from "@/app/actions/super-admin-mfa";

export function SuperAdminMfaPrompt() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto w-full max-w-[440px] py-10 sm:py-16">
      <form
        className="flex flex-col gap-5 rounded-2xl border border-line bg-canvas p-6 shadow-raised sm:p-8"
        onSubmit={(event) => {
          event.preventDefault();
          startTransition(async () => {
            setError(null);
            const result = await verifySuperAdminMfa({ code });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            router.replace("/super-admin");
            router.refresh();
          });
        }}
      >
        <span aria-hidden className="flex size-12 items-center justify-center rounded-full bg-muted text-ink">
          <ShieldCheck className="size-6" />
        </span>
        <div className="flex flex-col gap-2">
          <h1 className="text-h1 text-ink">Verify super-admin access</h1>
          <p className="text-body-ui text-ink-secondary">Enter a current code from your authenticator app. This separate verification expires after 10 minutes.</p>
        </div>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Six-digit authenticator code" required>
          <Input
            autoFocus
            autoComplete="one-time-code"
            inputMode="numeric"
            className="font-mono text-lg tracking-[0.3em]"
            onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
            value={code}
          />
        </Field>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending} loadingLabel="Verifying…" disabled={code.length !== 6}>
          Verify and continue
        </Button>
        <p className="text-caption text-ink-muted">MFA is required for this panel. Set it up from Account security if it is not enabled.</p>
      </form>
    </div>
  );
}

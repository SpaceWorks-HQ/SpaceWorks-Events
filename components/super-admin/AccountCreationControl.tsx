"use client";

import { useState, useTransition } from "react";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { setNewUserRegistrationEnabled } from "@/app/actions/instance-settings";

export function AccountCreationControl({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader title="New account creation" description="Applies immediately on every server. When disabled, password and Google sign-in remain available only for existing users; people without an account, including invitees, cannot create one." />
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SwitchRow
          label={enabled ? "New users can create accounts" : "New account creation is disabled"}
          checked={enabled}
          disabled={pending}
          onCheckedChange={(checked) => {
            const previous = enabled;
            setEnabled(checked);
            setError(null);
            startTransition(async () => {
              // A failed request (network or server error) must not leave the
              // switch showing a value that was never saved.
              const result = await setNewUserRegistrationEnabled({ allowNewUserSignups: checked }).catch(() => ({
                ok: false as const,
                error: "The setting could not be saved. Refresh the page and try again.",
              }));
              if (!result.ok) {
                setEnabled(previous);
                setError(result.error);
              }
            });
          }}
        />
      </div>
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { SwitchRow } from "@/components/ui/choice";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { setPaidEventsEnabled } from "@/app/actions/instance-settings";

export function PaidEventsControl({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <Card as="section" className="rounded-xl">
      <CardHeader
        title="Paid events"
        description="Lets organisations connect their own Razorpay or Stripe account and sell tickets. Money goes straight to each organisation; this installation never holds it. Turning this off stops new sales, but existing payments still settle and can be refunded."
      />
      <div className="flex flex-col gap-3">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <SwitchRow
          label={enabled ? "Organisations can sell tickets" : "Paid events are off"}
          checked={enabled}
          disabled={pending}
          onCheckedChange={(checked) => {
            const previous = enabled;
            setEnabled(checked);
            setError(null);
            startTransition(async () => {
              const result = await setPaidEventsEnabled({ paidEventsEnabled: checked });
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

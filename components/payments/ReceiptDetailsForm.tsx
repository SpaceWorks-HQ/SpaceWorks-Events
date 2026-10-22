"use client";

import { useState, useTransition } from "react";
import { saveReceiptDetails } from "@/app/actions/payment-settings";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";

type Details = { legalName: string; registrationNumber: string; address: string; };

/** The organisation's registered details, printed on every receipt buyers download. */
export function ReceiptDetailsForm({ organisationSlug, organisationName, initial }: { organisationSlug: string; organisationName: string; initial: Details; }) {
  const { showToast } = useToast();
  const [details, setDetails] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Details, value: string) => setDetails((current) => ({ ...current, [key]: value }));

  return (
    <Card as="section" className="rounded-xl" aria-labelledby="receipt-details-title">
      <CardHeader
        title={<span id="receipt-details-title">Receipts</span>}
        description="Buyers can download a receipt for every paid order, with the Razorpay or Stripe payment details. These details appear on it as the organisation that was paid."
      />
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await saveReceiptDetails({ organisationSlug, ...details });
            if (!result.ok) return setError(result.error);
            showToast("Receipt details saved.", "success");
          });
        }}
      >
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <Field label="Registered name" optional helperText={`The organisation's legal name. Blank uses "${organisationName}".`}>
          <Input value={details.legalName} maxLength={200} onChange={(event) => set("legalName", event.target.value)} />
        </Field>
        <Field label="Registration number" optional helperText="For example a company, society or trust registration number.">
          <Input value={details.registrationNumber} maxLength={80} onChange={(event) => set("registrationNumber", event.target.value)} />
        </Field>
        <Field label="Registered address" optional>
          <Textarea rows={3} value={details.address} maxLength={500} onChange={(event) => set("address", event.target.value)} />
        </Field>
        <div>
          <Button type="submit" loading={pending} loadingLabel="Saving…">Save receipt details</Button>
        </div>
      </form>
    </Card>
  );
}

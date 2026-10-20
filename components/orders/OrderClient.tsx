"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CreditCard, UserPen } from "lucide-react";
import { updateOrderAttendee } from "@/app/actions/orders";
import { RegistrationQuestions, useRegistrationAnswers } from "@/components/rsvp/QuestionField";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";

/** Opens the organiser's hosted payment page for an order still held. */
export function PayNowButton({ endpoint }: { endpoint: string; }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Button
        variant="accent"
        size="lg"
        fullWidth
        loading={pending}
        loadingLabel="Opening payment page…"
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const response = await fetch(endpoint, { method: "POST", credentials: "same-origin" });
              const body = (await response.json().catch(() => ({}))) as { ok?: boolean; url?: string; error?: string; };
              if (response.ok && body.url) {
                window.location.assign(body.url);
                return;
              }
              setError(body.error ?? "The payment page couldn't be opened. Try again in a moment.");
            } catch {
              setError("The payment page couldn't be opened. Check your connection and try again.");
            }
          });
        }}
      >
        <CreditCard aria-hidden className="size-[18px]" />
        Pay now
      </Button>
    </div>
  );
}

/**
 * Shown when the buyer comes back from checkout before the provider has
 * confirmed: re-reads the page a few times.
 */
export function ConfirmingPayment() {
  const router = useRouter();
  useEffect(() => {
    let attempts = 0;
    const timer = window.setInterval(() => {
      attempts += 1;
      router.refresh();
      if (attempts >= 12) window.clearInterval(timer);
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [router]);
  return (
    <Callout tone="info" role="status" title="Confirming payment…">
      This page updates by itself once the payment provider confirms it. If you didn&apos;t finish paying, use Pay now below.
    </Callout>
  );
}

/** "Seats held until 14:32", announced politely so screen readers hear the deadline. */
export function HoldCountdown({ expiresAt }: { expiresAt: string; }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  const minutes = Math.max(0, Math.ceil((new Date(expiresAt).getTime() - now) / 60_000));
  return (
    <p aria-live="polite" className="text-body-ui text-ink-secondary">
      {minutes > 0 ? `Your tickets are held for ${minutes} more ${minutes === 1 ? "minute" : "minutes"}.` : "Your hold is ending."}
    </p>
  );
}

/** The buyer names who holds a ticket and answers its registration questions. */
export function AttendeeDetailsForm({ orderToken, ticket, fields }: {
  orderToken: string;
  ticket: { id: string; label: string; name: string; email: string; account: boolean; needsDetails: boolean; initialAnswers: Record<string, unknown>; };
  fields: RegistrationFieldDefinition[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(ticket.needsDetails);
  const [name, setName] = useState(ticket.name);
  const [email, setEmail] = useState(ticket.email);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  const questions = useRegistrationAnswers(fields, ticket.initialAnswers);
  if (!open) {
    return (
      <Button size="sm" variant="ghost" onClick={() => setOpen(true)}>
        <UserPen aria-hidden className="size-4" />
        Edit details
      </Button>
    );
  }
  return (
    <form
      className="flex w-full flex-col gap-3 rounded-lg border border-line p-4"
      onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        if (Object.keys(questions.validate()).length > 0) return;
        startTransition(async () => {
          const result = await updateOrderAttendee({ orderToken, rsvpId: ticket.id, name, email: ticket.account ? "" : email, answers: questions.payload() });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          setSaved(true);
          router.refresh();
        });
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {saved ? <Callout tone="success" role="status">Saved.</Callout> : null}
      <Field label="Attendee name" required>
        <Input value={name} maxLength={200} disabled={ticket.account} onChange={(event) => setName(event.target.value)} />
      </Field>
      <Field label="Attendee email" helperText={ticket.email ? "To give this ticket to someone else, ask the organiser." : "They get their own ticket at this address."}>
        <Input type="email" value={email} disabled={Boolean(ticket.email)} onChange={(event) => setEmail(event.target.value)} />
      </Field>
      <RegistrationQuestions controller={questions} className="gap-3" />
      <div className="flex gap-2">
        <Button type="submit" size="sm" loading={pending} loadingLabel="Saving…">Save details</Button>
        {!ticket.needsDetails ? <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>Close</Button> : null}
      </div>
    </form>
  );
}

"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { RsvpStatus } from "@prisma/client";
import { CheckCircle2, Download } from "lucide-react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { RegistrationQuestions, focusQuestion, useRegistrationAnswers } from "@/components/rsvp/QuestionField";
import { identityErrors } from "@/components/rsvp/registrationAnswers";
import { TicketPicker, ticketAvailable } from "@/components/rsvp/TicketPicker";
import { PromoCodeField, previewOrderTotal, type AppliedPromo, type TicketingInfo } from "@/components/rsvp/PromoCodeField";
import { formatMoney } from "@/lib/payments/money";
import type { PublicTicketType } from "@/lib/payments/tickets";

async function postRsvp(body: unknown) {
  const res = await fetch("/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  type Saved = { ticketToken?: string; status?: RsvpStatus; orderToken?: string; checkoutUrl?: string | null };
  let data: { ok?: boolean; error?: string; data?: Saved } = {};
  try {
    data = (await res.json()) as { ok?: boolean; error?: string; data?: Saved };
  } catch {
    /* empty */
  }
  if (res.status === 429) {
    return {
      ok: false as const,
      error: data.error ?? "Too many requests. Try again later.",
    };
  }
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Could not save your RSVP.",
    };
  }
  if (data.ok) {
    return {
      ok: true as const,
      ticketToken: data.data?.ticketToken ?? "",
      status: data.data?.status ?? null,
      orderToken: data.data?.orderToken ?? null,
      checkoutUrl: data.data?.checkoutUrl ?? null,
    };
  }
  return {
    ok: false as const,
    error: data.error ?? "Could not save your RSVP.",
  };
}

function storageKey(params: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
}) {
  const suffix = params.eventInstanceId
    ? `i:${params.eventInstanceId}`
    : `e:${params.eventSlug ?? ""}`;
  return `swe:rsvp:${params.orgSlug}:${suffix}`;
}

function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

export function RsvpForm(props: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
  registrationFields?: RegistrationFieldDefinition[];
  /** Ticket types to buy; registration without tickets when empty. */
  tickets?: PublicTicketType[];
  paidSalesOpen?: boolean;
  /** Paid tickets: whether promo codes exist, and the refund terms. */
  ticketing?: TicketingInfo | null;
  /** A paid order is only a request first: it needs approval, or waits for a place. */
  paidRequest?: "approval" | "waitlist" | null;
  /** Lets a containing event page update immediately after this tab saves an RSVP. */
  onRsvpSaved?: (rsvp: { ticketToken: string; status: RsvpStatus | null }) => void;
}) {
  const { orgSlug, eventSlug, eventInstanceId, registrationFields, onRsvpSaved, tickets = [], paidSalesOpen = false, ticketing = null, paidRequest = null } = props;
  const [quantities, setQuantities] = useState<Record<string, number>>(() => {
    // Start with one of the first ticket that can be bought.
    const first = tickets.find((ticket) => ticketAvailable(ticket, paidSalesOpen));
    return first ? { [first.id]: first.minPerOrder } : {};
  });
  const [ticketError, setTicketError] = useState<string | undefined>();
  // Inside the embed widget's frame, provider pages must open in a new top-level tab.
  const [framedCheckout, setFramedCheckout] = useState<{ checkoutUrl: string; orderToken: string | null } | null>(null);
  const [attendees, setAttendees] = useState<Array<{ name: string; email: string }>>([]);
  const seats = Object.values(quantities).reduce((sum, quantity) => sum + quantity, 0);
  const [promo, setPromo] = useState<AppliedPromo | null>(null);
  const { totalMinor, discountMinor, promoProblem } = previewOrderTotal(tickets, quantities, promo);
  const currency = tickets[0]?.currency ?? "INR";
  const sellsPaid = tickets.some((ticket) => ticket.priceMinor > 0);
  const { data: session, status } = useSession();
  const router = useRouter();
  const lsKey = storageKey({ orgSlug, eventSlug, eventInstanceId });
  const [guestEmail, setGuestEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [rsvpStatus, setRsvpStatus] = useState<RsvpStatus | null>(null);
  const [ticketToken, setTicketToken] = useState("");

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const saved = safeJsonParse<{ ticketToken?: string }>(
        window.localStorage.getItem(lsKey),
      );
      setTicketToken(saved?.ticketToken ?? "");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [lsKey]);
  const [pending, startTransition] = useTransition();

  const fields = useMemo(() => registrationFields ?? [], [registrationFields]);
  const questionsState = useRegistrationAnswers(fields);
  const [identity, setIdentity] = useState<{ name?: string; email?: string }>({});
  const formRef = useRef<HTMLDivElement & HTMLFormElement>(null);
  const requireName = !session?.user?.name?.trim();
  const isGuest = !session?.user;
  const problemCount = Object.keys(questionsState.errors).length + Object.values(identity).filter(Boolean).length;

  /** Client-side checks first, so each question shows its own message; the server still decides. */
  function checkBeforeSubmit() {
    const who = identityErrors({ name, email: guestEmail, requireName: isGuest || requireName, requireEmail: isGuest });
    const questionErrors = questionsState.validate();
    setIdentity(who);
    const missingTicket = tickets.length > 0 && seats === 0;
    setTicketError(missingTicket ? "Choose at least one ticket." : undefined);
    const firstQuestion = fields.find((field) => questionErrors[field.key])?.key;
    const first = missingTicket ? "__ticket" : who.name ? "__name" : who.email ? "__email" : firstQuestion;
    if (first) focusQuestion(formRef.current, first);
    return !first;
  }

  function submit() {
    setError(null);
    if (!checkBeforeSubmit()) return;
    startTransition(async () => {
      const res = await postRsvp({
        orgSlug,
        ...(eventInstanceId ? { eventInstanceId } : { eventSlug: eventSlug! }),
        ...(isGuest ? { guestEmail } : {}),
        ...(tickets.length > 0 ? {
          items: Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity })),
          attendees: attendees.slice(0, Math.max(0, seats - 1)).map((attendee) => ({ name: attendee.name.trim() || undefined, email: attendee.email.trim() })),
          ...(promo ? { promoCode: promo.code } : {}),
        } : {}),
        name,
        answers: questionsState.payload(),
      });
      if (!res.ok) setError(res.error);
      else saveSuccessfulRsvp({ ticketToken: res.ticketToken, status: res.status }, res);
    });
  }

  function saveSuccessfulRsvp(rsvp: { ticketToken: string; status: RsvpStatus | null }, order: { orderToken?: string | null; checkoutUrl?: string | null } = {}) {
    setTicketToken(rsvp.ticketToken);
    setRsvpStatus(rsvp.status);
    if (rsvp.ticketToken) {
      try {
        window.localStorage.setItem(
          lsKey,
          JSON.stringify({
            ticketToken: rsvp.ticketToken,
            status: rsvp.status,
            registeredAt: new Date().toISOString(),
          }),
        );
      } catch {
        // The confirmed server state remains usable in this open page even if
        // this browser has disabled local storage.
      }
    }
    // A paid order continues on the provider's hosted page, or on the order
    // page ("Pay now") if that page couldn't open yet. Orders for several
    // people go to the order page to name each attendee.
    if (rsvp.status === "PENDING_PAYMENT" && order.checkoutUrl) {
      if (window.self !== window.top) setFramedCheckout({ checkoutUrl: order.checkoutUrl, orderToken: order.orderToken ?? null });
      else window.location.assign(order.checkoutUrl);
      return;
    }
    if (order.orderToken && (rsvp.status === "PENDING_PAYMENT" || seats > 1)) {
      router.push(`/order/${order.orderToken}`);
      return;
    }
    onRsvpSaved?.(rsvp);
    setDone(true);
    // Re-read the going count and spots left, which now include this registration.
    router.refresh();
  }

  if (status === "loading") {
    return <p className="text-body-ui text-ink-muted">Loading…</p>;
  }

  if (framedCheckout) {
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-info-bg p-5 text-ink">
        <p className="text-body font-semibold">Your tickets are held. Pay on the secure payment page, which opens in a new tab.</p>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="accent" size="sm">
            <a href={framedCheckout.checkoutUrl} target="_blank" rel="noopener noreferrer">Open the payment page</a>
          </Button>
          {framedCheckout.orderToken ? (
            <Button asChild variant="secondary" size="sm">
              <a href={`/order/${framedCheckout.orderToken}`} target="_blank" rel="noopener noreferrer">View your order</a>
            </Button>
          ) : null}
        </div>
        <p className="text-caption text-ink-muted">Finish paying in the new tab; your order page confirms the tickets.</p>
      </div>
    );
  }

  if (done) {
    const href = ticketToken ? `/ticket/${ticketToken}` : null;
    const ticketDownloadUrl = ticketToken ? `/api/ticket/${ticketToken}/download` : null;
    const isConfirmed = rsvpStatus === "CONFIRMED";
    return (
      <div role="status" className="flex flex-col items-start gap-3 rounded-lg bg-success-bg p-5 text-success-fg">
        <CheckCircle2 aria-hidden className="yy-success-in size-8" />
        <p className="text-body font-semibold">
          {isConfirmed
            ? "Registration confirmed. Download and save your ticket now — you’ll need it for check-in."
            : sellsPaid && (rsvpStatus === "PENDING_APPROVAL" || rsvpStatus === "WAITLISTED")
              ? rsvpStatus === "WAITLISTED"
                ? "You’re on the waitlist. Nothing has been charged; if a place frees up, we’ll email you a link to pay."
                : "Request sent. Nothing has been charged; if the organiser approves it, we’ll email you a link to pay."
              : "Registration received. We’ll let you know when its status changes."}
        </p>
        <div className="flex flex-wrap gap-2">
          {isConfirmed && ticketDownloadUrl ? (
            <Button asChild variant="primary" size="sm">
              <a href={ticketDownloadUrl} download>
                <Download aria-hidden className="size-4" />
                Download and save ticket
              </a>
            </Button>
          ) : null}
          {href ? (
            <Button asChild variant="secondary" size="sm">
              <Link href={href}>{isConfirmed ? "View ticket" : "View status"}</Link>
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  const questions = <RegistrationQuestions controller={questionsState} />;
  const ticketSection = tickets.length > 0 ? (
    <div data-question-key="__ticket" className="flex flex-col gap-3">
      <TicketPicker tickets={tickets} quantities={quantities} onChange={(next) => { setQuantities(next); setTicketError(undefined); }} error={ticketError} paidSalesOpen={paidSalesOpen} />
      {seats > 1 ? (
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
      ) : null}
      {ticketing?.promoCodes && eventSlug ? (
        <PromoCodeField orgSlug={orgSlug} eventSlug={eventSlug} applied={promo} onApplied={setPromo} problem={promoProblem} />
      ) : null}
      {discountMinor > 0 ? (
        <p className="text-body-ui text-ink">Discount: −{formatMoney(discountMinor, currency)} · Total {formatMoney(totalMinor, currency)}</p>
      ) : null}
      {sellsPaid && ticketing ? (
        <p className="text-caption text-ink-muted">
          {ticketing.refundPolicy}{ticketing.refundPolicyText ? ` ${ticketing.refundPolicyText}` : ""}
        </p>
      ) : null}
    </div>
  ) : null;
  const submitLabel = totalMinor <= 0
    ? "Register"
    : paidRequest === "approval"
      ? `Request tickets · ${formatMoney(totalMinor, currency)}`
      : paidRequest === "waitlist"
        ? "Join the waitlist"
        : `Continue to payment · ${formatMoney(totalMinor, currency)}`;
  const problems = problemCount > 0 ? (
    <Callout tone="danger" role="alert">
      {problemCount === 1 ? "One answer needs a quick fix before you can register." : `${problemCount} answers need a quick fix before you can register.`}
    </Callout>
  ) : null;

  if (session?.user) {
    return (
      <div ref={formRef} className="flex flex-col gap-3.5">
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        {problems}
        {ticketSection}
        <div data-question-key="__name">
          <Field label="Name" optional={!requireName} required={requireName} error={identity.name} helperText={!requireName ? `Leave blank to use ${session.user.name}.` : undefined}>
            <Input
              name="name"
              autoComplete="name"
              value={name}
              placeholder={session.user.name ?? ""}
              onChange={(event) => {
                setName(event.target.value);
                if (identity.name && event.target.value.trim()) setIdentity((current) => ({ ...current, name: undefined }));
              }}
              maxLength={200}
            />
          </Field>
        </div>
        {questions}
        <Button variant="accent" size="lg" fullWidth loading={pending} loadingLabel="Registering…" onClick={submit}>
          {submitLabel}
        </Button>
      </div>
    );
  }

  return (
    <form
      ref={formRef}
      noValidate
      className="flex flex-col gap-3.5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      {problems}
      {ticketSection}
      <p className="text-body-ui text-ink-muted">Your details</p>
      <div data-question-key="__name">
        <Field label="Name" required error={identity.name}>
          <Input
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (identity.name && event.target.value.trim()) setIdentity((current) => ({ ...current, name: undefined }));
            }}
            maxLength={200}
          />
        </Field>
      </div>
      <div data-question-key="__email">
        <Field label="Email" required error={identity.email} helperText="We’ll send your ticket here.">
          <Input
            name="guestEmail"
            type="email"
            autoComplete="email"
            value={guestEmail}
            onChange={(event) => {
              setGuestEmail(event.target.value);
              if (identity.email) {
                const recheck = identityErrors({ name, email: event.target.value, requireName: false, requireEmail: true }).email;
                setIdentity((current) => ({ ...current, email: recheck }));
              }
            }}
          />
        </Field>
      </div>
      {questions}
      <Button variant="accent" size="lg" fullWidth type="submit" loading={pending} loadingLabel="Registering…">
        {submitLabel}
      </Button>
    </form>
  );
}

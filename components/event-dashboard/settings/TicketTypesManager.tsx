"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { archiveTicketType, saveTicketType } from "@/app/actions/ticket-types";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { CheckboxField, Radio, RadioGroup } from "@/components/ui/choice";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { formatMoney, minorToDecimalString, parseMoneyToMinor, UPI_TYPICAL_LIMIT_MINOR } from "@/lib/payments/money";

/** Tickets for an event, or for a series (one date's tickets, and passes). */
export type TicketTarget = { eventId: string; } | { seriesId: string; };

export type ManagedTicketType = {
  id: string;
  /** PASS: one seat on every remaining date of a series. */
  kind: "SINGLE" | "PASS";
  name: string;
  description: string;
  priceMinor: number;
  currency: string;
  capacity: number | null;
  minPerOrder: number;
  maxPerOrder: number;
  salesStartAt: string | null;
  salesEndAt: string | null;
  confirmed: number;
  held: number;
  visibility: "PUBLIC" | "CODE" | "MEMBERS";
  /** The first letters of its access code, to recognise it; the code itself isn't stored. */
  accessCodeHint: string | null;
  pricing: "FIXED" | "FLEXIBLE";
  suggestedMinor: number | null;
  maxPriceMinor: number | null;
  seatsPerTicket: number;
  feeMinor: number;
  payAtDesk: boolean;
};

type Draft = {
  id?: string; kind: "SINGLE" | "PASS"; name: string; description: string; price: string; capacity: string; minPerOrder: string; maxPerOrder: string; salesStartAt: string; salesEndAt: string;
  visibility: "PUBLIC" | "CODE" | "MEMBERS"; accessCode: string; accessCodeHint: string | null; pricing: "FIXED" | "FLEXIBLE"; suggested: string; maxPrice: string; seatsPerTicket: string; fee: string; payAtDesk: boolean;
};

const EMPTY: Draft = {
  kind: "SINGLE", name: "", description: "", price: "", capacity: "", minPerOrder: "1", maxPerOrder: "10", salesStartAt: "", salesEndAt: "",
  visibility: "PUBLIC", accessCode: "", accessCodeHint: null, pricing: "FIXED", suggested: "", maxPrice: "", seatsPerTicket: "1", fee: "", payAtDesk: false,
};

const VISIBILITY_LABEL = { PUBLIC: null, CODE: "Access code", MEMBERS: "Members only" } as const;

/** "2026-10-20T09:30" in the browser's zone, for datetime-local inputs. */
function toLocalInput(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromLocalInput(value: string) {
  return value ? new Date(value).toISOString() : null;
}

/**
 * Ticket types for a standalone event: free or paid, with an optional limit
 * and sales window. Archiving takes a ticket off sale; registrations keep it.
 */
export function TicketTypesManager({ organisationSlug, target, tickets, currency, paidAllowed, paidBlockedReason, payee = null }: {
  /** Who receives payment for paid tickets: always this event's organisation. */
  payee?: { organisationName: string; provider: string; testMode: boolean } | null;
  organisationSlug: string;
  /** The event, or the series whose dates and passes these cover. */
  target: TicketTarget;
  tickets: ManagedTicketType[];
  /** The event's currency (every ticket uses it). */
  currency: string;
  paidAllowed: boolean;
  paidBlockedReason: string | null;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [archiving, setArchiving] = useState<ManagedTicketType | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const draftCurrency = currency;
  const draftPrice = draft?.price ? parseMoneyToMinor(draft.price, draftCurrency) : null;
  const overUpi = draftCurrency === "INR" && draftPrice != null && draftPrice > UPI_TYPICAL_LIMIT_MINOR;

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveTicketType({
        organisationSlug,
        ...target,
        ...(draft.id ? { ticketTypeId: draft.id } : { kind: draft.kind }),
        name: draft.name,
        description: draft.description,
        price: draft.price,
        capacity: draft.capacity ? Number(draft.capacity) : null,
        minPerOrder: Number(draft.minPerOrder) || 1,
        maxPerOrder: Number(draft.maxPerOrder) || 10,
        salesStartAt: fromLocalInput(draft.salesStartAt),
        salesEndAt: fromLocalInput(draft.salesEndAt),
        visibility: draft.visibility,
        ...(draft.visibility === "CODE" && draft.accessCode.trim() ? { accessCode: draft.accessCode.trim() } : {}),
        pricing: draft.pricing,
        ...(draft.pricing === "FLEXIBLE" ? { suggested: draft.suggested, maxPrice: draft.maxPrice } : {}),
        seatsPerTicket: Math.min(20, Math.max(1, Number(draft.seatsPerTicket) || 1)),
        fee: draft.fee,
        payAtDesk: draft.payAtDesk,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setDraft(null);
      showToast(draft.id ? "Ticket updated." : "Ticket added.", "success");
      router.refresh();
    });
  }

  function archive(ticket: ManagedTicketType) {
    startTransition(async () => {
      const result = await archiveTicketType({ organisationSlug, ...target, ticketTypeId: ticket.id });
      setArchiving(null);
      if (!result.ok) return showToast(result.error, "error");
      showToast("Ticket taken off sale.", "success");
      router.refresh();
    });
  }

  const series = "seriesId" in target;
  const set = (key: keyof Draft, value: string) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Card as="section" className="rounded-xl" aria-labelledby="tickets-title">
      <CardHeader
        title={<span id="tickets-title">Tickets</span>}
        description={series
          ? "Without tickets, registration for each date is free. Add tickets for single dates, and passes that seat a guest on every remaining date. Each date's capacity stays the overall limit."
          : "Without tickets, registration is free as before. Add tickets to offer free and paid options, each with its own limit and sales window. The event's capacity stays the overall limit."}
        action={draft ? null : (
          <Button variant="secondary" onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
            <Plus aria-hidden className="size-4" />
            Add ticket
          </Button>
        )}
      />
      <div className="flex flex-col gap-4">
        {paidBlockedReason ? <Callout tone="info">{paidBlockedReason}</Callout> : null}
        {payee ? (
          <p className="text-body-ui text-ink-secondary">
            Payments go to <strong className="text-ink">{payee.organisationName}</strong> through its {payee.provider} account
            {payee.testMode ? " (test mode: no real money moves)" : ""}. Co-organisers can manage tickets but never where the money goes.
          </p>
        ) : null}
        {tickets.length === 0 && !draft ? <p className="text-body-ui text-ink-muted">No tickets yet: anyone can register for free.</p> : null}
        {tickets.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {tickets.map((ticket) => (
              <li key={ticket.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-ink">
                    {ticket.name}
                    <span className="font-normal text-ink-secondary">{ticket.priceMinor > 0 ? formatMoney(ticket.priceMinor, ticket.currency) : "Free"}</span>
                  </p>
                  <p className="text-caption text-ink-muted">
                    {ticket.confirmed} confirmed{ticket.held > 0 ? `, ${ticket.held} paying now` : ""}{ticket.capacity != null ? ` of ${ticket.capacity}` : ""}
                    {ticket.salesEndAt ? ` · sales end ${new Date(ticket.salesEndAt).toLocaleString()}` : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2">
                  {ticket.kind === "PASS" ? <Chip tone="ink" size="sm">Pass</Chip> : null}
                  {VISIBILITY_LABEL[ticket.visibility] ? <Chip size="sm">{VISIBILITY_LABEL[ticket.visibility]}{ticket.accessCodeHint ? ` ${ticket.accessCodeHint}…` : ""}</Chip> : null}
                  {ticket.pricing === "FLEXIBLE" ? <Chip size="sm">Pay what you want</Chip> : null}
                  {ticket.seatsPerTicket > 1 ? <Chip size="sm">Admits {ticket.seatsPerTicket}</Chip> : null}
                  {ticket.priceMinor > 0 ? <Chip tone="accent" size="sm">Paid</Chip> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${ticket.name}`}
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: ticket.id,
                        kind: ticket.kind,
                        name: ticket.name,
                        description: ticket.description,
                        price: ticket.priceMinor > 0 ? minorToDecimalString(ticket.priceMinor, ticket.currency) : "",
                        capacity: ticket.capacity == null ? "" : String(ticket.capacity),
                        minPerOrder: String(ticket.minPerOrder),
                        maxPerOrder: String(ticket.maxPerOrder),
                        salesStartAt: toLocalInput(ticket.salesStartAt),
                        salesEndAt: toLocalInput(ticket.salesEndAt),
                        visibility: ticket.visibility,
                        accessCode: "",
                        accessCodeHint: ticket.accessCodeHint,
                        pricing: ticket.pricing,
                        suggested: ticket.suggestedMinor != null ? minorToDecimalString(ticket.suggestedMinor, ticket.currency) : "",
                        maxPrice: ticket.maxPriceMinor != null ? minorToDecimalString(ticket.maxPriceMinor, ticket.currency) : "",
                        seatsPerTicket: String(ticket.seatsPerTicket),
                        fee: ticket.feeMinor > 0 ? minorToDecimalString(ticket.feeMinor, ticket.currency) : "",
                        payAtDesk: ticket.payAtDesk,
                      });
                    }}
                  >
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </Button>
                  <Button variant="dangerQuiet" size="sm" onClick={() => setArchiving(ticket)}>Take off sale</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}

        {draft ? (
          <form
            className="flex flex-col gap-4 rounded-lg border border-line p-4"
            onSubmit={(event) => {
              event.preventDefault();
              save();
            }}
          >
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            {series && !draft.id ? (
              <RadioGroup value={draft.kind} onValueChange={(value) => set("kind", value)} aria-label="What the ticket is for">
                <Radio value="SINGLE" label="One date" description="Guests choose a date and buy a ticket for it." />
                <Radio value="PASS" label="Pass for every remaining date" description="One purchase seats the guest on every date that hasn't ended. Its limit is the number of passes." />
              </RadioGroup>
            ) : null}
            <Field label="Ticket name" required>
              <Input value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} placeholder="General admission" />
            </Field>
            <Field label="Description" optional>
              <Textarea rows={2} value={draft.description} maxLength={500} onChange={(event) => set("description", event.target.value)} />
            </Field>
            <RadioGroup value={draft.pricing} onValueChange={(value) => set("pricing", value)} aria-label="How the price works">
              <Radio value="FIXED" label="Fixed price" />
              <Radio value="FLEXIBLE" label="Pay what you want" description="Buyers choose the amount, from your minimum (0 allows free). Good for donations and sliding scales." disabled={!paidAllowed} />
            </RadioGroup>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={draft.pricing === "FLEXIBLE" ? `Minimum (${draftCurrency})` : `Price (${draftCurrency})`} helperText={paidAllowed ? draft.pricing === "FLEXIBLE" ? "The least a buyer may pay; blank or 0 lets them pay nothing." : "Leave blank or 0 for a free ticket. Include any tax." : "Free only until payments are set up."}>
                <Input inputMode="decimal" value={draft.price} disabled={!paidAllowed && !draft.price} onChange={(event) => set("price", event.target.value)} placeholder="0" />
              </Field>
              {draft.pricing === "FLEXIBLE" ? (
                <>
                  <Field label={`Suggested (${draftCurrency})`} optional helperText="Shown as the starting amount.">
                    <Input inputMode="decimal" value={draft.suggested} onChange={(event) => set("suggested", event.target.value)} />
                  </Field>
                  <Field label={`Most a buyer may pay (${draftCurrency})`} optional>
                    <Input inputMode="decimal" value={draft.maxPrice} onChange={(event) => set("maxPrice", event.target.value)} />
                  </Field>
                </>
              ) : null}
              <Field label={`Booking fee per ticket (${draftCurrency})`} optional helperText="Added on top of the price and paid by the buyer.">
                <Input inputMode="decimal" value={draft.fee} disabled={!paidAllowed && !draft.fee} onChange={(event) => set("fee", event.target.value)} placeholder="0" />
              </Field>
              <Field label="People per ticket" helperText="More than 1 makes a group ticket: each person gets their own ticket to check in.">
                <Input type="number" min={1} max={20} value={draft.seatsPerTicket} onChange={(event) => set("seatsPerTicket", event.target.value)} />
              </Field>
              <Field label="Limit" optional helperText="Seats for this ticket. Blank: only the event's capacity applies.">
                <Input type="number" min={1} value={draft.capacity} onChange={(event) => set("capacity", event.target.value)} />
              </Field>
              <Field label="Fewest per order">
                <Input type="number" min={1} max={100} value={draft.minPerOrder} onChange={(event) => set("minPerOrder", event.target.value)} />
              </Field>
              <Field label="Most per order">
                <Input type="number" min={1} max={100} value={draft.maxPerOrder} onChange={(event) => set("maxPerOrder", event.target.value)} />
              </Field>
              <Field label="Sales start" optional>
                <Input type="datetime-local" value={draft.salesStartAt} onChange={(event) => set("salesStartAt", event.target.value)} />
              </Field>
              <Field label="Sales end" optional>
                <Input type="datetime-local" value={draft.salesEndAt} onChange={(event) => set("salesEndAt", event.target.value)} />
              </Field>
            </div>
            <Field label="Who can buy it" helperText={draft.visibility === "CODE" ? "Hidden until a buyer enters the code. Share it with the people it's for." : draft.visibility === "MEMBERS" ? "Only shown to people signed in as members of your organisation." : "Everyone who can see the event."}>
              <Dropdown value={draft.visibility} onChange={(event) => set("visibility", event.target.value)}>
                <option value="PUBLIC">Everyone</option>
                <option value="CODE">Only with an access code</option>
                <option value="MEMBERS">Only organisation members</option>
              </Dropdown>
            </Field>
            <CheckboxField
              checked={draft.payAtDesk}
              onCheckedChange={(checked) => setDraft((current) => (current ? { ...current, payAtDesk: checked === true } : current))}
              label="Guests may pay at the desk"
              description="They reserve now and pay in person; mark it collected from the guest list. Places are held for them until you cancel."
            />
            {draft.visibility === "CODE" ? (
              <Field label="Access code" required={!draft.accessCodeHint} helperText={draft.accessCodeHint ? `Current code starts ${draft.accessCodeHint}…; leave blank to keep it.` : "3 to 32 letters, numbers, - or _. Stored securely; you won't see it again."}>
                <Input value={draft.accessCode} maxLength={32} autoComplete="off" spellCheck={false} onChange={(event) => set("accessCode", event.target.value.toUpperCase())} />
              </Field>
            ) : null}
            {overUpi ? <Callout tone="warning">UPI payments generally stop at ₹1 lakh, so buyers may need a card or netbanking for this ticket.</Callout> : null}
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={pending} loadingLabel="Saving…">{draft.id ? "Save ticket" : "Add ticket"}</Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmationDialog
        open={archiving != null}
        title="Take this ticket off sale?"
        message="People can no longer choose it. Anyone who already has it keeps their registration."
        confirmLabel="Take off sale"
        loading={pending}
        onConfirm={() => archiving && archive(archiving)}
        onCancel={() => setArchiving(null)}
      />
    </Card>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { archiveTicketType, saveTicketType } from "@/app/actions/ticket-types";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader, Chip } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { formatMoney, minorToDecimalString, parseMoneyToMinor, UPI_TYPICAL_LIMIT_MINOR } from "@/lib/payments/money";

export type ManagedTicketType = {
  id: string;
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
};

type Draft = { id?: string; name: string; description: string; price: string; capacity: string; minPerOrder: string; maxPerOrder: string; salesStartAt: string; salesEndAt: string; };

const EMPTY: Draft = { name: "", description: "", price: "", capacity: "", minPerOrder: "1", maxPerOrder: "10", salesStartAt: "", salesEndAt: "" };

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
export function TicketTypesManager({ organisationSlug, eventId, tickets, currency, paidAllowed, paidBlockedReason }: {
  organisationSlug: string;
  eventId: string;
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
        eventId,
        ...(draft.id ? { ticketTypeId: draft.id } : {}),
        name: draft.name,
        description: draft.description,
        price: draft.price,
        capacity: draft.capacity ? Number(draft.capacity) : null,
        minPerOrder: Number(draft.minPerOrder) || 1,
        maxPerOrder: Number(draft.maxPerOrder) || 10,
        salesStartAt: fromLocalInput(draft.salesStartAt),
        salesEndAt: fromLocalInput(draft.salesEndAt),
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
      const result = await archiveTicketType({ organisationSlug, eventId, ticketTypeId: ticket.id });
      setArchiving(null);
      if (!result.ok) return showToast(result.error, "error");
      showToast("Ticket taken off sale.", "success");
      router.refresh();
    });
  }

  const set = (key: keyof Draft, value: string) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  return (
    <Card as="section" className="rounded-xl" aria-labelledby="tickets-title">
      <CardHeader
        title={<span id="tickets-title">Tickets</span>}
        description="Without tickets, registration is free as before. Add tickets to offer free and paid options, each with its own limit and sales window. The event's capacity stays the overall limit."
        action={draft ? null : (
          <Button variant="secondary" onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
            <Plus aria-hidden className="size-4" />
            Add ticket
          </Button>
        )}
      />
      <div className="flex flex-col gap-4">
        {paidBlockedReason ? <Callout tone="info">{paidBlockedReason}</Callout> : null}
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
                  {ticket.priceMinor > 0 ? <Chip tone="accent" size="sm">Paid</Chip> : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label={`Edit ${ticket.name}`}
                    onClick={() => {
                      setError(null);
                      setDraft({
                        id: ticket.id,
                        name: ticket.name,
                        description: ticket.description,
                        price: ticket.priceMinor > 0 ? minorToDecimalString(ticket.priceMinor, ticket.currency) : "",
                        capacity: ticket.capacity == null ? "" : String(ticket.capacity),
                        minPerOrder: String(ticket.minPerOrder),
                        maxPerOrder: String(ticket.maxPerOrder),
                        salesStartAt: toLocalInput(ticket.salesStartAt),
                        salesEndAt: toLocalInput(ticket.salesEndAt),
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
            <Field label="Ticket name" required>
              <Input value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} placeholder="General admission" />
            </Field>
            <Field label="Description" optional>
              <Textarea rows={2} value={draft.description} maxLength={500} onChange={(event) => set("description", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={`Price (${draftCurrency})`} helperText={paidAllowed ? "Leave blank or 0 for a free ticket. Include any tax." : "Free only until payments are set up."}>
                <Input inputMode="decimal" value={draft.price} disabled={!paidAllowed && !draft.price} onChange={(event) => set("price", event.target.value)} placeholder="0" />
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

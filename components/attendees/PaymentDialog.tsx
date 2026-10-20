"use client";

import { useState, useTransition } from "react";
import { correctOfflinePayment, refundPaidOrder, sendOrderPaymentLink, settlePaidOrder } from "@/app/actions/payment-operations";
import type { AttendeeOrder, AttendeeRow } from "@/components/attendees/types";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Callout, DetailList, type ChipTone } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogHeader } from "@/components/ui/dialog";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { formatMoney } from "@/lib/payments/money";

export const OFFLINE_METHODS = [
  ["CASH", "Cash"],
  ["UPI", "UPI"],
  ["BANK_TRANSFER", "Bank transfer"],
  ["CARD_TERMINAL", "Card terminal"],
  ["OTHER", "Other"],
] as const;
type OfflineMethod = (typeof OFFLINE_METHODS)[number][0];

const METHOD_LABELS: Record<string, string> = Object.fromEntries(OFFLINE_METHODS);

/** The payment chip on a guest row. */
export function orderPaymentChip(order: AttendeeOrder | null | undefined): { label: string; tone: ChipTone; } | null {
  if (!order) return null;
  const test = order.testMode ? " (test)" : "";
  const total = formatMoney(order.totalMinor, order.currency);
  switch (order.status) {
    case "REQUESTED": return { label: `${total} after approval${test}`, tone: "neutral" };
    case "PENDING": return { label: `Awaiting ${total}${test}`, tone: "warning" };
    case "EXPIRED": return { label: "Payment expired", tone: "neutral" };
    case "CANCELLED": return { label: "Cancelled", tone: "neutral" };
    case "CONFIRMED":
      if (order.settlement === "waived") return { label: "Complimentary", tone: "neutral" };
      if (order.paidMinor > 0 && order.refundedMinor >= order.paidMinor) return { label: `Refunded${test}`, tone: "neutral" };
      if (order.refundedMinor + order.refundPendingMinor > 0) return { label: `Paid ${total}, part refunded${test}`, tone: "info" };
      return { label: `Paid ${total}${order.settlement === "offline" ? " offline" : ""}${test}`, tone: "success" };
  }
}

type Tab = "refund" | "cancel" | "correct";

/**
 * An organiser's payment actions for one guest's order: refund (in full or
 * part, optionally cancelling the tickets), record money taken in person,
 * make it complimentary, correct an offline record, or email a payment link.
 * Every action applies to the whole order.
 */
export function PaymentDialog({ organisationSlug, target, guest, onClose, onDone }: {
  organisationSlug: string;
  /** The event, or the series the guest's order is for. */
  target: { eventId: string; } | { seriesId: string; };
  guest: AttendeeRow;
  onClose: () => void;
  onDone: (message: string) => void;
}) {
  const order = guest.order!;
  const scope = { organisationSlug, ...target, orderId: order.id };
  const refundable = order.paidMinor - order.refundedMinor - order.refundPendingMinor;
  const confirmed = order.status === "CONFIRMED";
  const [tab, setTab] = useState<Tab>(refundable > 0 ? "refund" : "cancel");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [cancelTickets, setCancelTickets] = useState(false);
  const [method, setMethod] = useState<OfflineMethod>((order.offlinePayment?.method as OfflineMethod | null) ?? "CASH");
  const [reference, setReference] = useState(order.offlinePayment?.reference ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const chip = orderPaymentChip(order);

  function run(work: () => Promise<{ ok: boolean; error?: string; }>, message: string) {
    setError(null);
    startTransition(async () => {
      const result = await work();
      if (!result.ok) {
        setError(result.error ?? "That didn't work. Try again.");
        return;
      }
      onDone(message);
    });
  }

  const tickets = order.tickets === 1 ? "1 ticket" : `${order.tickets} tickets`;
  const methodField = (
    <Field label="Paid by">
      <Dropdown value={method} onChange={(event) => setMethod(event.target.value as OfflineMethod)}>
        {OFFLINE_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Dropdown>
    </Field>
  );

  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose(); }}>
      <DialogContent size="md">
        <DialogHeader title="Payment" description={`Order ${order.reference} · ${tickets}${guest.ticketName ? ` · ${guest.ticketName}` : ""}`} />
        <DialogBody className="flex flex-col gap-4 pb-6">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <DetailList items={[
            { label: "Status", value: chip?.label ?? "No payment" },
            { label: "Total", value: `${formatMoney(order.totalMinor, order.currency)}${order.testMode ? " (test mode)" : ""}` },
            ...(order.refundedMinor || order.refundPendingMinor ? [{ label: "Refunded", value: `${formatMoney(order.refundedMinor, order.currency)}${order.refundPendingMinor ? `, ${formatMoney(order.refundPendingMinor, order.currency)} on its way` : ""}` }] : []),
            ...(order.offlinePayment ? [{ label: "Paid by", value: `${METHOD_LABELS[order.offlinePayment.method ?? "OTHER"] ?? "Other"}${order.offlinePayment.reference ? ` · ${order.offlinePayment.reference}` : ""}` }] : []),
          ]} />

          {confirmed ? (
            <div className="flex flex-wrap gap-2" role="tablist" aria-label="Payment actions">
              {refundable > 0 ? <Button size="sm" variant={tab === "refund" ? "primary" : "ghost"} role="tab" aria-selected={tab === "refund"} onClick={() => setTab("refund")}>Refund</Button> : null}
              <Button size="sm" variant={tab === "cancel" ? "primary" : "ghost"} role="tab" aria-selected={tab === "cancel"} onClick={() => setTab("cancel")}>Cancel tickets</Button>
              {order.offlinePayment ? <Button size="sm" variant={tab === "correct" ? "primary" : "ghost"} role="tab" aria-selected={tab === "correct"} onClick={() => setTab("correct")}>Correct record</Button> : null}
            </div>
          ) : null}

          {confirmed && tab === "refund" && refundable > 0 ? (
            <form className="flex flex-col gap-3" onSubmit={(event) => {
              event.preventDefault();
              run(() => refundPaidOrder({ ...scope, amount, reason, cancelTickets }), cancelTickets ? "Refunded and cancelled." : "Refund recorded.");
            }}>
              <Field label={`Amount (${order.currency})`} optional helperText={`Leave blank to refund everything left: ${formatMoney(refundable, order.currency)}.${order.settlement === "offline" ? " This was paid in person, so return the money yourself; the refund is recorded." : ""}`}>
                <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
              </Field>
              <Field label="Reason" required><Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
              <CheckboxField label={`Also cancel the ${tickets} and free the places`} checked={cancelTickets} onCheckedChange={(checked) => setCancelTickets(checked === true)} />
              <div><Button type="submit" variant="danger" loading={pending} loadingLabel="Refunding…">Refund</Button></div>
            </form>
          ) : null}

          {confirmed && tab === "cancel" ? (
            <form className="flex flex-col gap-3" onSubmit={(event) => {
              event.preventDefault();
              run(() => refundPaidOrder({ ...scope, amount: refundable > 0 ? amount : "", reason, cancelTickets: true }), "Order cancelled.");
            }}>
              <p className="text-body-ui text-ink-secondary">
                {refundable > 0
                  ? `Cancels all ${tickets} and refunds what you enter (blank for everything left, ${formatMoney(refundable, order.currency)}). Enter 0 to cancel without a refund.`
                  : `Cancels all ${tickets}; nothing is left to refund.`} The places go to the waitlist.
              </p>
              {refundable > 0 ? (
                <Field label={`Refund (${order.currency})`} optional>
                  <Input inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} />
                </Field>
              ) : null}
              <Field label="Reason" required><Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
              <div><Button type="submit" variant="danger" loading={pending} loadingLabel="Cancelling…">Cancel tickets</Button></div>
            </form>
          ) : null}

          {confirmed && tab === "correct" && order.offlinePayment ? (
            <form className="flex flex-col gap-3" onSubmit={(event) => {
              event.preventDefault();
              run(() => correctOfflinePayment({ organisationSlug, ...target, paymentId: order.offlinePayment!.id, method, reference, reason }), "Payment record corrected.");
            }}>
              <p className="text-caption text-ink-muted">The original record is kept; each correction is added to its history.</p>
              {methodField}
              <Field label="Reference" optional><Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} /></Field>
              <Field label="Why the correction" required><Input value={reason} maxLength={500} onChange={(event) => setReason(event.target.value)} /></Field>
              <div><Button type="submit" loading={pending} loadingLabel="Saving…">Save correction</Button></div>
            </form>
          ) : null}

          {order.status === "PENDING" ? (
            <form className="flex flex-col gap-3" onSubmit={(event) => {
              event.preventDefault();
              run(() => settlePaidOrder({ ...scope, mode: "offline", method, reference }), "Marked as paid. Each guest gets their ticket by email.");
            }}>
              <p className="text-body-ui text-ink-secondary">Took the money another way? Record it and the tickets are confirmed. The online payment page is closed first.</p>
              <div className="grid gap-3 sm:grid-cols-2">
                {methodField}
                <Field label="Reference" optional><Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder="Receipt or UPI id" /></Field>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button type="submit" loading={pending} loadingLabel="Saving…">Mark as paid</Button>
                <Button type="button" variant="secondary" disabled={pending} onClick={() => run(() => settlePaidOrder({ ...scope, mode: "waive" }), "Made complimentary. Each guest gets their ticket by email.")}>Make complimentary</Button>
              </div>
            </form>
          ) : null}

          {order.status === "PENDING" || order.status === "EXPIRED" || order.status === "REQUESTED" ? (
            <div className="flex flex-col gap-2 border-t border-line pt-4">
              <p className="text-body-ui text-ink-secondary">
                {order.status === "PENDING" ? "Email the payment link again." : "Hold the places for 24 hours and email a payment link."}
              </p>
              <div><Button variant="secondary" loading={pending} loadingLabel="Sending…" onClick={() => run(() => sendOrderPaymentLink(scope), "Payment link sent.")}>Send payment link</Button></div>
            </div>
          ) : null}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

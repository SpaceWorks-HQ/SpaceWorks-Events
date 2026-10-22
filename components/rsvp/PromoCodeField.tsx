"use client";

import { useState, useTransition } from "react";
import { checkPromoCode, unlockTickets, type PromoPreview } from "@/app/actions/promo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { priceOrder, PricingError, type PricedTicketType, type PromoRule } from "@/lib/payments/pricing";
import type { PublicAddOn, PublicTicketType } from "@/lib/payments/tickets";

/** Paid-ticket extras for the registration form. */
export type TicketingInfo = {
  promoCodes: boolean;
  refundPolicy: string;
  refundPolicyText: string;
  /** Some tickets are hidden behind access codes. */
  accessCodes?: boolean;
  /** Extras to buy alongside tickets. */
  addOns?: PublicAddOn[];
  /** Something here can cost money (a price, pay what you want, a fee, a paid extra or a hidden ticket). */
  sellsPaid?: boolean;
};

export type AppliedPromo = { code: string; rule: PromoPreview; };

function asRule(preview: PromoPreview): PromoRule {
  return { ...preview, amountOffMinor: preview.amountOffMinor == null ? null : BigInt(preview.amountOffMinor) };
}

/** A public ticket as the shared pricing rules see it. */
export function asPricedTicket(ticket: PublicTicketType): PricedTicketType {
  return {
    id: ticket.id, name: ticket.name, priceMinor: BigInt(ticket.priceMinor), minPerOrder: ticket.minPerOrder, maxPerOrder: ticket.maxPerOrder,
    pricing: ticket.flexible ? "FLEXIBLE" : "FIXED", maxPriceMinor: ticket.maxPriceMinor == null ? null : BigInt(ticket.maxPriceMinor),
    seatsPerTicket: ticket.seatsPerTicket, feeMinor: BigInt(ticket.feeMinor),
  };
}

/** What the buyer has chosen beyond quantities: pay-what-you-want amounts and add-ons. */
export type OrderChoices = { amounts: Record<string, number>; addOns: Record<string, number>; addOnTypes: PublicAddOn[]; };

/**
 * The order's total as the server will price it, with exactly the same
 * rules: chosen amounts, booking fees and add-ons. A code that doesn't apply
 * to this choice says why; the total is then priced without it.
 */
export function previewOrderTotal(tickets: PublicTicketType[], quantities: Record<string, number>, promo: AppliedPromo | null, choices: OrderChoices = { amounts: {}, addOns: {}, addOnTypes: [] }) {
  const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity, amountMinor: choices.amounts[ticketTypeId] ?? null }));
  const addOns = Object.entries(choices.addOns).filter(([, quantity]) => quantity > 0).map(([addOnId, quantity]) => ({ addOnId, quantity }));
  const addOnTypes = choices.addOnTypes.map((addOn) => ({ id: addOn.id, name: addOn.name, priceMinor: BigInt(addOn.priceMinor), maxPerOrder: addOn.maxPerOrder }));
  const empty = { totalMinor: 0, discountMinor: 0, feeMinor: 0, promoProblem: null as string | null, priceProblem: null as string | null };
  if (items.length === 0) return empty;
  const priced = (rule: PromoRule | null) => {
    const order = priceOrder(items, tickets.map(asPricedTicket), rule, { addOns, addOnTypes });
    const fees = order.lines.filter((line) => line.kind === "FEE").reduce((sum, line) => sum + line.totalMinor, BigInt(0));
    return { totalMinor: Number(order.totalMinor), discountMinor: Number(order.discountMinor), feeMinor: Number(fees) };
  };
  try {
    return { ...priced(promo ? asRule(promo.rule) : null), promoProblem: null, priceProblem: null };
  } catch (error) {
    if (!(error instanceof PricingError)) throw error;
    if (!promo) return { ...empty, priceProblem: error.message };
    try {
      return { ...priced(null), promoProblem: error.message, priceProblem: null };
    } catch (inner) {
      if (inner instanceof PricingError) return { ...empty, priceProblem: inner.message };
      throw inner;
    }
  }
}

export function PromoCodeField({ orgSlug, eventSlug, eventInstanceId, applied, onApplied, problem }: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
  applied: AppliedPromo | null;
  onApplied: (promo: AppliedPromo | null) => void;
  /** Why the applied code doesn't discount the current choice. */
  problem: string | null;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  if (applied) {
    return (
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-body-ui">
        <span className="text-ink">Promo code <strong>{applied.code}</strong> applied.</span>
        {problem ? <span className="text-caption text-ink-muted">{problem}</span> : null}
        <Button size="sm" variant="quiet" onClick={() => onApplied(null)}>Remove</Button>
      </div>
    );
  }
  return (
    <Field label="Promo code" optional error={error}>
      <div className="flex gap-2">
        {/* Field labels its direct child, which here is the row, so the input names itself. */}
        <Input
          aria-label="Promo code"
          value={code}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(undefined); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        />
        <Button
          variant="secondary"
          loading={pending}
          disabled={!code.trim()}
          onClick={() => startTransition(async () => {
            const result = await checkPromoCode({ orgSlug, ...(eventSlug ? { eventSlug } : { eventInstanceId }), code });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onApplied({ code: code.trim(), rule: result.data! });
          })}
        >
          Apply
        </Button>
      </div>
    </Field>
  );
}

/** "Have an access code?": reveals the tickets it unlocks; the code goes with the order. */
export function AccessCodeField({ orgSlug, eventSlug, eventInstanceId, applied, onUnlocked }: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
  applied: string | null;
  onUnlocked: (code: string, tickets: PublicTicketType[]) => void;
}) {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | undefined>();
  const [pending, startTransition] = useTransition();
  if (applied) return <p className="text-body-ui text-ink">Access code <strong>{applied}</strong> unlocked its tickets above.</p>;
  return (
    <Field label="Access code" optional error={error} helperText="Some tickets are only shown with a code from the organiser.">
      <div className="flex gap-2">
        <Input
          aria-label="Access code"
          value={code}
          maxLength={32}
          autoComplete="off"
          spellCheck={false}
          onChange={(event) => { setCode(event.target.value.toUpperCase()); setError(undefined); }}
          onKeyDown={(event) => { if (event.key === "Enter") event.preventDefault(); }}
        />
        <Button
          variant="secondary"
          loading={pending}
          disabled={!code.trim()}
          onClick={() => startTransition(async () => {
            const result = await unlockTickets({ orgSlug, ...(eventSlug ? { eventSlug } : { eventInstanceId }), code });
            if (!result.ok) {
              setError(result.error);
              return;
            }
            onUnlocked(code.trim(), result.data!);
          })}
        >
          Unlock
        </Button>
      </div>
    </Field>
  );
}

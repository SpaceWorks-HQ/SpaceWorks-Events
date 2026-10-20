"use client";

import { useState, useTransition } from "react";
import { checkPromoCode, type PromoPreview } from "@/app/actions/promo";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { priceOrder, PricingError, type PromoRule } from "@/lib/payments/pricing";
import type { PublicTicketType } from "@/lib/payments/tickets";

/** Paid-ticket extras for the registration form. */
export type TicketingInfo = { promoCodes: boolean; refundPolicy: string; refundPolicyText: string; };

export type AppliedPromo = { code: string; rule: PromoPreview; };

function asRule(preview: PromoPreview): PromoRule {
  return { ...preview, amountOffMinor: preview.amountOffMinor == null ? null : BigInt(preview.amountOffMinor) };
}

/**
 * The order's total as the server will price it, with exactly the same
 * rules. A code that doesn't apply to this choice says why; the total then
 * stays undiscounted.
 */
export function previewOrderTotal(tickets: PublicTicketType[], quantities: Record<string, number>, promo: AppliedPromo | null) {
  const plain = tickets.reduce((sum, ticket) => sum + ticket.priceMinor * (quantities[ticket.id] ?? 0), 0);
  const items = Object.entries(quantities).filter(([, quantity]) => quantity > 0).map(([ticketTypeId, quantity]) => ({ ticketTypeId, quantity }));
  if (!promo || items.length === 0) return { totalMinor: plain, discountMinor: 0, promoProblem: null };
  try {
    const priced = priceOrder(items, tickets.map((ticket) => ({ ...ticket, priceMinor: BigInt(ticket.priceMinor) })), asRule(promo.rule));
    return { totalMinor: Number(priced.totalMinor), discountMinor: Number(priced.discountMinor), promoProblem: null };
  } catch (error) {
    if (error instanceof PricingError) return { totalMinor: plain, discountMinor: 0, promoProblem: error.message };
    throw error;
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

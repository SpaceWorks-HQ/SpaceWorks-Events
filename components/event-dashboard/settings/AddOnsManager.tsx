"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { archiveAddOn, saveAddOn } from "@/app/actions/ticket-types";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Callout, Card, CardHeader } from "@/components/ui/display";
import { Field, Input, Textarea } from "@/components/ui/field";
import { formatMoney, minorToDecimalString } from "@/lib/payments/money";
import type { TicketTarget } from "./TicketTypesManager";

export type ManagedAddOn = { id: string; name: string; description: string; priceMinor: number; capacity: number | null; maxPerOrder: number; sold: number; };

type Draft = { id?: string; name: string; description: string; price: string; capacity: string; maxPerOrder: string; };
const EMPTY: Draft = { name: "", description: "", price: "", capacity: "", maxPerOrder: "10" };

/**
 * Extras bought alongside tickets: a T-shirt, lunch, parking, a donation.
 * They take no seat. Taking one off sale leaves orders as they are.
 */
export function AddOnsManager({ organisationSlug, target, currency, addOns, paidAllowed }: {
  organisationSlug: string;
  target: TicketTarget;
  currency: string;
  addOns: ManagedAddOn[];
  paidAllowed: boolean;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [draft, setDraft] = useState<Draft | null>(null);
  const [archiving, setArchiving] = useState<ManagedAddOn | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const set = (key: keyof Draft, value: string) => setDraft((current) => (current ? { ...current, [key]: value } : current));

  function save() {
    if (!draft) return;
    setError(null);
    startTransition(async () => {
      const result = await saveAddOn({
        organisationSlug, ...target, ...(draft.id ? { addOnId: draft.id } : {}),
        name: draft.name, description: draft.description, price: draft.price,
        capacity: draft.capacity ? Number(draft.capacity) : null, maxPerOrder: Number(draft.maxPerOrder) || 10,
      });
      if (!result.ok) return setError(result.error);
      setDraft(null);
      showToast(draft.id ? "Extra updated." : "Extra added.", "success");
      router.refresh();
    });
  }

  return (
    <Card as="section" className="rounded-xl" aria-labelledby="add-ons-title">
      <CardHeader
        title={<span id="add-ons-title">Extras</span>}
        description="Things guests can add to their order, like a T-shirt, lunch or a donation. They don't take a place."
        action={draft ? null : (
          <Button variant="secondary" onClick={() => { setError(null); setDraft({ ...EMPTY }); }}>
            <Plus aria-hidden className="size-4" />
            Add extra
          </Button>
        )}
      />
      <div className="flex flex-col gap-4">
        {addOns.length === 0 && !draft ? <p className="text-body-ui text-ink-muted">No extras.</p> : null}
        {addOns.length > 0 ? (
          <ul className="flex flex-col divide-y divide-line rounded-lg border border-line">
            {addOns.map((addOn) => (
              <li key={addOn.id} className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-baseline gap-x-2 text-[15px] font-semibold text-ink">
                    {addOn.name}
                    <span className="font-normal text-ink-secondary">{addOn.priceMinor > 0 ? formatMoney(addOn.priceMinor, currency) : "Free"}</span>
                  </p>
                  <p className="text-caption text-ink-muted">{addOn.sold} sold{addOn.capacity != null ? ` of ${addOn.capacity}` : ""}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button variant="ghost" size="sm" aria-label={`Edit ${addOn.name}`} onClick={() => {
                    setError(null);
                    setDraft({ id: addOn.id, name: addOn.name, description: addOn.description, price: addOn.priceMinor > 0 ? minorToDecimalString(addOn.priceMinor, currency) : "", capacity: addOn.capacity == null ? "" : String(addOn.capacity), maxPerOrder: String(addOn.maxPerOrder) });
                  }}>
                    <Pencil aria-hidden className="size-4" />
                    Edit
                  </Button>
                  <Button variant="dangerQuiet" size="sm" onClick={() => setArchiving(addOn)}>Take off sale</Button>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
        {draft ? (
          <form className="flex flex-col gap-4 rounded-lg border border-line p-4" onSubmit={(event) => { event.preventDefault(); save(); }}>
            {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
            <Field label="Name" required>
              <Input value={draft.name} maxLength={80} onChange={(event) => set("name", event.target.value)} placeholder="Event T-shirt" />
            </Field>
            <Field label="Description" optional>
              <Textarea rows={2} value={draft.description} maxLength={300} onChange={(event) => set("description", event.target.value)} />
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={`Price (${currency})`} helperText={paidAllowed ? "Blank or 0 for free." : "Free only until payments are set up."}>
                <Input inputMode="decimal" value={draft.price} disabled={!paidAllowed && !draft.price} onChange={(event) => set("price", event.target.value)} placeholder="0" />
              </Field>
              <Field label="How many in all" optional>
                <Input type="number" min={1} value={draft.capacity} onChange={(event) => set("capacity", event.target.value)} />
              </Field>
              <Field label="Most per order">
                <Input type="number" min={1} max={100} value={draft.maxPerOrder} onChange={(event) => set("maxPerOrder", event.target.value)} />
              </Field>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button type="submit" loading={pending} loadingLabel="Saving…">{draft.id ? "Save extra" : "Add extra"}</Button>
              <Button type="button" variant="ghost" onClick={() => setDraft(null)}>Cancel</Button>
            </div>
          </form>
        ) : null}
      </div>
      <ConfirmationDialog
        open={archiving != null}
        title="Take this extra off sale?"
        message="Guests can no longer add it. Orders that include it keep it."
        confirmLabel="Take off sale"
        loading={pending}
        onConfirm={() => archiving && startTransition(async () => {
          const result = await archiveAddOn({ organisationSlug, ...target, addOnId: archiving.id });
          setArchiving(null);
          if (!result.ok) return showToast(result.error, "error");
          showToast("Extra taken off sale.", "success");
          router.refresh();
        })}
        onCancel={() => setArchiving(null)}
      />
    </Card>
  );
}

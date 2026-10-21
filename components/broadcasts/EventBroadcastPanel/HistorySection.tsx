"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { broadcastHtmlToText, describeBroadcastAudience } from "@/lib/broadcastTemplate";
import { cardClass, deliverySummary, type BroadcastHistoryRow } from "./shared";

export function HistorySection({ history, pending, loadFromHistory }: {
  history: BroadcastHistoryRow[];
  pending: boolean;
  loadFromHistory: (row: BroadcastHistoryRow) => void;
}) {
  return (
    <section aria-labelledby="broadcast-history" className={cn(cardClass, "gap-3")}>
      <h2 id="broadcast-history" className="text-h4 text-ink">Sent before</h2>
      {history.length === 0 ? (
        <p className="text-sm text-ink-muted">No emails have been sent for this event yet.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-line">
          {history.map((row) => (
            <li key={row.id} className="flex items-start gap-3 py-2.5 first:pt-0 last:pb-0">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink [overflow-wrap:anywhere]">{row.subject}</p>
                <p className="text-[13px] text-ink-muted">
                  Sent to {row.recipientCount} {row.recipientCount === 1 ? "person" : "people"} · <time dateTime={row.createdAt}>{row.sentLabel}</time>
                  {row.createdByName ? ` · by ${row.createdByName}` : ""}
                </p>
                <p className="text-[13px] text-ink-muted">{describeBroadcastAudience(row.statuses, row.attendance)}</p>
                {deliverySummary(row.delivery) ? (
                  <p className={cn("text-[13px]", row.delivery && !row.delivery.expired && row.delivery.failed ? "font-semibold text-danger-fg" : "text-ink-muted")}>{deliverySummary(row.delivery)}</p>
                ) : null}
                <p className="mt-1 line-clamp-2 whitespace-pre-wrap text-[13px] text-ink-secondary">{broadcastHtmlToText(row.body)}</p>
              </div>
              <Button size="sm" variant="quiet" className="shrink-0 font-semibold text-ink" onClick={() => loadFromHistory(row)} disabled={pending} aria-label={`Reuse “${row.subject}”`}>
                Reuse
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

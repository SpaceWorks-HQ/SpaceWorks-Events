"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Accordion, AccordionItem } from "@/components/ui/tabs";
import { formatDayTime } from "@/lib/format/datetime";

export type FeedbackResponseRow = {
  id: string;
  submittedAt: string;
  answers: Array<{ label: string; value: string }>;
};

/**
 * Anonymous list of individual feedback responses. Never receives attendee
 * identity or certificate information. With `showHeader={false}` it renders
 * only the list, for embedding inside the dashboard Responses card.
 */
export function FeedbackResponsesPanel(props: {
  responses: FeedbackResponseRow[];
  truncated: boolean;
  exportHref?: string;
  showHeader?: boolean;
  /** Event time zone for submission times; falls back to the browser's. */
  timeZone?: string;
}) {
  const { responses, truncated, exportHref, showHeader = true, timeZone } = props;
  const when = (value: string) => (timeZone ? formatDayTime(value, timeZone) : new Date(value).toLocaleString());
  return (
    <section className="flex flex-col gap-3" aria-label={showHeader ? undefined : "All feedback responses"}>
      {showHeader ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-h4 text-ink">Feedback responses</h2>
            <p className="mt-1 text-body-ui text-ink-muted">Responses are shown without attendee identity or certificate information.</p>
          </div>
          <div className="flex items-center gap-2">
            {exportHref ? <Button asChild variant="secondary" size="sm"><a href={exportHref}><Download aria-hidden className="size-4" />Download full CSV</a></Button> : null}
            <Chip size="sm">{`${responses.length}${truncated ? "+" : ""} responses`}</Chip>
          </div>
        </div>
      ) : null}
      {responses.length === 0 ? (
        <p className="text-body-ui text-ink-muted">No feedback responses yet.</p>
      ) : (
        <Accordion type="multiple" className="rounded-xl border border-line bg-canvas px-4 [&>*:last-child]:border-b-0">
          {responses.map((response, index) => (
            <AccordionItem key={response.id} value={response.id} title={<span className="text-[15px]">Response {responses.length - index} · {when(response.submittedAt)}</span>}>
              <div className="flex flex-col gap-3">
                {response.answers.length === 0 ? <p className="text-body-ui text-ink-muted">No answers were submitted.</p> : response.answers.map((answer) => (
                  <div key={`${answer.label}:${answer.value}`}>
                    <p className="text-label text-ink">{answer.label}</p>
                    <p className="whitespace-pre-wrap text-body-ui text-ink-secondary wrap-anywhere">{answer.value}</p>
                  </div>
                ))}
              </div>
            </AccordionItem>
          ))}
        </Accordion>
      )}
      {truncated ? <p className="text-caption text-ink-muted">Showing the 250 most recent responses. Download the CSV for all of them.</p> : null}
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { approveRsvp, rejectRsvp } from "@/app/actions/rsvp-lifecycle";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { Button } from "@/components/ui/button";
import { Avatar } from "@/components/ui/display";
import { formatRelativeTime } from "@/lib/format/datetime";
import type { PendingRequest } from "@/lib/eventDashboard/overview";
import { OpenTabButton } from "../EventDashboardTabs";

/** "Yesterday" → "yesterday"; dates such as "13 Oct 2026" stay as they are. */
function midSentence(value: string) {
  return /^[A-Z][a-z]/.test(value) && !/^[A-Z][a-z]{2} /.test(value) ? value.charAt(0).toLowerCase() + value.slice(1) : value;
}

/** Approval requests with inline Approve / Decline (organisation admins only; the actions re-check). */
export function WaitingForYou({
  organisationSlug,
  eventId,
  timeZone,
  referenceTime,
  requests,
  pendingTotal,
}: {
  organisationSlug: string;
  eventId: string;
  timeZone: string;
  referenceTime: string;
  requests: PendingRequest[];
  pendingTotal: number;
}) {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [declining, setDeclining] = useState<PendingRequest | null>(null);
  const now = new Date(referenceTime);

  function run(request: PendingRequest, action: typeof approveRsvp, success: string) {
    setBusyId(request.id);
    startTransition(async () => {
      const result = await action({ organisationSlug, rsvpId: request.id, eventId });
      setBusyId(null);
      if (!result.ok) {
        showToast(result.error, "error");
        return;
      }
      showToast(success, "success");
      router.refresh();
    });
  }

  const more = pendingTotal - requests.length;

  return (
    <section aria-labelledby="overview-waiting-title" className="flex flex-col gap-1 rounded-xl border border-line bg-canvas p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="overview-waiting-title" className="text-h4 text-ink">
          Waiting for you
        </h2>
        <OpenTabButton tab="guests" sub="people" className="inline-flex min-h-9 items-center gap-1 text-sm font-semibold text-ink underline-offset-4 hover:underline">
          All guests <ArrowRight aria-hidden className="size-4" />
        </OpenTabButton>
      </div>
      {requests.length === 0 ? (
        <p className="py-2 text-body-ui text-ink-muted">No one is waiting for approval.</p>
      ) : (
        <ul className="flex flex-col">
          {requests.map((request) => {
            const busy = pending && busyId === request.id;
            return (
              <li key={request.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line py-2.5 last:border-b-0">
                <Avatar name={request.name} size="md" tone="warning" />
                <span className="flex min-w-0 flex-[1_1_160px] flex-col">
                  <span className="truncate font-semibold text-ink">{request.name}</span>
                  <span className="text-caption text-ink-muted">Asked to join · {midSentence(formatRelativeTime(request.createdAt, timeZone, now))}</span>
                </span>
                <span className="flex items-center gap-1">
                  <Button size="sm" variant="secondary" disabled={pending} loading={busy} loadingLabel="Approving…" aria-label={`Approve ${request.name}`} onClick={() => run(request, approveRsvp, `${request.name} approved`)}>
                    Approve
                  </Button>
                  <Button size="sm" variant="dangerQuiet" disabled={pending} aria-label={`Decline ${request.name}`} onClick={() => setDeclining(request)}>
                    Decline
                  </Button>
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {more > 0 ? <p className="pt-1 text-caption text-ink-muted">and {more} more in Guests.</p> : null}

      <ConfirmationDialog
        open={declining != null}
        title="Decline this request?"
        message={`${declining?.name ?? "This guest"} will not get a place at this event.`}
        confirmLabel="Decline"
        loading={pending}
        onCancel={() => setDeclining(null)}
        onConfirm={() => {
          if (!declining) return;
          const request = declining;
          setDeclining(null);
          run(request, rejectRsvp, `${request.name} declined`);
        }}
      />
    </section>
  );
}

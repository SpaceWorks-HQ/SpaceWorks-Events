"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Avatar, EmptyState } from "@/components/ui/display";
import { formatDate, formatRelativeTime } from "@/lib/format/datetime";
import { Input } from "@/components/ui/field";
import { addEventInvite, removeEventInvite } from "@/app/actions/invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export function EventInvitePanel(props: {
  organisationSlug: string;
  eventId: string;
  eventHasEnded: boolean;
  invites: { id: string; email: string; createdAt: string }[];
  /** Event timezone for "Invited …" labels. */
  timeZone?: string;
  /** Server render time (ISO) so relative labels match between server and client. */
  now?: string;
}) {
  const { organisationSlug, eventId, eventHasEnded, invites, timeZone = "UTC", now } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-h4 text-ink">Invites</h2>
        <p className="text-body-ui text-ink-muted">
          {eventHasEnded
            ? "This event has ended, so no new invites can be sent."
            : "Required for invite-only events. Emails are matched case-insensitively."}
        </p>
      </div>
      <form
        className="flex flex-col gap-2.5 sm:flex-row sm:items-center"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await addEventInvite({
              organisationSlug,
              eventId,
              email,
            });
            if (!res.ok) {
              showToast(res.error, "error");
              return;
            }
            setEmail("");
            showToast("Invite added", "success");
            router.refresh();
          });
        }}
      >
        <label htmlFor="event-invite-email" className="sr-only">Email address to invite</label>
        <div className="min-w-0 sm:w-[360px]">
          <Input
            id="event-invite-email"
            type="email"
            placeholder="name@example.org"
            autoComplete="off"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={eventHasEnded || pending}
          />
        </div>
        <Button type="submit" variant="primary" startIcon={<Plus />} loading={pending && !removeTarget} disabled={eventHasEnded || pending}>
          Add
        </Button>
      </form>
      {invites.length === 0 ? (
        <EmptyState mood="sleepy" title="No invites yet.">
          {eventHasEnded ? null : "Add an email address to let that person register."}
        </EmptyState>
      ) : (
        <ul aria-label="Invited emails" className="flex flex-col gap-2">
          {invites.map((inv) => (
            <li key={inv.id} className="flex min-w-0 items-center gap-3.5 rounded-xl border border-line bg-canvas px-4 py-3">
              <Avatar name={inv.email} size="md" />
              <div className="min-w-0 flex-1">
                <p className="truncate font-bold text-ink">{inv.email}</p>
                <p className="text-caption text-ink-muted">Invited {invitedWhen(inv.createdAt, timeZone, now)}</p>
              </div>
              <IconButton label={`Remove invite for ${inv.email}`} variant="danger" size="sm" disabled={pending} onClick={() => setRemoveTarget(inv)}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <ConfirmationDialog
        open={Boolean(removeTarget)}
        title="Remove event invite?"
        message={`Remove ${removeTarget?.email ?? "this email"} from the event allowlist?`}
        confirmLabel="Remove invite"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          startTransition(async () => {
            const res = await removeEventInvite({
              organisationSlug,
              eventId,
              inviteId: removeTarget.id,
            });
            if (!res.ok) return showToast(res.error, "error");
            setRemoveTarget(null);
            showToast("Invite removed", "success");
            router.refresh();
          });
        }}
      />
    </div>
  );
}

function invitedWhen(createdAt: string, timeZone: string, now?: string) {
  const label = formatRelativeTime(createdAt, timeZone, now);
  return label === formatDate(createdAt, timeZone) ? `on ${label}` : `${label.charAt(0).toLowerCase()}${label.slice(1)}`;
}

"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/display";
import { Input } from "@/components/ui/field";
import { addSeriesInvite, removeSeriesInvite } from "@/app/actions/invites";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";

export function SeriesInvitePanel(props: {
  organisationSlug: string;
  eventSeriesId: string;
  invites: { id: string; email: string; createdAt: string }[];
}) {
  const { organisationSlug, eventSeriesId, invites } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [email, setEmail] = useState("");
  const [pending, startTransition] = useTransition();
  const [removeTarget, setRemoveTarget] = useState<{
    id: string;
    email: string;
  } | null>(null);

  return (
    <div className="flex flex-col gap-4">
      <p className="text-body-ui text-ink-muted">
        For invite-only series. Emails are matched case-insensitively.
      </p>
      <form
        className="flex flex-col gap-2.5 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          startTransition(async () => {
            const res = await addSeriesInvite({
              organisationSlug,
              eventSeriesId,
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
        <label htmlFor="series-invite-email" className="sr-only">Email</label>
        <Input
          id="series-invite-email"
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <Button type="submit" variant="primary" disabled={pending}>
          Add
        </Button>
      </form>
      {invites.length === 0 ? (
        <EmptyState mood="sleepy">No invites yet.</EmptyState>
      ) : (
        <ul className="flex flex-col divide-y divide-line rounded-lg border border-line bg-canvas">
          {invites.map((inv) => (
            <li key={inv.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-[15px] font-semibold text-ink">{inv.email}</p>
                <p className="text-caption text-ink-muted">{new Date(inv.createdAt).toLocaleString()}</p>
              </div>
              <IconButton label="Remove" disabled={pending} onClick={() => setRemoveTarget(inv)}>
                <Trash2 />
              </IconButton>
            </li>
          ))}
        </ul>
      )}
      <ConfirmationDialog
        open={Boolean(removeTarget)}
        title="Remove series invite?"
        message={`Remove ${removeTarget?.email ?? "this email"} from the series allowlist?`}
        confirmLabel="Remove invite"
        loading={pending}
        onCancel={() => setRemoveTarget(null)}
        onConfirm={() => {
          if (!removeTarget) return;
          startTransition(async () => {
            const res = await removeSeriesInvite({
              organisationSlug,
              eventSeriesId,
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

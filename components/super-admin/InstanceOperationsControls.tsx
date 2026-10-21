"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useToast } from "@/components/feedback/ToastProvider";
import {
  deliverInstanceOutbox,
  purgeExpiredVerificationTokens,
  recordBackupRestoreVerification,
  retryFailedOutboxMessages,
  sendInstanceTestEmail,
} from "@/app/actions/instance";

type OperationData = { sent?: number; failed?: number; deleted?: number; retried?: number; to?: string };
type OperationResult = { ok: boolean; error?: string; data?: OperationData | void };

function plural(count: number, one: string, many: string) {
  return `${count.toLocaleString()} ${count === 1 ? one : many}`;
}

function deliveredMessage(data: OperationData | undefined) {
  const sent = data?.sent ?? 0;
  const failed = data?.failed ?? 0;
  if (sent === 0 && failed === 0) return "No queued email was due for delivery.";
  return `Outbox processed: ${sent.toLocaleString()} sent, ${failed.toLocaleString()} failed.`;
}

export function InstanceOperationsControls() {
  const router = useRouter();
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [confirmDrill, setConfirmDrill] = useState(false);

  function run(action: () => Promise<OperationResult>, success: (data: OperationData | undefined) => string, after?: () => void) {
    startTransition(async () => {
      let result: OperationResult;
      try {
        result = await action();
      } catch {
        // Network loss or a server crash; the actions themselves return UI-safe errors.
        after?.();
        showToast("Could not reach the server. Check your connection and try again.", "error");
        return;
      }
      after?.();
      if (!result.ok) {
        showToast(result.error ?? "Could not complete that operation.", "error");
        return;
      }
      showToast(success(result.data ?? undefined), "success");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-2.5 sm:flex-row sm:flex-wrap" aria-busy={pending}>
      <Button disabled={pending} variant="primary" onClick={() => run(deliverInstanceOutbox, deliveredMessage)}>
        Deliver queued email
      </Button>
      <Button disabled={pending} variant="secondary" onClick={() => run(sendInstanceTestEmail, (data) => data?.failed ? `Test email to ${data.to} did not send yet; see Failed email deliveries below.` : `Test email sent to ${data?.to}. Check your inbox.`)}>
        Send test email
      </Button>
      <Button disabled={pending} variant="secondary" onClick={() => run(retryFailedOutboxMessages, (data) => (data?.retried ? `${plural(data.retried, "failed message", "failed messages")} requeued for delivery.` : "No failed email to retry."))}>
        Retry failed email (last 7 days)
      </Button>
      <Button disabled={pending} variant="secondary" onClick={() => run(purgeExpiredVerificationTokens, (data) => (data?.deleted ? `${plural(data.deleted, "expired token", "expired tokens")} removed.` : "No expired tokens to remove."))}>
        Purge expired tokens
      </Button>
      <Button disabled={pending} variant="secondary" onClick={() => setConfirmDrill(true)}>
        Record restore drill
      </Button>
      <ConfirmationDialog
        open={confirmDrill}
        title="Record a restore drill?"
        message="Only record this after restoring a recent backup to a separate database and checking the data. It is saved to the audit log as evidence; it does not create or test a backup."
        confirmLabel="Record drill"
        destructive={false}
        loading={pending}
        onCancel={() => setConfirmDrill(false)}
        onConfirm={() => run(recordBackupRestoreVerification, () => "Backup restore verification recorded.", () => setConfirmDrill(false))}
      />
    </div>
  );
}

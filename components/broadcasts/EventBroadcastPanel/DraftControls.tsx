"use client";

import { Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import type { DraftAutosaveState } from "@/lib/broadcastDraftAutosave";
import type { PendingReplace } from "./draft";

/** The quiet line under the message: draft status, Retry after a failed save, Discard and Save. */
export function DraftStatusBar(props: {
  state: DraftAutosaveState;
  statusText: string;
  /** Sending, or waiting out the undo countdown. */
  busy: boolean;
  replacing: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const { state, statusText, busy, replacing, onSave, onDiscard } = props;
  return (
    <div className="flex flex-col gap-2 border-t border-line pt-3 min-[420px]:flex-row min-[420px]:items-center">
      <p role="status" aria-live="polite" aria-atomic="true" className="flex flex-1 flex-wrap items-center gap-x-1.5 text-caption text-ink-muted">
        <span>{statusText}</span>
        {state.error && state.dirty && !state.saving ? (
          <>
            <span aria-hidden>·</span>
            <Button variant="quiet" size="sm" className="px-0 font-semibold text-ink" onClick={onSave}>
              Retry
            </Button>
          </>
        ) : null}
      </p>
      <div className="flex items-center gap-2">
        {state.hasDraft || state.dirty ? (
          <Button variant="dangerQuiet" size="sm" disabled={busy || replacing} onClick={onDiscard}>
            Discard draft…
          </Button>
        ) : null}
        <Button variant="secondary" size="sm" startIcon={<Save />} disabled={!state.dirty || state.saving || busy} onClick={onSave}>
          Save draft
        </Button>
      </div>
    </div>
  );
}

/** Asks before a template, a reused email, or a discard replaces work the organiser could lose. */
export function ReplaceDraftDialog(props: { pending: PendingReplace | null; replacing: boolean; onCancel: () => void; onConfirm: () => void }) {
  const { pending, replacing, onCancel, onConfirm } = props;
  const discard = pending?.kind === "discard";
  return (
    <ConfirmDialog
      open={pending !== null}
      title={discard ? "Discard this draft?" : "Replace your draft?"}
      message={
        discard
          ? "Your saved subject, message, design, and audience will be removed, and the editor starts again from the first template. This can't be undone."
          : pending?.kind === "template"
            ? `Loading the “${pending.name}” template replaces what you've written, and your saved draft is removed.`
            : "Reusing this email replaces what you've written, and your saved draft is removed."
      }
      confirmLabel={discard ? "Discard draft" : "Replace draft"}
      cancelLabel={discard ? "Keep draft" : "Keep my draft"}
      destructive
      loading={replacing}
      onCancel={onCancel}
      onConfirm={onConfirm}
    />
  );
}

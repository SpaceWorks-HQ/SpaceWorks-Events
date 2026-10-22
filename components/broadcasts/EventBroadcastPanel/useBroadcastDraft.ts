"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { discardEventBroadcastDraft, saveEventBroadcastDraft } from "@/app/actions/broadcasts";
import { DraftAutosave, draftStatusText, type DraftAutosaveState, type EventBroadcastDraftDto } from "@/lib/broadcastDraftAutosave";
import { BROADCAST_STARTER_TEMPLATES } from "@/lib/broadcastTemplate";
import { useToast } from "@/components/feedback/ToastProvider";
import { startingContent, type ComposerContent, type PendingReplace } from "./draft";

const noopSubscribe = () => () => {};

/**
 * The Emails-tab draft: restores, autosaves, and replaces the composer's
 * content. The DraftAutosave controller owns the timing; React only mirrors
 * its state. `apply` puts new content into the composer's own state.
 */
export function useBroadcastDraft(options: {
  organisationSlug: string;
  eventId: string;
  draft: EventBroadcastDraftDto | null;
  initial: ComposerContent;
  content: ComposerContent;
  apply: (next: ComposerContent) => void;
}) {
  const { organisationSlug, eventId, draft, initial, content, apply } = options;
  const { showToast } = useToast();
  const contentRef = useRef(content);
  const [state, setState] = useState<DraftAutosaveState>(() => ({
    dirty: false, saving: false, hasDraft: draft !== null, savedAt: draft?.updatedAt ?? null, error: null,
  }));
  const [autosave] = useState(() => new DraftAutosave({
    initial,
    savedAt: draft?.updatedAt ?? null,
    onChange: setState,
    save: async (next) => {
      const result = await saveEventBroadcastDraft({ organisationSlug, eventId, ...next, statuses: [...next.statuses] });
      return result.ok ? { ok: true, updatedAt: result.data?.updatedAt ?? new Date().toISOString() } : { ok: false, error: result.error };
    },
  }));
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const [replacing, setReplacing] = useState(false);
  // Saved times are formatted in the browser's locale, so only after hydration.
  const hydrated = useSyncExternalStore(noopSubscribe, () => true, () => false);
  const [timeFormat] = useState(() => new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }));

  useEffect(() => {
    contentRef.current = content;
    autosave.edit(content);
  }, [autosave, content]);

  // Switching dashboard tabs unmounts the composer: save what is left once.
  useEffect(() => () => autosave.leave(), [autosave]);

  // Closing or reloading the tab with unsaved work asks first. Client-side
  // navigation is covered by the save on unmount above.
  const unsaved = state.dirty || state.saving;
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);

  /** Puts new content in the composer as a fresh starting point, removing the saved draft if there is one. */
  async function replaceComposer(next: ComposerContent): Promise<boolean> {
    const hadDraft = autosave.state.hasDraft;
    apply(next);
    contentRef.current = next;
    autosave.reset(next, { hasDraft: hadDraft, savedAt: autosave.state.savedAt });
    if (!hadDraft) return true;
    const result = await discardEventBroadcastDraft({ organisationSlug, eventId });
    if (!result.ok) {
      // The old draft is still on the server; saving the new content replaces it.
      autosave.markUnsaved();
      showToast(result.error, "error");
      return false;
    }
    autosave.reset(next, { hasDraft: false, savedAt: null });
    autosave.edit(contentRef.current);
    return true;
  }

  async function performReplace(request: PendingReplace) {
    if (request.kind === "template") {
      const template = BROADCAST_STARTER_TEMPLATES.find((candidate) => candidate.id === request.id);
      if (!template) return;
      await replaceComposer({
        subject: template.subject,
        body: template.bodyHtml,
        design: contentRef.current.design,
        statuses: [...template.audience.statuses],
        attendance: template.audience.attendance,
        templateId: template.id,
      });
      showToast(`Loaded the “${template.name}” template. Edit anything before sending.`, "success");
    } else if (request.kind === "history") {
      const { row } = request;
      await replaceComposer({ subject: row.subject, body: row.body, design: row.design, statuses: [...row.statuses], attendance: row.attendance, templateId: null });
      showToast("Loaded the previous email into the editor", "success");
    } else if (await replaceComposer(startingContent())) {
      showToast("Draft discarded", "success");
    }
  }

  return {
    state,
    statusText: draftStatusText(state, hydrated ? (iso: string) => timeFormat.format(new Date(iso)) : null),
    pendingReplace,
    replacing,
    saveNow: () => void autosave.saveNow(),
    /** Templates, reuse, and discard overwrite the composer, so they ask first when there is work to lose. */
    requestReplace(request: PendingReplace) {
      if (autosave.state.dirty || autosave.state.hasDraft) return setPendingReplace(request);
      void performReplace(request);
    },
    cancelReplace: () => setPendingReplace(null),
    confirmReplace() {
      const request = pendingReplace;
      if (!request) return;
      setReplacing(true);
      void performReplace(request).finally(() => {
        setReplacing(false);
        setPendingReplace(null);
      });
    },
    /** No autosave while the email is about to go: the send clears the draft. */
    sendStarted: () => autosave.suspend(),
    sendStopped: () => autosave.resume(),
    /** The server removed the draft with the send. What was sent is the new starting point; edits made during the countdown stay unsaved and autosave. */
    sent(payload: ComposerContent) {
      autosave.reset(payload, { hasDraft: false, savedAt: null });
      autosave.resume();
      autosave.edit(contentRef.current);
    },
  };
}

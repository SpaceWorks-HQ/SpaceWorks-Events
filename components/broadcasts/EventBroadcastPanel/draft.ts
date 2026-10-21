import { BROADCAST_STARTER_TEMPLATES } from "@/lib/broadcastTemplate";
import type { BroadcastDraftContent, EventBroadcastDraftDto } from "@/lib/broadcastDraftAutosave";
import { DEFAULT_BROADCAST_DESIGN, type BroadcastDesignId } from "@/lib/email/broadcastDesigns";
import type { BroadcastHistoryRow } from "./shared";

/** Everything the composer holds, which is exactly what a draft stores. */
export type ComposerContent = BroadcastDraftContent & { design: BroadcastDesignId };

/** What replacing the composer would overwrite, asked before a template, a reused email, or a discard. */
export type PendingReplace =
  | { kind: "template"; id: string; name: string }
  | { kind: "history"; row: BroadcastHistoryRow }
  | { kind: "discard" };

/** The composer as it opens without a saved draft: the first starter template. */
export function startingContent(): ComposerContent {
  const template = BROADCAST_STARTER_TEMPLATES[0]!;
  return {
    subject: template.subject,
    body: template.bodyHtml,
    design: DEFAULT_BROADCAST_DESIGN,
    statuses: [...template.audience.statuses],
    attendance: template.audience.attendance,
    templateId: template.id,
  };
}

/** A restored draft, or the starting template when there is none. */
export function initialComposer(draft: EventBroadcastDraftDto | null): ComposerContent {
  if (!draft) return startingContent();
  return { subject: draft.subject, body: draft.body, design: draft.design, statuses: [...draft.statuses], attendance: draft.attendance, templateId: draft.templateId };
}

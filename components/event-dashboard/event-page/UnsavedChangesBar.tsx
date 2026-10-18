"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";
import { unsavedLabel } from "./summary";

/**
 * Floating ink pill shown only while a form has unsaved changes. Place it at
 * the end of the editor; it sticks to the bottom of the viewport. With
 * `onSave` omitted, the save button submits the surrounding form.
 */
export function UnsavedChangesBar({
  visible,
  count,
  pending,
  onDiscard,
  onSave,
  className,
}: {
  visible: boolean;
  /** Number of changes; omit when it cannot be counted ("Unsaved changes"). */
  count?: number;
  pending: boolean;
  onDiscard: () => void;
  onSave?: () => void;
  className?: string;
}) {
  return (
    <div className={cn("pointer-events-none sticky bottom-4 z-20 flex justify-center", !visible && "hidden", className)}>
      <div
        role="region"
        aria-label="Unsaved changes"
        className="pointer-events-auto flex w-full max-w-xl flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-inverse py-1.5 pl-5 pr-1.5 text-on-inverse shadow-raised max-sm:rounded-3xl"
      >
        <span role="status" className="min-w-0 flex-1 text-sm font-semibold">
          {visible ? unsavedLabel(count ?? 0) : null}
        </span>
        <button
          type="button"
          onClick={onDiscard}
          disabled={pending}
          className="inline-flex min-h-10 items-center rounded-full px-3 text-sm font-semibold text-on-inverse underline-offset-4 hover:underline disabled:opacity-50"
        >
          Discard
        </button>
        <Button type={onSave ? "button" : "submit"} variant="inverse" size="sm" className="min-h-10" loading={pending} loadingLabel="Saving…" onClick={onSave}>
          Save changes
        </Button>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useRef, useState } from "react";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { cn } from "@/lib/cn";
import { EditorBody } from "./PhotoEditor/EditorBody";
import type { PhotoEditorProps } from "./PhotoEditor/types";

export type { PhotoEditorResult, PhotoEditorSettings } from "./PhotoEditor/types";

/**
 * A reusable crop-and-adjust dialog. Large two-column dialog on desktop,
 * full-screen sheet on phones. Output is re-encoded on the server, so this is
 * a convenience, not a safety boundary.
 */
export function PhotoEditor(props: PhotoEditorProps) {
  const { open, image, sessionKey, onCancel } = props;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const editedRef = useRef(false);

  const setEdited = useCallback((edited: boolean) => {
    editedRef.current = edited;
  }, []);

  const requestCancel = useCallback(() => {
    if (editedRef.current) setConfirmDiscard(true);
    else onCancel();
  }, [onCancel]);

  return (
    <>
      <Dialog open={open && Boolean(image)} onOpenChange={(next) => (next ? undefined : requestCancel())}>
        <DialogContent
          size="xl"
          hideClose
          onOpenAutoFocus={(event) => {
            // Land keyboard users on the crop area rather than the close button.
            const stage = document.querySelector<HTMLElement>("[data-crop-stage]");
            if (stage) {
              event.preventDefault();
              stage.focus({ preventScroll: true });
            }
          }}
          className={cn(
            "sm:h-[min(860px,calc(100dvh-32px))]",
            "max-sm:left-0 max-sm:top-0 max-sm:h-dvh max-sm:max-h-none max-sm:w-full max-sm:max-w-none max-sm:translate-x-0 max-sm:translate-y-0 max-sm:rounded-none max-sm:border-0 max-sm:data-[state=open]:animate-[yy-fade-in_180ms_ease-out]",
          )}
        >
          {image ? (
            <EditorBody
              key={sessionKey}
              {...props}
              image={image}
              onRequestCancel={requestCancel}
              onEditedChange={setEdited}
            />
          ) : null}
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmDiscard}
        title="Discard your edits?"
        message="Your crop and adjustments to this photo will be lost."
        confirmLabel="Discard edits"
        cancelLabel="Keep editing"
        onCancel={() => setConfirmDiscard(false)}
        onConfirm={() => {
          setConfirmDiscard(false);
          editedRef.current = false;
          onCancel();
        }}
      />
    </>
  );
}

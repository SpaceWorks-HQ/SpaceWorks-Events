"use client";

import { useCallback, useEffect, useRef, useState, type DragEvent } from "react";
import { Crop, ImagePlus, Trash2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Spinner } from "@/components/ui/spinner";
import { PhotoEditor, type PhotoEditorResult, type PhotoEditorSettings } from "@/components/media/PhotoEditor";
import { canReadPixels, loadImage } from "@/components/media/photoCanvas";
import { ACCEPTED_IMAGE_TYPES, validateImageFile } from "@/components/media/photoMath";

type Session = {
  key: number;
  image: HTMLImageElement;
  /** Object URL for the source image, when this picker created it. */
  sourceUrl: string | null;
  initialSettings?: Partial<PhotoEditorSettings>;
};

type Committed = { image: HTMLImageElement; sourceUrl: string | null; settings: PhotoEditorSettings };

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || target.closest("input, textarea, select, [contenteditable=''], [contenteditable='true']") !== null;
}

function imageFromClipboard(data: DataTransfer | null) {
  if (!data) return null;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === "file" && item.type.startsWith("image/")) return item.getAsFile();
  }
  return Array.from(data.files ?? []).find((file) => file.type.startsWith("image/")) ?? null;
}

/**
 * Event cover picker. Choose, drop, or paste a photo, then crop it in the
 * photo editor (16:7 event page banner by default). The server still
 * validates and re-encodes every upload.
 */
export function CoverImagePicker(props: {
  initialUrl?: string | null;
  disabled?: boolean;
  onChange: (file: File | null, previewUrl: string) => void;
}) {
  const { initialUrl = "", disabled = false, onChange } = props;
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState(initialUrl ?? "");
  const [error, setError] = useState<{ message: string; offerReplace?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [dragDepth, setDragDepth] = useState(0);
  const [session, setSession] = useState<Session | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const sessionCounter = useRef(0);
  const ownedPreviewUrl = useRef<string | null>(null);
  const committed = useRef<Committed | null>(null);
  const pendingSourceUrl = useRef<string | null>(null);

  // Revoke every object URL this picker created when it goes away.
  useEffect(
    () => () => {
      if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
      if (committed.current?.sourceUrl) URL.revokeObjectURL(committed.current.sourceUrl);
      if (pendingSourceUrl.current) URL.revokeObjectURL(pendingSourceUrl.current);
    },
    [],
  );

  const openSession = useCallback((image: HTMLImageElement, sourceUrl: string | null, initialSettings?: Partial<PhotoEditorSettings>) => {
    sessionCounter.current += 1;
    setSession({ key: sessionCounter.current, image, sourceUrl, initialSettings });
    setEditorOpen(true);
  }, []);

  const openFile = useCallback(
    async (file: File | null | undefined) => {
      if (!file || disabled) return;
      setError(null);
      const problem = validateImageFile(file);
      if (problem) {
        setError({ message: problem });
        return;
      }
      const url = URL.createObjectURL(file);
      setLoading(true);
      try {
        const image = await loadImage(url);
        if (pendingSourceUrl.current) URL.revokeObjectURL(pendingSourceUrl.current);
        pendingSourceUrl.current = url;
        openSession(image, url);
      } catch {
        URL.revokeObjectURL(url);
        setError({ message: "That image couldn't be opened. It may be damaged — try a different file." });
      } finally {
        setLoading(false);
      }
    },
    [disabled, openSession],
  );

  async function editCurrent() {
    if (disabled) return;
    setError(null);
    const previous = committed.current;
    if (previous) {
      // Re-edit from the original photo, not the already-cropped result.
      openSession(previous.image, previous.sourceUrl, previous.settings);
      return;
    }
    if (!previewUrl) return;
    setLoading(true);
    try {
      const image = await loadImage(previewUrl, { crossOrigin: true });
      if (!canReadPixels(image)) throw new Error("blocked");
      openSession(image, null);
    } catch {
      setError({
        message: "Your browser couldn't open the current cover for editing. Upload the original photo again to crop or adjust it.",
        offerReplace: true,
      });
    } finally {
      setLoading(false);
    }
  }

  function closeEditor() {
    setEditorOpen(false);
    const pending = pendingSourceUrl.current;
    if (pending && pending !== committed.current?.sourceUrl) URL.revokeObjectURL(pending);
    pendingSourceUrl.current = null;
  }

  function applyEdit(result: PhotoEditorResult) {
    if (!session) return;
    const nextPreview = URL.createObjectURL(result.file);
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
    ownedPreviewUrl.current = nextPreview;
    const previous = committed.current;
    if (previous?.sourceUrl && previous.sourceUrl !== session.sourceUrl) URL.revokeObjectURL(previous.sourceUrl);
    committed.current = { image: session.image, sourceUrl: session.sourceUrl, settings: result.settings };
    if (pendingSourceUrl.current === session.sourceUrl) pendingSourceUrl.current = null;
    setPreviewUrl(nextPreview);
    setError(null);
    setEditorOpen(false);
    onChange(result.file, nextPreview);
  }

  function remove() {
    if (ownedPreviewUrl.current) URL.revokeObjectURL(ownedPreviewUrl.current);
    ownedPreviewUrl.current = null;
    if (committed.current?.sourceUrl) URL.revokeObjectURL(committed.current.sourceUrl);
    committed.current = null;
    setPreviewUrl("");
    setError(null);
    onChange(null, "");
  }

  // Paste an image anywhere on the page (outside text fields) while the editor is closed.
  useEffect(() => {
    if (disabled || editorOpen) return;
    const onPaste = (event: ClipboardEvent) => {
      if (isEditableTarget(event.target)) return;
      const file = imageFromClipboard(event.clipboardData);
      if (!file) return;
      event.preventDefault();
      void openFile(file);
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [disabled, editorOpen, openFile]);

  const hasFiles = (event: DragEvent) => Array.from(event.dataTransfer.types).includes("Files");
  const dragging = dragDepth > 0 && !disabled;

  const dropHandlers = {
    onDragEnter: (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      setDragDepth((depth) => depth + 1);
    },
    onDragOver: (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFiles(event)) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
    },
    onDragLeave: (event: DragEvent<HTMLDivElement>) => {
      if (disabled || !hasFiles(event)) return;
      setDragDepth((depth) => Math.max(0, depth - 1));
    },
    onDrop: (event: DragEvent<HTMLDivElement>) => {
      if (disabled) return;
      event.preventDefault();
      setDragDepth(0);
      const file = Array.from(event.dataTransfer.files)[0];
      if (file) void openFile(file);
    },
  };

  return (
    <div className="flex w-full max-w-[640px] flex-col gap-3">
      <div {...dropHandlers} className="relative">
        {previewUrl ? (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={editCurrent}
            aria-label="Edit cover photo"
            className="group relative block aspect-[16/7] w-full overflow-hidden rounded-xl border border-line bg-muted disabled:cursor-not-allowed"
          >
            {/* Local object URLs and managed uploads are previewed directly. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={previewUrl} alt="Current cover image" className="size-full object-cover" />
            <span
              aria-hidden
              className="absolute bottom-2.5 right-2.5 inline-flex items-center gap-1.5 rounded-full bg-black/60 px-3 py-1.5 text-caption font-semibold text-white opacity-0 transition-opacity duration-[180ms] ease-yy group-hover:opacity-100 group-focus-visible:opacity-100 [&_svg]:size-3.5"
            >
              <Crop /> Edit photo
            </span>
          </button>
        ) : (
          <button
            type="button"
            disabled={disabled || loading}
            onClick={() => inputRef.current?.click()}
            className="flex aspect-[16/7] w-full flex-col items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-line-strong bg-subtle px-4 text-center transition-colors duration-[180ms] ease-yy hover:bg-muted disabled:cursor-not-allowed disabled:opacity-60"
          >
            <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-full bg-canvas text-ink-secondary shadow-raised [&_svg]:size-5">
              <ImagePlus />
            </span>
            <span className="text-label text-ink">Drop an image, paste one, or choose a file</span>
            <span className="text-caption text-ink-muted">Shown as a wide 16:7 banner</span>
          </button>
        )}

        {dragging ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-primary bg-canvas/90 text-ink"
          >
            <Upload className="size-6" />
            <span className="text-label">{previewUrl ? "Drop to replace the cover" : "Drop to use this image"}</span>
          </div>
        ) : null}

        {loading ? (
          <div role="status" className="absolute inset-0 flex items-center justify-center gap-2 rounded-xl bg-canvas/80 text-label text-ink">
            <Spinner className="size-4" />
            Opening photo…
          </div>
        ) : null}
      </div>

      {error ? (
        <Callout
          tone="danger"
          role="alert"
          action={
            error.offerReplace ? (
              <Button variant="secondary" size="sm" disabled={disabled} onClick={() => inputRef.current?.click()}>
                Upload photo
              </Button>
            ) : undefined
          }
        >
          {error.message}
        </Callout>
      ) : null}

      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" startIcon={<Upload />} disabled={disabled || loading} onClick={() => inputRef.current?.click()}>
          {previewUrl ? "Replace" : "Choose image"}
        </Button>
        {previewUrl ? (
          <>
            <Button variant="secondary" size="sm" startIcon={<Crop />} disabled={disabled || loading} onClick={editCurrent}>
              Edit
            </Button>
            <Button variant="dangerQuiet" size="sm" startIcon={<Trash2 />} disabled={disabled || loading} onClick={remove}>
              Remove
            </Button>
          </>
        ) : null}
      </div>
      <p className="text-caption text-ink-muted">JPEG, PNG or WebP · up to 5 MB · shown as a wide banner on your event page</p>
      <input
        ref={inputRef}
        type="file"
        accept={ACCEPTED_IMAGE_TYPES.join(",")}
        hidden
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Allow choosing the same file again later.
          event.target.value = "";
          void openFile(file);
        }}
      />

      <PhotoEditor
        open={editorOpen}
        image={session?.image ?? null}
        sessionKey={session?.key ?? 0}
        initialSettings={session?.initialSettings}
        title="Edit cover photo"
        description="Position your photo for the event page banner, cards and social shares."
        fileBaseName="event-cover"
        onCancel={closeEditor}
        onApply={applyEdit}
      />
    </div>
  );
}

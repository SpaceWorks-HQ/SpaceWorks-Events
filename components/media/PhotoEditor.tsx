"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FlipHorizontal2, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/cn";
import { AdjustPanel } from "./AdjustPanel";
import { CropStage } from "./CropStage";
import { EditorSlider } from "./EditorSlider";
import { PlacementPreviews } from "./PlacementPreviews";
import { encodeCanvas, makeThumbnail, renderOutput } from "./photoCanvas";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CROP,
  DEFAULT_SHAPE,
  MAX_INPUT_BYTES,
  MAX_STRAIGHTEN,
  MAX_ZOOM,
  MIN_ZOOM,
  SHAPES,
  SHAPE_ORDER,
  changeFrame,
  cssFilter,
  filterOps,
  formatBytes,
  guidesForAspect,
  isDefaultCrop,
  mimeLabel,
  mirrorCrop,
  normaliseCrop,
  outputFileName,
  rotateQuarter,
  setStraighten,
  setZoom,
  shapeAspect,
  type Adjustments,
  type CropState,
  type Dims,
  type ShapeId,
} from "./photoMath";

export type PhotoEditorSettings = { shape: ShapeId; crop: CropState; adjustments: Adjustments };
export type PhotoEditorResult = { file: File; settings: PhotoEditorSettings };

type PhotoEditorProps = {
  open: boolean;
  /** A loaded image whose pixels the canvas may read (same-origin, blob, or CORS-enabled). */
  image: HTMLImageElement | null;
  /** Changes whenever a new editing session starts, so state resets. */
  sessionKey: string | number;
  initialSettings?: Partial<PhotoEditorSettings>;
  title?: string;
  description?: string;
  fileBaseName?: string;
  onCancel: () => void;
  onApply: (result: PhotoEditorResult) => void;
};

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

type OutputState = { key: string; url: string; blob: Blob; width: number; height: number };

function EditorBody({
  image,
  initialSettings,
  title = "Edit photo",
  description = "Crop, straighten, and adjust your photo, then apply it.",
  fileBaseName = "photo",
  onApply,
  onRequestCancel,
  onEditedChange,
}: PhotoEditorProps & { image: HTMLImageElement; onRequestCancel: () => void; onEditedChange: (edited: boolean) => void }) {
  const dimsFor = useCallback(
    (shape: ShapeId): Dims => ({
      imageWidth: image.naturalWidth,
      imageHeight: image.naturalHeight,
      frameWidth: SHAPES[shape].width,
      frameHeight: SHAPES[shape].height,
    }),
    [image],
  );

  const [initial] = useState<PhotoEditorSettings>(() => {
    const shape = initialSettings?.shape ?? DEFAULT_SHAPE;
    return {
      shape,
      crop: normaliseCrop(initialSettings?.crop ?? DEFAULT_CROP, dimsFor(shape)),
      adjustments: initialSettings?.adjustments ?? DEFAULT_ADJUSTMENTS,
    };
  });
  const [shape, setShape] = useState<ShapeId>(initial.shape);
  const [crop, setCrop] = useState<CropState>(initial.crop);
  const [adjustments, setAdjustments] = useState<Adjustments>(initial.adjustments);
  const [showGuides, setShowGuides] = useState(true);
  const [tab, setTab] = useState("crop");
  const [thumbnailUrl] = useState(() => makeThumbnail(image, 144, 96));
  const [output, setOutput] = useState<OutputState | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const outputUrlRef = useRef<string | null>(null);

  const preset = SHAPES[shape];
  const dims = useMemo(() => dimsFor(shape), [dimsFor, shape]);
  const ops = useMemo(() => filterOps(adjustments), [adjustments]);
  const filter = cssFilter(ops);
  const guides = useMemo(() => guidesForAspect(shapeAspect(preset)), [preset]);
  const stateKey = JSON.stringify({ shape, crop, adjustments });
  const edited = stateKey !== JSON.stringify(initial);

  useEffect(() => {
    onEditedChange(edited);
  }, [edited, onEditedChange]);

  const updateCrop = useCallback((updater: (current: CropState) => CropState) => setCrop(updater), []);

  // Re-render the real output shortly after edits settle; feeds the previews and size readout.
  useEffect(() => {
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const canvas = renderOutput(image, crop, preset.width, preset.height, ops);
        const blob = await encodeCanvas(canvas);
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        const previous = outputUrlRef.current;
        outputUrlRef.current = url;
        setOutput({ key: stateKey, url, blob, width: preset.width, height: preset.height });
        setRenderError(null);
        if (previous) window.setTimeout(() => URL.revokeObjectURL(previous), 1000);
      } catch {
        if (!cancelled) setRenderError("Previews are unavailable for this photo in this browser.");
      }
    }, 160);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [image, crop, preset, ops, stateKey]);

  useEffect(
    () => () => {
      if (outputUrlRef.current) URL.revokeObjectURL(outputUrlRef.current);
      outputUrlRef.current = null;
    },
    [],
  );

  function changeShape(next: ShapeId) {
    if (next === shape) return;
    setCrop((current) => changeFrame(current, dimsFor(shape), dimsFor(next)));
    setShape(next);
  }

  async function apply() {
    setApplying(true);
    setApplyError(null);
    try {
      const blob = output && output.key === stateKey ? output.blob : await encodeCanvas(renderOutput(image, crop, preset.width, preset.height, ops));
      if (blob.size > MAX_INPUT_BYTES) {
        setApplyError(`The edited photo is ${formatBytes(blob.size)}, over the 5 MB limit. Try a simpler photo or the Wide or Banner shape.`);
        return;
      }
      const file = new File([blob], outputFileName(fileBaseName, blob.type), { type: blob.type });
      onEditedChange(false);
      onApply({ file, settings: { shape, crop, adjustments } });
    } catch {
      setApplyError("This photo couldn't be exported. Try choosing it again or use a different photo.");
    } finally {
      setApplying(false);
    }
  }

  const zoomPercent = `${Math.round(crop.zoom * 100)}%`;
  const updating = !output || output.key !== stateKey;

  return (
    <>
      <div className="flex shrink-0 items-center gap-3 border-b border-line py-2.5 pl-4 pr-2 sm:pl-6">
        <div className="min-w-0 flex-1">
          <DialogPrimitive.Title className="text-h4 text-ink">{title}</DialogPrimitive.Title>
          <DialogPrimitive.Description className="truncate text-caption text-ink-muted">{description}</DialogPrimitive.Description>
        </div>
        <IconButton label="Cancel and close the editor" onClick={onRequestCancel}>
          <X />
        </IconButton>
      </div>

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden lg:flex-row lg:overflow-hidden">
        {/* Crop area and zoom: the backdrop stays dark in both themes. */}
        <div className="flex shrink-0 flex-col bg-[#111113] text-white lg:min-w-0 lg:flex-1 lg:shrink">
          <CropStage
            image={image}
            crop={crop}
            dims={dims}
            filter={filter}
            guides={guides}
            showGuides={showGuides}
            onCropChange={updateCrop}
            className="h-[min(42dvh,300px)] sm:h-[360px] lg:h-auto lg:min-h-0 lg:flex-1"
          />
          <div className="flex flex-col gap-1 border-t border-white/10 px-3 pb-3 pt-2 sm:px-5">
            <div className="flex items-center gap-1">
              <button
                type="button"
                aria-label="Zoom out"
                title="Zoom out"
                disabled={crop.zoom <= MIN_ZOOM + 1e-6}
                onClick={() => setCrop((current) => setZoom(current, current.zoom / 1.25, dims))}
                className={darkIconButton}
              >
                <Minus aria-hidden />
              </button>
              <ZoomSlider value={crop.zoom} valueText={zoomPercent} onChange={(value) => setCrop((current) => setZoom(current, value, dims))} />
              <button
                type="button"
                aria-label="Zoom in"
                title="Zoom in"
                disabled={crop.zoom >= MAX_ZOOM - 1e-6}
                onClick={() => setCrop((current) => setZoom(current, current.zoom * 1.25, dims))}
                className={darkIconButton}
              >
                <Plus aria-hidden />
              </button>
              <span aria-hidden className="w-12 shrink-0 text-right font-mono text-caption tabular-nums text-white/80">
                {zoomPercent}
              </span>
            </div>
            <p className="text-center text-caption text-white/60">
              <span className="hidden sm:inline">Drag to move · scroll or pinch to zoom · arrow keys nudge</span>
              <span className="sm:hidden">Drag to move · pinch to zoom</span>
            </p>
          </div>
        </div>

        {/* Controls and previews. */}
        <div className="flex flex-col gap-6 p-4 sm:p-6 lg:w-[380px] lg:shrink-0 lg:overflow-y-auto lg:border-l lg:border-line">
          <ShapePicker value={shape} onChange={changeShape} />

          <Tabs value={tab} onValueChange={setTab}>
            <TabsList aria-label="Editing tools">
              <TabsTrigger value="crop">Crop</TabsTrigger>
              <TabsTrigger value="adjust">Adjust</TabsTrigger>
            </TabsList>
            <TabsContent value="crop" className="flex flex-col gap-5 pt-5">
              <div className="flex flex-col gap-2">
                <span className="text-label text-ink">Rotate and flip</span>
                <div className="grid grid-cols-3 gap-2">
                  <ToolButton label="Rotate left" onClick={() => setCrop((current) => rotateQuarter(current, -1, dims))} icon={<RotateCcw />} />
                  <ToolButton label="Rotate right" onClick={() => setCrop((current) => rotateQuarter(current, 1, dims))} icon={<RotateCw />} />
                  <ToolButton label="Flip" pressed={crop.flipX} onClick={() => setCrop((current) => mirrorCrop(current, dims))} icon={<FlipHorizontal2 />} />
                </div>
              </div>
              <EditorSlider
                label="Straighten"
                centred
                value={crop.straighten}
                min={-MAX_STRAIGHTEN}
                max={MAX_STRAIGHTEN}
                step={0.5}
                valueText={`${crop.straighten > 0 ? "+" : crop.straighten < 0 ? "−" : ""}${Math.abs(crop.straighten)}°`}
                onValueChange={(value) => setCrop((current) => setStraighten(current, value, dims))}
              />
              <SwitchRow
                label="Show other crops"
                description={guides.length > 0 ? `Dashed outlines show what ${guides.map((guide) => guide.label.toLowerCase()).join(" and ")} keep.` : "Outlines show how other places crop this photo."}
                checked={showGuides}
                onCheckedChange={setShowGuides}
              />
              <div>
                <Button variant="secondary" size="sm" startIcon={<Undo2 />} disabled={isDefaultCrop(crop)} onClick={() => setCrop(normaliseCrop(DEFAULT_CROP, dims))}>
                  Reset crop
                </Button>
              </div>
            </TabsContent>
            <TabsContent value="adjust" className="pt-5">
              <AdjustPanel adjustments={adjustments} thumbnailUrl={thumbnailUrl} onChange={setAdjustments} />
            </TabsContent>
          </Tabs>

          <PlacementPreviews url={output?.url ?? null} updating={updating} />
          {renderError ? <p className="text-caption text-ink-muted">{renderError}</p> : null}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-x-4 gap-y-2 border-t border-line px-4 py-3 pb-[max(12px,env(safe-area-inset-bottom))] sm:px-6">
        <div className="min-w-0 flex-1">
          {applyError ? (
            <p role="alert" className="text-caption text-danger-fg">
              {applyError}
            </p>
          ) : (
            <p className="text-caption tabular-nums text-ink-muted">
              {preset.width} × {preset.height} px
              {output ? ` · ${mimeLabel(output.blob.type)} · ${formatBytes(output.blob.size)}` : " · preparing…"}
            </p>
          )}
        </div>
        <div className="flex gap-2 max-sm:w-full">
          <Button variant="secondary" onClick={onRequestCancel} className="max-sm:flex-1">
            Cancel
          </Button>
          <Button variant="primary" onClick={apply} loading={applying} loadingLabel="Applying…" className="max-sm:flex-1">
            Apply
          </Button>
        </div>
      </div>
    </>
  );
}

const darkIconButton =
  "inline-flex size-10 shrink-0 items-center justify-center rounded-full text-white/85 transition-colors duration-[180ms] ease-yy hover:bg-white/10 hover:text-white disabled:pointer-events-none disabled:text-white/30 [&_svg]:size-[18px]";

function ZoomSlider({ value, valueText, onChange }: { value: number; valueText: string; onChange: (value: number) => void }) {
  return (
    <div className="min-w-0 flex-1">
      <EditorSlider label="Zoom" hideLabel tone="dark" value={value} min={MIN_ZOOM} max={MAX_ZOOM} step={0.01} valueText={valueText} onValueChange={onChange} />
    </div>
  );
}

function ToolButton({ label, icon, onClick, pressed }: { label: string; icon: ReactNode; onClick: () => void; pressed?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      className={cn(
        "flex min-h-14 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-caption font-semibold transition-colors duration-[180ms] ease-yy [&_svg]:size-[18px]",
        pressed ? "border-primary bg-subtle text-ink" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
      )}
    >
      <span aria-hidden>{icon}</span>
      {label}
    </button>
  );
}

function ShapePicker({ value, onChange }: { value: ShapeId; onChange: (value: ShapeId) => void }) {
  const labelId = useId();
  return (
    <div className="flex flex-col gap-2">
      <span id={labelId} className="text-label text-ink">
        Shape
      </span>
      <div role="radiogroup" aria-labelledby={labelId} className="grid grid-cols-3 gap-2">
        {SHAPE_ORDER.map((id) => {
          const shape = SHAPES[id];
          const selected = value === id;
          const aspect = shapeAspect(shape);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => onChange(id)}
              onKeyDown={(event) => {
                const index = SHAPE_ORDER.indexOf(id);
                let next: number | null = null;
                if (event.key === "ArrowRight" || event.key === "ArrowDown") next = (index + 1) % SHAPE_ORDER.length;
                if (event.key === "ArrowLeft" || event.key === "ArrowUp") next = (index - 1 + SHAPE_ORDER.length) % SHAPE_ORDER.length;
                if (next === null) return;
                event.preventDefault();
                const nextId = SHAPE_ORDER[next]!;
                onChange(nextId);
                (event.currentTarget.parentElement?.children[next] as HTMLElement | undefined)?.focus();
              }}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1.5 rounded-lg border px-1.5 pb-2 pt-2.5 text-center transition-colors duration-[180ms] ease-yy",
                selected ? "border-primary bg-subtle text-ink shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
              )}
            >
              <span aria-hidden className="flex h-7 items-center">
                <span
                  className={cn("block rounded-[3px] border-[1.5px]", selected ? "border-ink bg-emphasis" : "border-ink-muted")}
                  style={aspect >= 1 ? { width: 32, height: 32 / aspect } : { width: 28 * aspect, height: 28 }}
                />
              </span>
              <span className="text-caption font-semibold leading-tight">{shape.label}</span>
              <span className="font-mono text-[11px] leading-none text-ink-muted">
                {shape.ratioLabel}
                {id === DEFAULT_SHAPE ? " · best" : ""}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

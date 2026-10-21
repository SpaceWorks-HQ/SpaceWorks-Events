"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { FlipHorizontal2, Minus, Plus, RotateCcw, RotateCw, Undo2, X } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { SwitchRow } from "@/components/ui/choice";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AdjustPanel } from "../AdjustPanel";
import { CropStage } from "../CropStage";
import { EditorSlider } from "../EditorSlider";
import { PlacementPreviews } from "../PlacementPreviews";
import { encodeCanvas, makeThumbnail, renderOutput } from "../photoCanvas";
import {
  DEFAULT_ADJUSTMENTS,
  DEFAULT_CROP,
  DEFAULT_SHAPE,
  MAX_INPUT_BYTES,
  MAX_STRAIGHTEN,
  MAX_ZOOM,
  MIN_ZOOM,
  SHAPES,
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
} from "../photoMath";
import { ShapePicker, ToolButton, ZoomSlider, darkIconButton } from "./controls";
import type { PhotoEditorProps, PhotoEditorSettings } from "./types";

type OutputState = { key: string; url: string; blob: Blob; width: number; height: number };

export function EditorBody({
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
        <div className="yy-dark-band flex shrink-0 flex-col bg-sw-ink text-ink lg:min-w-0 lg:flex-1 lg:shrink">
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
          <div className="flex flex-col gap-1 border-t border-line px-3 pb-3 pt-2 sm:px-5">
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
              <span aria-hidden className="w-12 shrink-0 text-right tabular-nums text-caption text-ink-secondary">
                {zoomPercent}
              </span>
            </div>
            <p className="text-center text-caption text-ink-muted">
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

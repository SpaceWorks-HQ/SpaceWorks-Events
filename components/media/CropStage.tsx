"use client";

import { forwardRef, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import { cn } from "@/lib/cn";
import { drawCropped } from "./photoCanvas";
import {
  centreCropRect,
  fitFrame,
  panBy,
  zoomAround,
  type CropGuide,
  type CropState,
  type Dims,
  type Vec,
} from "./photoMath";

const GUIDE_LABEL_POSITIONS = ["left-1 top-1", "bottom-1 right-1", "right-1 top-1"] as const;

type CropUpdater = (updater: (current: CropState) => CropState) => void;

/**
 * The dark crop area. The full image is drawn dimmed so organisers can see
 * what lies outside the frame; the frame itself is drawn at full strength.
 * Drag (mouse, pen, touch), pinch, wheel, and keyboard all edit the crop.
 */
export const CropStage = forwardRef<HTMLDivElement, {
  image: HTMLImageElement;
  crop: CropState;
  dims: Dims;
  filter: string;
  guides: CropGuide[];
  showGuides: boolean;
  onCropChange: CropUpdater;
  className?: string;
}>(function CropStage({ image, crop, dims, filter, guides, showGuides, onCropChange, className }, forwardedRef) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointers = useRef(new Map<number, Vec>());
  const pinch = useRef<{ distance: number; mid: Vec } | null>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [active, setActive] = useState(false);

  const aspect = dims.frameWidth / dims.frameHeight;
  const padding = box.width < 480 ? 16 : 32;
  const frame = fitFrame(box.width, box.height, aspect, padding);
  // CSS pixels per output pixel.
  const scale = frame.width > 0 ? frame.width / dims.frameWidth : 1;

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      const { width, height } = entry.contentRect;
      setBox((current) => (Math.abs(current.width - width) < 0.5 && Math.abs(current.height - height) < 0.5 ? current : { width, height }));
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  // Paint the stage whenever the crop, frame, or size changes.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || box.width === 0 || box.height === 0) return;
    const ratio = Math.min(window.devicePixelRatio || 1, 2);
    const pixelWidth = Math.round(box.width * ratio);
    const pixelHeight = Math.round(box.height * ratio);
    if (canvas.width !== pixelWidth) canvas.width = pixelWidth;
    if (canvas.height !== pixelHeight) canvas.height = pixelHeight;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.setTransform(1, 0, 0, 1, 0, 0);
    context.clearRect(0, 0, pixelWidth, pixelHeight);
    context.imageSmoothingQuality = "high";
    const unit = ratio * scale;
    context.setTransform(unit, 0, 0, unit, (box.width * ratio) / 2, (box.height * ratio) / 2);
    context.globalAlpha = 0.32;
    drawCropped(context, image, crop, dims);
    context.globalAlpha = 1;
    context.save();
    context.beginPath();
    context.rect(-dims.frameWidth / 2, -dims.frameHeight / 2, dims.frameWidth, dims.frameHeight);
    context.clip();
    drawCropped(context, image, crop, dims);
    context.restore();
  }, [image, crop, dims, box, scale]);

  /** Client coordinates → frame coordinates (output pixels from the frame centre). */
  const toFrame = (clientX: number, clientY: number): Vec => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return { x: (clientX - rect.left - rect.width / 2) / scale, y: (clientY - rect.top - rect.height / 2) / scale };
  };

  // Wheel and trackpad-pinch zoom need a non-passive listener to stop page scroll.
  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const rect = node.getBoundingClientRect();
      const anchor = { x: (event.clientX - rect.left - rect.width / 2) / scale, y: (event.clientY - rect.top - rect.height / 2) / scale };
      const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
      const factor = Math.exp(-delta * (event.ctrlKey ? 0.01 : 0.0015));
      onCropChange((current) => zoomAround(current, current.zoom * factor, anchor, dims));
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, [dims, onCropChange, scale]);

  function onPointerDown(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointers.current.set(event.pointerId, { x: event.clientX, y: event.clientY });
    pinch.current = null;
    setActive(true);
  }

  function onPointerMove(event: ReactPointerEvent<HTMLDivElement>) {
    const previous = pointers.current.get(event.pointerId);
    if (!previous) return;
    const point = { x: event.clientX, y: event.clientY };
    pointers.current.set(event.pointerId, point);
    const all = Array.from(pointers.current.values());
    if (all.length === 1) {
      const delta = { x: (point.x - previous.x) / scale, y: (point.y - previous.y) / scale };
      onCropChange((current) => panBy(current, delta, dims));
      return;
    }
    const [a, b] = all as [Vec, Vec];
    const distance = Math.hypot(a.x - b.x, a.y - b.y);
    const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    const last = pinch.current;
    pinch.current = { distance, mid };
    if (!last || last.distance < 1) return;
    const ratio = distance / last.distance;
    const anchor = toFrame(last.mid.x, last.mid.y);
    const pan = { x: (mid.x - last.mid.x) / scale, y: (mid.y - last.mid.y) / scale };
    onCropChange((current) => panBy(zoomAround(current, current.zoom * ratio, anchor, dims), pan, dims));
  }

  function onPointerEnd(event: ReactPointerEvent<HTMLDivElement>) {
    pointers.current.delete(event.pointerId);
    pinch.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    if (pointers.current.size === 0) setActive(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    const step = (event.shiftKey ? 0.08 : 0.015) * dims.frameWidth;
    let delta: Vec | null = null;
    if (event.key === "ArrowLeft") delta = { x: -step, y: 0 };
    else if (event.key === "ArrowRight") delta = { x: step, y: 0 };
    else if (event.key === "ArrowUp") delta = { x: 0, y: -step };
    else if (event.key === "ArrowDown") delta = { x: 0, y: step };
    if (delta) {
      event.preventDefault();
      const move = delta;
      onCropChange((current) => panBy(current, move, dims));
      return;
    }
    if (event.key === "+" || event.key === "=") {
      event.preventDefault();
      onCropChange((current) => zoomAround(current, current.zoom * 1.1, { x: 0, y: 0 }, dims));
    } else if (event.key === "-" || event.key === "_") {
      event.preventDefault();
      onCropChange((current) => zoomAround(current, current.zoom / 1.1, { x: 0, y: 0 }, dims));
    }
  }

  const frameLeft = (box.width - frame.width) / 2;
  const frameTop = (box.height - frame.height) / 2;

  return (
    <div
      ref={(node) => {
        containerRef.current = node;
        if (typeof forwardedRef === "function") forwardedRef(node);
        else if (forwardedRef) forwardedRef.current = node;
      }}
      data-crop-stage=""
      role="application"
      aria-roledescription="Crop area"
      aria-label="Crop area. Drag the photo to reposition it, or use the arrow keys to move it; hold Shift to move further. Press plus or minus to zoom in or out."
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerEnd}
      onPointerCancel={onPointerEnd}
      onKeyDown={onKeyDown}
      className={cn(
        "relative cursor-grab touch-none select-none overflow-hidden bg-[#111113] outline-none focus-visible:shadow-[inset_0_0_0_3px_rgba(255,255,255,0.85)]",
        active && "cursor-grabbing",
        className,
      )}
    >
      <canvas ref={canvasRef} aria-hidden className="absolute inset-0 size-full" style={{ filter: filter === "none" ? undefined : filter }} />
      {frame.width > 0 ? (
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: frameLeft, top: frameTop, width: frame.width, height: frame.height }}
        >
          <div className="absolute inset-0 shadow-[0_0_0_1px_rgba(0,0,0,0.4)] ring-2 ring-inset ring-white/90" />
          <div
            className={cn("absolute inset-0 transition-opacity duration-[180ms] ease-yy", active ? "opacity-100" : "opacity-0")}
            style={{
              backgroundImage:
                "linear-gradient(to right, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.45) calc(33.333% - 0.5px), rgba(255,255,255,0.45) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.45) calc(66.666% - 0.5px), rgba(255,255,255,0.45) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px)), linear-gradient(to bottom, transparent calc(33.333% - 0.5px), rgba(255,255,255,0.45) calc(33.333% - 0.5px), rgba(255,255,255,0.45) calc(33.333% + 0.5px), transparent calc(33.333% + 0.5px), transparent calc(66.666% - 0.5px), rgba(255,255,255,0.45) calc(66.666% - 0.5px), rgba(255,255,255,0.45) calc(66.666% + 0.5px), transparent calc(66.666% + 0.5px))",
            }}
          />
          {showGuides
            ? guides.map((guide, index) => {
                const rect = centreCropRect(aspect, guide.aspect);
                return (
                  <div
                    key={guide.id}
                    className="absolute border border-dashed border-white/75"
                    style={{ left: `${rect.left * 100}%`, top: `${rect.top * 100}%`, width: `${rect.width * 100}%`, height: `${rect.height * 100}%` }}
                  >
                    <span className={cn("absolute whitespace-nowrap rounded bg-black/60 px-1.5 py-px text-[11px] font-semibold leading-4 text-white", GUIDE_LABEL_POSITIONS[index % GUIDE_LABEL_POSITIONS.length])}>
                      {guide.label}
                    </span>
                  </div>
                );
              })
            : null}
        </div>
      ) : null}
    </div>
  );
});

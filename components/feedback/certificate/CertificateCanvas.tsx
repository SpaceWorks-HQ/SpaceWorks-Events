"use client";

import { useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/cn";
import {
  certificateFonts,
  fillCertificateText,
  type CertificateElement,
  type CertificateMergeValues,
  type CertificateTextElement,
} from "@/lib/certificateTemplate";
import { clamp, clampBox, MIN_BOX, round2, SNAP_DISTANCE, uploadUrl, type Box, type Size } from "./layers";

type Drag = { id: string; mode: "move" | "resize"; startX: number; startY: number; original: CertificateElement };
type Guides = { vertical: boolean; horizontal: boolean };

export function CertificateCanvas({
  backgroundKey, elements, size, selectedId, values, disabled,
  onSelect, onChangeElement, onKeyDown, onBackgroundError, onBackgroundLoad,
}: {
  backgroundKey: string;
  elements: CertificateElement[];
  size: Size;
  selectedId: string | null;
  values: CertificateMergeValues;
  disabled: boolean;
  onSelect: (id: string | null) => void;
  onChangeElement: (id: string, patch: Partial<Box>) => void;
  onKeyDown: (event: KeyboardEvent<Element>) => void;
  onBackgroundLoad: (size: Size) => void;
  onBackgroundError: () => void;
}) {
  const canvas = useRef<SVGSVGElement>(null);
  const drag = useRef<Drag | null>(null);
  const [guides, setGuides] = useState<Guides>({ vertical: false, horizontal: false });
  const { width: W, height: H } = size;
  const px = (box: Box) => ({ x: box.x * W / 100, y: box.y * H / 100, width: box.width * W / 100, height: box.height * H / 100 });
  // Stroke widths and handle sizes stay roughly constant on screen whatever the artwork's pixel size.
  const unit = W / 100;

  function start(event: PointerEvent<SVGElement>, element: CertificateElement, mode: Drag["mode"]) {
    if (disabled || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    onSelect(element.id);
    canvas.current?.focus({ preventScroll: true });
    canvas.current?.setPointerCapture(event.pointerId);
    drag.current = { id: element.id, mode, startX: event.clientX, startY: event.clientY, original: element };
  }

  function move(event: PointerEvent<SVGSVGElement>) {
    const current = drag.current;
    const bounds = canvas.current?.getBoundingClientRect();
    if (!current || !bounds) return;
    const dx = (event.clientX - current.startX) / bounds.width * 100;
    const dy = (event.clientY - current.startY) / bounds.height * 100;
    const o = current.original;
    if (current.mode === "move") {
      let x = clamp(o.x + dx, 0, 100 - o.width);
      let y = clamp(o.y + dy, 0, 100 - o.height);
      const vertical = Math.abs(x + o.width / 2 - 50) <= SNAP_DISTANCE;
      const horizontal = Math.abs(y + o.height / 2 - 50) <= SNAP_DISTANCE;
      if (vertical) x = 50 - o.width / 2;
      if (horizontal) y = 50 - o.height / 2;
      setGuides((g) => (g.vertical === vertical && g.horizontal === horizontal ? g : { vertical, horizontal }));
      onChangeElement(o.id, clampBox({ ...o, x, y }));
      return;
    }
    let width = clamp(o.width + dx, MIN_BOX, 100 - o.x);
    let height = clamp(o.height + dy, MIN_BOX, 100 - o.y);
    if (o.type === "image" && !event.shiftKey) {
      // Images keep their proportions; hold Shift to stretch freely.
      const aspect = o.height / o.width;
      height = width * aspect;
      if (height > 100 - o.y) { height = 100 - o.y; width = height / aspect; }
      if (height < MIN_BOX) { height = MIN_BOX; width = height / aspect; }
    }
    onChangeElement(o.id, { width: round2(width), height: round2(height) });
  }

  function stop(event: PointerEvent<SVGSVGElement>) {
    if (!drag.current) return;
    drag.current = null;
    if (canvas.current?.hasPointerCapture(event.pointerId)) canvas.current.releasePointerCapture(event.pointerId);
    setGuides({ vertical: false, horizontal: false });
  }

  const selected = elements.find((element) => element.id === selectedId) ?? null;
  const selectedBox = selected ? px(selected) : null;
  const background = uploadUrl(backgroundKey);

  return (
    <div className="overflow-hidden rounded-lg border border-line bg-track">
      {/* Hidden measurement image gives the artwork's natural size, so portrait uploads are not distorted. */}
      {/* eslint-disable-next-line @next/next/no-img-element -- served by the app's private upload route */}
      <img src={background} alt="" className="hidden" onLoad={(e) => onBackgroundLoad({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })} onError={onBackgroundError} />
      <svg
        ref={canvas}
        viewBox={`0 0 ${W} ${H}`}
        role="application"
        aria-roledescription="certificate canvas"
        aria-label={`Certificate layout with ${elements.length} ${elements.length === 1 ? "layer" : "layers"}${selected ? `. Selected layer can be moved with the arrow keys (Shift for larger steps) or removed with Delete.` : ". Select a layer to move it."}`}
        tabIndex={0}
        className="block w-full touch-none select-none outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-inset"
        onPointerMove={move}
        onPointerUp={stop}
        onPointerCancel={stop}
        onKeyDown={onKeyDown}
      >
        <image href={background} width={W} height={H} onPointerDown={() => { if (!disabled) onSelect(null); }} />
        {elements.map((element) => {
          const box = px(element);
          const isSelected = element.id === selectedId;
          return (
            <g key={element.id} className="group">
              {element.type === "text"
                ? <TextLayer element={element} box={box} imageWidth={W} values={values} />
                : <image href={uploadUrl(element.key)} {...box} preserveAspectRatio="xMidYMid meet" />}
              <rect
                {...box}
                fill="transparent"
                stroke="#2563eb"
                strokeWidth={1.5}
                vectorEffect="non-scaling-stroke"
                strokeDasharray={isSelected ? "6 4" : undefined}
                className={cn(isSelected ? "opacity-100" : "opacity-0 group-hover:opacity-50")}
                style={{ cursor: disabled ? "default" : "move" }}
                onPointerDown={(e) => start(e, element, "move")}
              />
            </g>
          );
        })}
        {guides.vertical && <line x1={W / 2} x2={W / 2} y1={0} y2={H} stroke="#ec4899" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {guides.horizontal && <line x1={0} x2={W} y1={H / 2} y2={H / 2} stroke="#ec4899" strokeWidth={1} vectorEffect="non-scaling-stroke" pointerEvents="none" />}
        {selected && selectedBox && !disabled && (
          <rect
            x={selectedBox.x + selectedBox.width - unit * 1.2}
            y={selectedBox.y + selectedBox.height - unit * 1.2}
            width={unit * 2.4}
            height={unit * 2.4}
            rx={unit / 2}
            fill="#2563eb"
            stroke="#ffffff"
            strokeWidth={1.5}
            vectorEffect="non-scaling-stroke"
            style={{ cursor: "nwse-resize" }}
            onPointerDown={(e) => start(e, selected, "resize")}
          >
            <title>Drag to resize</title>
          </rect>
        )}
      </svg>
    </div>
  );
}

/**
 * A text layer drawn the way the server lays it out: lines centred vertically
 * in the box and reduced (never enlarged) to fit inside it.
 */
function TextLayer({ element, box, imageWidth, values }: { element: CertificateTextElement; box: Box; imageWidth: number; values: CertificateMergeValues }) {
  const group = useRef<SVGGElement>(null);
  const filled = fillCertificateText(element.text, values);
  const lines = (element.uppercase ? filled.toUpperCase() : filled).split(/\r?\n/);
  const fontSize = element.fontSize * imageWidth / 1000;
  const lineHeight = fontSize * 1.2;
  const anchorX = element.align === "left" ? box.x : element.align === "right" ? box.x + box.width : box.x + box.width / 2;
  const centreY = box.y + box.height / 2;

  // Scale the text down to fit its box. getBBox ignores the group's own transform, so this never feeds back on itself.
  useLayoutEffect(() => {
    const node = group.current;
    if (!node) return;
    let scale = 1;
    try {
      const bounds = node.getBBox();
      if (bounds.width > 0 && bounds.height > 0) scale = Math.min(1, box.width / bounds.width, box.height / bounds.height);
    } catch { /* not rendered yet */ }
    node.setAttribute("transform", scale < 1 ? `translate(${anchorX} ${centreY}) scale(${scale}) translate(${-anchorX} ${-centreY})` : "");
  });

  return (
    <g ref={group} pointerEvents="none">
      <text
        fontFamily={certificateFonts[element.font].css}
        fontSize={fontSize}
        fontWeight={element.bold ? 700 : 400}
        fontStyle={element.italic ? "italic" : "normal"}
        fill={element.color}
        textAnchor={element.align === "left" ? "start" : element.align === "right" ? "end" : "middle"}
        dominantBaseline="central"
        style={{ letterSpacing: `${element.letterSpacing / 100 * fontSize}px`, whiteSpace: "pre" }}
      >
        {lines.map((line, index) => (
          <tspan key={index} x={anchorX} y={centreY + (index - (lines.length - 1) / 2) * lineHeight}>{line || " "}</tspan>
        ))}
      </text>
    </g>
  );
}

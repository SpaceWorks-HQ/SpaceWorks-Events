"use client";

import { useRef, useState, type InputHTMLAttributes, type ReactNode } from "react";
import { AlignCenter, AlignHorizontalJustifyCenter, AlignLeft, AlignRight, AlignVerticalJustifyCenter, Bold, CaseUpper, Italic, Upload } from "lucide-react";
import { Button, buttonClasses } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Field, Input, Textarea, Dropdown } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  certificateFonts,
  certificateMergeTags,
  type CertificateElement,
  type CertificateImageElement,
  type CertificateMergeTag,
  type CertificateTextElement,
} from "@/lib/certificateTemplate";
import { clamp, MIN_BOX, round2, type Box } from "./layers";

const TEXT_MAX = 300;

/** Number input that lets people type freely and clamps on blur or Enter. */
function NumberInput({ value, min, max, step = 1, integer = false, onCommit, ...props }: Omit<InputHTMLAttributes<HTMLInputElement>, "value" | "onChange" | "min" | "max"> & {
  value: number; min: number; max: number; integer?: boolean; onCommit: (value: number) => void;
}) {
  const [draft, setDraft] = useState<string | null>(null);
  const normalise = (n: number) => { const c = clamp(n, min, max); return integer ? Math.round(c) : round2(c); };
  const commit = () => {
    if (draft === null) return;
    const n = Number(draft);
    if (draft.trim() !== "" && Number.isFinite(n)) onCommit(normalise(n));
    setDraft(null);
  };
  return (
    <Input
      {...props}
      type="number"
      inputMode="decimal"
      min={min}
      max={max}
      step={step}
      value={draft ?? String(value)}
      onChange={(event) => {
        const next = event.target.value;
        setDraft(next);
        const n = Number(next);
        // Apply in-range values straight away so the canvas follows typing.
        if (next.trim() !== "" && Number.isFinite(n) && n >= min && n <= max) onCommit(normalise(n));
      }}
      onBlur={commit}
      onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); commit(); } }}
    />
  );
}

function Toggle({ pressed, label, icon, onChange }: { pressed: boolean; label: string; icon: ReactNode; onChange: (pressed: boolean) => void }) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      onClick={() => onChange(!pressed)}
      className={cn(
        "inline-flex min-h-9 items-center gap-1.5 rounded-full border px-3 text-sm font-semibold transition-colors [&_svg]:size-4",
        pressed ? "border-primary bg-primary text-on-primary" : "border-line-strong bg-canvas text-ink-secondary hover:bg-subtle hover:text-ink",
      )}
    >
      {icon}{label}
    </button>
  );
}

export function LayerInspector({
  element, disabled, onChange, onReplaceImage,
}: {
  element: CertificateElement;
  disabled: boolean;
  onChange: (patch: Partial<CertificateTextElement> | Partial<CertificateImageElement>) => void;
  onReplaceImage: (file: File) => void;
}) {
  return (
    <section aria-labelledby="certificate-inspector-title" className="flex flex-col gap-4 rounded-lg border border-line bg-canvas p-3.5">
      <h4 id="certificate-inspector-title" className="text-label text-ink">{element.type === "text" ? "Text layer" : "Image layer"}</h4>
      {element.type === "text"
        ? <TextControls key={element.id} element={element} onChange={onChange} />
        : <ImageControls element={element} disabled={disabled} onChange={onChange} onReplaceImage={onReplaceImage} />}
      <PositionControls element={element} onChange={onChange} />
    </section>
  );
}

function TextControls({ element, onChange }: { element: CertificateTextElement; onChange: (patch: Partial<CertificateTextElement>) => void }) {
  const textarea = useRef<HTMLTextAreaElement>(null);
  const insertTag = (tag: CertificateMergeTag) => {
    const node = textarea.current;
    const token = `{{${tag}}}`;
    const start = node?.selectionStart ?? element.text.length;
    const end = node?.selectionEnd ?? element.text.length;
    const next = element.text.slice(0, start) + token + element.text.slice(end);
    if (next.length > TEXT_MAX) return;
    onChange({ text: next });
    requestAnimationFrame(() => {
      if (!node) return;
      node.focus();
      node.setSelectionRange(start + token.length, start + token.length);
    });
  };
  return (
    <>
      <Field label="Text" error={element.text.trim() ? undefined : "Enter some text or delete this layer."} helperText={`${element.text.length}/${TEXT_MAX} · line breaks are kept`}>
        <Textarea ref={textarea} rows={3} maxLength={TEXT_MAX} value={element.text} onChange={(e) => onChange({ text: e.target.value })} />
      </Field>
      <div className="flex flex-col gap-1.5">
        <span id={`merge-tags-${element.id}`} className="text-caption text-ink-muted">Insert a value that changes per certificate</span>
        <div role="group" aria-labelledby={`merge-tags-${element.id}`} className="flex flex-wrap gap-1.5">
          {(Object.entries(certificateMergeTags) as [CertificateMergeTag, (typeof certificateMergeTags)[CertificateMergeTag]][]).map(([tag, info]) => (
            <Button key={tag} type="button" size="sm" variant="secondary" className="min-h-8 px-3 text-[13px]" aria-label={`Insert ${info.label}`} disabled={element.text.length + tag.length + 4 > TEXT_MAX} onClick={() => insertTag(tag)}>
              {info.label}
            </Button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Font" className="col-span-2">
          <Dropdown value={element.font} onChange={(e) => onChange({ font: e.target.value as CertificateTextElement["font"] })}>
            {Object.entries(certificateFonts).map(([key, font]) => <option key={key} value={key}>{font.label}</option>)}
          </Dropdown>
        </Field>
        <Field label="Size" helperText="Per 1000 px of width">
          <NumberInput integer min={6} max={160} value={element.fontSize} onCommit={(fontSize) => onChange({ fontSize })} />
        </Field>
        <Field label="Colour">
          <Input type="color" value={element.color} onChange={(e) => onChange({ color: e.target.value })} className="h-11 cursor-pointer p-1" />
        </Field>
        <Field label="Letter spacing" helperText="0–50" className="col-span-2">
          <NumberInput integer min={0} max={50} value={element.letterSpacing} onCommit={(letterSpacing) => onChange({ letterSpacing })} />
        </Field>
      </div>
      <div className="flex flex-col gap-1.5">
        <span className="text-label text-ink">Alignment</span>
        <SegmentedControl
          ariaLabel="Text alignment"
          size="sm"
          className="self-start"
          value={element.align}
          onValueChange={(align) => onChange({ align })}
          options={[
            { value: "left", label: <AlignLeft aria-hidden />, ariaLabel: "Align left" },
            { value: "center", label: <AlignCenter aria-hidden />, ariaLabel: "Align centre" },
            { value: "right", label: <AlignRight aria-hidden />, ariaLabel: "Align right" },
          ]}
        />
      </div>
      <div role="group" aria-label="Text style" className="flex flex-wrap gap-1.5">
        <Toggle pressed={element.bold} label="Bold" icon={<Bold aria-hidden />} onChange={(bold) => onChange({ bold })} />
        <Toggle pressed={element.italic} label="Italic" icon={<Italic aria-hidden />} onChange={(italic) => onChange({ italic })} />
        <Toggle pressed={element.uppercase} label="Uppercase" icon={<CaseUpper aria-hidden />} onChange={(uppercase) => onChange({ uppercase })} />
      </div>
    </>
  );
}

function ImageControls({ element, disabled, onChange, onReplaceImage }: { element: CertificateImageElement; disabled: boolean; onChange: (patch: Partial<CertificateImageElement>) => void; onReplaceImage: (file: File) => void }) {
  return (
    <>
      <Field label="Label" helperText="Only shown in the layer list.">
        <Input value={element.label} maxLength={60} onChange={(e) => onChange({ label: e.target.value })} />
      </Field>
      <label className={cn(buttonClasses({ variant: "secondary", size: "sm" }), "self-start", disabled ? "pointer-events-none opacity-60" : "cursor-pointer")} aria-disabled={disabled || undefined}>
        <Upload aria-hidden className="size-4" />
        Replace image
        <input hidden type="file" accept="image/jpeg,image/png,image/webp" disabled={disabled} onChange={(event) => { const file = event.target.files?.[0]; event.target.value = ""; if (file) onReplaceImage(file); }} />
      </label>
    </>
  );
}

function PositionControls({ element, onChange }: { element: CertificateElement; onChange: (patch: Partial<Box>) => void }) {
  const fields = [
    { key: "x", label: "X (%)", min: 0, max: Math.min(99, 100 - element.width) },
    { key: "y", label: "Y (%)", min: 0, max: Math.min(99, 100 - element.height) },
    { key: "width", label: "W (%)", min: MIN_BOX, max: 100 - element.x },
    { key: "height", label: "H (%)", min: MIN_BOX, max: 100 - element.y },
  ] as const;
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-2 gap-3">
        {fields.map((field) => (
          <Field key={field.key} label={field.label}>
            <NumberInput min={field.min} max={field.max} step={0.5} value={element[field.key]} onCommit={(n) => onChange({ [field.key]: n })} />
          </Field>
        ))}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <Button type="button" size="sm" variant="secondary" startIcon={<AlignHorizontalJustifyCenter />} onClick={() => onChange({ x: round2(50 - element.width / 2) })}>Centre horizontally</Button>
        <Button type="button" size="sm" variant="secondary" startIcon={<AlignVerticalJustifyCenter />} onClick={() => onChange({ y: round2(50 - element.height / 2) })}>Centre vertically</Button>
      </div>
    </div>
  );
}

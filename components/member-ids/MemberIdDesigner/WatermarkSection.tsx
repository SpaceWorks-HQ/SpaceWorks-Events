"use client";

import { NumberSlider, Section } from "@/components/checkin/id-card/IdCardDesigner";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Field, Input } from "@/components/ui/field";
import { WATERMARK_OPACITY_MAX, WATERMARK_OPACITY_MIN, type IdCardPrintSettings } from "@/lib/idCardPrint";
import type { BadgeBranding } from "@/lib/badge/types";

export function WatermarkSection({
  mark,
  branding,
  uploading,
  update,
  uploadWatermark,
}: {
  mark: IdCardPrintSettings["watermark"];
  branding: BadgeBranding;
  uploading: boolean;
  update: (patch: Partial<IdCardPrintSettings>) => void;
  uploadWatermark: (file: File | null) => Promise<void>;
}) {
  return (
    <Section title="Watermark">
      <SegmentedControl<IdCardPrintSettings["watermark"]["kind"]>
        ariaLabel="Watermark"
        size="sm"
        value={mark.kind}
        onValueChange={(kind) => update({ watermark: { ...mark, kind } })}
        options={[{ value: "none", label: "None" }, { value: "text", label: "Text" }, { value: "image", label: "Image" }]}
        className="self-start"
      />
      {mark.kind === "text" ? (
        <Field label="Watermark text"><Input maxLength={32} value={mark.text} placeholder="MEMBER" onChange={(event) => update({ watermark: { ...mark, text: event.target.value } })} /></Field>
      ) : null}
      {mark.kind === "image" ? (
        <div className="flex flex-col gap-2">
          <Field label="Watermark image" helperText={branding.watermarkUrl ? "Shared by both sides. Choose a file to replace it." : "A simple mark works best. PNG with transparency, up to 5 MB."}>
            <input type="file" accept="image/png,image/jpeg,image/webp" disabled={uploading} onChange={(event) => void uploadWatermark(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
          </Field>
          {branding.watermarkUrl ? <Button size="sm" variant="quiet" className="self-start" disabled={uploading} onClick={() => void uploadWatermark(null)}>Remove image</Button> : null}
        </div>
      ) : null}
      {mark.kind !== "none" ? (
        <>
          <NumberSlider label="Strength" unit="%" min={WATERMARK_OPACITY_MIN} max={WATERMARK_OPACITY_MAX} step={1} value={mark.opacityPct} onChange={(opacityPct) => update({ watermark: { ...mark, opacityPct } })} />
          <SegmentedControl<IdCardPrintSettings["watermark"]["colour"]>
            ariaLabel="Watermark colour"
            size="sm"
            value={mark.colour}
            onValueChange={(colour) => update({ watermark: { ...mark, colour } })}
            options={[{ value: "accent", label: "Accent colour" }, { value: "text", label: "Text colour" }]}
            className="self-start"
          />
          {mark.kind === "text" ? <NumberSlider label="Angle" unit="°" min={-60} max={60} step={5} value={mark.angleDeg} onChange={(angleDeg) => update({ watermark: { ...mark, angleDeg } })} /> : null}
        </>
      ) : null}
    </Section>
  );
}

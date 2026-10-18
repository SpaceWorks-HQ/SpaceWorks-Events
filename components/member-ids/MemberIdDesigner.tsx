"use client";

import { useEffect, useRef, useState } from "react";
import { BadgeCanvas, BadgeFontFaces, elementHeightForMove } from "@/components/checkin/id-card/BadgeCanvas";
import { FitArea, Inspector, NumberSlider, SaveStatusPill, Section, SwatchGroup, SwitchLine, ToggleField } from "@/components/checkin/id-card/IdCardDesigner";
import { SAFE_MARGIN_MM, type BadgeSaveStatus } from "@/components/checkin/id-card/shared";
import { Button } from "@/components/ui/button";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { saveIdProgrammeDesign, uploadIdProgrammeWatermark } from "@/app/actions/member-ids";
import {
  CR80,
  FOOTER_MAX_LENGTH,
  isDefaultLayout,
  layoutFlags,
  layoutForPaper,
  normalizeIdCardPrintSettings,
  WATERMARK_OPACITY_MAX,
  WATERMARK_OPACITY_MIN,
  type IdCardLayoutElement,
  type IdCardLayoutFlags,
  type IdCardPrintSettings,
} from "@/lib/idCardPrint";
import { BADGE_ACCENT_KEYS, BADGE_BACKGROUND_KEYS, BADGE_TEXT_KEYS, BRAND, resolveBadgePalette } from "@/lib/badge/palette";
import type { BadgeBranding, IdCardAttendee } from "@/lib/badge/types";
import type { FieldPlacement, FieldType } from "@/lib/memberIds/core";
import {
  applyMemberIdPreset,
  sideSettings,
  type MemberIdDesign,
  type MemberIdDesignContext,
  type MemberIdPreset,
  type MemberIdSide,
} from "@/lib/memberIds/design";
import { PresetPicker } from "./PresetPicker";

type DesignerField = { key: string; label: string; placement: FieldPlacement; type: FieldType };

const SAVE_DELAY_MS = 900;
const TEXT_LIMITS = [["heading", 120], ["badgeLabel", 40], ["footerText", FOOTER_MAX_LENGTH], ["idNumberLabel", 30], ["validUntilLabel", 30]] as const;
// Member cards never use the event accent.
const BACKGROUNDS = BADGE_BACKGROUND_KEYS.filter((key) => key !== "event");
const ACCENTS = BADGE_ACCENT_KEYS.filter((key) => key !== "event");

function samplePerson(fields: DesignerField[], idPrefix: string): IdCardAttendee {
  return {
    displayName: "Priya Raman",
    email: "priya@example.com",
    checkInQrToken: "https://example.com/verify/preview",
    checkInDetails: [],
    registrationDetails: fields.map((field) => ({ key: field.key, label: field.label, value: field.type === "DATE" ? "14 Feb 1998" : /blood/i.test(field.label) ? "O+" : /role|title|position/i.test(field.label) ? "Volunteer lead" : /dep|team/i.test(field.label) ? "Workshops" : "Sample answer" })),
    photoUrl: null,
    idNumber: `${idPrefix}-${new Date().getUTCFullYear()}-0042`,
    validUntil: "31 Dec 2026",
  };
}

/**
 * Front and back designer for a programme's cards. Each side is an ordinary
 * badge design, edited with the same canvas and inspector as event badges,
 * and the whole design autosaves to the programme.
 */
export function MemberIdDesigner({
  organisationSlug,
  programmeId,
  context,
  initialDesign,
  branding: initialBranding,
  fields,
  idPrefix,
}: {
  organisationSlug: string;
  programmeId: string;
  context: MemberIdDesignContext;
  initialDesign: MemberIdDesign;
  branding: BadgeBranding;
  fields: DesignerField[];
  idPrefix: string;
  updatedAt: string;
}) {
  const [design, setDesign] = useState(initialDesign);
  const [side, setSide] = useState<MemberIdSide>("front");
  const [selected, setSelected] = useState<IdCardLayoutElement>("name");
  const [status, setStatus] = useState<BadgeSaveStatus>("saved");
  const [error, setError] = useState<string | null>(null);
  const [branding, setBranding] = useState(initialBranding);
  const [uploading, setUploading] = useState(false);
  const latest = useRef(design);
  const timer = useRef<number | null>(null);
  const saving = useRef(false);
  const dirty = useRef(false);

  const save = async (): Promise<void> => {
    if (saving.current) {
      dirty.current = true;
      return;
    }
    saving.current = true;
    dirty.current = false;
    setStatus("saving");
    try {
      const result = await saveIdProgrammeDesign({ organisationSlug, programmeId, design: latest.current as unknown as Record<string, unknown> });
      if (result.ok) {
        setStatus(dirty.current ? "pending" : "saved");
        setError(null);
      } else {
        setStatus("error");
        setError(result.error);
      }
    } catch {
      setStatus("error");
      setError("The design couldn't be saved. Check your connection.");
    } finally {
      saving.current = false;
      if (dirty.current) void save();
    }
  };

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current);
  }, []);

  const commit = (next: MemberIdDesign) => {
    latest.current = next;
    setDesign(next);
    setStatus("pending");
    if (timer.current) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void save(), SAVE_DELAY_MS);
  };

  const current = design[side];
  const drawn = sideSettings(design, side, fields);
  const person = samplePerson(fields, idPrefix);

  const update = (patch: Partial<IdCardPrintSettings>) => {
    const base = latest.current[side];
    const next = normalizeIdCardPrintSettings({ ...base, ...patch }, context.programmeName, context.organisationName);
    // Text stays exactly as typed (including empty) while editing.
    for (const [key, max] of TEXT_LIMITS) next[key] = (patch[key] ?? base[key]).slice(0, max);
    commit({ ...latest.current, [side]: next });
  };

  const move = (element: IdCardLayoutElement, xMm: number, yMm: number) => {
    const size = current.elementSizes[element];
    const height = elementHeightForMove(current, element);
    const snap = (value: number) => Math.round(value / current.gridSizeMm) * current.gridSizeMm;
    const next = {
      xMm: Math.min(Math.max(0, current.widthMm - size - SAFE_MARGIN_MM), Math.max(0, snap(xMm))),
      yMm: Math.min(Math.max(0, current.heightMm - height - SAFE_MARGIN_MM), Math.max(0, snap(yMm))),
    };
    const at = current.elementPositions[element];
    if (at.xMm === next.xMm && at.yMm === next.yMm) return;
    update({ elementPositions: { ...current.elementPositions, [element]: next } });
  };

  /** Optional items: an untouched layout reflows to make room; a hand-adjusted one keeps every position. */
  const toggleItem = (flag: keyof IdCardLayoutFlags, on: boolean, element: IdCardLayoutElement) => {
    const flags = layoutFlags(current);
    const nextFlags = { ...flags, [flag]: on };
    if (isDefaultLayout(current, flags)) update({ [flag]: on, ...layoutForPaper(current.template, current.widthMm, current.heightMm, nextFlags) });
    else update({ [flag]: on });
    if (on) setSelected(element);
  };

  /** Both sides share one card size; turning the card reflows both. */
  const setOrientation = (landscape: boolean) => {
    const [widthMm, heightMm] = landscape ? [CR80.widthMm, CR80.heightMm] : [CR80.heightMm, CR80.widthMm];
    const resize = (settings: IdCardPrintSettings) => ({ ...settings, widthMm, heightMm, ...layoutForPaper(settings.template, widthMm, heightMm, layoutFlags(settings)) });
    commit({ ...latest.current, front: resize(latest.current.front), back: resize(latest.current.back) });
  };

  const usePreset = (preset: MemberIdPreset) => commit(applyMemberIdPreset(latest.current, preset, context));

  const uploadWatermark = async (file: File | null) => {
    setUploading(true);
    setError(null);
    const data = new FormData();
    data.set("organisationSlug", organisationSlug);
    data.set("programmeId", programmeId);
    if (file) data.set("file", file);
    else data.set("remove", "1");
    try {
      const result = await uploadIdProgrammeWatermark(data);
      if (result.ok) setBranding((value) => ({ ...value, watermarkUrl: result.data?.url ?? null }));
      else setError(result.error);
    } catch {
      setError("The image didn't upload. Try again.");
    } finally {
      setUploading(false);
    }
  };

  const palette = resolveBadgePalette(current, null);
  const colourOf = (key: string) => (key === "auto" ? null : BRAND[key as keyof typeof BRAND]);
  const placedHere = fields.filter((field) => field.placement === (side === "front" ? "FRONT" : "BACK"));
  const mark = current.watermark;
  const landscape = current.widthMm > current.heightMm;

  return (
    <div className="flex flex-col overflow-hidden rounded-2xl border border-line bg-panel">
      <BadgeFontFaces />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3">
        <SegmentedControl<MemberIdSide>
          ariaLabel="Card side"
          value={side}
          onValueChange={(next) => {
            setSide(next);
            setSelected(next === "front" ? "name" : "details");
          }}
          options={[{ value: "front", label: "Front" }, { value: "back", label: "Back" }]}
        />
        <div className="ml-auto flex items-center gap-2" aria-live="polite">
          <SaveStatusPill status={status} />
          {status === "error" ? <Button size="sm" variant="secondary" onClick={() => void save()}>Try again</Button> : null}
        </div>
      </header>
      {error ? <div className="px-4 pt-3"><Callout tone="danger" role="alert">{error}</Callout></div> : null}

      <div className="flex min-h-0 flex-col lg:grid lg:grid-cols-[300px_minmax(0,1fr)_272px]">
        <aside aria-label="Card settings" className="order-2 flex flex-col gap-6 border-line p-4 sm:p-5 lg:order-none lg:max-h-[860px] lg:overflow-y-auto lg:border-r">
          <Section title="Design">
            <PresetPicker value={design.preset} onChange={usePreset} />
            <p className="text-caption text-ink-muted">Choosing a design resets both sides&apos; layout and colours.</p>
            <SegmentedControl<"landscape" | "portrait">
              ariaLabel="Orientation"
              size="sm"
              value={landscape ? "landscape" : "portrait"}
              onValueChange={(next) => setOrientation(next === "landscape")}
              options={[{ value: "landscape", label: "Landscape" }, { value: "portrait", label: "Portrait" }]}
              className="self-start"
            />
            <p className="text-caption text-ink-muted">ID card size (CR80, 85.6 × 54 mm).</p>
          </Section>

          {side === "back" ? (
            <Section title="Back">
              <SwitchLine label="Print a back" hint="Off: downloads and the wallet show the front only." checked={design.backEnabled} onCheckedChange={(backEnabled) => commit({ ...latest.current, backEnabled })} />
            </Section>
          ) : null}

          <Section title="Colour">
            <SwatchGroup label="Card" value={current.backgroundColor} options={BACKGROUNDS} colourOf={colourOf} onChange={(backgroundColor) => update({ backgroundColor })} />
            <SwatchGroup label={current.template === "bold" ? "Band and accents" : "Frame and accents"} value={current.accentColor} options={ACCENTS} colourOf={colourOf} onChange={(accentColor) => update({ accentColor })} />
            <SwatchGroup label="Text" value={current.textColor} options={BADGE_TEXT_KEYS} colourOf={colourOf} onChange={(textColor) => update({ textColor })} />
            {palette.textAdjusted ? <Callout tone="warning">That text colour doesn&apos;t have enough contrast on this card, so text prints in the automatic colour.</Callout> : null}
          </Section>

          <Section title="Text">
            <Field label="Heading"><Input maxLength={120} value={current.heading} onChange={(event) => update({ heading: event.target.value })} /></Field>
            <ToggleField label="Label above the heading" checked={current.showBadgeLabel} onCheckedChange={(showBadgeLabel) => update({ showBadgeLabel })}>
              <Input maxLength={40} value={current.badgeLabel} disabled={!current.showBadgeLabel} onChange={(event) => update({ badgeLabel: event.target.value })} />
            </ToggleField>
            <ToggleField label={side === "back" ? "Note" : "Footer"} checked={current.showFooter} onCheckedChange={(showFooter) => update({ showFooter })}>
              <Input maxLength={FOOTER_MAX_LENGTH} value={current.footerText} disabled={!current.showFooter} onChange={(event) => update({ footerText: event.target.value })} />
            </ToggleField>
          </Section>

          <Section title="On this side">
            <SwitchLine label="Name" checked={current.showName} onCheckedChange={(showName) => update({ showName })} />
            <SwitchLine label="Photo" hint="The member's uploaded photo, or their initials." checked={current.showPhoto} onCheckedChange={(on) => toggleItem("showPhoto", on, "photo")} />
            {current.showPhoto ? (
              <SegmentedControl<IdCardPrintSettings["photoShape"]>
                ariaLabel="Photo shape"
                size="sm"
                value={current.photoShape}
                onValueChange={(photoShape) => update({ photoShape })}
                options={[{ value: "rounded", label: "Rounded square" }, { value: "circle", label: "Circle" }]}
                className="self-start"
              />
            ) : null}
            <SwitchLine label="ID number" checked={current.showIdNumber} onCheckedChange={(on) => toggleItem("showIdNumber", on, "idNumber")} />
            {current.showIdNumber ? <Field label="ID number label"><Input maxLength={30} value={current.idNumberLabel} onChange={(event) => update({ idNumberLabel: event.target.value })} placeholder="No label" /></Field> : null}
            <SwitchLine label="Valid until" checked={current.showValidUntil} onCheckedChange={(on) => toggleItem("showValidUntil", on, "validUntil")} />
            {current.showValidUntil ? <Field label="Valid until label"><Input maxLength={30} value={current.validUntilLabel} onChange={(event) => update({ validUntilLabel: event.target.value })} placeholder="No label" /></Field> : null}
            <SwitchLine label="Check QR code" hint="Opens the public check page for this card." checked={current.showQr} onCheckedChange={(showQr) => update({ showQr })} />
            <SwitchLine label="Email" checked={current.showEmail} onCheckedChange={(showEmail) => update({ showEmail })} />
            <SwitchLine
              label="Organisation logo"
              hint={branding.organisationLogoUrl ? undefined : "Add a logo in organisation settings first."}
              disabled={!branding.organisationLogoUrl}
              checked={current.showLogo && Boolean(branding.organisationLogoUrl)}
              onCheckedChange={(on) => toggleItem("showLogo", on, "logo")}
            />
            <SwitchLine label="Space Works symbol" hint="Placed unaltered, with clear space around it." checked={current.showSymbol} onCheckedChange={(on) => toggleItem("showSymbol", on, "symbol")} />
            <p className="text-caption text-ink-muted">
              {placedHere.length
                ? `Answers printed here: ${placedHere.map((field) => field.label).join(", ")}.`
                : "No answers print on this side."}{" "}
              Choose where each answer prints in Settings.
            </p>
          </Section>

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
        </aside>

        <section aria-label="Card preview" className="order-1 flex min-h-[360px] min-w-0 flex-col bg-subtle lg:order-none">
          <FitArea widthMm={drawn.widthMm} heightMm={drawn.heightMm}>
            {(pxPerMm) => (
              <BadgeCanvas
                settings={drawn}
                attendee={person}
                branding={branding}
                pxPerMm={pxPerMm}
                interaction={{ selected, onSelect: setSelected, onBeginChange: () => undefined, onMove: move, showGrid: false }}
              />
            )}
          </FitArea>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            {side === "back" && !design.backEnabled ? "The back is turned off, so cards print the front only." : "Click an item to edit it. Drag, or use the arrow keys (Shift for bigger steps). Sample details shown."}
          </p>
        </section>

        <aside aria-label="Selected item" className="order-1 border-line p-4 sm:p-5 lg:order-none lg:max-h-[860px] lg:overflow-y-auto lg:border-l">
          <Inspector settings={drawn} branding={branding} selected={selected} onSelect={setSelected} update={update} />
        </aside>
      </div>
    </div>
  );
}

"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { SegmentedControl, Switch } from "@/components/ui/choice";
import { Callout, Chip, type ChipTone } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  exportIdCardDesign,
  ID_CARD_GRID_SIZES_MM,
  ID_CARD_LAYOUT_ELEMENTS,
  ID_CARD_PAPER_PRESETS,
  importIdCardDesign,
  isDefaultLayout,
  isSquareElement,
  isTextElement,
  layoutFlags,
  layoutForPaper,
  matchPaperPreset,
  minimumElementSizeMm,
  SPONSOR_LIMIT_MAX,
  type IdCardLayoutElement,
  type IdCardLayoutFlags,
  type IdCardPrintSettings,
} from "@/lib/idCardPrint";
import {
  BADGE_ACCENT_KEYS,
  BADGE_BACKGROUND_KEYS,
  BADGE_COLOUR_LABELS,
  BADGE_TEXT_KEYS,
  BRAND,
  eventAccentHex,
  resolveBadgePalette,
} from "@/lib/badge/palette";
import type { BadgeBranding } from "@/lib/badge/types";
import { BadgeCanvas, BadgeFontFaces, elementHeightForMove } from "./BadgeCanvas";
import { printCard } from "./printCards";
import {
  ELEMENT_LABELS,
  registrationFieldKey,
  SAFE_MARGIN_MM,
  SAVE_STATUS_LABELS,
  sampleAttendee,
  type BadgeDesignSource,
  type BadgeSaveStatus,
  type IdCardAttendee,
  type RegistrationField,
  useIdCardSettings,
} from "./shared";

const TEMPLATES = [
  { key: "classic", label: "Classic", hint: "Thin frame, rule under the heading" },
  { key: "bold", label: "Bold", hint: "Heading on a colour band, name in capitals" },
  { key: "minimal", label: "Minimal", hint: "No lines, just the name" },
] as const;

type Sample = "short" | "long" | "attendee";

const STATUS_TONES: Record<BadgeSaveStatus, ChipTone> = { saved: "success", pending: "neutral", saving: "neutral", local: "warning", error: "danger" };

export function SaveStatusPill({ status }: { status: BadgeSaveStatus }) {
  return <Chip size="sm" tone={STATUS_TONES[status]}>{SAVE_STATUS_LABELS[status]}</Chip>;
}

/**
 * Badge designer: style, colour, logos and content on the left, the card
 * drawn to scale in the middle, and the selected item's properties on the
 * right. The design saves to the event as you go, for every check-in desk.
 */
export function IdCardDesigner({
  source,
  branding,
  attendee,
  registrationFields,
  onClose,
}: {
  source: BadgeDesignSource;
  branding: BadgeBranding;
  attendee: IdCardAttendee | null;
  registrationFields: RegistrationField[];
  onClose: () => void;
}) {
  const { settings, update, checkpoint, undo, redo, retry, canUndo, canRedo, status, error } = useIdCardSettings(source);
  const [selected, setSelected] = useState<IdCardLayoutElement>("name");
  const [sample, setSample] = useState<Sample>(attendee ? "attendee" : "short");
  const [guides, setGuides] = useState(true);
  const [notice, setNotice] = useState<{ tone: "danger" | "success"; text: string } | null>(null);
  const [printing, setPrinting] = useState(false);

  const previewPerson = sample === "attendee" && attendee ? attendee : sampleAttendee(registrationFields, sample === "long");

  // Undo/redo from the keyboard while the designer is open (not while typing).
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "z") return;
      event.preventDefault();
      if (event.shiftKey) redo();
      else undo();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const move = (element: IdCardLayoutElement, xMm: number, yMm: number) => {
    const size = settings.elementSizes[element];
    const height = elementHeightForMove(settings, element);
    const snap = (value: number) => Math.round(value / settings.gridSizeMm) * settings.gridSizeMm;
    const next = {
      xMm: Math.min(Math.max(0, settings.widthMm - size - SAFE_MARGIN_MM), Math.max(0, snap(xMm))),
      yMm: Math.min(Math.max(0, settings.heightMm - height - SAFE_MARGIN_MM), Math.max(0, snap(yMm))),
    };
    const current = settings.elementPositions[element];
    if (current.xMm === next.xMm && current.yMm === next.yMm) return;
    update({ elementPositions: { ...settings.elementPositions, [element]: next } }, false);
  };

  const flags = layoutFlags(settings);
  const setPaper = (widthMm: number, heightMm: number) => {
    update({ widthMm, heightMm, ...layoutForPaper(settings.template, widthMm, heightMm, flags) });
  };

  /**
   * Turn an optional item on or off. An untouched layout reflows so the new
   * item has room; a hand-adjusted one keeps every position.
   */
  const toggleItem = (flag: keyof IdCardLayoutFlags, on: boolean, element: IdCardLayoutElement) => {
    const nextFlags = { ...flags, [flag]: on };
    if (isDefaultLayout(settings, flags)) {
      update({ [flag]: on, ...layoutForPaper(settings.template, settings.widthMm, settings.heightMm, nextFlags) });
    } else {
      update({ [flag]: on });
    }
    if (on) setSelected(element);
  };

  const runPrint = async (person: IdCardAttendee) => {
    setPrinting(true);
    setNotice(null);
    try {
      const ok = await printCard({ settings, attendee: person, branding });
      if (!ok) setNotice({ tone: "danger", text: "The print window was blocked. Allow pop-ups for this site and try again." });
    } catch {
      setNotice({ tone: "danger", text: "The card couldn't be prepared. Try again." });
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <BadgeFontFaces />
      <header className="flex flex-wrap items-center gap-3 border-b border-line px-4 py-3 sm:px-5">
        <div className="min-w-0 flex-1">
          <h2 id="id-card-designer-title" className="text-h4 text-ink">Badge designer</h2>
          <p className="truncate text-caption text-ink-muted">{source.eventTitle} · every check-in desk prints this design</p>
        </div>
        <div className="flex items-center gap-2" aria-live="polite">
          <SaveStatusPill status={status} />
          {status === "error" ? <Button size="sm" variant="secondary" onClick={retry}>Try again</Button> : null}
        </div>
        <Button size="sm" variant="quiet" disabled={!canUndo} onClick={undo}>Undo</Button>
        <Button size="sm" variant="quiet" disabled={!canRedo} onClick={redo}>Redo</Button>
        <Button size="sm" variant="secondary" onClick={onClose}>Close</Button>
      </header>
      {status === "error" && error ? (
        <div className="px-4 pt-2"><Callout tone="danger" role="alert">{error} Your changes are kept on this device.</Callout></div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto lg:grid lg:grid-cols-[300px_minmax(0,1fr)_272px] lg:overflow-hidden">
        {/* Settings */}
        <aside aria-label="Badge settings" className="order-2 flex shrink-0 flex-col gap-6 border-line p-4 sm:p-5 lg:order-none lg:overflow-y-auto lg:border-r">
          <Section title="Style">
            <div role="radiogroup" aria-label="Badge style" className="grid grid-cols-3 gap-2">
              {TEMPLATES.map((template) => {
                const active = settings.template === template.key;
                return (
                  <button
                    key={template.key}
                    type="button"
                    role="radio"
                    aria-checked={active}
                    title={template.hint}
                    onClick={() => update({ template: template.key, ...layoutForPaper(template.key, settings.widthMm, settings.heightMm, flags) })}
                    className={cn("flex min-h-11 flex-col items-center gap-1.5 rounded-[10px] border bg-canvas p-2 text-center transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary", active ? "border-primary shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line")}
                  >
                    <TemplateThumb template={template.key} />
                    <span className="text-[12px] font-semibold leading-tight text-ink">{template.label}</span>
                  </button>
                );
              })}
            </div>
            <p className="text-caption text-ink-muted">Changing style resets positions.</p>
          </Section>

          <ColourSection settings={settings} branding={branding} update={update} />

          <PaperSection settings={settings} onPaper={setPaper} onCustom={(patch) => update(patch)} />

          <Section title="Text">
            <Field label="Heading">
              <Input maxLength={120} value={settings.heading} onChange={(event) => update({ heading: event.target.value })} />
            </Field>
            <ToggleField label="Badge label" checked={settings.showBadgeLabel} onCheckedChange={(showBadgeLabel) => update({ showBadgeLabel })}>
              <Input maxLength={40} value={settings.badgeLabel} disabled={!settings.showBadgeLabel} onChange={(event) => update({ badgeLabel: event.target.value })} placeholder="ATTENDEE" />
            </ToggleField>
            <ToggleField label="Footer" checked={settings.showFooter} onCheckedChange={(showFooter) => update({ showFooter })}>
              <Input maxLength={80} value={settings.footerText} disabled={!settings.showFooter} onChange={(event) => update({ footerText: event.target.value })} />
            </ToggleField>
          </Section>

          <Section title="Logos">
            <SwitchLine
              label="Space Works symbol"
              hint="Placed unaltered, with clear space around it."
              checked={settings.showSymbol}
              onCheckedChange={(on) => toggleItem("showSymbol", on, "symbol")}
            />
            <SwitchLine
              label="Organisation logo"
              hint={branding.organisationLogoUrl ? undefined : "Add a logo in organisation settings first."}
              disabled={!branding.organisationLogoUrl}
              checked={settings.showLogo && Boolean(branding.organisationLogoUrl)}
              onCheckedChange={(on) => toggleItem("showLogo", on, "logo")}
            />
            <SwitchLine
              label="Event logo"
              hint={branding.eventLogoUrl ? undefined : "Add a logo to the event website first."}
              disabled={!branding.eventLogoUrl}
              checked={settings.showEventLogo && Boolean(branding.eventLogoUrl)}
              onCheckedChange={(on) => toggleItem("showEventLogo", on, "eventLogo")}
            />
            <SwitchLine
              label="Sponsor logos"
              hint={branding.sponsorLogoUrls.length ? `${branding.sponsorLogoUrls.length} published sponsor${branding.sponsorLogoUrls.length === 1 ? "" : "s"} with a logo.` : "Publish sponsors with logos on the event website first."}
              disabled={branding.sponsorLogoUrls.length === 0}
              checked={settings.showSponsors && branding.sponsorLogoUrls.length > 0}
              onCheckedChange={(on) => toggleItem("showSponsors", on, "sponsors")}
            />
            {settings.showSponsors && branding.sponsorLogoUrls.length > 1 ? (
              <Field label="Sponsors on each badge">
                <Dropdown value={String(Math.min(settings.sponsorLimit, branding.sponsorLogoUrls.length))} onChange={(event) => update({ sponsorLimit: Number(event.target.value) })}>
                  {Array.from({ length: Math.min(SPONSOR_LIMIT_MAX, branding.sponsorLogoUrls.length) }, (_, index) => index + 1).map((count) => (
                    <option key={count} value={count}>Up to {count}</option>
                  ))}
                </Dropdown>
              </Field>
            ) : null}
          </Section>

          <Section title="Show on the badge">
            <SwitchLine
              label="Attendee photo"
              hint="Their uploaded profile photo, or their initials."
              checked={settings.showPhoto}
              onCheckedChange={(on) => toggleItem("showPhoto", on, "photo")}
            />
            {settings.showPhoto ? (
              <SegmentedControl<IdCardPrintSettings["photoShape"]>
                ariaLabel="Photo shape"
                size="sm"
                value={settings.photoShape}
                onValueChange={(photoShape) => update({ photoShape })}
                options={[{ value: "circle", label: "Circle" }, { value: "rounded", label: "Rounded square" }]}
                className="self-start"
              />
            ) : null}
            <SwitchLine label="Attendee email" checked={settings.showEmail} onCheckedChange={(showEmail) => update({ showEmail })} />
            <SwitchLine label="Shrink long names to fit" hint="Keeps names on one line, down to 60% of the size." checked={settings.nameAutoFit} onCheckedChange={(nameAutoFit) => update({ nameAutoFit })} />
          </Section>

          <AnswersSection settings={settings} fields={registrationFields} update={update} />
        </aside>

        {/* Canvas */}
        <section aria-label="Badge preview" className="order-1 flex min-h-[420px] min-w-0 shrink-0 flex-col bg-subtle lg:order-none lg:min-h-0">
          <div className="flex flex-wrap items-center gap-2 border-b border-line bg-canvas px-3 py-2">
            <SegmentedControl<Sample>
              ariaLabel="Preview with"
              size="sm"
              value={sample}
              onValueChange={setSample}
              options={[
                { value: "short", label: "Short name" },
                { value: "long", label: "Long name" },
                ...(attendee ? [{ value: "attendee" as const, label: attendee.displayName.split(" ")[0] || "Attendee" }] : []),
              ]}
            />
            <div className="ml-auto flex items-center gap-2">
              <Button size="sm" variant={guides ? "secondary" : "quiet"} aria-pressed={guides} onClick={() => setGuides(!guides)}>
                {guides ? "Hide guides" : "Show guides"}
              </Button>
              <Dropdown aria-label="Snap to" value={String(settings.gridSizeMm)} onChange={(event) => update({ gridSizeMm: Number(event.target.value) as IdCardPrintSettings["gridSizeMm"] }, false)} className="w-[132px] text-[13px]">
                {ID_CARD_GRID_SIZES_MM.map((size) => <option key={size} value={size}>Snap {size} mm</option>)}
              </Dropdown>
            </div>
          </div>
          <FitArea widthMm={settings.widthMm} heightMm={settings.heightMm}>
            {(pxPerMm) => (
              <BadgeCanvas
                settings={settings}
                attendee={previewPerson}
                branding={branding}
                pxPerMm={pxPerMm}
                interaction={guides ? { selected, onSelect: setSelected, onBeginChange: checkpoint, onMove: move, showGrid: settings.showGrid } : undefined}
              />
            )}
          </FitArea>
          <p className="border-t border-line bg-canvas px-4 py-2 text-caption text-ink-muted">
            {guides ? "Click an item to edit it. Drag, or use arrow keys (Shift for bigger steps)." : "This is how the card prints. Guides never print."}
          </p>
        </section>

        {/* Inspector */}
        <aside aria-label="Selected item" className="order-1 shrink-0 border-line p-4 sm:p-5 lg:order-none lg:overflow-y-auto lg:border-l">
          <Inspector settings={settings} branding={branding} selected={selected} onSelect={setSelected} update={update} />
        </aside>
      </div>

      {notice ? (
        <div className="px-4 pt-2">
          <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"} action={<Button size="sm" variant="quiet" onClick={() => setNotice(null)}>Dismiss</Button>}>{notice.text}</Callout>
        </div>
      ) : null}

      <footer className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 sm:px-5">
        <DesignFileButtons
          settings={settings}
          eventTitle={source.eventTitle}
          organisationName={source.organisationName}
          onImport={(next) => {
            update(next);
            setNotice({ tone: "success", text: "Design imported." });
          }}
          onError={(text) => setNotice({ tone: "danger", text })}
        />
        <span className="hidden text-caption text-ink-muted md:inline">Print at 100% (actual size), no headers or footers.</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Button variant="secondary" disabled={printing} onClick={() => runPrint(sampleAttendee(registrationFields))}>
            Print test card
          </Button>
          {attendee ? (
            <Button variant="primary" disabled={printing} onClick={() => runPrint(attendee)}>
              Print {attendee.displayName.split(" ")[0]}&apos;s badge
            </Button>
          ) : (
            <Button variant="primary" onClick={onClose}>Done</Button>
          )}
        </div>
      </footer>
    </div>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3">
      <h3 id={id} className="text-overline text-ink-muted">{title}</h3>
      {children}
    </section>
  );
}

export function SwitchLine({ label, hint, checked, disabled, onCheckedChange }: { label: string; hint?: string; checked: boolean; disabled?: boolean; onCheckedChange: (checked: boolean) => void }) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-center justify-between gap-3">
      <label htmlFor={id} className={cn("min-w-0 cursor-pointer", disabled && "cursor-not-allowed")}>
        <span className={cn("block text-body-ui", disabled ? "text-ink-muted" : "text-ink")}>{label}</span>
        {hint ? <span className="block text-caption text-ink-muted">{hint}</span> : null}
      </label>
      <Switch id={id} checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function ToggleField({ label, checked, onCheckedChange, children }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void; children: ReactNode }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={`${id}-input`} className="text-label text-ink">{label}</label>
        <Switch aria-label={`Show ${label.toLowerCase()}`} checked={checked} onCheckedChange={onCheckedChange} />
      </div>
      <div id={`${id}-input`} className="contents">{children}</div>
    </div>
  );
}

/** A labelled colour choice: a swatch plus its name, so the choice never depends on colour alone. */
export function SwatchGroup<T extends string>({
  label,
  value,
  options,
  colourOf,
  onChange,
}: {
  label: string;
  value: T;
  options: readonly T[];
  colourOf: (key: T) => string | null;
  onChange: (key: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-label text-ink">{label}</p>
      <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
        {options.map((key) => {
          const colour = colourOf(key);
          const active = key === value;
          return (
            <button
              key={key}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(key)}
              className={cn(
                "inline-flex min-h-9 items-center gap-1.5 rounded-[10px] border px-2.5 text-[13px] font-semibold text-ink transition-colors hover:bg-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                active ? "border-primary bg-subtle shadow-[inset_0_0_0_1px_var(--color-primary)]" : "border-line",
              )}
            >
              {colour ? <span aria-hidden className="size-4 shrink-0 rounded-full border border-line-strong" style={{ background: colour }} /> : null}
              {BADGE_COLOUR_LABELS[key as keyof typeof BADGE_COLOUR_LABELS]}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ColourSection({ settings, branding, update }: { settings: IdCardPrintSettings; branding: BadgeBranding; update: (patch: Partial<IdCardPrintSettings>) => void }) {
  const eventColour = eventAccentHex(branding.eventAccent);
  const colourOf = (key: string) => (key === "event" ? eventColour : key === "auto" ? null : BRAND[key as keyof typeof BRAND]);
  const palette = resolveBadgePalette(settings, branding.eventAccent);
  const autoName = palette.text === BRAND.ink ? "Deep Ink" : palette.text === BRAND.cream ? "Warm Cream" : "White";
  return (
    <Section title="Colour">
      <SegmentedControl<IdCardPrintSettings["colorMode"]>
        ariaLabel="Colour mode"
        size="sm"
        value={settings.colorMode}
        onValueChange={(colorMode) => update({ colorMode })}
        options={[{ value: "colour", label: "Colour" }, { value: "mono", label: "Black and white" }]}
        className="self-start"
      />
      {settings.colorMode === "mono" ? (
        <p className="text-caption text-ink-muted">Print economy: black on white only, for laser and thermal printers. Logos and photos print in grey.</p>
      ) : (
        <>
          <SwatchGroup label="Card" value={settings.backgroundColor} options={BADGE_BACKGROUND_KEYS} colourOf={colourOf} onChange={(backgroundColor) => update({ backgroundColor })} />
          <SwatchGroup label={settings.template === "bold" ? "Band and accents" : "Frame and accents"} value={settings.accentColor} options={BADGE_ACCENT_KEYS} colourOf={colourOf} onChange={(accentColor) => update({ accentColor })} />
          <SwatchGroup label="Text" value={settings.textColor} options={BADGE_TEXT_KEYS} colourOf={colourOf} onChange={(textColor) => update({ textColor })} />
          {palette.textAdjusted ? (
            <Callout tone="warning">That text colour doesn&apos;t have enough contrast on this card, so text prints in {autoName}.</Callout>
          ) : null}
          <p className="text-caption text-ink-muted">Text always keeps a 4.5:1 contrast with what it sits on. Event accent: {eventColour}.</p>
        </>
      )}
    </Section>
  );
}

/** A tiny drawing of each template: the frame, band or bare page, a big name bar and the QR corner. */
function TemplateThumb({ template }: { template: IdCardPrintSettings["template"] }) {
  return (
    <span aria-hidden className="relative block h-[52px] w-[38px] overflow-hidden bg-white outline outline-1 outline-line">
      {template === "classic" ? (
        <>
          <span className="absolute inset-[2px] rounded-[1.5px] border border-sw-teal" />
          <span className="absolute left-[6px] top-[6px] block h-[1.5px] w-[9px] bg-sw-ink" />
          <span className="absolute left-[6px] top-[9px] block h-[2.5px] w-[18px] bg-sw-ink" />
          <span className="absolute left-[6px] top-[13.5px] block h-px w-[20px] bg-sw-teal" />
          <span className="absolute left-[6px] top-[18px] block h-[5px] w-[24px] bg-sw-ink" />
          <span className="absolute left-[6px] top-[25px] block h-[1.5px] w-[15px] bg-sw-ink" />
        </>
      ) : null}
      {template === "bold" ? (
        <>
          <span className="absolute inset-x-[2px] top-[2px] block h-[12px] rounded-[1.5px] bg-sw-teal" />
          <span className="absolute left-[5px] top-[5px] block h-[1.5px] w-[8px] bg-sw-cream" />
          <span className="absolute left-[5px] top-[8.5px] block h-[2.5px] w-[18px] bg-sw-cream" />
          <span className="absolute left-[5px] top-[17px] block h-[5px] w-[26px] bg-sw-ink" />
          <span className="absolute left-[5px] top-[24px] block h-[1.5px] w-[15px] bg-sw-ink" />
        </>
      ) : null}
      {template === "minimal" ? (
        <>
          <span className="absolute left-[5px] top-[5px] block h-[1.5px] w-[11px] bg-sw-ink" />
          <span className="absolute left-[5px] top-[19px] block h-[5px] w-[26px] bg-sw-ink" />
          <span className="absolute left-[5px] top-[26px] block h-[1.5px] w-[14px] bg-sw-ink" />
        </>
      ) : null}
      <span
        className={cn(
          "absolute block border-[1.5px] border-dotted border-sw-ink",
          template === "minimal" ? "bottom-[5px] right-[5px] size-[9px]" : "bottom-[5px] right-[5px] size-[11px]",
        )}
      />
    </span>
  );
}

export function PaperSection({
  settings,
  onPaper,
  onCustom,
}: {
  settings: IdCardPrintSettings;
  onPaper: (widthMm: number, heightMm: number) => void;
  onCustom: (patch: Partial<IdCardPrintSettings>) => void;
}) {
  const match = matchPaperPreset(settings.widthMm, settings.heightMm);
  const [custom, setCustom] = useState(!match);
  const landscape = settings.widthMm > settings.heightMm;
  const presetId = custom ? "custom" : match?.preset.id ?? "custom";
  return (
    <Section title="Paper">
      <Field label="Badge stock" helperText={custom ? "Enter your stock's size. Positions keep where they are." : match?.preset.detail}>
        <Dropdown
          value={presetId}
          onChange={(event) => {
            const preset = ID_CARD_PAPER_PRESETS.find((item) => item.id === event.target.value);
            if (!preset) return setCustom(true);
            setCustom(false);
            const [w, h] = landscape !== preset.widthMm > preset.heightMm ? [preset.heightMm, preset.widthMm] : [preset.widthMm, preset.heightMm];
            onPaper(w, h);
          }}
        >
          {ID_CARD_PAPER_PRESETS.map((preset) => <option key={preset.id} value={preset.id}>{preset.label}</option>)}
          <option value="custom">Custom size</option>
        </Dropdown>
      </Field>
      {custom ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Width (mm)"><Input type="number" min={40} max={300} step={0.1} value={settings.widthMm} onChange={(event) => onCustom({ widthMm: Number(event.target.value) })} /></Field>
          <Field label="Height (mm)"><Input type="number" min={40} max={300} step={0.1} value={settings.heightMm} onChange={(event) => onCustom({ heightMm: Number(event.target.value) })} /></Field>
        </div>
      ) : null}
      <SegmentedControl<"portrait" | "landscape">
        ariaLabel="Orientation"
        size="sm"
        value={landscape ? "landscape" : "portrait"}
        onValueChange={(next) => {
          if ((next === "landscape") !== landscape) onPaper(settings.heightMm, settings.widthMm);
        }}
        options={[{ value: "portrait", label: "Portrait" }, { value: "landscape", label: "Landscape" }]}
        className="self-start"
      />
    </Section>
  );
}

function AnswersSection({ settings, fields, update }: { settings: IdCardPrintSettings; fields: RegistrationField[]; update: (patch: Partial<IdCardPrintSettings>) => void }) {
  const options = fields.map((field) => ({ key: registrationFieldKey(field.key), label: field.label }));
  const chosen = settings.printFieldKeys.flatMap((key) => options.find((option) => option.key === key) ?? []);
  const available = options.filter((option) => !settings.printFieldKeys.includes(option.key));
  const moveField = (index: number, by: -1 | 1) => {
    const keys = [...settings.printFieldKeys];
    const [item] = keys.splice(index, 1);
    keys.splice(index + by, 0, item!);
    update({ printFieldKeys: keys });
  };
  return (
    <Section title="Registration answers">
      {options.length === 0 ? (
        <p className="text-caption text-ink-muted">This event&apos;s sign-up form has no extra questions to print.</p>
      ) : (
        <>
          {chosen.length > 0 ? (
            <ol className="flex flex-col gap-2">
              {chosen.map((field, index) => (
                <li key={field.key} className="flex flex-col gap-2 rounded-[10px] border border-line p-2.5">
                  <span className="min-w-0 truncate text-label text-ink">{field.label}</span>
                  <div className="flex flex-wrap gap-1">
                    <Button size="sm" variant="quiet" aria-label={`Move ${field.label} up`} disabled={index === 0} onClick={() => moveField(index, -1)}>Up</Button>
                    <Button size="sm" variant="quiet" aria-label={`Move ${field.label} down`} disabled={index === chosen.length - 1} onClick={() => moveField(index, 1)}>Down</Button>
                    <Button size="sm" variant="quiet" aria-label={`Remove ${field.label}`} onClick={() => update({ printFieldKeys: settings.printFieldKeys.filter((key) => key !== field.key) })}>Remove</Button>
                  </div>
                  <Input
                    aria-label={`Printed label for ${field.label}`}
                    maxLength={60}
                    value={settings.printFieldLabels[field.key] ?? field.label}
                    placeholder="No label, just the answer"
                    onChange={(event) => update({ printFieldLabels: { ...settings.printFieldLabels, [field.key]: event.target.value } })}
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-caption text-ink-muted">Print answers like company or role under the name.</p>
          )}
          {available.length > 0 ? (
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Add an answer">
              {available.map((field) => (
                <button
                  key={field.key}
                  type="button"
                  onClick={() => update({ printFieldKeys: [...settings.printFieldKeys, field.key] })}
                  className="inline-flex min-h-9 items-center rounded-full border border-dashed border-line-strong px-3 text-[13px] font-semibold text-ink-secondary hover:bg-subtle hover:text-ink focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  Add {field.label}
                </button>
              ))}
            </div>
          ) : null}
        </>
      )}
    </Section>
  );
}

export function Inspector({
  settings,
  branding,
  selected,
  onSelect,
  update,
  labels = ELEMENT_LABELS,
}: {
  settings: IdCardPrintSettings;
  branding: BadgeBranding;
  selected: IdCardLayoutElement;
  onSelect: (element: IdCardLayoutElement) => void;
  update: (patch: Partial<IdCardPrintSettings>) => void;
  /** Item names, for designers that call things differently (member ID cards). */
  labels?: Record<IdCardLayoutElement, string>;
}) {
  const square = isSquareElement(selected);
  const text = isTextElement(selected);
  const at = settings.elementPositions[selected];
  const size = settings.elementSizes[selected];
  const visible: Record<IdCardLayoutElement, boolean> = {
    header: Boolean((settings.showBadgeLabel && settings.badgeLabel.trim()) || settings.heading.trim()),
    name: settings.showName,
    email: settings.showEmail,
    details: settings.printFieldKeys.length > 0,
    qr: settings.showQr,
    footer: settings.showFooter && Boolean(settings.footerText.trim()),
    logo: settings.showLogo && Boolean(branding.organisationLogoUrl),
    eventLogo: settings.showEventLogo && Boolean(branding.eventLogoUrl),
    symbol: settings.showSymbol,
    photo: settings.showPhoto,
    sponsors: settings.showSponsors && branding.sponsorLogoUrls.length > 0,
    // Member ID items; event badges never turn these on.
    idNumber: settings.showIdNumber,
    validUntil: settings.showValidUntil,
  };
  const place = (xMm: number, yMm: number) => update({ elementPositions: { ...settings.elementPositions, [selected]: { xMm: Math.round(xMm * 10) / 10, yMm: Math.round(yMm * 10) / 10 } } });
  const height = elementHeightForMove(settings, selected);
  const align = {
    left: () => place(SAFE_MARGIN_MM, at.yMm),
    centre: () => place((settings.widthMm - size) / 2, at.yMm),
    right: () => place(settings.widthMm - size - SAFE_MARGIN_MM, at.yMm),
    top: () => place(at.xMm, SAFE_MARGIN_MM),
    middle: () => place(at.xMm, (settings.heightMm - height) / 2),
    bottom: () => place(at.xMm, settings.heightMm - height - SAFE_MARGIN_MM),
  };
  const fresh = () => layoutForPaper(settings.template, settings.widthMm, settings.heightMm, layoutFlags(settings));
  const resetItem = () => {
    const layout = fresh();
    update({
      elementPositions: { ...settings.elementPositions, [selected]: layout.elementPositions[selected] },
      elementSizes: { ...settings.elementSizes, [selected]: layout.elementSizes[selected] },
      elementTextSizes: { ...settings.elementTextSizes, [selected]: layout.elementTextSizes[selected] },
      elementBold: { ...settings.elementBold, [selected]: layout.elementBold[selected] },
    });
  };
  const minimum = minimumElementSizeMm(selected);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-2">
        <h3 className="text-overline text-ink-muted">Items</h3>
        <div role="radiogroup" aria-label="Select an item" className="flex flex-wrap gap-1.5">
          {ID_CARD_LAYOUT_ELEMENTS.filter((element) => visible[element] || element === selected).map((element) => (
            <button
              key={element}
              type="button"
              role="radio"
              aria-checked={selected === element}
              onClick={() => onSelect(element)}
              className={cn(
                "min-h-9 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary",
                selected === element ? "border-primary bg-primary text-on-primary" : "border-line text-ink-secondary hover:bg-subtle hover:text-ink",
              )}
            >
              {labels[element]}
            </button>
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-3 rounded-[16px] border border-line p-3.5">
        <p className="text-label text-ink">{labels[selected]}</p>
        {!visible[selected] ? <p className="text-caption text-ink-muted">Hidden on the badge right now.</p> : null}
        {text ? (
          <NumberSlider
            label="Text size"
            unit="pt"
            min={6}
            max={48}
            step={0.5}
            value={settings.elementTextSizes[selected]}
            onChange={(value) => update({ elementTextSizes: { ...settings.elementTextSizes, [selected]: value } })}
          />
        ) : null}
        <NumberSlider
          label={square ? "Size" : selected === "sponsors" ? "Strip width" : "Box width"}
          unit="mm"
          min={minimum}
          max={Math.max(minimum, settings.widthMm - 4)}
          step={1}
          value={size}
          onChange={(value) => update({ elementSizes: { ...settings.elementSizes, [selected]: value } })}
        />
        {text ? <SwitchLine label="Bold" checked={settings.elementBold[selected]} onCheckedChange={(bold) => update({ elementBold: { ...settings.elementBold, [selected]: bold } })} /> : null}
        <div className="grid grid-cols-2 gap-2">
          <Field label="From left (mm)"><Input type="number" step={settings.gridSizeMm} value={at.xMm} onChange={(event) => place(Number(event.target.value), at.yMm)} /></Field>
          <Field label="From top (mm)"><Input type="number" step={settings.gridSizeMm} value={at.yMm} onChange={(event) => place(at.xMm, Number(event.target.value))} /></Field>
        </div>
        <div className="flex flex-col gap-1.5">
          <p className="text-caption text-ink-muted">Align on the badge</p>
          <div className="grid grid-cols-3 gap-1">
            {(Object.keys(align) as Array<keyof typeof align>).map((key) => (
              <Button key={key} size="sm" variant="secondary" className="px-2 capitalize" onClick={align[key]}>{key}</Button>
            ))}
          </div>
        </div>
        <Button size="sm" variant="quiet" onClick={resetItem} className="self-start">Reset this item</Button>
      </div>

      {selected === "qr" && size < 20 ? <Callout tone="warning">Keep the QR at least 20 mm so it scans reliably once printed.</Callout> : null}
      {selected === "symbol" ? <p className="text-caption text-ink-muted">Keep a quarter of the symbol&apos;s height clear on every side.</p> : null}

      <Button size="sm" variant="quiet" className="self-start" onClick={() => update(fresh())}>
        Reset the whole layout
      </Button>
    </div>
  );
}

export function NumberSlider({ label, unit, min, max, step, value, onChange }: { label: string; unit: string; min: number; max: number; step: number; value: number; onChange: (value: number) => void }) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-center justify-between gap-2">
        <label htmlFor={id} className="text-caption text-ink-muted">{label}</label>
        <span className="flex items-center gap-1">
          <Input aria-label={`${label} (${unit})`} type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-[76px] px-2 text-right tabular-nums" />
          <span className="text-caption text-ink-muted">{unit}</span>
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} className="w-full accent-[var(--color-primary)]" />
    </div>
  );
}

/** Measures the space and hands the card the largest scale that fits. */
export function FitArea({ widthMm, heightMm, children }: { widthMm: number; heightMm: number; children: (pxPerMm: number) => ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [box, setBox] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBox({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  const fit = box.width ? Math.min((box.width - 40) / widthMm, (Math.max(box.height, 320) - 40) / heightMm) : 0;
  const pxPerMm = Math.min(6, Math.max(1.6, fit || 3));
  return (
    <div
      ref={ref}
      className="grid min-h-[380px] flex-1 place-items-center overflow-auto p-5"
      style={{ backgroundImage: "radial-gradient(circle, rgb(20 44 42 / 18%) 1px, transparent 1px)", backgroundSize: "16px 16px" }}
    >
      {box.width ? children(pxPerMm) : null}
    </div>
  );
}

function DesignFileButtons({
  settings,
  eventTitle,
  organisationName,
  onImport,
  onError,
}: {
  settings: IdCardPrintSettings;
  eventTitle: string;
  organisationName: string;
  onImport: (settings: IdCardPrintSettings) => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="quiet"
        title="Save this design as a file, to reuse it for another event"
        onClick={() => {
          const blob = new Blob([exportIdCardDesign(settings)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "badge-design.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Export design
      </Button>
      <Button size="sm" variant="quiet" onClick={() => fileInput.current?.click()}>Import design</Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 200_000) return onError("That file is too large to be a badge design.");
          const next = importIdCardDesign(await file.text(), eventTitle, organisationName);
          if (next) onImport(next);
          else onError("That file isn't a badge design. Choose a .json file exported from the badge designer.");
        }}
      />
    </div>
  );
}

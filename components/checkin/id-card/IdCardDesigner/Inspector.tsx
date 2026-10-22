"use client";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import {
  ID_CARD_LAYOUT_ELEMENTS,
  isSquareElement,
  isTextElement,
  layoutFlags,
  layoutForPaper,
  minimumElementSizeMm,
  type IdCardLayoutElement,
  type IdCardPrintSettings,
} from "@/lib/idCardPrint";
import type { BadgeBranding } from "@/lib/badge/types";
import { elementHeightForMove } from "../BadgeCanvas";
import { ELEMENT_LABELS, SAFE_MARGIN_MM } from "../shared";
import { NumberSlider, SwitchLine } from "./controls";

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

"use client";

import { cn } from "@/lib/cn";
import { layoutForPaper, type IdCardLayoutFlags, type IdCardPrintSettings } from "@/lib/idCardPrint";
import { Section } from "./controls";

const TEMPLATES = [
  { key: "classic", label: "Classic", hint: "Thin frame, rule under the heading" },
  { key: "bold", label: "Bold", hint: "Heading on a colour band, name in capitals" },
  { key: "minimal", label: "Minimal", hint: "No lines, just the name" },
] as const;

export function StyleSection({ settings, flags, update }: { settings: IdCardPrintSettings; flags: IdCardLayoutFlags; update: (patch: Partial<IdCardPrintSettings>) => void }) {
  return (
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

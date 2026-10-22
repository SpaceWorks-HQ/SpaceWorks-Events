"use client";

import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/cn";
import { BROADCAST_STARTER_TEMPLATES } from "@/lib/broadcastTemplate";
import { FEATURED_TEMPLATES, MORE_TEMPLATES, StepHeading } from "./shared";

export function TemplateSection({ templateId, applyTemplate, pending, moreOpen, setShowAllTemplates }: {
  templateId: string;
  applyTemplate: (id: string) => void;
  pending: boolean;
  moreOpen: boolean;
  setShowAllTemplates: (value: boolean) => void;
}) {
  const templateCard = (template: (typeof BROADCAST_STARTER_TEMPLATES)[number]) => {
    const selected = templateId === template.id;
    return (
      <li key={template.id} className="flex">
        <button
          type="button"
          aria-pressed={selected}
          onClick={() => applyTemplate(template.id)}
          disabled={pending}
          className={cn(
            "flex w-full flex-col items-start gap-1 rounded-xl p-3.5 text-left transition-colors duration-[180ms] ease-yy disabled:pointer-events-none disabled:bg-surface disabled:text-ink-muted",
            selected ? "border-2 border-primary bg-accent-soft" : "border border-line bg-panel hover:bg-subtle",
          )}
        >
          <span className="font-bold text-ink">{template.name}</span>
          <span className="line-clamp-2 text-[13px] text-ink-muted">{template.description}</span>
        </button>
      </li>
    );
  };

  return (
    <section aria-labelledby="broadcast-step-template" className="flex flex-col gap-3">
      <StepHeading step={1} id="broadcast-step-template" title="Pick a starting point" aside="Everything stays editable." />
      <ul className="grid grid-cols-1 gap-2.5 min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
        {FEATURED_TEMPLATES.map(templateCard)}
        {moreOpen ? MORE_TEMPLATES.map(templateCard) : null}
        {MORE_TEMPLATES.length > 0 && !moreOpen ? (
          <li className="flex">
            <button
              type="button"
              aria-expanded={false}
              onClick={() => setShowAllTemplates(true)}
              className="flex w-full flex-col items-start gap-1 rounded-xl border border-dashed border-line-strong bg-panel p-3.5 text-left transition-colors duration-[180ms] ease-yy hover:bg-subtle"
            >
              <span className="inline-flex items-center gap-1 font-bold text-ink">
                More templates <ChevronDown aria-hidden className="size-4" />
              </span>
              <span className="line-clamp-2 text-[13px] text-ink-muted">
                {MORE_TEMPLATES.length} more · {MORE_TEMPLATES.slice(0, 2).map((template) => template.name.toLowerCase()).join(", ")}…
              </span>
            </button>
          </li>
        ) : null}
      </ul>
    </section>
  );
}

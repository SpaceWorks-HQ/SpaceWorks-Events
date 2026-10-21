"use client";

import type { Dispatch, ReactNode, SetStateAction } from "react";
import { ChevronDown, ChevronUp, GripVertical } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { cn } from "@/lib/cn";
import {
  sectionLabel,
  sectionNote,
  type PageSection,
} from "@/components/event-dashboard/event-page/summary";

export function SectionsList({
  sections,
  setSections,
  noteData,
  sectionAction,
  touch,
  moveSection,
}: {
  sections: readonly PageSection[];
  setSections: Dispatch<SetStateAction<readonly PageSection[]>>;
  noteData: Parameters<typeof sectionNote>[1];
  sectionAction: (type: string, label: string) => ReactNode;
  touch: () => void;
  moveSection: (index: number, direction: -1 | 1) => void;
}) {
  return (
    <section aria-labelledby="event-page-sections-title" className="flex flex-col gap-3 rounded-xl border border-line bg-panel p-5">
      <div>
        <h2 id="event-page-sections-title" className="text-h4 text-ink">Sections</h2>
        <p className="mt-0.5 text-body-ui text-ink-muted">Reorder with the arrows. Turn off anything you don&apos;t need. Open a section to edit what&apos;s in it.</p>
      </div>
      <ol className="flex flex-col gap-2">
        {sections.map((section, index) => {
          const label = sectionLabel(section.type);
          return (
            <li
              key={section.type}
              className={cn("flex items-center gap-2 rounded-xl border border-line py-2 pl-2.5 pr-2 sm:gap-3 sm:pl-3.5", section.isVisible ? "bg-panel" : "bg-subtle")}
            >
              <GripVertical aria-hidden className="size-4 shrink-0 text-ink-disabled" />
              <div className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-3">
                <div className="flex min-w-0 flex-1 flex-col">
                  <span className={cn("font-bold", section.isVisible ? "text-ink" : "text-ink-muted")}>{label}</span>
                  <span className="truncate text-caption text-ink-muted">{sectionNote(section.type, noteData)}</span>
                </div>
                <div className="-ml-1.5 sm:ml-0">{sectionAction(section.type, label)}</div>
              </div>
              <Switch
                checked={section.isVisible}
                aria-label={`Show ${label} on the event page`}
                onCheckedChange={(checked) => {
                  touch();
                  setSections((current) => current.map((item) => (item.type === section.type ? { ...item, isVisible: checked } : item)));
                }}
              />
              <div className="flex shrink-0 flex-col sm:flex-row sm:gap-0.5">
                <IconButton label={`Move ${label} up`} size="sm" disabled={index === 0} onClick={() => moveSection(index, -1)}>
                  <ChevronUp />
                </IconButton>
                <IconButton label={`Move ${label} down`} size="sm" disabled={index === sections.length - 1} onClick={() => moveSection(index, 1)}>
                  <ChevronDown />
                </IconButton>
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

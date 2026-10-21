"use client";

import { type ChipTone } from "@/components/ui/display";
import { Field, Dropdown } from "@/components/ui/field";

export const visibilityTones: Record<string, ChipTone> = { PUBLISHED: "success", DRAFT: "neutral", HIDDEN: "outline" };
export const visibilityLabels: Record<string, string> = { PUBLISHED: "Published", DRAFT: "Draft", HIDDEN: "Hidden" };

export function VisibilitySelect({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <Field label="Visibility">
      <Dropdown name="visibility" value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="PUBLISHED">Published</option>
        <option value="DRAFT">Draft</option>
        <option value="HIDDEN">Hidden</option>
      </Dropdown>
    </Field>
  );
}

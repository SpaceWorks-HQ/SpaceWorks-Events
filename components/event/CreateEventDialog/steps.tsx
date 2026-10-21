"use client";

import type { Dispatch, SetStateAction } from "react";
import { X } from "lucide-react";
import { RichTextEditor } from "@/components/editor/RichTextEditor";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { fromDatetimeLocalValue, timezones, toDatetimeLocalValue } from "./helpers";

export function BasicsStep({ activeStep, tagInput, setTagInput, addTag, tagsPreview, setTagsPreview }: {
  activeStep: number;
  tagInput: string;
  setTagInput: (value: string) => void;
  addTag: (raw: string) => void;
  tagsPreview: string[];
  setTagsPreview: (value: string[]) => void;
}) {
  return (
    <div className={cn("flex-col gap-4", activeStep === 0 ? "flex" : "hidden")}>
      <Field label="Title" required>
        <Input name="title" autoFocus />
      </Field>
      <RichTextEditor
        name="aboutHtml"
        label="About the event"
        helperText="Required. Share the key details attendees should know."
        minHeight={160}
      />
      <Field label="Tags" helperText="Press Enter or Comma to add up to 12 tags (e.g. workshop, meetup, ai).">
        <Input
          value={tagInput}
          onChange={(e) => {
            const val = e.target.value;
            if (val.endsWith(",")) addTag(val.slice(0, -1));
            else setTagInput(val);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              addTag(tagInput);
            }
          }}
          placeholder="Type a tag and press Enter or Comma"
        />
      </Field>
      <input type="hidden" name="tags" value={tagsPreview.join(",")} />
      {tagsPreview.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {tagsPreview.map((t) => (
            <li key={t} className="inline-flex items-center gap-1 rounded-full bg-muted py-0.5 pl-3 pr-1 text-[13px] font-semibold text-ink-secondary">
              {t}
              <button
                type="button"
                aria-label={`Remove tag ${t}`}
                onClick={() => setTagsPreview(tagsPreview.filter((x) => x !== t))}
                className="inline-flex size-6 items-center justify-center rounded-full hover:bg-emphasis hover:text-ink"
              >
                <X aria-hidden className="size-3.5" />
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

export function ScheduleStep({ activeStep, start, setStart, end, setEnd }: {
  activeStep: number;
  start: Date | null;
  setStart: Dispatch<SetStateAction<Date | null>>;
  end: Date | null;
  setEnd: Dispatch<SetStateAction<Date | null>>;
}) {
  return (
    <div className={cn("flex-col gap-4", activeStep === 1 ? "flex" : "hidden")}>
      <Field label="Start" required helperText="Pick date and time">
        <Input
          type="datetime-local"
          value={start ? toDatetimeLocalValue(start) : ""}
          min={toDatetimeLocalValue(new Date())}
          onChange={(e) => {
            const v = fromDatetimeLocalValue(e.target.value);
            setStart(v);
            if (v) setEnd(new Date(v.getTime() + 60 * 60 * 1000));
          }}
        />
      </Field>
      <Field label="End" required helperText="Must be after start">
        <Input
          type="datetime-local"
          value={end ? toDatetimeLocalValue(end) : ""}
          min={start ? toDatetimeLocalValue(start) : undefined}
          onChange={(e) => setEnd(fromDatetimeLocalValue(e.target.value))}
        />
      </Field>
      <Field label="Timezone" required>
        <Dropdown name="timezone" defaultValue="Asia/Kolkata">
          {timezones.map((tz) => (
            <option key={tz} value={tz}>
              {tz}
            </option>
          ))}
        </Dropdown>
      </Field>
    </div>
  );
}

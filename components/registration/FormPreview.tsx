"use client";

import { useState } from "react";
import { EyeOff, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Radio, RadioGroup } from "@/components/ui/choice";
import { Field, Input, Dropdown, Textarea } from "@/components/ui/field";
import { cn } from "@/lib/cn";
import { DEFAULT_MAX_LENGTH, settingsForType, visibleFieldKeys } from "@/lib/registrationFields";
import type { BuilderField } from "./builderModel";

export type PreviewField = Pick<BuilderField, "id" | "key" | "label" | "type" | "required" | "options" | "helpText" | "placeholder" | "settings">;

const OTHER = "__other__";

/**
 * Interactive mock of the guest's sign-up form. Answers stay in this
 * component (nothing is submitted) so organisers can try their "show only if"
 * rules: hidden questions disappear exactly as they will for guests.
 */
export function FormPreview({ fields, activeId }: { fields: PreviewField[]; activeId?: string | null }) {
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [others, setOthers] = useState<Record<string, string>>({});
  const logic = fields.map((field) => ({ key: field.key, type: field.type, settings: settingsForType(field.type, field.settings) }));
  const visible = visibleFieldKeys(logic, answers);
  const hidden = fields.filter((field) => !visible.has(field.key)).length;
  const touched = Object.keys(answers).length > 0;
  const setAnswer = (key: string, value: unknown) => setAnswers((current) => ({ ...current, [key]: value }));

  return (
    <div className="flex flex-col gap-4 rounded-2xl border border-line bg-canvas p-5 shadow-raised">
      <div>
        <p className="text-h4 text-ink">Register</p>
        <p className="mt-1 text-caption text-ink-muted">This is what guests fill in. Try answering to test your rules.</p>
      </div>
      <Field label={<RequiredLabel label="Full name" required />}>
        <Input autoComplete="off" placeholder="Your name" />
      </Field>
      <Field label={<RequiredLabel label="Email" required />}>
        <Input type="email" autoComplete="off" placeholder="you@example.com" />
      </Field>

      {fields.map((field) =>
        visible.has(field.key) ? (
          <div key={field.id} className={cn("-mx-2 rounded-xl px-2 py-1 transition-colors", activeId === field.id && "bg-accent-soft/60 outline-1 outline-dashed outline-accent")}>
            <PreviewQuestion field={field} value={answers[field.key]} other={others[field.key] ?? ""} onChange={(value) => setAnswer(field.key, value)} onOther={(text) => setOthers((current) => ({ ...current, [field.key]: text }))} />
          </div>
        ) : null,
      )}

      {hidden > 0 || touched ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-subtle px-3 py-2" role="status">
          <span className="flex items-center gap-1.5 text-caption text-ink-muted">
            {hidden > 0 ? (
              <>
                <EyeOff aria-hidden className="size-4" />
                {hidden} {hidden === 1 ? "question is" : "questions are"} hidden by your rules
              </>
            ) : (
              "Every question is showing"
            )}
          </span>
          {touched ? (
            <Button
              variant="quiet"
              size="sm"
              startIcon={<RotateCcw />}
              onClick={() => {
                setAnswers({});
                setOthers({});
              }}
            >
              Clear answers
            </Button>
          ) : null}
        </div>
      ) : null}

      <Button variant="primary" fullWidth className="mt-1" type="button" aria-disabled tabIndex={-1}>
        Register
      </Button>
    </div>
  );
}

function PreviewQuestion({ field, value, other, onChange, onOther }: { field: PreviewField; value: unknown; other: string; onChange: (value: unknown) => void; onOther: (text: string) => void }) {
  const settings = settingsForType(field.type, field.settings);
  const label = field.label || "Untitled question";
  const help = field.helpText || undefined;
  const text = typeof value === "string" ? value : "";

  switch (field.type) {
    case "TEXT":
    case "EMAIL":
    case "PHONE":
      return (
        <Field label={<RequiredLabel label={label} required={field.required} />} helperText={help}>
          <Input
            type={field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : "text"}
            value={text}
            placeholder={field.placeholder || (field.type === "PHONE" ? "+44 7700 900123" : undefined)}
            maxLength={settings.maxLength ?? DEFAULT_MAX_LENGTH[field.type]}
            onChange={(event) => onChange(event.target.value)}
          />
        </Field>
      );
    case "TEXTAREA":
      return (
        <Field label={<RequiredLabel label={label} required={field.required} />} helperText={help}>
          <Textarea rows={3} value={text} placeholder={field.placeholder || undefined} maxLength={settings.maxLength ?? DEFAULT_MAX_LENGTH.TEXTAREA} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "NUMBER":
      return (
        <Field label={<RequiredLabel label={label} required={field.required} />} helperText={help}>
          <Input type="number" inputMode="decimal" value={text} min={settings.min} max={settings.max} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "DATE":
      return (
        <Field label={<RequiredLabel label={label} required={field.required} />} helperText={help}>
          <Input type="date" value={text} min={settings.minDate} max={settings.maxDate} onChange={(event) => onChange(event.target.value)} />
        </Field>
      );
    case "CHECKBOX":
      return <CheckboxField label={<RequiredLabel label={label} required={field.required} />} description={help} checked={value === true} onCheckedChange={(checked) => onChange(checked === true)} />;
    case "SELECT":
      return (
        <div className="flex flex-col gap-2">
          <Field label={<RequiredLabel label={label} required={field.required} />} helperText={help}>
            <Dropdown value={text} onChange={(event) => onChange(event.target.value)}>
              <option value="" disabled>
                Choose…
              </option>
              {field.options.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {settings.allowOther ? <option value={OTHER}>Other</option> : null}
            </Dropdown>
          </Field>
          {text === OTHER ? <OtherInput label={label} value={other} onChange={onOther} /> : null}
        </div>
      );
    case "RADIO":
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label text-ink">
            <RequiredLabel label={label} required={field.required} />
          </legend>
          {help ? <p className="-mt-1 text-caption text-ink-muted">{help}</p> : null}
          <RadioGroup value={text} onValueChange={onChange}>
            {field.options.map((option) => (
              <Radio key={option} value={option} label={option} />
            ))}
            {settings.allowOther ? <Radio value={OTHER} label="Other" /> : null}
          </RadioGroup>
          {text === OTHER ? <OtherInput label={label} value={other} onChange={onOther} /> : null}
        </fieldset>
      );
    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? (value as string[]) : [];
      const limit = settings.maxSelections;
      const atLimit = limit != null && selected.length >= limit;
      const toggle = (option: string, checked: boolean) => onChange(checked ? [...selected, option] : selected.filter((item) => item !== option));
      const all = [...field.options, ...(settings.allowOther ? [OTHER] : [])];
      return (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-1 text-label text-ink">
            <RequiredLabel label={label} required={field.required} />
          </legend>
          {help || limit ? <p className="-mt-1 text-caption text-ink-muted">{[help, limit ? `Choose up to ${limit}.` : null].filter(Boolean).join(" ")}</p> : null}
          {all.map((option) => {
            const checked = selected.includes(option);
            return <CheckboxField key={option} label={option === OTHER ? "Other" : option} checked={checked} disabled={!checked && atLimit} onCheckedChange={(next) => toggle(option, next === true)} />;
          })}
          {selected.includes(OTHER) ? <OtherInput label={label} value={other} onChange={onOther} /> : null}
        </fieldset>
      );
    }
    default:
      return null;
  }
}

function RequiredLabel({ label, required }: { label: string; required: boolean }) {
  return (
    <>
      {label}
      {required ? (
        <span aria-hidden className="ml-0.5 text-danger-fg">
          *
        </span>
      ) : null}
      {required ? <span className="sr-only"> (required)</span> : null}
    </>
  );
}

function OtherInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return <Input aria-label={`${label}: other answer`} value={value} maxLength={200} placeholder="Tell us more" onChange={(event) => onChange(event.target.value)} />;
}

"use client";

import { useId } from "react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import {
  OTHER_CHOICE,
  allowsOther,
  canSelectMore,
  limitHint,
  shouldShowCounter,
  textLimits,
  type OtherAnswer,
} from "@/components/rsvp/registrationAnswers";
import { Input, Dropdown, Textarea } from "@/components/ui/field";
import { CheckboxField, FilterChip, Radio, RadioGroup } from "@/components/ui/choice";
import { controlClasses } from "@/components/ui/styles";
import { cn } from "@/lib/cn";
import { getPhoneParts, phoneCountries, phoneNumberInputValue, setPhoneValue } from "./phone";
import { describedBy, ErrorText, HelpText, ids, LabelText, OtherInput } from "./pieces";

/* ---------- Question ---------- */

export type QuestionFieldProps = {
  field: RegistrationFieldDefinition;
  value: unknown;
  other?: OtherAnswer;
  error?: string;
  /** `other` is passed when the question's "Other" answer changes too. */
  onChange: (value: unknown, other?: OtherAnswer) => void;
};

/** One registration question: label, help text, control, limits, and its own error. */
export function QuestionField({ field, value, other, error, onChange }: QuestionFieldProps) {
  const baseId = useId();
  const id = ids(baseId);
  const help = field.helpText?.trim() ? field.helpText.trim() : null;
  const hint = limitHint(field);
  const placeholder = field.placeholder?.trim() || undefined;
  const invalid = Boolean(error);
  const withOther = allowsOther(field);
  const otherAnswer: OtherAnswer = other ?? { chosen: false, text: "" };
  const otherChosen = withOther && otherAnswer.chosen;

  const helpNode = help ? <HelpText id={id.help}>{help}</HelpText> : null;
  const errorNode = error ? <ErrorText id={id.error}>{error}</ErrorText> : null;

  switch (field.type) {
    case "TEXT":
    case "TEXTAREA": {
      const text = typeof value === "string" ? value : "";
      const { min, max } = textLimits(field);
      const showCounter = shouldShowCounter(field, text.length);
      const describe = describedBy(help && id.help, hint && id.hint, showCounter && id.counter, error && id.error);
      const common = {
        id: id.control,
        value: text,
        onChange: (event: { target: { value: string } }) => onChange(event.target.value),
        maxLength: max,
        minLength: min,
        placeholder,
        required: field.required,
        "aria-invalid": invalid || undefined,
        "aria-describedby": describe,
      };
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.control} className="text-label text-ink"><LabelText field={field} /></label>
          {helpNode}
          {field.type === "TEXTAREA" ? <Textarea rows={3} {...common} /> : <Input {...common} />}
          {hint || showCounter ? (
            <div className="flex items-start gap-3">
              {hint ? <p id={id.hint} className="text-caption text-ink-muted">{hint}</p> : null}
              {showCounter && max != null ? (
                <p id={id.counter} className="ml-auto shrink-0 text-caption tabular-nums text-ink-muted">
                  {text.length.toLocaleString("en-GB")} / {max.toLocaleString("en-GB")}
                  <span className="sr-only"> characters</span>
                </p>
              ) : null}
            </div>
          ) : null}
          {errorNode}
        </div>
      );
    }
    case "EMAIL":
    case "NUMBER":
    case "DATE": {
      const settings = field.settings ?? {};
      const typeProps =
        field.type === "EMAIL"
          ? { type: "email", autoComplete: "email", placeholder }
          : field.type === "NUMBER"
            ? { type: "number", inputMode: "decimal" as const, step: "any", min: settings.min, max: settings.max, placeholder }
            : { type: "date", min: settings.minDate, max: settings.maxDate };
      const current = typeof value === "string" || typeof value === "number" ? value : "";
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.control} className="text-label text-ink"><LabelText field={field} /></label>
          {helpNode}
          <Input
            id={id.control}
            {...typeProps}
            value={current}
            onChange={(event) => onChange(event.target.value)}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(help && id.help, hint && id.hint, error && id.error)}
          />
          {hint ? <p id={id.hint} className="text-caption text-ink-muted">{hint}</p> : null}
          {errorNode}
        </div>
      );
    }
    case "PHONE": {
      const parts = getPhoneParts(value);
      const describe = describedBy(help && id.help, id.hint, error && id.error);
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.control} className="text-label text-ink"><LabelText field={field} /></label>
          {helpNode}
          <div className="flex gap-2">
            <div className="w-[112px] shrink-0">
              <label htmlFor={`${baseId}-dial`} className="sr-only">Country code</label>
              <input
                id={`${baseId}-dial`}
                list={`${baseId}-countries`}
                inputMode="tel"
                autoComplete="tel-country-code"
                value={parts.dial}
                required={field.required}
                onChange={(event) => {
                  const typed = event.target.value;
                  const match = phoneCountries.find((country) => `${country.label} (${country.dial})` === typed || country.label.toLowerCase() === typed.trim().toLowerCase());
                  onChange(setPhoneValue(value, { dial: match ? match.dial : typed }));
                }}
                className={controlClasses}
                aria-invalid={invalid || undefined}
                aria-describedby={describe}
              />
              <datalist id={`${baseId}-countries`}>
                {phoneCountries.map((country) => (
                  <option key={country.id} value={country.dial} label={`${country.label} (${country.dial})`} />
                ))}
              </datalist>
            </div>
            <input
              id={id.control}
              required={field.required}
              value={parts.number}
              onChange={(event) => {
                onChange(phoneNumberInputValue(value, event.target.value));
              }}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={placeholder ?? "Phone number"}
              pattern="[0-9]*"
              className={cn(controlClasses, "min-w-0 flex-1")}
              aria-invalid={invalid || undefined}
              aria-describedby={describe}
            />
          </div>
          <p id={id.hint} className="text-caption text-ink-muted">
            {parts.dial === "+91" ? "Indian mobile numbers must be 10 digits and start with 6–9." : "Choose a country code, or paste a complete international number."}
          </p>
          {errorNode}
        </div>
      );
    }
    case "CHECKBOX":
      return (
        <div className="flex flex-col gap-1.5">
          <CheckboxField
            id={id.control}
            label={field.label}
            description={help ?? undefined}
            checked={value === true}
            onCheckedChange={(checked) => onChange(checked === true)}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(help && `${id.control}-desc`, error && id.error)}
          />
          {errorNode}
        </div>
      );
    case "SELECT": {
      const current = otherChosen ? OTHER_CHOICE : typeof value === "string" ? value : "";
      return (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={id.control} className="text-label text-ink"><LabelText field={field} /></label>
          {helpNode}
          <Dropdown
            id={id.control}
            value={current}
            required={field.required}
            aria-invalid={invalid || undefined}
            aria-describedby={describedBy(help && id.help, error && id.error)}
            onChange={(event) => {
              const next = event.target.value;
              if (next === OTHER_CHOICE) onChange(value, { ...otherAnswer, chosen: true });
              else onChange(next, withOther ? { ...otherAnswer, chosen: false } : undefined);
            }}
          >
            <option value="">{placeholder ?? "Choose…"}</option>
            {field.options.map((option) => (
              <option key={option} value={option}>{option}</option>
            ))}
            {withOther ? <option value={OTHER_CHOICE}>Other</option> : null}
          </Dropdown>
          {otherChosen ? (
            <OtherInput id={id.other} field={field} text={otherAnswer.text} invalid={invalid} onText={(text) => onChange(value, { chosen: true, text })} />
          ) : null}
          {errorNode}
        </div>
      );
    }
    case "RADIO": {
      const current = otherChosen ? OTHER_CHOICE : typeof value === "string" ? value : "";
      return (
        <fieldset className="flex min-w-0 flex-col gap-2" aria-describedby={describedBy(help && id.help, error && id.error)}>
          <legend className="mb-1.5 text-label text-ink"><LabelText field={field} /></legend>
          {helpNode}
          <RadioGroup
            value={current}
            required={field.required}
            aria-invalid={invalid || undefined}
            onValueChange={(next) => {
              if (next === OTHER_CHOICE) onChange(value, { ...otherAnswer, chosen: true });
              else onChange(next, withOther ? { ...otherAnswer, chosen: false } : undefined);
            }}
          >
            {field.options.map((option) => (
              <Radio key={option} value={option} label={option} />
            ))}
            {withOther ? <Radio value={OTHER_CHOICE} label="Other" /> : null}
          </RadioGroup>
          {otherChosen ? (
            <div className="pl-8">
              <OtherInput id={id.other} field={field} text={otherAnswer.text} invalid={invalid} onText={(text) => onChange(value, { chosen: true, text })} />
            </div>
          ) : null}
          {errorNode}
        </fieldset>
      );
    }
    case "MULTI_SELECT": {
      const selected = Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
      const more = canSelectMore(field, selected, otherAnswer);
      return (
        <fieldset className="flex min-w-0 flex-col gap-1.5" aria-describedby={describedBy(help && id.help, hint && id.hint, error && id.error)}>
          <legend className="mb-1.5 text-label text-ink"><LabelText field={field} /></legend>
          {helpNode}
          <div className="flex flex-wrap gap-1.5">
            {field.options.map((option) => {
              const isSelected = selected.includes(option);
              return (
                <FilterChip
                  key={option}
                  selected={isSelected}
                  disabled={!isSelected && !more}
                  className="disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() => onChange(isSelected ? selected.filter((item) => item !== option) : [...selected, option])}
                >
                  {option}
                </FilterChip>
              );
            })}
            {withOther ? (
              <FilterChip
                selected={otherChosen}
                disabled={!otherChosen && !more}
                className="disabled:cursor-not-allowed disabled:opacity-50"
                onClick={() => onChange(selected, { ...otherAnswer, chosen: !otherChosen })}
              >
                Other
              </FilterChip>
            ) : null}
          </div>
          {otherChosen ? (
            <OtherInput id={id.other} field={field} text={otherAnswer.text} invalid={invalid} onText={(text) => onChange(selected, { chosen: true, text })} />
          ) : null}
          {hint ? <p id={id.hint} className="text-caption text-ink-muted">{hint}</p> : null}
          {errorNode}
        </fieldset>
      );
    }
    default:
      return null;
  }
}

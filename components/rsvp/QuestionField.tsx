"use client";

import { useCallback, useId, useMemo, useState, type ReactNode } from "react";
import { AlertCircle } from "lucide-react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import {
  OTHER_CHOICE,
  allowsOther,
  buildAnswersPayload,
  canSelectMore,
  initialAnswerState,
  limitHint,
  shouldShowCounter,
  textLimits,
  validateAnswerState,
  validateQuestion,
  visibleQuestionKeys,
  type AnswerState,
  type OtherAnswer,
} from "@/components/rsvp/registrationAnswers";
import { Input, Dropdown, Textarea } from "@/components/ui/field";
import { CheckboxField, FilterChip, Radio, RadioGroup } from "@/components/ui/choice";
import { controlClasses } from "@/components/ui/styles";
import { OTHER_MAX_LENGTH } from "@/lib/registrationFields";
import { cn } from "@/lib/cn";

/* ---------- Phone ---------- */

const phoneCountries = [
  ["AF", "Afghanistan", "+93"], ["AL", "Albania", "+355"], ["AR", "Argentina", "+54"], ["AU", "Australia", "+61"], ["AT", "Austria", "+43"], ["BD", "Bangladesh", "+880"], ["BE", "Belgium", "+32"], ["BR", "Brazil", "+55"], ["CA", "Canada", "+1"], ["CL", "Chile", "+56"], ["CN", "China", "+86"], ["CO", "Colombia", "+57"], ["DK", "Denmark", "+45"], ["EG", "Egypt", "+20"], ["FI", "Finland", "+358"], ["FR", "France", "+33"], ["DE", "Germany", "+49"], ["GR", "Greece", "+30"], ["HK", "Hong Kong", "+852"], ["HU", "Hungary", "+36"], ["IN", "India", "+91"], ["ID", "Indonesia", "+62"], ["IE", "Ireland", "+353"], ["IL", "Israel", "+972"], ["IT", "Italy", "+39"], ["JP", "Japan", "+81"], ["KE", "Kenya", "+254"], ["MY", "Malaysia", "+60"], ["MX", "Mexico", "+52"], ["NL", "Netherlands", "+31"], ["NZ", "New Zealand", "+64"], ["NG", "Nigeria", "+234"], ["NO", "Norway", "+47"], ["PK", "Pakistan", "+92"], ["PH", "Philippines", "+63"], ["PL", "Poland", "+48"], ["PT", "Portugal", "+351"], ["QA", "Qatar", "+974"], ["RO", "Romania", "+40"], ["RU", "Russia", "+7"], ["SA", "Saudi Arabia", "+966"], ["SG", "Singapore", "+65"], ["ZA", "South Africa", "+27"], ["KR", "South Korea", "+82"], ["ES", "Spain", "+34"], ["SE", "Sweden", "+46"], ["CH", "Switzerland", "+41"], ["TW", "Taiwan", "+886"], ["TH", "Thailand", "+66"], ["TR", "Turkey", "+90"], ["AE", "United Arab Emirates", "+971"], ["GB", "United Kingdom", "+44"], ["US", "United States", "+1"], ["VN", "Vietnam", "+84"],
].map(([id, label, dial]) => ({ id, label, dial }));

function getPhoneParts(raw: unknown) {
  const s = normalizePhoneInput(typeof raw === "string" ? raw : "");
  const knownDial = [...phoneCountries]
    .sort((a, b) => b.dial.length - a.dial.length)
    .find((c) => s.startsWith(c.dial))?.dial;
  // Calling codes are at most three digits. Retaining an unlisted prefix lets
  // attendees use every E.164 country code, not only the convenience list.
  const dial = knownDial ?? s.match(/^\+\d{1,3}/)?.[0] ?? "+91";
  const number = s.startsWith(dial) ? s.slice(dial.length) : s;
  return { dial, number: number.replace(/[^\d]/g, "") };
}

function normalizePhoneInput(value: string) {
  const trimmed = value.trim();
  const withInternationalPrefix = trimmed.startsWith("00") ? `+${trimmed.slice(2)}` : trimmed;
  const digits = withInternationalPrefix.replace(/[^\d]/g, "");
  return withInternationalPrefix.startsWith("+") ? `+${digits.slice(0, 15)}` : digits.slice(0, 15);
}

function normalizeDial(value: string) {
  const digits = value.replace(/[^\d]/g, "").slice(0, 3);
  return digits ? `+${digits}` : "+";
}

function setPhoneValue(current: unknown, next: { dial?: string; number?: string }): string {
  const parts = getPhoneParts(current);
  const dial = next.dial ? normalizeDial(next.dial) : parts.dial;
  const number = (next.number ?? parts.number).replace(/[^\d]/g, "").slice(0, Math.max(0, 15 - (dial.length - 1)));
  return number ? `${dial}${number}` : "";
}

/* ---------- Small pieces ---------- */

function LabelText({ field }: { field: RegistrationFieldDefinition }) {
  return (
    <>
      {field.label}
      {field.required ? null : <span className="ml-1.5 font-normal text-ink-muted">Optional</span>}
    </>
  );
}

function HelpText({ id, children }: { id: string; children: ReactNode }) {
  return <p id={id} className="whitespace-pre-line text-caption text-ink-muted">{children}</p>;
}

function ErrorText({ id, children }: { id: string; children: ReactNode }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-caption text-danger-fg">
      <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
      <span>{children}</span>
    </p>
  );
}

function ids(baseId: string) {
  return { control: `${baseId}-control`, help: `${baseId}-help`, hint: `${baseId}-hint`, counter: `${baseId}-counter`, error: `${baseId}-error`, other: `${baseId}-other` };
}

function describedBy(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ") || undefined;
}

/** Text box for an "Other" answer, shown under the choices once "Other" is picked. */
function OtherInput({ id, field, text, invalid, onText }: { id: string; field: RegistrationFieldDefinition; text: string; invalid: boolean; onText: (text: string) => void }) {
  return (
    <div className="motion-safe:animate-[yy-fade-in_180ms_ease-out_both]">
      <label htmlFor={id} className="sr-only">{`${field.label}: your other answer`}</label>
      <Input
        id={id}
        value={text}
        onChange={(event) => onText(event.target.value)}
        maxLength={OTHER_MAX_LENGTH}
        placeholder="Type your answer"
        aria-invalid={invalid || undefined}
      />
    </div>
  );
}

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
      const maxLength = parts.dial === "+91" ? 10 : Math.max(1, 15 - (parts.dial.length - 1));
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
                const next = event.target.value;
                onChange(next.trimStart().startsWith("+") || next.trimStart().startsWith("00")
                  ? normalizePhoneInput(next)
                  : setPhoneValue(value, { number: next }));
              }}
              inputMode="tel"
              autoComplete="tel-national"
              placeholder={placeholder ?? "Phone number"}
              pattern="[0-9]*"
              maxLength={maxLength}
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

/* ---------- Form state ---------- */

export type RegistrationAnswers = ReturnType<typeof useRegistrationAnswers>;

/**
 * Holds the answers for a list of registration questions: live "show only if"
 * visibility, per-question errors (re-checked as people fix them), and the
 * payload to submit with hidden answers left out.
 */
export function useRegistrationAnswers(fields: readonly RegistrationFieldDefinition[], initialAnswers?: Record<string, unknown>) {
  const [state, setState] = useState<AnswerState>(() => initialAnswerState(fields, initialAnswers ?? {}));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [announcement, setAnnouncement] = useState("");
  const visible = useMemo(() => visibleQuestionKeys(fields, state), [fields, state]);

  const setAnswer = useCallback(
    (key: string, value: unknown, other?: OtherAnswer) => {
      const next: AnswerState = {
        answers: { ...state.answers, [key]: value },
        others: other ? { ...state.others, [key]: other } : state.others,
      };
      const nextVisible = visibleQuestionKeys(fields, next);
      const shown = fields.filter((field) => nextVisible.has(field.key) && !visible.has(field.key));
      const hiddenCount = fields.filter((field) => visible.has(field.key) && !nextVisible.has(field.key)).length;
      if (shown.length > 0) {
        setAnnouncement(shown.length === 1 ? `New question below: ${shown[0]!.label}` : `${shown.length} new questions below.`);
      } else if (hiddenCount > 0) {
        setAnnouncement(hiddenCount === 1 ? "One question no longer applies." : `${hiddenCount} questions no longer apply.`);
      }
      setState(next);
      setErrors((current) => {
        const updated: Record<string, string> = {};
        for (const [errorKey, message] of Object.entries(current)) {
          if (!nextVisible.has(errorKey)) continue;
          if (errorKey !== key) {
            updated[errorKey] = message;
            continue;
          }
          const field = fields.find((item) => item.key === key);
          const recheck = field ? validateQuestion(field, next.answers[key], next.others[key]) : null;
          if (recheck) updated[errorKey] = recheck;
        }
        return updated;
      });
    },
    [fields, state, visible],
  );

  /** Checks every visible question, shows the messages, and returns them (empty when all is well). */
  const validate = useCallback(() => {
    const result = validateAnswerState(fields, state);
    setErrors(result);
    return result;
  }, [fields, state]);

  const payload = useCallback(() => buildAnswersPayload(fields, state), [fields, state]);

  return { fields, state, visible, errors, announcement, setAnswer, validate, payload };
}

/** Moves focus to the first control of a question (or other wrapper) marked with `data-question-key`. */
export function focusQuestion(root: HTMLElement | null, key: string) {
  if (!root) return;
  const wrapper = root.querySelector<HTMLElement>(`[data-question-key="${CSS.escape(key)}"]`);
  const target = wrapper?.querySelector<HTMLElement>(
    'input:not([type="hidden"]):not([tabindex="-1"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled):not([tabindex="-1"])',
  );
  target?.focus();
}

/** Renders the visible questions; ones revealed by an answer fade in without taking focus. */
export function RegistrationQuestions({ controller, className }: { controller: RegistrationAnswers; className?: string }) {
  const { fields, state, visible, errors, announcement, setAnswer } = controller;
  const [initiallyVisible] = useState(() => new Set(visible));
  if (fields.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-3.5", className)}>
      {fields.map((field) =>
        visible.has(field.key) ? (
          <div
            key={field.key}
            data-question-key={field.key}
            className={cn("min-w-0", field.settings?.showIf && !initiallyVisible.has(field.key) && "motion-safe:animate-[yy-fade-in_220ms_ease-out_both]")}
          >
            <QuestionField
              field={field}
              value={state.answers[field.key]}
              other={state.others[field.key]}
              error={errors[field.key]}
              onChange={(value, other) => setAnswer(field.key, value, other)}
            />
          </div>
        ) : null,
      )}
      <p className="sr-only" aria-live="polite">{announcement}</p>
    </div>
  );
}

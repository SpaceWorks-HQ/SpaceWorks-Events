"use client";

import { useCallback, useMemo, useState } from "react";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import {
  buildAnswersPayload,
  initialAnswerState,
  validateAnswerState,
  validateQuestion,
  visibleQuestionKeys,
  type AnswerState,
  type OtherAnswer,
} from "@/components/rsvp/registrationAnswers";
import { cn } from "@/lib/cn";
import { QuestionField } from "./QuestionField/QuestionField";

export { phoneNumberInputValue } from "./QuestionField/phone";
export { QuestionField, type QuestionFieldProps } from "./QuestionField/QuestionField";

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

"use client";

import { forwardRef, useId, type ReactNode } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import { AlertCircle, GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField, Switch, SwitchRow } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { Field, Input, Dropdown } from "@/components/ui/field";
import { FIELD_TYPES, fieldTypeMeta, triggerChoices } from "@/lib/registrationFields";
import { ChoicesEditor } from "./ChoicesEditor";
import { FieldTypeIcon } from "./FieldTypeIcon";
import {
  affectedDependents,
  droppedByTypeChange,
  joinOr,
  MAX_HELP,
  MAX_LABEL,
  MAX_PLACEHOLDER,
  triggerCandidates,
  type BuilderField,
  type DraftErrors,
  type LimitKey,
  type QuestionDraft,
} from "./builderModel";

type Props = {
  id: string;
  draft: QuestionDraft;
  /** Type the question had when editing started (or was picked for a new one). */
  originalType: RegistrationFieldType;
  onChange: (next: QuestionDraft) => void;
  errors: DraftErrors;
  /** Saved questions in form order. */
  fields: BuilderField[];
  /** The question being edited; undefined for a new one (which goes at the end). */
  field?: BuilderField;
  isNew: boolean;
  pending: boolean;
  dirty: boolean;
  onSave: () => void;
  onCancel: () => void;
};

/** Inline editor for one question. The label input is forwarded so the builder can focus it after "add". */
export const QuestionEditor = forwardRef<HTMLInputElement, Props>(function QuestionEditor(props, labelRef) {
  const { id, draft, originalType, onChange, errors, fields, field, isNew, pending, dirty, onSave, onCancel } = props;
  const caps = fieldTypeMeta(draft.type);
  const set = (patch: Partial<QuestionDraft>) => onChange({ ...draft, ...patch });
  const setLimit = (key: LimitKey, value: string) => onChange({ ...draft, limits: { ...draft.limits, [key]: value } });

  const index = field ? fields.findIndex((item) => item.id === field.id) : fields.length;
  const candidates = triggerCandidates(fields, index);
  const trigger = draft.showIf ? fields.find((item) => item.key === draft.showIf!.fieldKey) : undefined;
  const triggerIsValid = Boolean(trigger && candidates.some((item) => item.id === trigger.id));
  const dropped = draft.type === originalType ? [] : droppedByTypeChange({ ...draft, type: originalType }, draft.type);
  const affected = field ? affectedDependents(fields, field.key, draft.type, draft.options.map((choice) => choice.trim())) : [];
  const charLimits = draft.type === "TEXT" || draft.type === "TEXTAREA";

  return (
    <div
      id={id}
      role="group"
      aria-label={isNew ? "New question" : `Edit ${field?.label ?? "question"}`}
      className="flex flex-col gap-5 border-t border-line bg-subtle px-4 py-5 sm:px-5"
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault();
          onSave();
        }
      }}
    >
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_200px]">
        <Field label="Question" error={errors.label}>
          <Input ref={labelRef} value={draft.label} maxLength={MAX_LABEL} placeholder="e.g. Do you have any dietary needs?" onChange={(event) => set({ label: event.target.value })} />
        </Field>
        <Field label="Answer type">
          <Dropdown value={draft.type} onChange={(event) => set({ type: event.target.value as RegistrationFieldType })}>
            {FIELD_TYPES.map((item) => (
              <option key={item.type} value={item.type}>
                {item.label}
              </option>
            ))}
          </Dropdown>
        </Field>
      </div>

      <p className="-mt-3 flex items-center gap-1.5 text-caption text-ink-muted">
        <FieldTypeIcon type={draft.type} />
        {caps.description}
      </p>

      {dropped.length > 0 ? (
        <Callout tone="warning" role="status">
          Switching to {caps.label.toLowerCase()} removes {joinOr(dropped)} when you save.
        </Callout>
      ) : null}

      <div className={caps.isText ? "grid gap-4 sm:grid-cols-2" : "grid gap-4"}>
        <Field label="Help text" optional helperText="Shown under the question." error={errors.helpText}>
          <Input value={draft.helpText} maxLength={MAX_HELP} placeholder="e.g. We'll pass this to the caterer." onChange={(event) => set({ helpText: event.target.value })} />
        </Field>
        {caps.isText ? (
          <Field label="Example answer" optional helperText="Shown faintly inside the empty box." error={errors.placeholder}>
            <Input value={draft.placeholder} maxLength={MAX_PLACEHOLDER} placeholder="e.g. Acme Ltd" onChange={(event) => set({ placeholder: event.target.value })} />
          </Field>
        ) : null}
      </div>

      {caps.hasOptions ? <ChoicesEditor choices={draft.options} onChange={(options) => set({ options })} error={errors.options} disabled={pending} /> : null}

      <div className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4">
        <SwitchRow label="Required" description="Guests must answer before they can register." checked={draft.required} onCheckedChange={(required) => set({ required })} />
        {caps.supportsOther ? (
          <SwitchRow label="Allow an “Other” answer" description="Adds an “Other” choice with a short text box." checked={draft.allowOther} onCheckedChange={(allowOther) => set({ allowOther })} />
        ) : null}
      </div>

      {charLimits || caps.supportsRange || caps.supportsDateRange || caps.supportsMaxSelections ? (
        <Section title="Limits" description="Leave blank for no limit.">
          {charLimits ? (
            <div className="grid grid-cols-2 gap-3">
              <LimitInput label="Fewest characters" value={draft.limits.minLength} error={errors.minLength} onChange={(value) => setLimit("minLength", value)} inputMode="numeric" />
              <LimitInput label="Most characters" value={draft.limits.maxLength} error={errors.maxLength} onChange={(value) => setLimit("maxLength", value)} inputMode="numeric" placeholder={draft.type === "TEXT" ? "200" : "5000"} />
            </div>
          ) : null}
          {caps.supportsRange ? (
            <div className="grid grid-cols-2 gap-3">
              <LimitInput label="Lowest number" value={draft.limits.min} error={errors.min} onChange={(value) => setLimit("min", value)} inputMode="decimal" />
              <LimitInput label="Highest number" value={draft.limits.max} error={errors.max} onChange={(value) => setLimit("max", value)} inputMode="decimal" />
            </div>
          ) : null}
          {caps.supportsDateRange ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <LimitInput label="Earliest date" type="date" value={draft.limits.minDate} error={errors.minDate} onChange={(value) => setLimit("minDate", value)} />
              <LimitInput label="Latest date" type="date" value={draft.limits.maxDate} error={errors.maxDate} onChange={(value) => setLimit("maxDate", value)} />
            </div>
          ) : null}
          {caps.supportsMaxSelections ? (
            <div className="max-w-[220px]">
              <LimitInput label="Up to how many choices?" value={draft.limits.maxSelections} error={errors.maxSelections} onChange={(value) => setLimit("maxSelections", value)} inputMode="numeric" placeholder="Any number" />
            </div>
          ) : null}
        </Section>
      ) : null}

      <ShowIfSection draft={draft} onChange={onChange} candidates={candidates} trigger={triggerIsValid ? trigger : undefined} brokenRule={Boolean(draft.showIf && !triggerIsValid)} error={errors.showIf} />

      {affected.length > 0 ? (
        <Callout tone="warning" role="status" title="Later questions depend on this answer">
          <ul className="list-disc pl-5">
            {affected.map((item) => (
              <li key={item.id}>
                “{item.label}” shows for {joinOr(item.missing.map((value) => `“${value}”`))}, which this question would no longer offer.
              </li>
            ))}
          </ul>
        </Callout>
      ) : null}

      {errors.form ? (
        <p role="alert" className="flex items-start gap-1.5 text-caption text-danger-fg">
          <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
          <span>{errors.form}</span>
        </p>
      ) : null}

      <div className="flex flex-wrap items-center justify-end gap-2">
        <span className="mr-auto hidden text-caption text-ink-muted sm:inline">{dirty ? "Unsaved changes · Ctrl+Enter to save" : null}</span>
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={pending}>
          Cancel
        </Button>
        <Button variant="primary" size="sm" onClick={onSave} loading={pending} loadingLabel="Saving…" disabled={!dirty && !isNew}>
          {isNew ? "Add question" : "Save question"}
        </Button>
      </div>
    </div>
  );
});

function Section({ title, description, children, icon }: { title: string; description?: string; children: ReactNode; icon?: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h4 className="flex items-center gap-1.5 text-label text-ink">
          {icon}
          {title}
        </h4>
        {description ? <p className="text-caption text-ink-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function LimitInput({ label, value, onChange, error, type = "text", inputMode, placeholder }: { label: string; value: string; onChange: (value: string) => void; error?: string; type?: "text" | "date"; inputMode?: "numeric" | "decimal"; placeholder?: string }) {
  return (
    <Field label={label} error={error}>
      <Input type={type} inputMode={inputMode} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
    </Field>
  );
}

function ShowIfSection({
  draft,
  onChange,
  candidates,
  trigger,
  brokenRule,
  error,
}: {
  draft: QuestionDraft;
  onChange: (next: QuestionDraft) => void;
  candidates: BuilderField[];
  trigger?: BuilderField;
  brokenRule: boolean;
  error?: string;
}) {
  const id = useId();
  const enabled = Boolean(draft.showIf);
  const choices = trigger ? triggerChoices(trigger) : [];
  const values = draft.showIf?.values ?? [];

  const enable = (on: boolean) => {
    if (!on) return onChange({ ...draft, showIf: null });
    const first = candidates[0];
    onChange({ ...draft, showIf: first ? { fieldKey: first.key, values: [] } : { fieldKey: "", values: [] } });
  };

  return (
    <section className="flex flex-col gap-3 rounded-xl border border-line bg-canvas p-4" aria-labelledby={`${id}-title`}>
      <div className="flex items-center justify-between gap-4">
        <label htmlFor={`${id}-switch`} className="min-w-0 flex-1 cursor-pointer select-none">
          <span id={`${id}-title`} className="flex items-center gap-1.5 text-label text-ink">
            <GitBranch aria-hidden className="size-4 shrink-0" />
            Show this question only if…
          </span>
          <span className="block text-caption text-ink-muted">Ask it only when an earlier answer makes it relevant.</span>
        </label>
        <Switch id={`${id}-switch`} checked={enabled} onCheckedChange={enable} disabled={!enabled && candidates.length === 0} />
      </div>

      {!enabled && candidates.length === 0 ? (
        <p className="text-caption text-ink-muted">Add a multiple choice, dropdown, checkboxes or yes/no question above this one to use this.</p>
      ) : null}

      {enabled ? (
        <div className="flex flex-col gap-3 border-t border-line pt-3">
          {brokenRule ? (
            <p className="flex items-start gap-1.5 text-caption text-warning-fg">
              <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
              <span>The question this rule used is no longer above this one. Pick another, or turn the rule off.</span>
            </p>
          ) : null}
          {candidates.length > 0 ? (
            <Field label="Earlier question">
              <Dropdown
                value={trigger?.key ?? ""}
                onChange={(event) => onChange({ ...draft, showIf: { fieldKey: event.target.value, values: [] } })}
              >
                {trigger ? null : (
                  <option value="" disabled>
                    Choose a question…
                  </option>
                )}
                {candidates.map((item) => (
                  <option key={item.id} value={item.key}>
                    {item.label}
                  </option>
                ))}
              </Dropdown>
            </Field>
          ) : null}
          {trigger ? (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-1.5 text-label text-ink">Show when the answer is</legend>
              {choices.length === 0 ? <p className="text-caption text-ink-muted">That question has no choices yet.</p> : null}
              <div className="grid gap-2 sm:grid-cols-2">
                {choices.map((choice) => (
                  <CheckboxField
                    key={choice}
                    label={choice}
                    checked={values.includes(choice)}
                    onCheckedChange={(checked) => {
                      const next = checked === true ? [...values, choice] : values.filter((value) => value !== choice);
                      onChange({ ...draft, showIf: { fieldKey: trigger.key, values: choices.filter((item) => next.includes(item)) } });
                    }}
                  />
                ))}
              </div>
              {values.length > 1 ? <p className="text-caption text-ink-muted">Shows if the answer is any of these.</p> : null}
            </fieldset>
          ) : null}
          {error ? (
            <p className="flex items-start gap-1.5 text-caption text-danger-fg">
              <AlertCircle aria-hidden className="mt-px size-4 shrink-0" />
              <span>{error}</span>
            </p>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

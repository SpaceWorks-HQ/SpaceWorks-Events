"use client";

import { forwardRef, useId, type ReactNode } from "react";
import { AlertTriangle, ArrowDown, ArrowUp, ChevronUp, Copy, GitBranch, Pencil, Trash2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { Switch } from "@/components/ui/choice";
import { Chip } from "@/components/ui/display";
import { cn } from "@/lib/cn";
import { fieldTypeMeta } from "@/lib/registrationFields";
import { FieldTypeIcon } from "./FieldTypeIcon";
import type { BuilderField, LogicProblem } from "./builderModel";

type Props = {
  field: BuilderField;
  number: number;
  isFirst: boolean;
  isLast: boolean;
  summary: string[];
  problem?: LogicProblem;
  expanded: boolean;
  editorId: string;
  pending: boolean;
  onToggleEdit: () => void;
  onRequiredChange: (required: boolean) => void;
  onDuplicate: () => void;
  onMove: (direction: -1 | 1) => void;
  onDelete: () => void;
  onMoveBelowTrigger: () => void;
  onRemoveRule: () => void;
  children?: ReactNode;
};

/** A saved question: what it asks, its type and extras, quick actions, and the inline editor when expanded. */
export const QuestionCard = forwardRef<HTMLButtonElement, Props>(function QuestionCard(props, editRef) {
  const { field, number, isFirst, isLast, summary, problem, expanded, editorId, pending, children } = props;
  const switchId = useId();
  const typeLabel = fieldTypeMeta(field.type).label;

  return (
    <li className={cn("overflow-hidden rounded-xl border bg-canvas transition-colors", expanded ? "border-line-strong shadow-raised" : "border-line hover:border-line-strong")}>
      <div className="flex gap-3 px-3 pt-3 sm:px-4 sm:pt-4">
        <span aria-hidden className="mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold text-ink-secondary">
          {number}
        </span>
        <div className="min-w-0 flex-1">
          <h4 className="text-label text-ink wrap-anywhere">
            <span className="sr-only">Question {number}: </span>
            {field.label}
          </h4>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <Chip size="sm" tone="neutral" icon={<FieldTypeIcon type={field.type} />}>
              {typeLabel}
            </Chip>
            {field.required ? (
              <Chip size="sm" tone="warning">
                Required
              </Chip>
            ) : null}
            {field.settings.showIf ? (
              <Chip size="sm" tone="accent" icon={<GitBranch />}>
                Conditional
              </Chip>
            ) : null}
          </div>
          {summary.length > 0 ? <p className="mt-1.5 text-caption text-ink-muted wrap-anywhere">{summary.join(" · ")}</p> : null}
          {field.helpText ? <p className="mt-1 line-clamp-2 text-caption italic text-ink-muted wrap-anywhere">{field.helpText}</p> : null}
        </div>
      </div>

      {problem ? (
        <div role="status" className="mx-3 mt-3 flex flex-col gap-2 rounded-lg bg-warning-bg px-3 py-2.5 text-warning-fg sm:mx-4 sm:flex-row sm:items-center">
          <p className="flex min-w-0 flex-1 items-start gap-1.5 text-caption">
            <AlertTriangle aria-hidden className="mt-px size-4 shrink-0" />
            <span>
              {problem.kind === "later"
                ? `This rule needs the question above it: move it below “${problem.triggerLabel}”. Until then it always shows.`
                : problem.kind === "cannotTrigger"
                  ? `“${problem.triggerLabel}” no longer has choices to check, so this question always shows.`
                  : "The question this rule used was removed, so this question always shows."}
            </span>
          </p>
          <div className="flex shrink-0 flex-wrap gap-1.5">
            {problem.kind === "later" ? (
              <Button size="sm" variant="secondary" onClick={props.onMoveBelowTrigger} disabled={pending}>
                Move it below
              </Button>
            ) : null}
            <Button size="sm" variant="quiet" onClick={props.onRemoveRule} disabled={pending}>
              Remove rule
            </Button>
          </div>
        </div>
      ) : null}

      <div className="mt-2 flex flex-wrap items-center gap-x-1 gap-y-1 px-2 pb-2 sm:px-3">
        <div className="mr-auto flex items-center gap-2 pl-1">
          <Switch id={switchId} checked={field.required} disabled={pending} onCheckedChange={props.onRequiredChange} className="scale-90" />
          <label htmlFor={switchId} className="cursor-pointer select-none text-caption font-semibold text-ink-secondary">
            Required
          </label>
        </div>
        <IconButton label={`Move “${field.label}” up`} size="sm" disabled={pending || isFirst} onClick={() => props.onMove(-1)}>
          <ArrowUp />
        </IconButton>
        <IconButton label={`Move “${field.label}” down`} size="sm" disabled={pending || isLast} onClick={() => props.onMove(1)}>
          <ArrowDown />
        </IconButton>
        <IconButton label={`Duplicate “${field.label}”`} size="sm" disabled={pending} onClick={props.onDuplicate}>
          <Copy />
        </IconButton>
        <IconButton label={`Delete “${field.label}”`} size="sm" variant="danger" disabled={pending} onClick={props.onDelete}>
          <Trash2 />
        </IconButton>
        <Button ref={editRef} size="sm" variant={expanded ? "secondary" : "quiet"} startIcon={expanded ? <ChevronUp /> : <Pencil />} aria-expanded={expanded} aria-controls={expanded ? editorId : undefined} onClick={props.onToggleEdit}>
          {expanded ? "Close" : "Edit"}
        </Button>
      </div>

      {expanded ? children : null}
    </li>
  );
});

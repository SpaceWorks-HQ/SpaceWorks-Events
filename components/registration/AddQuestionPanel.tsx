"use client";

import type { RegistrationFieldType } from "@prisma/client";
import { Check, Plus, X } from "lucide-react";
import { IconButton } from "@/components/ui/button";
import { Chip } from "@/components/ui/display";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FIELD_TYPES, fieldTypeMeta, QUESTION_TEMPLATES, type QuestionTemplate } from "@/lib/registrationFields";
import { FieldTypeIcon } from "./FieldTypeIcon";
import { hasLabel, type BuilderField } from "./builderModel";

/** Pick an answer type to write your own question, or add a ready-made one in one click. */
export function AddQuestionPanel({
  id,
  fields,
  pending,
  onPickType,
  onAddTemplate,
  onClose,
}: {
  id: string;
  fields: BuilderField[];
  pending: boolean;
  onPickType: (type: RegistrationFieldType) => void;
  onAddTemplate: (template: QuestionTemplate) => void;
  onClose?: () => void;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="rounded-2xl border border-line bg-canvas p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 id={`${id}-title`} className="text-h4 text-ink">
            Add a question
          </h3>
          <p className="mt-0.5 text-body-ui text-ink-muted">Choose what kind of answer you need, or start from a ready-made question.</p>
        </div>
        {onClose ? (
          <IconButton label="Close" size="sm" onClick={onClose}>
            <X />
          </IconButton>
        ) : null}
      </div>
      <Tabs defaultValue="types" className="mt-2">
        <TabsList aria-label="Ways to add a question">
          <TabsTrigger value="types">Answer types</TabsTrigger>
          <TabsTrigger value="ready">Ready-made</TabsTrigger>
        </TabsList>
        <TabsContent value="types" className="pt-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {FIELD_TYPES.map((item) => (
              <li key={item.type}>
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => onPickType(item.type)}
                  className="flex h-full w-full items-start gap-3 rounded-xl border border-line bg-canvas p-3 text-left transition-colors duration-[180ms] ease-yy hover:border-line-strong hover:bg-subtle disabled:opacity-60"
                >
                  <span className="mt-0.5 inline-flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted text-ink-secondary">
                    <FieldTypeIcon type={item.type} />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-label text-ink">{item.label}</span>
                    <span className="block text-caption text-ink-muted">{item.description}</span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </TabsContent>
        <TabsContent value="ready" className="pt-4">
          <ul className="grid gap-2 sm:grid-cols-2">
            {QUESTION_TEMPLATES.map((template) => {
              const added = hasLabel(fields, template.label);
              const typeLabel = fieldTypeMeta(template.type).label;
              return (
                <li key={template.id}>
                  <button
                    type="button"
                    disabled={pending || added}
                    onClick={() => onAddTemplate(template)}
                    aria-label={added ? `${template.label} (already on the form)` : `Add ${template.label} (${typeLabel})`}
                    className="flex h-full w-full items-center gap-3 rounded-xl border border-line bg-canvas p-3 text-left transition-colors duration-[180ms] ease-yy hover:border-line-strong hover:bg-subtle disabled:cursor-default disabled:bg-subtle disabled:hover:border-line"
                  >
                    <span className="min-w-0 flex-1">
                      <span className={added ? "block text-label text-ink-muted" : "block text-label text-ink"}>{template.label}</span>
                      <span className="mt-1 flex flex-wrap items-center gap-1.5">
                        <Chip size="sm" tone="neutral" icon={<FieldTypeIcon type={template.type} />}>
                          {typeLabel}
                        </Chip>
                        {template.required ? (
                          <Chip size="sm" tone="outline">
                            Required
                          </Chip>
                        ) : null}
                      </span>
                    </span>
                    <span aria-hidden className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-ink-secondary">
                      {added ? <Check className="size-4" /> : <Plus className="size-4" />}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-3 text-caption text-ink-muted">Ready-made questions are added straight to the form. You can edit them afterwards.</p>
        </TabsContent>
      </Tabs>
    </section>
  );
}

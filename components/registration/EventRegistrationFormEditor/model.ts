import type { RegistrationFieldType } from "@prisma/client";
import type { FieldSettings } from "@/lib/registrationFields";
import type { DraftErrors, QuestionDraft, SaveableQuestion } from "../builderModel";

export type RegistrationFieldRow = {
  id: string;
  /** Internal answer key; never shown to organisers. */
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  sortOrder: number;
  options: string[];
  helpText: string;
  placeholder: string;
  settings: FieldSettings;
};

export const NEW_ID = "__new__";

export type Editing = {
  id: string;
  draft: QuestionDraft;
  original: QuestionDraft;
  errors: DraftErrors;
};

export type FocusRequest = { target: "label" } | { target: "edit"; id: string } | { target: "add" };

export const sorted = (rows: RegistrationFieldRow[]) => [...rows].sort((a, b) => a.sortOrder - b.sortOrder);
export const renumber = (rows: RegistrationFieldRow[]) => rows.map((row, index) => ({ ...row, sortOrder: index + 1 }));
export const toSaveable = (field: RegistrationFieldRow): SaveableQuestion => ({
  label: field.label,
  type: field.type,
  required: field.required,
  options: field.options,
  helpText: field.helpText,
  placeholder: field.placeholder,
  settings: field.settings,
});

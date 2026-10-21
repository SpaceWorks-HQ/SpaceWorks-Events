"use client";

import type { Dispatch, RefObject, SetStateAction, TransitionStartFunction } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import type { useRouter } from "next/navigation";
import type { useToast } from "@/components/feedback/ToastProvider";
import { deleteEventRegistrationField, reorderEventRegistrationFields, upsertEventRegistrationField } from "@/app/actions/registration-form";
import type { QuestionTemplate } from "@/lib/registrationFields";
import { draftFromField, duplicateLabel, hasLabel, newDraft, predictKey, validateDraft, type SaveableQuestion } from "../builderModel";
import { NEW_ID, renumber, toSaveable, type Editing, type FocusRequest, type RegistrationFieldRow } from "./model";

/** Server mutations and editing actions for the registration form editor. */
export function useQuestionActions(ctx: {
  organisationSlug: string;
  eventId: string;
  router: ReturnType<typeof useRouter>;
  showToast: ReturnType<typeof useToast>["showToast"];
  startTransition: TransitionStartFunction;
  localFields: RegistrationFieldRow[];
  setLocalFields: Dispatch<SetStateAction<RegistrationFieldRow[]>>;
  latestFields: RefObject<RegistrationFieldRow[]>;
  fields: RegistrationFieldRow[];
  editing: Editing | null;
  setEditing: Dispatch<SetStateAction<Editing | null>>;
  setAddOpen: Dispatch<SetStateAction<boolean>>;
  dirty: boolean;
  deleteTarget: RegistrationFieldRow | null;
  setDeleteTarget: Dispatch<SetStateAction<RegistrationFieldRow | null>>;
  setFocusRequest: (request: FocusRequest) => void;
}) {
  const { organisationSlug, eventId, router, showToast, startTransition, localFields, setLocalFields, latestFields, fields, editing, setEditing, setAddOpen, dirty, deleteTarget, setDeleteTarget, setFocusRequest } = ctx;

  /* ---------- Server helpers ---------- */

  function upsert(question: SaveableQuestion, extra: { fieldId?: string; key?: string } = {}) {
    return upsertEventRegistrationField({ organisationSlug, eventId, ...extra, ...question });
  }

  function reorder(ids: string[], previous: RegistrationFieldRow[]) {
    return reorderEventRegistrationFields({ organisationSlug, eventId, fieldIds: ids }).then((res) => {
      if (!res.ok) {
        setLocalFields(previous);
        showToast(res.error, "error");
      }
      return res.ok;
    });
  }

  function applyOrder(ids: string[]) {
    const previous = localFields;
    const byId = new Map(localFields.map((field) => [field.id, field]));
    setLocalFields(renumber(ids.map((id) => byId.get(id)!).filter(Boolean)));
    startTransition(async () => {
      if (await reorder(ids, previous)) router.refresh();
    });
  }

  /* ---------- Editing ---------- */

  function confirmDiscard() {
    return !dirty || window.confirm("Discard your unsaved changes to this question?");
  }

  function startEdit(field: RegistrationFieldRow) {
    if (editing?.id === field.id) {
      if (!confirmDiscard()) return;
      setEditing(null);
      return;
    }
    if (!confirmDiscard()) return;
    const draft = draftFromField(field);
    setEditing({ id: field.id, draft, original: draft, errors: {} });
    setFocusRequest({ target: "label" });
  }

  function pickType(type: RegistrationFieldType) {
    if (!confirmDiscard()) return;
    const draft = newDraft(type);
    setEditing({ id: NEW_ID, draft, original: draft, errors: {} });
    setAddOpen(false);
    setFocusRequest({ target: "label" });
  }

  function cancelEdit() {
    if (!editing || !confirmDiscard()) return;
    const id = editing.id;
    setEditing(null);
    setFocusRequest(id === NEW_ID ? { target: "add" } : { target: "edit", id });
  }

  function saveEdit() {
    if (!editing) return;
    const result = validateDraft(editing.draft);
    if (!result.ok) {
      setEditing({ ...editing, errors: result.errors });
      showToast("Check the highlighted fields.", "error");
      return;
    }
    const current = editing;
    const isNew = current.id === NEW_ID;
    const question = result.value;
    startTransition(async () => {
      const res = await upsert(question, isNew ? {} : { fieldId: current.id });
      if (!res.ok) {
        const fieldError = (name: string) => res.fieldErrors?.[name]?.[0];
        setEditing({
          ...current,
          errors: { label: fieldError("label"), helpText: fieldError("helpText"), placeholder: fieldError("placeholder"), options: fieldError("options"), form: res.error === "Invalid input." ? "Some answers need another look." : res.error },
        });
        return;
      }
      const id = res.data!.fieldId;
      setLocalFields((rows) => {
        if (!isNew) return rows.map((row) => (row.id === id ? { ...row, ...question } : row));
        return [...rows, { id, key: predictKey(question.label, rows), sortOrder: rows.length + 1, ...question }];
      });
      setEditing(null);
      setFocusRequest({ target: "edit", id });
      showToast(isNew ? "Question added" : "Question saved", "success");
      router.refresh();
    });
  }

  /* ---------- Quick actions ---------- */

  function setRequired(field: RegistrationFieldRow, required: boolean) {
    const previous = localFields;
    setLocalFields((rows) => rows.map((row) => (row.id === field.id ? { ...row, required } : row)));
    if (editing?.id === field.id) setEditing({ ...editing, draft: { ...editing.draft, required }, original: { ...editing.original, required } });
    startTransition(async () => {
      const res = await upsert({ ...toSaveable(field), required }, { fieldId: field.id });
      if (!res.ok) {
        setLocalFields(previous);
        showToast(res.error, "error");
        return;
      }
      showToast(required ? `“${field.label}” is now required` : `“${field.label}” is now optional`, "success");
      router.refresh();
    });
  }

  function duplicate(field: RegistrationFieldRow) {
    const copy = { ...toSaveable(field), label: duplicateLabel(field.label, fields.map((row) => row.label)) };
    const previous = localFields;
    startTransition(async () => {
      const res = await upsert(copy);
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const id = res.data!.fieldId;
      const ids = previous.map((row) => row.id);
      const at = ids.indexOf(field.id) + 1;
      const order = [...ids.slice(0, at), id, ...ids.slice(at)];
      const row: RegistrationFieldRow = { id, key: predictKey(copy.label, previous), sortOrder: 0, ...copy };
      setLocalFields(renumber(order.map((rowId) => (rowId === id ? row : previous.find((item) => item.id === rowId)!))));
      setFocusRequest({ target: "edit", id });
      showToast(`Added “${copy.label}”`, "success");
      await reorder(order, [...previous, row]);
      router.refresh();
    });
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= fields.length) return;
    const ids = fields.map((field) => field.id);
    [ids[index], ids[target]] = [ids[target]!, ids[index]!];
    applyOrder(ids);
  }

  function removeRule(field: RegistrationFieldRow) {
    const settings = { ...field.settings };
    delete settings.showIf;
    const previous = localFields;
    setLocalFields((rows) => rows.map((row) => (row.id === field.id ? { ...row, settings } : row)));
    startTransition(async () => {
      const res = await upsert({ ...toSaveable(field), settings }, { fieldId: field.id });
      if (!res.ok) {
        setLocalFields(previous);
        showToast(res.error, "error");
        return;
      }
      showToast("Rule removed. The question now always shows.", "success");
      router.refresh();
    });
  }

  function addTemplate(template: QuestionTemplate) {
    if (hasLabel(fields, template.label)) return;
    const question: SaveableQuestion = {
      label: template.label,
      type: template.type,
      required: template.required,
      options: template.options ?? [],
      helpText: template.helpText ?? "",
      placeholder: template.placeholder ?? "",
      settings: template.settings ?? {},
    };
    startTransition(async () => {
      const res = await upsert(question);
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      const id = res.data!.fieldId;
      setLocalFields((rows) => [...rows, { id, key: predictKey(question.label, rows), sortOrder: rows.length + 1, ...question }]);
      setFocusRequest({ target: "edit", id });
      showToast(`Added “${question.label}”`, "success");
      router.refresh();
    });
  }

  function confirmDelete() {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const previous = localFields;
    const position = previous.findIndex((row) => row.id === target.id);
    setDeleteTarget(null);
    if (editing?.id === target.id) setEditing(null);
    setLocalFields((rows) => renumber(rows.filter((row) => row.id !== target.id)));
    startTransition(async () => {
      const res = await deleteEventRegistrationField({ organisationSlug, eventId, fieldId: target.id });
      if (!res.ok) {
        setLocalFields(previous);
        showToast(res.error, "error");
        return;
      }
      router.refresh();
      showToast(
        `Deleted “${target.label}”`,
        "success",
        {
          label: "Undo",
          onClick: () =>
            startTransition(async () => {
              // Restoring with the same internal key keeps later "show only if" rules working.
              const restore = await upsert(toSaveable(target), { key: target.key });
              if (!restore.ok) {
                showToast(restore.error, "error");
                return;
              }
              const id = restore.data!.fieldId;
              const restored: RegistrationFieldRow = { ...target, id };
              const before = latestFields.current;
              const next = [...before];
              next.splice(Math.min(position, next.length), 0, restored);
              const order = next.map((row) => row.id);
              setLocalFields(renumber(next));
              if (order[order.length - 1] !== id) await reorder(order, [...before, restored]);
              showToast("Question restored", "success");
              router.refresh();
            }),
        },
        10000,
      );
    });
  }

  return { applyOrder, startEdit, pickType, cancelEdit, saveEdit, setRequired, duplicate, move, removeRule, addTemplate, confirmDelete };
}

"use client";

import type { Dispatch, SetStateAction } from "react";
import type { RegistrationFieldType } from "@prisma/client";
import { RegistrationFieldType as FieldType } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field as FormField, Input, Dropdown } from "@/components/ui/field";
import { FIELD_TYPE_LABELS } from "@/components/event-dashboard/feedback/helpers";
import type { Field } from "./field";

export function QuestionDialog({
  dialog,
  setDialog,
  pending,
  editingField,
  label,
  setLabel,
  type,
  setType,
  options,
  setOptions,
  required,
  setRequired,
  saveField,
}: {
  dialog: boolean;
  setDialog: Dispatch<SetStateAction<boolean>>;
  pending: boolean;
  editingField: Field | null;
  label: string;
  setLabel: Dispatch<SetStateAction<string>>;
  type: RegistrationFieldType;
  setType: Dispatch<SetStateAction<RegistrationFieldType>>;
  options: string;
  setOptions: Dispatch<SetStateAction<string>>;
  required: boolean;
  setRequired: Dispatch<SetStateAction<boolean>>;
  saveField: () => void;
}) {
  return (
<Dialog open={dialog} onOpenChange={(next) => { if (!next && !pending) setDialog(false); }}>
  <DialogContent size="md">
    <DialogHeader title={editingField ? "Edit feedback question" : "Add feedback question"} />
    <DialogBody className="flex flex-col gap-4">
      <FormField label="Question">
        <Input value={label} onChange={(event) => setLabel(event.target.value)} autoFocus />
      </FormField>
      <FormField label="Answer type">
        <Dropdown value={type} onChange={(event) => setType(event.target.value as RegistrationFieldType)}>
          {Object.values(FieldType).filter((item) => item !== "EMAIL" && item !== "PHONE" && item !== "DATE").map((item) => <option key={item} value={item}>{FIELD_TYPE_LABELS[item] ?? item}</option>)}
        </Dropdown>
      </FormField>
      {["SELECT", "MULTI_SELECT", "RADIO"].includes(type) ? (
        <FormField label="Options (comma separated)" helperText={type === "MULTI_SELECT" ? undefined : "For a rating scale, use numbers such as 1, 2, 3, 4, 5."}>
          <Input value={options} onChange={(event) => setOptions(event.target.value)} />
        </FormField>
      ) : null}
      <CheckboxField label="Required" checked={required} onCheckedChange={(checked) => setRequired(checked === true)} />
    </DialogBody>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setDialog(false)} disabled={pending}>Cancel</Button>
      <Button variant="primary" onClick={saveField} disabled={pending || !label.trim()}>{editingField ? "Save question" : "Add question"}</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
  );
}

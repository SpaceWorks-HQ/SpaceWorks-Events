"use client";

import { useRouter } from "next/navigation";
import { useState, type FormEvent } from "react";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react";
import { deleteIdProgramme, saveIdProgrammeFields, updateIdProgramme } from "@/app/actions/member-ids";
import { Button, IconButton } from "@/components/ui/button";
import { SegmentedControl, SwitchRow } from "@/components/ui/choice";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Callout, Card, DangerZone } from "@/components/ui/display";
import { Dropdown, Field, Input, Textarea } from "@/components/ui/field";
import { MAX_PROGRAMME_FIELDS, type FieldPlacement, type FieldType } from "@/lib/memberIds/core";

type Details = {
  id: string;
  name: string;
  description: string;
  status: "DRAFT" | "ACTIVE" | "CLOSED";
  registrationOpen: boolean;
  requiresApproval: boolean;
  idPrefix: string;
  validity: "none" | "date" | "days";
  validUntil: string;
  validityDays: number;
};

type EditableField = { key?: string; label: string; type: FieldType; required: boolean; options: string[]; placement: FieldPlacement };

const TYPE_LABELS: Record<FieldType, string> = { TEXT: "Short text", SELECT: "Choice", DATE: "Date", EMAIL: "Email", PHONE: "Phone" };
const PLACEMENT_LABELS: Record<FieldPlacement, string> = { FRONT: "Front of card", BACK: "Back of card", HIDDEN: "Not printed" };

function useNotice() {
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const view = <div aria-live="polite">{notice ? <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>{notice.text}</Callout> : null}</div>;
  return [view, setNotice] as const;
}

export function ProgrammeSettings({ organisationSlug, programme, fields }: { organisationSlug: string; programme: Details; fields: EditableField[] }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2 xl:items-start">
      <DetailsForm organisationSlug={organisationSlug} programme={programme} />
      <div className="flex flex-col gap-6">
        <FieldsBuilder organisationSlug={organisationSlug} programmeId={programme.id} initial={fields} />
        <DeleteProgramme organisationSlug={organisationSlug} programme={programme} />
      </div>
    </div>
  );
}

function DetailsForm({ organisationSlug, programme }: { organisationSlug: string; programme: Details }) {
  const router = useRouter();
  const [form, setForm] = useState(programme);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useNotice();
  const set = <K extends keyof Details>(key: K, value: Details[K]) => setForm((current) => ({ ...current, [key]: value }));

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setNotice(null);
    try {
      const result = await updateIdProgramme({
        organisationSlug,
        programmeId: form.id,
        name: form.name,
        description: form.description,
        status: form.status,
        registrationOpen: form.registrationOpen,
        requiresApproval: form.requiresApproval,
        idPrefix: form.idPrefix,
        validity: form.validity,
        ...(form.validity === "date" ? { validUntil: form.validUntil } : {}),
        ...(form.validity === "days" ? { validityDays: Number(form.validityDays) } : {}),
      });
      if (result.ok) {
        setNotice({ tone: "success", text: "Settings saved." });
        router.refresh();
      } else setNotice({ tone: "danger", text: result.error });
    } catch {
      setNotice({ tone: "danger", text: "That didn't save. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="details-heading">
      <form onSubmit={save} className="flex flex-col gap-5">
        <h2 id="details-heading" className="text-h3 text-ink">Programme</h2>
        <Field label="Name"><Input value={form.name} onChange={(event) => set("name", event.target.value)} maxLength={80} required /></Field>
        <Field label="Description" optional helperText="Shown at the top of the join form.">
          <Textarea rows={3} value={form.description} onChange={(event) => set("description", event.target.value)} maxLength={500} />
        </Field>

        <div className="flex flex-col gap-1.5">
          <span className="text-label text-ink">Status</span>
          <SegmentedControl<Details["status"]>
            ariaLabel="Programme status"
            value={form.status}
            onValueChange={(status) => set("status", status)}
            options={[{ value: "DRAFT", label: "Draft" }, { value: "ACTIVE", label: "Active" }, { value: "CLOSED", label: "Closed" }]}
            className="self-start"
          />
          <p className="text-caption text-ink-muted">
            {form.status === "DRAFT" ? "Only your team can see it. Cards still check as normal." : form.status === "ACTIVE" ? "The join form can take requests." : "No new requests. Issued cards keep working until they expire."}
          </p>
        </div>
        <SwitchRow label="Join form open" description={form.status === "ACTIVE" ? "People can request a card with the join link." : "Set the status to Active to open the join form."} checked={form.status === "ACTIVE" && form.registrationOpen} disabled={form.status !== "ACTIVE"} onCheckedChange={(on) => set("registrationOpen", on)} />
        <SwitchRow label="Approve each request" description="When off, cards are issued as soon as someone joins." checked={form.requiresApproval} onCheckedChange={(on) => set("requiresApproval", on)} />

        <Field label="ID number prefix" helperText={`Numbers look like ${form.idPrefix || "ID"}-${new Date().getUTCFullYear()}-0042. Existing numbers don't change.`}>
          <Input value={form.idPrefix} onChange={(event) => set("idPrefix", event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6))} className="w-[140px] tabular-nums" />
        </Field>

        <div className="flex flex-col gap-2">
          <span className="text-label text-ink">Cards are valid</span>
          <SegmentedControl<Details["validity"]>
            ariaLabel="Card validity"
            value={form.validity}
            onValueChange={(validity) => set("validity", validity)}
            options={[{ value: "days", label: "For a time" }, { value: "date", label: "Until a date" }, { value: "none", label: "No expiry" }]}
            className="self-start"
          />
          {form.validity === "days" ? (
            <Field label="Days from approval"><Input type="number" min={1} max={3650} value={form.validityDays} onChange={(event) => set("validityDays", Number(event.target.value))} className="w-[140px]" /></Field>
          ) : form.validity === "date" ? (
            <Field label="Valid until"><Input type="date" value={form.validUntil} onChange={(event) => set("validUntil", event.target.value)} className="w-[200px]" /></Field>
          ) : null}
          <p className="text-caption text-ink-muted">Applies to cards approved or renewed from now on. Use Renew all to restart every card.</p>
        </div>

        {notice}
        <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…" className="self-start">Save settings</Button>
      </form>
    </Card>
  );
}

function FieldsBuilder({ organisationSlug, programmeId, initial }: { organisationSlug: string; programmeId: string; initial: EditableField[] }) {
  const router = useRouter();
  const [fields, setFields] = useState<EditableField[]>(initial);
  const [pending, setPending] = useState(false);
  const [notice, setNotice] = useNotice();
  const update = (index: number, patch: Partial<EditableField>) => setFields((current) => current.map((field, i) => (i === index ? { ...field, ...patch } : field)));
  const move = (index: number, by: -1 | 1) => setFields((current) => {
    const next = [...current];
    const [item] = next.splice(index, 1);
    next.splice(index + by, 0, item!);
    return next;
  });

  const save = async () => {
    setPending(true);
    setNotice(null);
    try {
      const result = await saveIdProgrammeFields({ organisationSlug, programmeId, fields: fields.map((field) => ({ ...field, label: field.label.trim(), options: field.options.map((option) => option.trim()).filter(Boolean) })) });
      if (result.ok) {
        setNotice({ tone: "success", text: "Questions saved." });
        router.refresh();
      } else setNotice({ tone: "danger", text: result.error });
    } catch {
      setNotice({ tone: "danger", text: "That didn't save. Check your connection and try again." });
    } finally {
      setPending(false);
    }
  };

  return (
    <Card as="section" aria-labelledby="fields-heading">
      <div className="flex flex-col gap-4">
        <div>
          <h2 id="fields-heading" className="text-h3 text-ink">Join form questions</h2>
          <p className="text-caption text-ink-muted">Name, email and photo are always asked. Choose where each answer prints on the card.</p>
        </div>
        {fields.length === 0 ? <p className="text-body-ui text-ink-secondary">No extra questions. Add one for things like role, department or blood group.</p> : null}
        <ol className="flex flex-col gap-3">
          {fields.map((field, index) => (
            <li key={field.key ?? `new-${index}`} className="flex flex-col gap-3 rounded-[16px] border border-line p-3.5">
              <div className="flex items-end gap-2">
                <Field label="Question" className="min-w-0 flex-1"><Input value={field.label} maxLength={60} onChange={(event) => update(index, { label: event.target.value })} /></Field>
                <IconButton label={`Move ${field.label || "question"} up`} size="sm" variant="quiet" disabled={index === 0} onClick={() => move(index, -1)}><ArrowUp /></IconButton>
                <IconButton label={`Move ${field.label || "question"} down`} size="sm" variant="quiet" disabled={index === fields.length - 1} onClick={() => move(index, 1)}><ArrowDown /></IconButton>
                <IconButton label={`Remove ${field.label || "question"}`} size="sm" variant="quiet" onClick={() => setFields((current) => current.filter((_, i) => i !== index))}><Trash2 /></IconButton>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field label="Answer type">
                  <Dropdown value={field.type} onChange={(event) => update(index, { type: event.target.value as FieldType })}>
                    {(Object.keys(TYPE_LABELS) as FieldType[]).map((type) => <option key={type} value={type}>{TYPE_LABELS[type]}</option>)}
                  </Dropdown>
                </Field>
                <Field label="Prints on">
                  <Dropdown value={field.placement} onChange={(event) => update(index, { placement: event.target.value as FieldPlacement })}>
                    {(Object.keys(PLACEMENT_LABELS) as FieldPlacement[]).map((placement) => <option key={placement} value={placement}>{PLACEMENT_LABELS[placement]}</option>)}
                  </Dropdown>
                </Field>
              </div>
              {field.type === "SELECT" ? (
                <Field label="Options" helperText="One per line, at least two.">
                  <Textarea rows={3} value={field.options.join("\n")} onChange={(event) => update(index, { options: event.target.value.split("\n").slice(0, 20) })} />
                </Field>
              ) : null}
              <SwitchRow label="Required" checked={field.required} onCheckedChange={(required) => update(index, { required })} />
            </li>
          ))}
        </ol>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" startIcon={<Plus />} disabled={fields.length >= MAX_PROGRAMME_FIELDS} onClick={() => setFields((current) => [...current, { label: "", type: "TEXT", required: false, options: [], placement: "FRONT" }])}>Add a question</Button>
          <Button variant="primary" loading={pending} loadingLabel="Saving…" onClick={save}>Save questions</Button>
        </div>
        {notice}
      </div>
    </Card>
  );
}

function DeleteProgramme({ organisationSlug, programme }: { organisationSlug: string; programme: Details }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <DangerZone
      title="Delete this programme"
      description="Deletes every member and card in it. Their check pages will say Card not found. This can't be undone."
      action={<Button variant="dangerOutline" onClick={() => setOpen(true)}>Delete programme</Button>}
    >
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <ConfirmDialog
        open={open}
        title="Delete this programme?"
        message="Every member and card in it is deleted for good."
        confirmLabel="Delete programme"
        confirmText={programme.name}
        loading={pending}
        onCancel={() => setOpen(false)}
        onConfirm={async () => {
          setPending(true);
          const result = await deleteIdProgramme({ organisationSlug, programmeId: programme.id }).catch(() => ({ ok: false as const, error: "That didn't work. Try again." }));
          setPending(false);
          setOpen(false);
          if (result.ok) router.push(`/dashboard/${organisationSlug}/ids`);
          else setError(result.error);
        }}
      />
    </DangerZone>
  );
}

"use client";

import { useState, type FormEvent } from "react";
import { addIdMember, updateIdMember, uploadIdMemberPhoto } from "@/app/actions/member-ids";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Callout } from "@/components/ui/display";
import { Dropdown, Field, Input } from "@/components/ui/field";
import type { FormField, MemberRow } from "./shared";

export function MemberDialog({
  organisationSlug,
  programmeId,
  member,
  fields,
  onClose,
  onSaved,
}: {
  organisationSlug: string;
  programmeId: string;
  member: MemberRow | null;
  fields: FormField[];
  onClose: () => void;
  onSaved: (text: string) => void;
}) {
  const [name, setName] = useState(member?.name ?? "");
  const [email, setEmail] = useState(member?.email ?? "");
  const [values, setValues] = useState<Record<string, string>>(member?.values ?? {});
  const [approve, setApprove] = useState(true);
  const [photo, setPhoto] = useState<File | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    try {
      const base = { organisationSlug, programmeId, name, email, values };
      const result = member ? await updateIdMember({ ...base, memberId: member.id }) : await addIdMember({ ...base, approve });
      if (!result.ok) return setError(result.error);
      const memberId = member?.id ?? (result.ok && result.data && "id" in result.data ? result.data.id : null);
      if (photo && memberId) {
        const data = new FormData();
        data.set("organisationSlug", organisationSlug);
        data.set("programmeId", programmeId);
        data.set("memberId", memberId);
        data.set("file", photo);
        const uploaded = await uploadIdMemberPhoto(data);
        if (!uploaded.ok) return setError(`Details saved, but the photo didn't upload: ${uploaded.error}`);
      }
      onSaved(member ? `${name}'s details saved.` : approve ? `${name} added and their card issued.` : `${name} added, waiting for approval.`);
    } catch {
      setError("That didn't save. Check your connection and try again.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open onOpenChange={(open) => !open && !pending && onClose()}>
      <DialogContent size="md">
        <form onSubmit={save} className="flex min-h-0 flex-1 flex-col">
          <DialogHeader title={member ? `Edit ${member.name}` : "Add a member"} description={member ? "Changes show on the card the next time it's downloaded." : "Add someone who didn't use the join form."} />
          <DialogBody className="flex flex-col gap-4">
            <Field label="Name on the card" required>
              <Input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} />
            </Field>
            <Field label="Email" required helperText="Their card appears in the wallet of the account with this email.">
              <Input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} />
            </Field>
            {fields.map((field) => (
              <Field key={field.key} label={field.label} optional={!field.required}>
                {field.type === "SELECT" ? (
                  <Dropdown value={values[field.key] ?? ""} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}>
                    <option value="">Not set</option>
                    {field.options.map((option) => <option key={option} value={option}>{option}</option>)}
                  </Dropdown>
                ) : (
                  <Input type={field.type === "DATE" ? "date" : field.type === "EMAIL" ? "email" : field.type === "PHONE" ? "tel" : "text"} value={values[field.key] ?? ""} maxLength={200} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />
                )}
              </Field>
            ))}
            <Field label="Photo" optional helperText={member?.photoUrl ? "Choose a file to replace the current photo." : "JPEG, PNG or WebP, up to 5 MB."}>
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} className="block w-full text-[14px] text-ink-secondary file:mr-3 file:min-h-11 file:rounded-[10px] file:border file:border-line file:bg-panel file:px-4 file:font-semibold file:text-ink hover:file:bg-muted" />
            </Field>
            {!member ? <CheckboxField label="Approve and issue the card now" checked={approve} onCheckedChange={(on) => setApprove(on === true)} /> : null}
            <div aria-live="polite">{error ? <Callout tone="danger" role="alert">{error}</Callout> : null}</div>
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pending} loadingLabel="Saving…">{member ? "Save" : "Add member"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

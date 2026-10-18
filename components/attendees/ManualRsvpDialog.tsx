"use client";

import { useRef, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { RegistrationQuestions, focusQuestion, useRegistrationAnswers } from "@/components/rsvp/QuestionField";
import { identityErrors } from "@/components/rsvp/registrationAnswers";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Field, Input } from "@/components/ui/field";
import { addManualRsvp } from "@/app/actions/rsvp-admin";
import { useToast } from "@/components/feedback/ToastProvider";

/** A registration question as the organiser's add/edit attendee dialogs render it (help text, limits and logic included). */
export type ManualRsvpField = RegistrationFieldDefinition & { id: string };

export function ManualRsvpDialog(props: {
  organisationSlug: string;
  eventId: string;
  fields: ManualRsvpField[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const { organisationSlug, eventId, fields, onClose, onAdded } = props;
  const { showToast } = useToast();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [identity, setIdentity] = useState<{ name?: string; email?: string }>({});
  const questions = useRegistrationAnswers(fields);
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <Dialog open onOpenChange={(next) => { if (!next && !pending) onClose(); }}>
      <DialogContent size="md">
      <form ref={formRef} noValidate className="flex min-h-0 flex-col" onSubmit={(event) => {
        event.preventDefault();
        setError(null);
        const who = identityErrors({ name, email, requireName: true, requireEmail: true });
        const questionErrors = questions.validate();
        setIdentity(who);
        const first = who.name ? "__name" : who.email ? "__email" : fields.find((field) => questionErrors[field.key])?.key;
        if (first) {
          focusQuestion(formRef.current, first);
          return;
        }
        startTransition(async () => {
          const result = await addManualRsvp({
            organisationSlug,
            eventId,
            name,
            guestEmail: email,
            answers: questions.payload(),
          });
          if (!result.ok) {
            setError(result.error);
            return;
          }
          const status = result.data!.status === "CONFIRMED" ? "confirmed" : result.data!.status.toLowerCase().replace(/_/g, " ");
          showToast(`Attendee added — ${status}. A ticket email has been queued.`, "success");
          onAdded();
          onClose();
        });
      }}>
        <DialogHeader title="Add attendee" description="Add a guest RSVP and send their ticket confirmation. Capacity and event registration rules still apply." />
        <DialogBody className="flex flex-col gap-4">
          {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
          <div data-question-key="__name">
            <Field label="Name" required error={identity.name}>
              <Input value={name} onChange={(event) => { setName(event.target.value); setIdentity((current) => ({ ...current, name: undefined })); }} autoFocus />
            </Field>
          </div>
          <div data-question-key="__email">
            <Field label="Email" required error={identity.email}>
              <Input type="email" autoComplete="email" value={email} onChange={(event) => { setEmail(event.target.value); setIdentity((current) => ({ ...current, email: undefined })); }} />
            </Field>
          </div>
          <RegistrationQuestions controller={questions} className="gap-4" />
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={pending}>Cancel</Button>
          <Button type="submit" variant="primary" startIcon={<UserPlus />} loading={pending}>
            Add attendee
          </Button>
        </DialogFooter>
      </form>
      </DialogContent>
    </Dialog>
  );
}

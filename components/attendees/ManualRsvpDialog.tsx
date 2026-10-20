"use client";

import { useRef, useState, useTransition } from "react";
import { UserPlus } from "lucide-react";
import { RegistrationQuestions, focusQuestion, useRegistrationAnswers } from "@/components/rsvp/QuestionField";
import { identityErrors } from "@/components/rsvp/registrationAnswers";
import type { RegistrationFieldDefinition } from "@/components/rsvp/registrationTypes";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { Radio, RadioGroup } from "@/components/ui/choice";
import { Dropdown, Field, Input } from "@/components/ui/field";
import { addManualRsvp } from "@/app/actions/rsvp-admin";
import { addTicketGuest } from "@/app/actions/payment-operations";
import { OFFLINE_METHODS } from "@/components/attendees/PaymentDialog";
import { formatMoney } from "@/lib/payments/money";
import { useToast } from "@/components/feedback/ToastProvider";

/** A registration question as the organiser's add/edit attendee dialogs render it (help text, limits and logic included). */
export type ManualRsvpField = RegistrationFieldDefinition & { id: string };

export function ManualRsvpDialog(props: {
  organisationSlug: string;
  eventId: string;
  fields: ManualRsvpField[];
  onClose: () => void;
  onAdded: () => void;
  /** Events that sell tickets: each guest gets one; a paid one is paid by link, in person, or complimentary. */
  ticketTypes?: Array<{ id: string; name: string; priceMinor: number; currency: string; }>;
}) {
  const { organisationSlug, eventId, fields, onClose, onAdded, ticketTypes = [] } = props;
  const [ticketTypeId, setTicketTypeId] = useState(ticketTypes[0]?.id ?? "");
  const [payment, setPayment] = useState<"link" | "offline" | "waive">("link");
  const [method, setMethod] = useState<(typeof OFFLINE_METHODS)[number][0]>("CASH");
  const [reference, setReference] = useState("");
  const ticket = ticketTypes.find((type) => type.id === ticketTypeId);
  const paidTicket = Boolean(ticket && ticket.priceMinor > 0);
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
          const result = ticketTypes.length > 0
            ? await addTicketGuest({
              organisationSlug,
              eventId,
              name,
              guestEmail: email,
              answers: questions.payload(),
              ticketTypeId,
              ...(paidTicket ? { payment, ...(payment === "offline" ? { method, reference } : {}) } : {}),
            })
            : await addManualRsvp({
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
          const status = result.data!.status;
          showToast(
            status === "PENDING_PAYMENT"
              ? "Attendee added. They've been emailed a payment link and have 24 hours to pay."
              : `Attendee added — ${status === "CONFIRMED" ? "confirmed" : status.toLowerCase().replace(/_/g, " ")}. A ticket email has been queued.`,
            "success",
          );
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
          {ticketTypes.length > 0 ? (
            <Field label="Ticket" required>
              <Dropdown value={ticketTypeId} onChange={(event) => setTicketTypeId(event.target.value)}>
                {ticketTypes.map((type) => <option key={type.id} value={type.id}>{type.name} · {type.priceMinor > 0 ? formatMoney(type.priceMinor, type.currency) : "Free"}</option>)}
              </Dropdown>
            </Field>
          ) : null}
          {paidTicket ? (
            <div className="flex flex-col gap-3">
              <RadioGroup value={payment} onValueChange={(value) => setPayment(value as typeof payment)} aria-label="How this ticket is paid">
                <Radio value="link" label="Email a payment link" description="Their place is held for 24 hours while they pay." />
                <Radio value="offline" label="They've paid me already" description="Cash, UPI, bank transfer or a card terminal." />
                <Radio value="waive" label="Complimentary" description="No charge." />
              </RadioGroup>
              {payment === "offline" ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Paid by">
                    <Dropdown value={method} onChange={(event) => setMethod(event.target.value as typeof method)}>
                      {OFFLINE_METHODS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </Dropdown>
                  </Field>
                  <Field label="Reference" optional>
                    <Input value={reference} maxLength={120} onChange={(event) => setReference(event.target.value)} placeholder="Receipt or UPI id" />
                  </Field>
                </div>
              ) : null}
            </div>
          ) : null}
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

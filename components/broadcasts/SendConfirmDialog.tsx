"use client";

import { useState } from "react";
import { Send, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckboxField } from "@/components/ui/choice";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";

/**
 * Review step before a broadcast is queued: who it goes to and what they get.
 * Sending stays disabled until the organiser ticks that they checked it, so a
 * stray click or Enter can't send to everyone.
 */
export function SendConfirmDialog({
  open,
  recipientCount,
  audienceText,
  subject,
  onCancel,
  onConfirm,
}: {
  open: boolean;
  recipientCount: number;
  audienceText: string;
  subject: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const [checked, setChecked] = useState(false);
  const people = `${recipientCount} ${recipientCount === 1 ? "person" : "people"}`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) {
          setChecked(false);
          onCancel();
        }
      }}
    >
      <DialogContent size="sm">
        <DialogHeader title={`Send to ${people}?`} description="Emails can't be recalled once delivery starts." />
        <DialogBody className="flex flex-col gap-4">
          <dl className="flex flex-col divide-y divide-line rounded-xl border border-line text-body-ui">
            <div className="flex items-start gap-3 px-4 py-3">
              <Users aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <dt className="text-caption text-ink-muted">To</dt>
                <dd className="text-ink">
                  <span className="font-bold">{people}</span> · {audienceText}
                </dd>
              </div>
            </div>
            <div className="flex items-start gap-3 px-4 py-3">
              <Send aria-hidden className="mt-0.5 size-4 shrink-0 text-ink-muted" />
              <div className="min-w-0">
                <dt className="text-caption text-ink-muted">Subject</dt>
                <dd className="text-ink wrap-anywhere">{subject || "(no subject)"}</dd>
              </div>
            </div>
          </dl>
          <CheckboxField
            checked={checked}
            onCheckedChange={(value) => setChecked(value === true)}
            label={`I've checked the preview and want to email ${people}`}
            description="You'll have 5 seconds to undo after this."
          />
        </DialogBody>
        <DialogFooter>
          <Button
            variant="quiet"
            onClick={() => {
              setChecked(false);
              onCancel();
            }}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            startIcon={<Send />}
            disabled={!checked}
            onClick={() => {
              setChecked(false);
              onConfirm();
            }}
          >
            Send to {people}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

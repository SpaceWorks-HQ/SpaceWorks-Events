"use client";

import type { Dispatch, SetStateAction } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader } from "@/components/ui/dialog";
import { feedbackTemplates, type FeedbackTemplate } from "@/lib/feedbackTemplates";

export function TemplateDialog({
  templateDialog,
  setTemplateDialog,
  pending,
  applyTemplate,
}: {
  templateDialog: boolean;
  setTemplateDialog: Dispatch<SetStateAction<boolean>>;
  pending: boolean;
  applyTemplate: (template: FeedbackTemplate) => void;
}) {
  return (
<Dialog open={templateDialog} onOpenChange={(next) => { if (!next && !pending) setTemplateDialog(false); }}>
  <DialogContent size="lg">
    <DialogHeader title="Choose a feedback template" description="A template replaces unanswered questions and closes the form so you can review it." />
    <DialogBody>
      <ul className="flex flex-col gap-2.5">
        {feedbackTemplates.map((template) => (
          <li key={template.id} className="flex flex-col gap-3 rounded-xl border border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[16px] font-bold text-ink">{template.name}</p>
              <p className="text-body-ui text-ink-secondary">{template.description}</p>
              <p className="text-caption text-ink-muted">{template.fields.length} questions · {template.title}</p>
            </div>
            <Button variant="primary" size="sm" onClick={() => applyTemplate(template)} disabled={pending} className="shrink-0">Use template</Button>
          </li>
        ))}
      </ul>
    </DialogBody>
    <DialogFooter>
      <Button variant="secondary" onClick={() => setTemplateDialog(false)} disabled={pending}>Cancel</Button>
    </DialogFooter>
  </DialogContent>
</Dialog>
  );
}

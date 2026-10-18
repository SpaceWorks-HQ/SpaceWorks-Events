"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { EventSeries } from "@prisma/client";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { updateEventSeriesMeta, deleteEventSeries } from "@/app/actions/series";
import { useToast } from "@/components/feedback/ToastProvider";
import { ConfirmationDialog } from "@/components/feedback/ConfirmationDialog";
import { useUnsavedChangesGuard } from "@/components/forms/useUnsavedChangesGuard";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { Field, Input, Dropdown, Textarea } from "@/components/ui/field";

const timezones = [
  "UTC",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/London",
  "Europe/Paris",
  "Asia/Kolkata",
  "Asia/Tokyo",
  "Australia/Sydney",
];

export function EditSeriesForm(props: {
  organisationSlug: string;
  series: Pick<EventSeries, "id" | "title" | "description" | "recurrenceRule" | "timezone" | "capacity" | "status" | "privacyType">;
}) {
  const { organisationSlug, series } = props;
  const router = useRouter();
  const { showToast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [dirty, setDirty] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  useUnsavedChangesGuard(dirty && !pending);

  const deleteSeries = () => {
    setDeleteOpen(false);
    startTransition(async () => {
      const res = await deleteEventSeries({ organisationSlug, eventSeriesId: series.id });
      if (!res.ok) {
        showToast(res.error, "error");
        return;
      }
      setDirty(false);
      showToast("Series deleted", "success");
      router.push(`/dashboard/${organisationSlug}`);
    });
  };

  return (
    <>
    <form
      className="flex flex-col gap-4"
      onChangeCapture={() => setDirty(true)}
      onSubmit={(e) => {
        e.preventDefault();
        setError(null);
        const fd = new FormData(e.currentTarget);
        const capacityRaw = String(fd.get("capacity") ?? "").trim();
        startTransition(async () => {
          const res = await updateEventSeriesMeta({
            organisationSlug,
            eventSeriesId: series.id,
            title: String(fd.get("title") ?? ""),
            description: String(fd.get("description") ?? ""),
            timezone: String(fd.get("timezone") ?? "UTC"),
            capacity: capacityRaw,
            status: String(fd.get("status") ?? EventStatus.DRAFT) as EventStatus,
            privacyType: String(
              fd.get("privacyType") ?? EventPrivacyType.PUBLIC,
            ) as EventPrivacyType,
          });
          if (!res.ok) {
            setError(res.error);
            showToast(res.error, "error");
            return;
          }
          showToast("Series saved", "success");
          setDirty(false);
          router.refresh();
        });
      }}
    >
      <p className="text-body-ui text-ink-muted">
        Recurrence is fixed at creation. RRULE:{" "}
        <code className="break-all font-mono text-sm text-ink-secondary">{series.recurrenceRule}</code>
      </p>
      {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
      <Field label="Title" required>
        <Input name="title" defaultValue={series.title} />
      </Field>
      <Field label="Description">
        <Textarea name="description" rows={2} defaultValue={series.description} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Timezone" required>
          <Dropdown name="timezone" defaultValue={series.timezone}>
            {timezones.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </Dropdown>
        </Field>
        <Field label="Capacity per occurrence" optional>
          <Input name="capacity" type="number" min={1} inputMode="numeric" defaultValue={series.capacity ?? ""} />
        </Field>
        <Field label="Status">
          <Dropdown name="status" defaultValue={series.status}>
            <option value={EventStatus.DRAFT}>Draft</option>
            <option value={EventStatus.PUBLISHED}>Published</option>
          </Dropdown>
        </Field>
        <Field label="Audience">
          <Dropdown name="privacyType" defaultValue={series.privacyType}>
            <option value={EventPrivacyType.PUBLIC}>Public</option>
            <option value={EventPrivacyType.HIDDEN_LINK}>Hidden link</option>
            <option value={EventPrivacyType.APPROVAL_REQUIRED}>Approval required</option>
            <option value={EventPrivacyType.INVITE_ONLY}>Invite only</option>
          </Dropdown>
        </Field>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
        <Button variant="dangerQuiet" disabled={pending} onClick={() => setDeleteOpen(true)}>
          Delete series
        </Button>
        <Button type="submit" variant="primary" disabled={pending} loading={pending}>
          Save
        </Button>
      </div>
    </form>
    <ConfirmationDialog
      open={deleteOpen}
      title="Delete event series?"
      message={`Delete “${series.title}” and its generated occurrences? This cannot be undone.`}
      confirmLabel="Delete series"
      loading={pending}
      onCancel={() => setDeleteOpen(false)}
      onConfirm={deleteSeries}
    />
    </>
  );
}

import { prisma } from "@/lib/db";
import type { EventDashboardContext } from "@/lib/eventDashboard/context";
import { loadFeedbackInsights } from "@/lib/eventDashboard/feedback";
const MAX_BROWSER_FEEDBACK_RESPONSES = 250;
export async function loadFeedbackPanel({ ctx }: { ctx: EventDashboardContext; }) {
  ctx = await loadEventDashboard(ctx.organisation.slug, ctx.event.id);

  const { event, permissions, organisation } = ctx;
  // The feedback form and its responses are organisation-admin only (see app/actions/feedback-form.ts).
  if (!permissions.isAdmin) notFound();
  const record = await prisma.eventFeedbackForm.findUnique({ where: { eventId: event.id }, include: { fields: { orderBy: { sortOrder: "asc" } } } });
  const form = record ? { isOpen: record.isOpen, title: record.title, thankYouMessage: record.thankYouMessage, certificateEnabled: record.certificateEnabled, certificateTemplate: record.certificateTemplate } : null;
  const fields = (record?.fields ?? []).map((field) => ({
    id: field.id, key: field.key, label: field.label, type: field.type, required: field.required, sortOrder: field.sortOrder,
    options: Array.isArray(field.options) ? field.options.filter((value): value is string => typeof value === "string") : [],
  }));

  // Responses are organisation-admin only. Only answer values are read: never
  // the RSVP, attendee identity or certificate token.
  const canViewResponses = permissions.canEditDetails;
  const [responseRecords, insights] = canViewResponses && record
    ? await Promise.all([
      prisma.eventFeedbackResponse.findMany({
        where: { formId: record.id },
        select: { id: true, submittedAt: true, answers: { select: { fieldKey: true, fieldLabel: true, valueText: true, valueBool: true, valueNumber: true, valueDate: true }, orderBy: { createdAt: "asc" } } },
        orderBy: { submittedAt: "desc" },
        take: MAX_BROWSER_FEEDBACK_RESPONSES + 1,
      }),
      loadFeedbackInsights(record.id, fields),
    ])
    : [[], { responseCount: 0, ratings: [], texts: [] }];
  const responses = responseRecords.slice(0, MAX_BROWSER_FEEDBACK_RESPONSES).map((response) => {
    const grouped: Record<string, { label: string; values: string[]; }> = {};
    for (const answer of response.answers) {
      const value = answer.valueText ?? (answer.valueBool != null ? (answer.valueBool ? "Yes" : "No") : null) ?? (answer.valueNumber != null ? String(answer.valueNumber) : null) ?? answer.valueDate?.toLocaleDateString() ?? null;
      if (value === null) continue;
      if (!grouped[answer.fieldKey]) grouped[answer.fieldKey] = { label: answer.fieldLabel, values: [] };
      grouped[answer.fieldKey]!.values.push(value);
    }
    return { id: response.id, submittedAt: response.submittedAt.toISOString(), answers: Object.values(grouped).map((answer) => ({ label: answer.label, value: answer.values.join(", ") })) };
  });


  return { event, permissions, organisation, form, fields, canViewResponses, responseRecords, insights, responses };
}

import { notFound } from "next/navigation";
import { loadEventDashboard } from "@/lib/eventDashboard/context";

import "server-only";

import type { Prisma, RegistrationFieldType } from "@prisma/client";
import { prisma } from "@/lib/db";
import { isRatingField, isTextField, RATING_DOTS, ratingDistribution, ratingScale, type FeedbackInsights } from "@/components/event-dashboard/feedback/helpers";

/*
 * Aggregate feedback insights for the event dashboard. Every query is scoped to
 * one feedback form (whose event was already resolved inside the organisation)
 * and reads only answer values: never the RSVP, attendee identity or
 * certificate token, so responses stay anonymous.
 */

export type InsightField = { id: string; label: string; type: RegistrationFieldType; options: string[] };

const RECENT_TEXT_ANSWERS = 3;

export async function loadFeedbackInsights(formId: string, fields: InsightField[]): Promise<FeedbackInsights> {
  const ratingFields = fields.filter(isRatingField);
  const textFields = fields.filter(isTextField);
  const scope = { response: { formId } };

  const [responseCount, ratingGroups, textResults] = await Promise.all([
    prisma.eventFeedbackResponse.count({ where: { formId } }),
    ratingFields.length
      ? prisma.eventFeedbackAnswer.groupBy({
          by: ["fieldId", "valueText"],
          where: { ...scope, fieldId: { in: ratingFields.map((field) => field.id) }, valueText: { not: null } },
          _count: { _all: true },
        })
      : Promise.resolve([]),
    Promise.all(textFields.map(async (field) => {
      const where = { ...scope, fieldId: field.id, AND: [{ valueText: { not: null } }, { NOT: { valueText: "" } }] } satisfies Prisma.EventFeedbackAnswerWhereInput;
      const [total, recent] = await Promise.all([
        prisma.eventFeedbackAnswer.count({ where }),
        prisma.eventFeedbackAnswer.findMany({
          where,
          select: { valueText: true },
          orderBy: [{ response: { submittedAt: "desc" } }, { createdAt: "desc" }],
          take: RECENT_TEXT_ANSWERS,
        }),
      ]);
      return { field, total, recent: recent.map((answer) => answer.valueText?.trim() ?? "").filter(Boolean) };
    })),
  ]);

  const ratings = ratingFields.map((field) => {
    const counts: Record<string, number> = {};
    for (const group of ratingGroups) {
      if (group.fieldId !== field.id || group.valueText == null) continue;
      const key = group.valueText.trim();
      counts[key] = (counts[key] ?? 0) + group._count._all;
    }
    return { fieldId: field.id, label: field.label, ...ratingDistribution(field.options, counts, RATING_DOTS, ratingScale(field) ?? undefined) };
  });

  const texts = textResults.map(({ field, total, recent }) => ({ fieldId: field.id, label: field.label, total, recent }));
  return { responseCount, ratings, texts };
}

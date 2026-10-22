import "server-only";

import type { EventStatus } from "@prisma/client";

export const DAY_MS = 86_400_000;
export const LIVE_LEAD_MS = 2 * 60 * 60_000; // event-day mode starts two hours before doors
export const ARRIVAL_BUCKET_MS = 15 * 60_000;
export const ARRIVAL_BUCKETS = 8;
export const LIST_LIMIT = 6;
export const SAMPLE_LIMIT = 5000; // cap on timestamps pulled for the weekly dot charts

export const LISTED: EventStatus[] = ["PUBLISHED", "HIDDEN"];

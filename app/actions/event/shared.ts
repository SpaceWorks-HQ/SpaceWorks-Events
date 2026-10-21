import { revalidatePath as nextRevalidatePath } from "next/cache";
import { trackedRevalidation } from "@/lib/frontend/revalidation";
import { flattenZodErrors } from "../utils";

export const revalidatePath = trackedRevalidation(nextRevalidatePath);

export function revalidateEventPaths(
  orgSlug: string,
  eventSlug: string,
  eventId: string,
) {
  revalidatePath(`/${orgSlug}`);
  revalidatePath(`/${orgSlug}/${eventSlug}`);
  revalidatePath(`/dashboard/${orgSlug}`);
  revalidatePath(`/dashboard/${orgSlug}/event/${eventId}`);
}

export function validationError(error: Parameters<typeof flattenZodErrors>[0]) {
  const fieldErrors = flattenZodErrors(error);
  const message = Object.values(fieldErrors).flat()[0] ?? "Invalid input.";
  return { error: message, fieldErrors };
}

import { requireAuth } from "@/lib/permissions";
import { loadAccountRegistrations } from "@/lib/accountRegistrations";

export async function loadAccountRegistrationsView() {
  const session = await requireAuth();
  const { upcoming, past, certificates } = await loadAccountRegistrations(session.user.id);
  return { upcoming, past, certificates };
}

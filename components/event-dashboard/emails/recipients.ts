/* Pure helpers for the Emails tab's "Who gets it" step. No I/O. */

/** "34 people will get this. One email per address." The count comes from the server. */
export function recipientSummary(count: number | null): { count: string; rest: string } {
  if (count === null) return { count: "", rest: "Counting recipients…" };
  if (count <= 0) return { count: "No one", rest: "matches this audience yet." };
  return { count: `${count} ${count === 1 ? "person" : "people"}`, rest: "will get this. One email per address." };
}

/** The send bar's status line, or why sending is not possible yet. */
export function sendBarLabel(input: { count: number | null; hasStatuses: boolean; hasContent: boolean }): string {
  if (!input.hasStatuses) return "Pick at least one group to send to";
  if (!input.hasContent) return "Add a subject and a message to send";
  if (input.count === null) return "Counting recipients…";
  if (input.count <= 0) return "No one matches this audience yet";
  return `Ready to send to ${input.count} ${input.count === 1 ? "person" : "people"}`;
}

/**
 * Dots for the recipient line: one per registration (scaled past `cap`), the
 * first `lit` standing for the people who will get the email.
 */
export function recipientDots(recipients: number, registrations: number, cap = 40): { dots: number; lit: number } {
  const total = Math.max(0, Math.floor(registrations));
  const reach = Math.max(0, Math.floor(recipients));
  const dots = Math.min(Math.max(total, reach, 1), cap);
  const base = Math.max(total, reach);
  if (base === 0 || reach === 0) return { dots, lit: 0 };
  return { dots, lit: Math.max(1, Math.round((reach / base) * dots)) };
}

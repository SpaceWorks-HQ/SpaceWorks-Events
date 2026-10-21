import type { RsvpStatus } from "@prisma/client";

export async function postRsvp(body: unknown) {
  const res = await fetch("/api/rsvp", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
  type Saved = { ticketToken?: string; status?: RsvpStatus; orderToken?: string; checkoutUrl?: string | null };
  let data: { ok?: boolean; error?: string; data?: Saved } = {};
  try {
    data = (await res.json()) as { ok?: boolean; error?: string; data?: Saved };
  } catch {
    /* empty */
  }
  if (res.status === 429) {
    return {
      ok: false as const,
      error: data.error ?? "Too many requests. Try again later.",
    };
  }
  if (!res.ok) {
    return {
      ok: false as const,
      error: data.error ?? "Could not save your RSVP.",
    };
  }
  if (data.ok) {
    return {
      ok: true as const,
      ticketToken: data.data?.ticketToken ?? "",
      status: data.data?.status ?? null,
      orderToken: data.data?.orderToken ?? null,
      checkoutUrl: data.data?.checkoutUrl ?? null,
    };
  }
  return {
    ok: false as const,
    error: data.error ?? "Could not save your RSVP.",
  };
}

export function storageKey(params: {
  orgSlug: string;
  eventSlug?: string;
  eventInstanceId?: string;
}) {
  const suffix = params.eventInstanceId
    ? `i:${params.eventInstanceId}`
    : `e:${params.eventSlug ?? ""}`;
  return `swe:rsvp:${params.orgSlug}:${suffix}`;
}

export function safeJsonParse<T>(v: string | null): T | null {
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}

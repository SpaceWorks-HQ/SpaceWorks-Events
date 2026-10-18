import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  rateLimit: vi.fn(),
  unsubscribes: [] as Array<ReturnType<typeof vi.fn>>,
}));

vi.mock("@/lib/ticketCheckInEvents", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/ticketCheckInEvents")>();
  return {
    ...actual,
    subscribeTicketCheckedIn: (...args: Parameters<typeof actual.subscribeTicketCheckedIn>) => {
      const real = actual.subscribeTicketCheckedIn(...args);
      const spy = vi.fn(() => real());
      mocks.unsubscribes.push(spy);
      return Object.assign(spy, { ready: real.ready });
    },
  };
});

vi.mock("@/lib/db", () => ({ prisma: { rSVP: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/rateLimit", () => ({
  getClientIpFromHeaders: () => "203.0.113.7",
  checkRateLimitById: mocks.rateLimit,
}));

import { GET as getStatus } from "@/app/api/ticket/[token]/status/route";
import { GET as getEvents } from "@/app/api/ticket/[token]/events/route";
import { publishTicketCheckedIn } from "@/lib/ticketCheckInEvents";

const TOKEN = "opaque-ticket-token-123";
const CHECKED_AT = new Date("2035-01-01T10:15:00.000Z");

function call(handler: typeof getStatus, token: string, init?: RequestInit) {
  const request = new Request(`https://events.example.test/api/ticket/${token}/x`, init);
  return handler(request, { params: Promise.resolve({ token }) });
}

/** Mock both lookups: by token (initial) and by id (post-subscribe re-read). */
function ticket(checkedInAt: Date | null, reread: Date | null = checkedInAt) {
  mocks.findUnique.mockImplementation(async ({ where }: { where: { checkInToken?: string; id?: string } }) => {
    if (where.checkInToken) return where.checkInToken === TOKEN ? { id: "rsvp_1", checkedInAt } : null;
    return where.id === "rsvp_1" ? { checkedInAt: reread } : null;
  });
}

async function readUntilClosed(response: Response) {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let text = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) return text;
    text += decoder.decode(value);
  }
}

async function readChunk(reader: ReadableStreamDefaultReader<Uint8Array>) {
  const { value, done } = await reader.read();
  return done ? null : new TextDecoder().decode(value);
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.unsubscribes.length = 0;
  vi.stubEnv("REDIS_URL", "");
  mocks.rateLimit.mockResolvedValue(true);
  ticket(null);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("GET /api/ticket/:token/status", () => {
  it("returns 404 with an empty body for malformed tokens before any lookup", async () => {
    const response = await call(getStatus, "bad token!");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(mocks.findUnique).not.toHaveBeenCalled();
    expect(mocks.rateLimit).not.toHaveBeenCalled();
  });

  it("returns 404 with an empty body for unknown tokens", async () => {
    const response = await call(getStatus, "unknown-token-456");
    expect(response.status).toBe(404);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("returns only the check-in state with privacy headers", async () => {
    ticket(CHECKED_AT);
    const response = await call(getStatus, TOKEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toStrictEqual({ checkedIn: true, checkedInAt: CHECKED_AT.toISOString() });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Referrer-Policy")).toBe("no-referrer");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
    expect(mocks.findUnique).toHaveBeenCalledWith({ where: { checkInToken: TOKEN }, select: { id: true, checkedInAt: true } });
  });

  it("reports not-yet-checked-in tickets", async () => {
    const response = await call(getStatus, TOKEN);
    expect(await response.json()).toStrictEqual({ checkedIn: false, checkedInAt: null });
  });

  it("rate limits per client IP without touching the database", async () => {
    mocks.rateLimit.mockResolvedValue(false);
    const response = await call(getStatus, TOKEN);
    expect(response.status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenCalledWith("ticketStatus", "ip:203.0.113.7");
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

describe("GET /api/ticket/:token/events", () => {
  it("rejects malformed and unknown tokens and rate limits", async () => {
    expect((await call(getEvents, "x")).status).toBe(404);
    expect((await call(getEvents, "unknown-token-456")).status).toBe(404);
    mocks.rateLimit.mockResolvedValue(false);
    expect((await call(getEvents, TOKEN)).status).toBe(429);
    expect(mocks.rateLimit).toHaveBeenLastCalledWith("ticketEvents", "ip:203.0.113.7");
  });

  it("sends the state and closes immediately when already checked in", async () => {
    ticket(CHECKED_AT);
    const response = await call(getEvents, TOKEN);
    expect(response.headers.get("Content-Type")).toContain("text/event-stream");
    expect(response.headers.get("Cache-Control")).toBe("no-store, no-transform");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
    expect(response.headers.get("Connection")).toBe("keep-alive");
    const text = await readUntilClosed(response);
    expect(text).toBe(`event: state\ndata: ${JSON.stringify({ checkedIn: true, checkedInAt: CHECKED_AT.toISOString() })}\n\n`);
    expect(mocks.unsubscribes).toHaveLength(0);
  });

  it("sends the initial state, then checked-in on publish, then closes", async () => {
    const response = await call(getEvents, TOKEN);
    const reader = response.body!.getReader();
    expect(await readChunk(reader)).toBe(`event: state\ndata: ${JSON.stringify({ checkedIn: false, checkedInAt: null })}\n\n`);

    publishTicketCheckedIn({ rsvpId: "rsvp_2", checkedInAt: CHECKED_AT }); // someone else
    publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: CHECKED_AT });
    expect(await readChunk(reader)).toBe(`event: checked-in\ndata: ${JSON.stringify({ checkedInAt: CHECKED_AT.toISOString() })}\n\n`);
    expect(await reader.read()).toEqual({ value: undefined, done: true });
    expect(mocks.unsubscribes).toHaveLength(1);
    expect(mocks.unsubscribes[0]).toHaveBeenCalled();
  });

  it("reports a check-in that commits between lookup and subscription", async () => {
    ticket(null, CHECKED_AT);
    const text = await readUntilClosed(await call(getEvents, TOKEN));
    expect(text).toBe(`event: state\ndata: ${JSON.stringify({ checkedIn: true, checkedInAt: CHECKED_AT.toISOString() })}\n\n`);
  });

  it("sends heartbeats and closes after the maximum lifetime", async () => {
    vi.useFakeTimers();
    const response = await call(getEvents, TOKEN);
    const reader = response.body!.getReader();
    await expect(readChunk(reader)).resolves.toContain("event: state");
    await vi.advanceTimersByTimeAsync(25_000);
    expect(await readChunk(reader)).toBe(": ping\n\n");
    await vi.advanceTimersByTimeAsync(10 * 60_000);
    const rest: string[] = [];
    for (let chunk = await readChunk(reader); chunk !== null; chunk = await readChunk(reader)) rest.push(chunk);
    expect(rest.every((chunk) => chunk === ": ping\n\n")).toBe(true);
    expect(mocks.unsubscribes[0]).toHaveBeenCalledTimes(1);
  });

  it("unsubscribes when the client aborts", async () => {
    const controller = new AbortController();
    const response = await call(getEvents, TOKEN, { signal: controller.signal });
    const reader = response.body!.getReader();
    await readChunk(reader);
    controller.abort();
    expect(await reader.read()).toEqual({ value: undefined, done: true });
    expect(mocks.unsubscribes[0]).toHaveBeenCalledTimes(1);

    // A later publish must not reach the closed stream (no enqueue-after-close errors).
    publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: CHECKED_AT });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

  it("cleans up when the reader cancels", async () => {
    const response = await call(getEvents, TOKEN);
    const reader = response.body!.getReader();
    await readChunk(reader);
    await reader.cancel();
    expect(mocks.unsubscribes[0]).toHaveBeenCalledTimes(1);
    publishTicketCheckedIn({ rsvpId: "rsvp_1", checkedInAt: CHECKED_AT });
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
});

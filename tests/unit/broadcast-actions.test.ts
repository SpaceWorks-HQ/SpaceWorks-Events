import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimited: vi.fn(),
  orgFind: vi.fn(),
  membership: vi.fn(),
  eventFind: vi.fn(),
  userFind: vi.fn(),
  broadcastCreate: vi.fn(),
  rsvpFindMany: vi.fn(),
  outboxCreateMany: vi.fn(),
  outboxCreate: vi.fn(),
  audit: vi.fn(),
  startWorker: vi.fn(),
}));

const tx = {
  rSVP: { findMany: mocks.rsvpFindMany },
  eventBroadcast: { create: mocks.broadcastCreate },
  outboxMessage: { createMany: mocks.outboxCreateMany, create: mocks.outboxCreate },
};

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimited }));
vi.mock("@/lib/permissions", () => ({
  getMembership: mocks.membership,
  canManageEvents: (m: { role: string } | null) => m?.role === "OWNER" || m?.role === "ADMIN",
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/outboxWorker", () => ({ startOutboxWorker: mocks.startWorker }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: {
  organisation: { findUnique: mocks.orgFind },
  event: { findFirst: mocks.eventFind },
  user: { findUnique: mocks.userFind },
  rSVP: { findMany: mocks.rsvpFindMany },
  outboxMessage: { createMany: mocks.outboxCreateMany, create: mocks.outboxCreate },
  $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
} }));

import { countBroadcastRecipients, previewEventBroadcast, sendEventBroadcast, sendEventBroadcastTest } from "@/app/actions/broadcasts";

const baseInput = {
  organisationSlug: "org-a",
  eventId: "event_1",
  statuses: ["CONFIRMED", "WAITLISTED"],
  attendance: "ANY",
  subject: "Doors open at 6",
  body: '<p onclick="x()">Hello {{name}}, see you at <strong>{{event}}</strong>.</p><script>alert(1)</script><p><a class="cta" href="{{ticketLink}}">Ticket</a></p>',
};
const cleanedBody = '<p>Hello {{name}}, see you at <strong>{{event}}</strong>.</p><p><a class="cta" href="{{ticketLink}}">Ticket</a></p>';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "admin_1" } });
  mocks.rateLimited.mockResolvedValue(false);
  mocks.orgFind.mockResolvedValue({ id: "org_a", slug: "org-a" });
  mocks.membership.mockResolvedValue({ role: "ADMIN" });
  mocks.eventFind.mockResolvedValue({
    id: "event_1", title: "Mixer", slug: "mixer", startDateTime: new Date("2030-03-07T12:30:00.000Z"), timezone: "Asia/Kolkata",
    location: "Hall A", isOnline: false, organisation: { name: "Org", slug: "org" },
  });
  mocks.rsvpFindMany.mockResolvedValue([
    { id: "rsvp_1", guestEmail: "a@example.test", user: null },
    { id: "rsvp_2", guestEmail: null, user: { email: "b@example.test" } },
  ]);
  mocks.broadcastCreate.mockResolvedValue({ id: "broadcast_1" });
  mocks.outboxCreateMany.mockResolvedValue({ count: 2 });
  mocks.outboxCreate.mockResolvedValue({ id: "msg_1" });
  mocks.userFind.mockResolvedValue({ email: "admin@example.test", emailVerified: new Date(), name: "Admin" });
});

describe("event broadcast actions", () => {
  it("binds the event lookup to the authorised organisation", async () => {
    await expect(sendEventBroadcast(baseInput)).resolves.toEqual({ ok: true, data: { broadcastId: "broadcast_1", recipientCount: 2 } });
    expect(mocks.eventFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "event_1", organisationId: "org_a" } }));
    expect(mocks.broadcastCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({
      eventId: "event_1",
      createdByUserId: "admin_1",
      statuses: ["CONFIRMED", "WAITLISTED"],
      attendance: "ANY",
      recipientCount: 2,
      body: cleanedBody,
    }) }));
    expect(mocks.outboxCreateMany).toHaveBeenCalledWith({ data: [
      { kind: "event-broadcast", payload: { to: "a@example.test", broadcastId: "broadcast_1", rsvpId: "rsvp_1" } },
      { kind: "event-broadcast", payload: { to: "b@example.test", broadcastId: "broadcast_1", rsvpId: "rsvp_2" } },
    ] });
    expect(mocks.startWorker).toHaveBeenCalled();
  });

  it("writes an audit event without recipient addresses or message text", async () => {
    await sendEventBroadcast(baseInput);
    const call = mocks.audit.mock.calls[0]?.[0];
    expect(call).toEqual(expect.objectContaining({ action: "EVENT_BROADCAST_QUEUED", organisationId: "org_a", targetId: "broadcast_1" }));
    const serialized = JSON.stringify(call);
    expect(serialized).not.toContain("example.test");
    expect(serialized).not.toContain("Doors open");
  });

  it("refuses members who cannot manage events", async () => {
    mocks.membership.mockResolvedValue({ role: "MEMBER" });
    await expect(sendEventBroadcast(baseInput)).resolves.toEqual({ ok: false, error: "You do not have permission to email attendees." });
    expect(mocks.outboxCreateMany).not.toHaveBeenCalled();
    await expect(countBroadcastRecipients(baseInput)).resolves.toEqual({ ok: false, error: "You do not have permission to email attendees." });
  });

  it("refuses an event that belongs to another organisation", async () => {
    mocks.eventFind.mockResolvedValue(null);
    await expect(sendEventBroadcast(baseInput)).resolves.toEqual({ ok: false, error: "Event not found." });
    expect(mocks.broadcastCreate).not.toHaveBeenCalled();
  });

  it("does not create a broadcast when nobody matches the audience", async () => {
    mocks.rsvpFindMany.mockResolvedValue([]);
    await expect(sendEventBroadcast(baseInput)).resolves.toEqual({ ok: false, error: "No registrations match the selected audience." });
    expect(mocks.broadcastCreate).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects empty audiences and oversized messages before touching the database", async () => {
    const noStatus = await sendEventBroadcast({ ...baseInput, statuses: [] });
    expect(noStatus.ok).toBe(false);
    const tooLong = await sendEventBroadcast({ ...baseInput, body: "x".repeat(20001) });
    expect(tooLong.ok).toBe(false);
    expect(mocks.orgFind).not.toHaveBeenCalled();
  });

  it("applies the broadcast rate limit", async () => {
    mocks.rateLimited.mockResolvedValue(true);
    const result = await sendEventBroadcast(baseInput);
    expect(result.ok).toBe(false);
    expect(mocks.orgFind).not.toHaveBeenCalled();
  });

  it("limits test sends in their own bucket so testing never blocks the real send", async () => {
    mocks.rateLimited.mockImplementation(async (bucket: string) => bucket === "broadcastTest");
    expect((await sendEventBroadcastTest(baseInput)).ok).toBe(false);
    expect(mocks.orgFind).not.toHaveBeenCalled();
    expect(mocks.rateLimited).toHaveBeenCalledWith("broadcastTest", expect.any(String));
    expect(mocks.rateLimited).not.toHaveBeenCalledWith("broadcast", expect.any(String));
  });

  it("reports the deduplicated recipient count", async () => {
    mocks.rsvpFindMany.mockResolvedValue([
      { id: "rsvp_1", guestEmail: "same@example.test", user: null },
      { id: "rsvp_2", guestEmail: null, user: { email: "SAME@example.test" } },
    ]);
    await expect(countBroadcastRecipients(baseInput)).resolves.toEqual({ ok: true, data: { count: 1 } });
  });

  it("sends a test only to the organiser's own verified address", async () => {
    await expect(sendEventBroadcastTest(baseInput)).resolves.toEqual({ ok: true, data: { to: "admin@example.test" } });
    expect(mocks.outboxCreate).toHaveBeenCalledWith({ data: { kind: "event-broadcast-test", payload: {
      to: "admin@example.test",
      eventId: "event_1",
      subject: "Doors open at 6",
      body: cleanedBody,
      design: "classic",
      recipientName: "Admin",
    } } });

    mocks.userFind.mockResolvedValue({ email: "admin@example.test", emailVerified: null, name: null });
    await expect(sendEventBroadcastTest(baseInput)).resolves.toEqual({ ok: false, error: "Verify your own email address before sending a test." });
  });

  it("rejects a message that is empty after sanitising", async () => {
    await expect(sendEventBroadcast({ ...baseInput, body: "<p></p><script>alert(1)</script>" })).resolves.toEqual({ ok: false, error: "The message is empty." });
    expect(mocks.broadcastCreate).not.toHaveBeenCalled();
  });

  it("previews the exact email with sample values and the event's own links", async () => {
    const result = await previewEventBroadcast(baseInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data?.subject).toBe("Doors open at 6");
    expect(result.data?.html).toContain("Hello Priya, see you at <strong>Mixer</strong>.");
    expect(result.data?.html).toContain('href="http://localhost:3000/org/mixer" style="display: inline-block;');
    expect(result.data?.html).not.toContain("onclick");
    expect(result.data?.text).toContain("Ticket (http://localhost:3000/org/mixer)");
  });
});

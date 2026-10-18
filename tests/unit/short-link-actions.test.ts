import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  rateLimited: vi.fn(),
  orgFind: vi.fn(),
  membership: vi.fn(),
  eventFind: vi.fn(),
  eventUpdateMany: vi.fn(),
  audit: vi.fn(),
  revalidate: vi.fn(),
  generate: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimited }));
vi.mock("@/lib/permissions", () => ({
  getMembership: mocks.membership,
  canManageEvents: (m: { role: string } | null) => m?.role === "OWNER" || m?.role === "ADMIN",
}));
vi.mock("@/lib/audit", () => ({ recordAuditEvent: mocks.audit }));
vi.mock("@/lib/shortLink", () => ({ generateShortCode: mocks.generate }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.orgFind },
    event: { findFirst: mocks.eventFind, updateMany: mocks.eventUpdateMany },
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));

import { createEventShortLink, regenerateEventShortLink } from "@/app/actions/shortLink";

const input = { organisationSlug: "org-a", eventId: "event_1" };
const uniqueViolation = Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "user_1" } });
  mocks.rateLimited.mockResolvedValue(false);
  mocks.orgFind.mockResolvedValue({ id: "org_a", slug: "org-a" });
  mocks.membership.mockResolvedValue({ role: "ADMIN" });
  mocks.eventFind.mockReset().mockResolvedValue({ id: "event_1", shortCode: null });
  mocks.eventUpdateMany.mockReset().mockResolvedValue({ count: 1 });
  mocks.generate.mockReset().mockReturnValueOnce("Abc1234").mockReturnValueOnce("Def5678").mockReturnValue("Ghi9012");
});

describe.each([
  ["createEventShortLink", createEventShortLink],
  ["regenerateEventShortLink", regenerateEventShortLink],
])("%s access control", (_name, action) => {
  it("rejects signed-out users before touching the database", async () => {
    mocks.auth.mockResolvedValue(null);
    await expect(action(input)).resolves.toEqual({ ok: false, error: "You must be signed in." });
    expect(mocks.orgFind).not.toHaveBeenCalled();
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects organisation members who are not owners or admins", async () => {
    mocks.membership.mockResolvedValue({ role: "MEMBER" });
    const result = await action(input);
    expect(result.ok).toBe(false);
    expect(mocks.eventFind).not.toHaveBeenCalled();
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("rejects users with no membership (including event collaborators)", async () => {
    mocks.membership.mockResolvedValue(null);
    expect((await action(input)).ok).toBe(false);
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
  });

  it("treats an event from another organisation as not found", async () => {
    mocks.eventFind.mockResolvedValue(null);
    await expect(action({ organisationSlug: "org-a", eventId: "event_from_org_b" })).resolves.toEqual({ ok: false, error: "Event not found." });
    expect(mocks.eventFind).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "event_from_org_b", organisationId: "org_a" } }));
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
  });

  it("returns the same not-found error for an unknown organisation", async () => {
    mocks.orgFind.mockResolvedValue(null);
    await expect(action(input)).resolves.toEqual({ ok: false, error: "Event not found." });
  });

  it("refuses when rate limited", async () => {
    mocks.rateLimited.mockResolvedValue(true);
    await expect(action(input)).resolves.toEqual({ ok: false, error: "Too many updates. Please try again later." });
    expect(mocks.rateLimited).toHaveBeenCalledWith("action", "user_1");
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects malformed input", async () => {
    await expect(action({ organisationSlug: "org-a" })).resolves.toEqual({ ok: false, error: "Invalid request." });
    await expect(action({ ...input, extra: true })).resolves.toEqual({ ok: false, error: "Invalid request." });
    expect(mocks.orgFind).not.toHaveBeenCalled();
  });
});

describe("createEventShortLink", () => {
  it.each(["OWNER", "ADMIN"])("lets an %s create a short link, scoped to the organisation", async (role) => {
    mocks.membership.mockResolvedValue({ role });
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: true, code: "Abc1234" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({
      where: { id: "event_1", organisationId: "org_a", shortCode: null },
      data: { shortCode: "Abc1234" },
    });
    expect(mocks.audit).toHaveBeenCalledWith({ action: "EVENT_SHORT_LINK_CREATED", actorUserId: "user_1", organisationId: "org_a", targetType: "Event", targetId: "event_1" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/org-a/event/event_1");
  });

  it("is idempotent: an existing code is returned without writing or auditing", async () => {
    mocks.eventFind.mockResolvedValue({ id: "event_1", shortCode: "Xyz7890" });
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: true, code: "Xyz7890" });
    expect(mocks.generate).not.toHaveBeenCalled();
    expect(mocks.eventUpdateMany).not.toHaveBeenCalled();
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("returns the winner's code when a concurrent create got there first", async () => {
    mocks.eventFind.mockResolvedValueOnce({ id: "event_1", shortCode: null }).mockResolvedValueOnce({ shortCode: "Win1234" });
    mocks.eventUpdateMany.mockResolvedValue({ count: 0 });
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: true, code: "Win1234" });
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("retries with a new code on a unique-constraint collision", async () => {
    mocks.eventUpdateMany.mockRejectedValueOnce(uniqueViolation).mockResolvedValueOnce({ count: 1 });
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: true, code: "Def5678" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(2);
    expect(mocks.audit).toHaveBeenCalledTimes(1);
  });

  it("gives up with a UI-safe error after repeated collisions", async () => {
    mocks.eventUpdateMany.mockRejectedValue(uniqueViolation);
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: false, error: "Could not create a short link. Please try again." });
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(5);
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("does not retry or leak details on other database errors", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.eventUpdateMany.mockRejectedValue(new Error("connection reset at 10.0.0.1"));
    await expect(createEventShortLink(input)).resolves.toEqual({ ok: false, error: "Could not create a short link. Please try again." });
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(1);
  });
});

describe("regenerateEventShortLink", () => {
  it("replaces an existing code and records a regeneration without the code in metadata", async () => {
    mocks.eventFind.mockResolvedValue({ id: "event_1", shortCode: "Old1234" });
    const result = await regenerateEventShortLink(input);
    expect(result).toEqual({ ok: true, code: "Abc1234" });
    expect(result.ok && result.code).not.toBe("Old1234");
    expect(mocks.eventUpdateMany).toHaveBeenCalledWith({ where: { id: "event_1", organisationId: "org_a" }, data: { shortCode: "Abc1234" } });
    expect(mocks.audit).toHaveBeenCalledWith({ action: "EVENT_SHORT_LINK_REGENERATED", actorUserId: "user_1", organisationId: "org_a", targetType: "Event", targetId: "event_1" });
    expect(mocks.revalidate).toHaveBeenCalledWith("/dashboard/org-a/event/event_1");
  });

  it("creates a code when none existed yet", async () => {
    await expect(regenerateEventShortLink(input)).resolves.toEqual({ ok: true, code: "Abc1234" });
    expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({ action: "EVENT_SHORT_LINK_CREATED" }));
  });

  it("retries on a unique-constraint collision", async () => {
    mocks.eventFind.mockResolvedValue({ id: "event_1", shortCode: "Old1234" });
    mocks.eventUpdateMany.mockRejectedValueOnce(uniqueViolation).mockRejectedValueOnce(uniqueViolation).mockResolvedValueOnce({ count: 1 });
    await expect(regenerateEventShortLink(input)).resolves.toEqual({ ok: true, code: "Ghi9012" });
    expect(mocks.eventUpdateMany).toHaveBeenCalledTimes(3);
  });
});

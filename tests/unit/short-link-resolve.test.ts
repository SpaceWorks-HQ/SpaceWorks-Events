import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  rateLimited: vi.fn(),
  executeRaw: vi.fn(),
  headers: new Headers(),
}));

vi.mock("@/lib/db", () => ({ prisma: { event: { findUnique: mocks.findUnique }, $executeRaw: mocks.executeRaw } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimited }));
vi.mock("next/headers", () => ({ headers: async () => mocks.headers }));

import { isPersonVisit, resolveShortCode, resolveShortLinkSegment } from "@/lib/shortLinkResolve";

const BROWSER = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Mobile Safari/537.36";

function event(overrides: Partial<{ status: EventStatus; page: { isPublished: boolean } | null }> = {}) {
  return {
    id: "evt_1",
    timezone: "Asia/Kolkata",
    slug: "spring-meetup",
    status: EventStatus.PUBLISHED,
    organisation: { slug: "trivandrum-devs" },
    page: { isPublished: true },
    ...overrides,
  };
}

describe("resolveShortCode", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.rateLimited.mockReset().mockResolvedValue(false);
  });

  it("returns the canonical public path for a published, released event", async () => {
    mocks.findUnique.mockResolvedValue(event());
    await expect(resolveShortCode("aB3x9Kq")).resolves.toBe("/trivandrum-devs/spring-meetup");
    expect(mocks.findUnique).toHaveBeenCalledWith({
      where: { shortCode: "aB3x9Kq" },
      select: {
        id: true,
        slug: true,
        timezone: true,
        status: true,
        organisation: { select: { slug: true } },
        page: { select: { isPublished: true } },
      },
    });
  });

  it("rejects malformed codes without touching the database", async () => {
    for (const code of ["ab3x9kq", "aB3x9K", "aB3x9Kqq", "aB3-9Kq", "", "../aB3x9", "ABCDEFG/"]) {
      await expect(resolveShortCode(code)).resolves.toBeNull();
    }
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("returns null for an unknown code", async () => {
    mocks.findUnique.mockResolvedValue(null);
    await expect(resolveShortCode("aB3x9Kq")).resolves.toBeNull();
  });

  it("never reveals the slug of an event that is not publicly live", async () => {
    for (const status of [EventStatus.DRAFT, EventStatus.HIDDEN, EventStatus.CANCELLED]) {
      mocks.findUnique.mockResolvedValue(event({ status }));
      await expect(resolveShortCode("aB3x9Kq"), status).resolves.toBeNull();
    }
    mocks.findUnique.mockResolvedValue(event({ page: { isPublished: false } }));
    await expect(resolveShortCode("aB3x9Kq")).resolves.toBeNull();
    mocks.findUnique.mockResolvedValue(event({ page: null }));
    await expect(resolveShortCode("aB3x9Kq")).resolves.toBeNull();
  });
});

describe("resolveShortLinkSegment", () => {
  beforeEach(() => {
    mocks.findUnique.mockReset();
    mocks.rateLimited.mockReset().mockResolvedValue(false);
    mocks.executeRaw.mockReset().mockResolvedValue(1);
    mocks.headers = new Headers({ "user-agent": BROWSER });
  });

  it("counts a person's visit once, and never a link preview or prefetch", async () => {
    mocks.findUnique.mockResolvedValue(event());
    await expect(resolveShortLinkSegment("Pq9x3Ba")).resolves.toBe("/trivandrum-devs/spring-meetup");
    expect(mocks.executeRaw).toHaveBeenCalledTimes(1);
    // The day is the event's local date; nothing about the visitor is passed.
    const values = mocks.executeRaw.mock.calls[0]!.slice(1);
    expect(values[0]).toBe("evt_1");
    expect(values[1]).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(values).toHaveLength(2);

    for (const agent of ["WhatsApp/2.23.20.0", "Slackbot-LinkExpanding 1.0", "facebookexternalhit/1.1", "TelegramBot (like TwitterBot)", "curl/8.0", ""]) {
      expect(isPersonVisit(new Headers(agent ? { "user-agent": agent } : {})), agent || "no user agent").toBe(false);
    }
    expect(isPersonVisit(new Headers({ "user-agent": BROWSER, "sec-purpose": "prefetch" }))).toBe(false);
    expect(isPersonVisit(new Headers({ "user-agent": BROWSER, "next-router-prefetch": "1" }))).toBe(false);
    expect(isPersonVisit(new Headers({ "user-agent": BROWSER }))).toBe(true);
  });

  it("still redirects when the visit cannot be counted", async () => {
    mocks.findUnique.mockResolvedValue(event());
    mocks.executeRaw.mockRejectedValue(new Error("database busy"));
    await expect(resolveShortLinkSegment("Rq9x3Ba")).resolves.toBe("/trivandrum-devs/spring-meetup");
  });

  it("counts nothing for a hidden event", async () => {
    mocks.findUnique.mockResolvedValue(event({ status: EventStatus.HIDDEN }));
    await expect(resolveShortLinkSegment("Sq9x3Ba")).resolves.toBeNull();
    expect(mocks.executeRaw).not.toHaveBeenCalled();
  });

  it("rate limits code-shaped lookups before resolving them", async () => {
    mocks.findUnique.mockResolvedValue(event());
    await expect(resolveShortLinkSegment("Kq9x3Ba")).resolves.toBe("/trivandrum-devs/spring-meetup");
    expect(mocks.rateLimited).toHaveBeenCalledWith("shortLink");
  });

  it("treats a rate-limited lookup like an unknown code and skips the database", async () => {
    mocks.rateLimited.mockResolvedValue(true);
    await expect(resolveShortLinkSegment("Zz9x3Ba")).resolves.toBeNull();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("does not spend the limiter on ordinary unknown organisation slugs", async () => {
    await expect(resolveShortLinkSegment("no-such-org")).resolves.toBeNull();
    expect(mocks.rateLimited).not.toHaveBeenCalled();
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });
});

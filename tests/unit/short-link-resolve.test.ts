import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventStatus } from "@prisma/client";

const mocks = vi.hoisted(() => ({
  findUnique: vi.fn(),
  rateLimited: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ prisma: { event: { findUnique: mocks.findUnique } } }));
vi.mock("@/lib/actionRateLimit", () => ({ isActionRateLimited: mocks.rateLimited }));

import { resolveShortCode, resolveShortLinkSegment } from "@/lib/shortLinkResolve";

function event(overrides: Partial<{ status: EventStatus; page: { isPublished: boolean } | null }> = {}) {
  return {
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
        slug: true,
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

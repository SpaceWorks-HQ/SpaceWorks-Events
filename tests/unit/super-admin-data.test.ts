import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ queryRaw: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw: mocks.queryRaw } }));

import { loadDailyActivity, loadDailyEmail, loadTopOrganisationsByBroadcasts, loadTopOrganisationsByRsvps, utcTimestamp } from "@/lib/superAdminData";

type SqlLike = { sql: string; values: unknown[] };

describe("super-admin raw insight queries", () => {
  it("binds window starts as UTC timestamps so a non-UTC database TimeZone cannot shift them", () => {
    const since = new Date("2026-10-01T00:00:00.000Z");
    const fragment = utcTimestamp(since) as unknown as SqlLike;
    expect(fragment.sql).toBe("(?::timestamptz at time zone 'UTC')");
    expect(fragment.values).toEqual([since]);

    for (const load of [loadDailyActivity, loadDailyEmail, (d: Date) => loadTopOrganisationsByRsvps(d), (d: Date) => loadTopOrganisationsByBroadcasts(d)]) {
      mocks.queryRaw.mockClear();
      load(since);
      const [strings, ...values] = mocks.queryRaw.mock.calls[0]! as [TemplateStringsArray, ...unknown[]];
      expect(strings.join("?")).not.toMatch(/now\(\)/i);
      const windows = values.filter((value) => typeof value === "object" && value !== null && "sql" in value) as SqlLike[];
      expect(windows.length).toBeGreaterThan(0);
      for (const window of windows) expect(window.sql).toContain("at time zone 'UTC'");
      expect(values).not.toContain(since);
    }
  });

  it("caps the top-organisation limits", () => {
    mocks.queryRaw.mockClear();
    loadTopOrganisationsByRsvps(new Date(), 10_000);
    const values = mocks.queryRaw.mock.calls[0]!.slice(1);
    expect(values).toContain(50);
  });
});

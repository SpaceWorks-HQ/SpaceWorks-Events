import { describe, expect, it } from "vitest";
import { filterTeam, firstName, roleBreakdown, roleDots, type TeamMemberRow } from "@/components/members/memberSummary";

const row = (overrides: Partial<TeamMemberRow>): TeamMemberRow => ({
  id: "m",
  userId: "u",
  name: "Someone",
  role: "MEMBER",
  joinedLabel: "Mar 2025",
  isYou: false,
  ...overrides,
});

describe("member summary helpers", () => {
  it("describes the role mix, skipping empty roles", () => {
    expect(roleBreakdown({ OWNER: 1, ADMIN: 2, MEMBER: 3 })).toBe("1 owner · 2 admins · 3 members");
    expect(roleBreakdown({ OWNER: 1, ADMIN: 0, MEMBER: 1 })).toBe("1 owner · 1 member");
  });

  it("draws one dot per person up to the cap, ordered by role", () => {
    expect(roleDots({ OWNER: 1, ADMIN: 2, MEMBER: 3 })).toEqual(["OWNER", "ADMIN", "ADMIN", "MEMBER", "MEMBER", "MEMBER"]);
    const capped = roleDots({ OWNER: 1, ADMIN: 4, MEMBER: 195 }, 24);
    expect(capped).toHaveLength(24);
    expect(capped[0]).toBe("OWNER");
    expect(capped.filter((r) => r === "ADMIN").length).toBeGreaterThanOrEqual(1);
    expect(roleDots({ OWNER: 0, ADMIN: 0, MEMBER: 0 })).toEqual([]);
  });

  it("filters by tab and searches email only when it was sent", () => {
    const rows = [
      row({ id: "1", name: "Anand Nair", role: "OWNER", email: "anand@example.org" }),
      row({ id: "2", name: "Riya Kapoor", role: "ADMIN", email: "riya@example.org" }),
      row({ id: "3", name: "Jo Thomas", role: "MEMBER" }),
    ];
    expect(filterTeam(rows, "admins", "").map((r) => r.id)).toEqual(["1", "2"]);
    expect(filterTeam(rows, "members", "").map((r) => r.id)).toEqual(["3"]);
    expect(filterTeam(rows, "everyone", "RIYA@").map((r) => r.id)).toEqual(["2"]);
    expect(filterTeam(rows, "everyone", "thomas").map((r) => r.id)).toEqual(["3"]);
    expect(filterTeam(rows.map((r) => ({ ...r, email: undefined })), "everyone", "example.org")).toEqual([]);
  });

  it("takes the first name for hints", () => {
    expect(firstName("  Priya L. ")).toBe("Priya");
    expect(firstName(null)).toBeNull();
  });
});

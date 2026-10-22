import { describe, expect, it } from "vitest";
import { EventPrivacyType, EventStatus } from "@prisma/client";
import { isEventPublished, shouldIndexPublicEvent } from "@/lib/eventVisibility";
import { slugifyTitle, withSlugSuffix } from "@/lib/slug";
import { gateCheckInForStatus } from "@/lib/checkIn";

describe("public visibility and identifier utilities", () => {
  it("indexes only published public events", () => {
    expect(shouldIndexPublicEvent(EventStatus.PUBLISHED, EventPrivacyType.PUBLIC)).toBe(true);
    expect(shouldIndexPublicEvent(EventStatus.PUBLISHED, EventPrivacyType.HIDDEN_LINK)).toBe(false);
    expect(isEventPublished(EventStatus.DRAFT)).toBe(false);
  });
  it("creates bounded event slugs", () => {
    expect(slugifyTitle("  Hello, Secure World! ")).toBe("hello-secure-world");
    expect(withSlugSuffix("event", 3)).toBe("event-3");
  });
  it("blocks rejected and pending-approval check-ins, while allowing an explicit waitlist override", () => {
    expect(gateCheckInForStatus("REJECTED", false).ok).toBe(false);
    expect(gateCheckInForStatus("WAITLISTED", false)).toMatchObject({ ok: false, needsForce: true });
    expect(gateCheckInForStatus("WAITLISTED", true).ok).toBe(true);
    expect(gateCheckInForStatus("PENDING_APPROVAL", false)).toMatchObject({ ok: false, blocked: true });
    expect(gateCheckInForStatus("PENDING_APPROVAL", true)).toMatchObject({ ok: false, blocked: true });
    // An unpaid ticket shows "Payment pending" at the desk and can't be overridden.
    expect(gateCheckInForStatus("PENDING_PAYMENT", true)).toMatchObject({ ok: false, blocked: true, reason: expect.stringContaining("Payment pending") });
  });
});

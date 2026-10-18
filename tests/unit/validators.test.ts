import { describe, expect, it } from "vitest";
import {
  createEventSchema,
  deleteRsvpSchema,
  restoreRsvpSchema,
  rsvpGuestSchema,
  updateOrganisationSchema,
  updateRsvpRegistrationSchema,
  rsvpTransitionSchema,
} from "@/lib/validators";

describe("RSVP validation", () => {
  it("requires exactly one RSVP target when deleting", () => {
    const base = { organisationSlug: "demo", rsvpId: "rsvp_1" };

    expect(
      deleteRsvpSchema.safeParse({ ...base, eventId: "event_1" }).success,
    ).toBe(true);
    expect(
      deleteRsvpSchema.safeParse({ ...base, eventInstanceId: "instance_1" })
        .success,
    ).toBe(true);
    expect(deleteRsvpSchema.safeParse(base).success).toBe(false);
    expect(
      deleteRsvpSchema.safeParse({
        ...base,
        eventId: "event_1",
        eventInstanceId: "instance_1",
      }).success,
    ).toBe(false);
  });

  it("does not accept client supplied RSVP data for undo", () => {
    expect(
      restoreRsvpSchema.safeParse({
        organisationSlug: "demo",
        undoId: "undo_1",
      }).success,
    ).toBe(true);
    expect(
      restoreRsvpSchema.safeParse({
        organisationSlug: "demo",
        rsvpId: "rsvp_1",
      }).success,
    ).toBe(false);
  });

  it("normalizes guest email input and requires an event target", () => {
    const result = rsvpGuestSchema.parse({
      orgSlug: "demo",
      eventSlug: "launch-night",
      guestEmail: "  guest@example.com ",
      name: "Jamie",
    });
    expect(result.guestEmail).toBe("guest@example.com");
    expect(
      rsvpGuestSchema.safeParse({
        guestEmail: "guest@example.com",
        name: "Jamie",
        orgSlug: "demo",
      }).success,
    ).toBe(false);
    expect(
      rsvpGuestSchema.safeParse({
        orgSlug: "demo",
        eventSlug: "event",
        eventInstanceId: "instance",
        guestEmail: "guest@example.com",
        name: "Jamie",
      }).success,
    ).toBe(false);
  });

  it("requires exactly one target for lifecycle transitions", () => {
    const base = { organisationSlug: "demo", rsvpId: "rsvp_1" };
    expect(
      rsvpTransitionSchema.safeParse({ ...base, eventId: "event_1" }).success,
    ).toBe(true);
    expect(
      rsvpTransitionSchema.safeParse({ ...base, eventInstanceId: "instance_1" })
        .success,
    ).toBe(true);
    expect(
      rsvpTransitionSchema.safeParse({
        ...base,
        eventId: "event_1",
        eventInstanceId: "instance_1",
      }).success,
    ).toBe(false);
  });

  it("requires exactly one target when editing a registration", () => {
    const base = { organisationSlug: "demo", rsvpId: "rsvp_1", answers: {} };
    expect(
      updateRsvpRegistrationSchema.safeParse({ ...base, eventId: "event_1" })
        .success,
    ).toBe(true);
    expect(
      updateRsvpRegistrationSchema.safeParse({
        ...base,
        eventInstanceId: "instance_1",
      }).success,
    ).toBe(true);
    expect(
      updateRsvpRegistrationSchema.safeParse({
        ...base,
        eventId: "event_1",
        eventInstanceId: "instance_1",
      }).success,
    ).toBe(false);
  });
});

describe("event validation", () => {
  // A fixed time of day one year ahead, so these tests never fall into the past.
  const futureDay = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const baseEvent = {
    organisationSlug: "demo",
    title: "Launch night",
    description: "A useful description.",
    aboutHtml: "<p>A useful description.</p>",
    startDateTime: `${futureDay}T18:00:00.000Z`,
    endDateTime: `${futureDay}T20:00:00.000Z`,
    timezone: "UTC",
    isOnline: false,
    location: "Main auditorium",
  };

  it("rejects an event that ends before it begins", () => {
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        endDateTime: `${futureDay}T17:00:00.000Z`,
      }).success,
    ).toBe(false);
  });

  it("rejects past starts and invalid event locations", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(
      createEventSchema.safeParse({ ...baseEvent, startDateTime: past })
        .success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...baseEvent, location: "x" }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        isOnline: true,
        location: "not a URL",
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        isOnline: true,
        location: "https://meet.example.test/demo",
      }).success,
    ).toBe(true);
  });

  it("deduplicates and normalizes event tags", () => {
    const result = createEventSchema.parse({
      ...baseEvent,
      tags: " Design, design\nCommunity ",
    });
    expect(result.tags).toEqual(["design", "community"]);
  });

  it("accepts IANA timezones and rejects invalid timezone identifiers", () => {
    expect(
      createEventSchema.safeParse({ ...baseEvent, timezone: "Asia/Kolkata" })
        .success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        timezone: "Definitely/Not_A_Zone",
      }).success,
    ).toBe(false);
  });

  it("allows uploaded managed images only", () => {
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        mapLinkUrl: "https://maps.example.test/place",
      }).success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        coverImageUrl: "/api/uploads/image-id",
      }).success,
    ).toBe(true);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        mapLinkUrl: "javascript:alert(1)",
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        coverImageUrl: "data:text/html,unsafe",
      }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({
        ...baseEvent,
        coverImageUrl: "https://images.example.test/cover.png",
      }).success,
    ).toBe(false);
    expect(
      updateOrganisationSchema.safeParse({
        name: "Demo",
        slug: "demo",
        organisationSlug: "demo",
        logoUrl:
          "/api/uploads/organisations/org_1/organisation-logos/image.webp",
      }).success,
    ).toBe(true);
    expect(
      updateOrganisationSchema.safeParse({
        name: "Demo",
        slug: "demo",
        organisationSlug: "demo",
        logoUrl: "https://images.example.test/logo.png",
      }).success,
    ).toBe(false);
  });

  it("requires the About content field while keeping the derived description optional", () => {
    expect(
      createEventSchema.safeParse({ ...baseEvent, aboutHtml: undefined }).success,
    ).toBe(false);
    expect(
      createEventSchema.safeParse({ ...baseEvent, description: "" }).success,
    ).toBe(true);
    expect(createEventSchema.safeParse(baseEvent).success).toBe(true);
  });
});

describe("attendee name validation", () => {
  it("rejects numeric-only and markup guest names while accepting ordinary names", () => {
    const base = {
      orgSlug: "demo",
      eventSlug: "launch-night",
      guestEmail: "guest@example.com",
    };
    expect(rsvpGuestSchema.safeParse({ ...base, name: "123456" }).success).toBe(
      false,
    );
    expect(
      rsvpGuestSchema.safeParse({ ...base, name: "Asha 123" }).success,
    ).toBe(true);
    expect(
      rsvpGuestSchema.safeParse({ ...base, name: "<script>alert(1)</script>" })
        .success,
    ).toBe(false);
  });
});

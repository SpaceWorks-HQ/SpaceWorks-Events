import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ org: vi.fn(), event: vi.fn(), page: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    organisation: { findUnique: mocks.org },
    event: { findUnique: mocks.event },
    eventPage: { findUnique: mocks.page },
  },
}));
vi.mock("@/lib/auth", () => ({ auth: vi.fn() }));
vi.mock("@/lib/publicEventAccess", () => ({ resolvePublicEventAccess: vi.fn() }));
vi.mock("@/components/event/EventWebsiteShell", () => ({ EventWebsiteShell: () => null }));

import { generateMetadata } from "@/app/[orgSlug]/[eventSlug]/page";

const event = {
  id: "event_1",
  slug: "launch",
  title: "Launch",
  description: "A launch night.",
  status: "PUBLISHED",
  privacyType: "PUBLIC",
  listedPublicly: false,
  coverImageUrl: null as string | null,
};
const params = Promise.resolve({ orgSlug: "community", eventSlug: "launch" });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.org.mockResolvedValue({ id: "org_1", slug: "community" });
  mocks.page.mockResolvedValue({ isPublished: true });
});

describe("event page metadata", () => {
  it("leaves Open Graph images to the generated share card when there is no cover", async () => {
    mocks.event.mockResolvedValue(event);
    const metadata = await generateMetadata({ params });
    expect(metadata.openGraph).toBeDefined();
    // An `images` key, even undefined, replaces the file-based opengraph-image.
    expect(Object.keys(metadata.openGraph ?? {})).not.toContain("images");
  });

  it("uses the cover image when the event has one", async () => {
    mocks.event.mockResolvedValue({ ...event, coverImageUrl: "/api/uploads/cover.webp" });
    const metadata = await generateMetadata({ params });
    expect(metadata.openGraph).toMatchObject({ images: [{ url: "/api/uploads/cover.webp" }] });
  });
});

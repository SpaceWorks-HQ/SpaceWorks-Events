import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { EventPrivacyType, EventStatus, MembershipRole, PrismaClient } from "@prisma/client";
import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
const prisma = new PrismaClient();
const suffix = randomUUID().replaceAll("-", "");
const orgSlug = `short-links-${suffix}`;
const eventSlug = `short-link-event-${suffix}`;
// Hex suffixes are lowercase, so a leading capital gives each code the shape
// of a real short code while keeping it unique to this run.
const publishedCode = `Q${suffix.slice(0, 6)}`;
const draftCode = `D${suffix.slice(0, 6)}`;
const unknownCode = `Z${suffix.slice(0, 6)}`;
const managedSlug = `managed-${suffix}`;
const password = "short-link-browser-password";
const ownerEmail = `short-owner-${suffix}@example.test`;
const memberEmail = `short-member-${suffix}@example.test`;
const SHORT_CODE = /^(?=.*[A-Z])[A-Za-z0-9]{7}$/;
let organisationId = "";
let managedEventId = "";
const userIds: string[] = [];

function eventData(slug: string, shortCode: string | null, status: EventStatus) {
  return {
    organisationId,
    title: `Short link ${slug}`,
    slug,
    shortCode,
    startDateTime: new Date("2035-01-01T10:00:00.000Z"),
    endDateTime: new Date("2035-01-01T12:00:00.000Z"),
    timezone: "UTC",
    status,
    privacyType: EventPrivacyType.PUBLIC,
    page: { create: { isPublished: true } },
  };
}

test.beforeAll(async () => {
  const organisation = await prisma.organisation.create({ data: { name: `Short links ${suffix}`, slug: orgSlug } });
  organisationId = organisation.id;
  await prisma.event.create({ data: eventData(eventSlug, publishedCode, EventStatus.PUBLISHED) });
  await prisma.event.create({ data: eventData(`draft-${suffix}`, draftCode, EventStatus.DRAFT) });
  managedEventId = (await prisma.event.create({ data: eventData(managedSlug, null, EventStatus.PUBLISHED) })).id;
  const passwordHash = await bcrypt.hash(password, 12);
  for (const [email, role] of [[ownerEmail, MembershipRole.OWNER], [memberEmail, MembershipRole.MEMBER]] as const) {
    const user = await prisma.user.create({
      data: { email, name: `Short link ${role.toLowerCase()}`, passwordHash, emailVerified: new Date(), memberships: { create: { organisationId, role } } },
    });
    userIds.push(user.id);
  }
});

test.afterAll(async () => {
  if (organisationId) await prisma.organisation.delete({ where: { id: organisationId } });
  if (userIds.length) await prisma.user.deleteMany({ where: { id: { in: userIds } } });
  await prisma.$disconnect();
});

test("a published event's short code temporarily redirects to its canonical page", async ({ request }) => {
  const response = await request.get(`/${publishedCode}`, { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe(`/${orgSlug}/${eventSlug}`);

  const followed = await request.get(`/${publishedCode}`);
  expect(followed.status()).toBe(200);
  expect(new URL(followed.url()).pathname).toBe(`/${orgSlug}/${eventSlug}`);
});

test("unknown and unpublished codes are an ordinary not-found", async ({ request }) => {
  for (const code of [unknownCode, draftCode]) {
    const response = await request.get(`/${code}`, { maxRedirects: 0 });
    expect(response.status(), code).toBe(404);
    expect(await response.text(), code).not.toContain(`draft-${suffix}`);
  }
});

async function signIn(page: Page, email: string, ip: string) {
  await page.context().setExtraHTTPHeaders({ "cf-connecting-ip": ip });
  // Settle the Auth.js CSRF cookie first: on a fresh context the login page's
  // parallel /api/auth requests can each mint one, and a lost race fails the
  // first sign-in with MissingCSRF.
  await page.request.get("/api/auth/csrf");
  await page.goto("/login?callbackUrl=%2Fdashboard");
  await page.getByRole("textbox", { name: /^Email/ }).fill(email);
  await page.locator('input[type="password"]:visible').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await page.goto(`/dashboard/${orgSlug}/event/${managedEventId}`);
  return shareCard(page);
}

// By role, so React's hidden streaming placeholder copy is never matched.
const shareCard = (page: Page) => page.getByRole("region", { name: "Share" });

/** The full short URL shown in the Share card, and its code. */
async function shownShortLink(page: Page) {
  const url = await shareCard(page).locator("p[title]").last().getAttribute("title");
  const code = new URL(url!).pathname.slice(1);
  return { url: url!, code };
}

async function expectRedirect(page: Page, code: string) {
  const response = await page.request.get(`/${code}`, { maxRedirects: 0 });
  expect(response.status(), code).toBe(307);
  expect(new URL(response.headers().location, "http://localhost").pathname).toBe(`/${orgSlug}/${managedSlug}`);
}

test("a member cannot create a short link that does not exist yet", async ({ page }) => {
  const share = await signIn(page, memberEmail, "192.0.2.241");
  await expect(share.getByRole("heading", { name: "Share" })).toBeVisible();
  await expect(share.getByRole("button", { name: "Create short link" })).toHaveCount(0);
  await expect(share.getByText("Short link", { exact: true })).toHaveCount(0);
});

test("an owner creates, copies, and regenerates the event's short link", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const share = await signIn(page, ownerEmail, "192.0.2.242");

  await share.getByRole("button", { name: "Create short link" }).click();
  await expect(share.getByText("Short link", { exact: true })).toBeVisible();
  const first = await shownShortLink(page);
  expect(first.code).toMatch(SHORT_CODE);
  await expectRedirect(page, first.code);

  await share.getByRole("button", { name: /^Copy the short link to / }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(first.url);

  await page.reload();
  expect((await shownShortLink(page)).code).toBe(first.code);

  await share.getByRole("button", { name: /^Regenerate the short link to / }).click();
  const dialog = page.getByRole("alertdialog", { name: "Regenerate short link?" });
  await expect(dialog).toContainText("The old short link will stop working");
  await dialog.getByRole("button", { name: "Regenerate" }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await shownShortLink(page)).code).not.toBe(first.code);
  const second = await shownShortLink(page);
  expect(second.code).toMatch(SHORT_CODE);

  expect((await page.request.get(`/${first.code}`, { maxRedirects: 0 })).status()).toBe(404);
  await expectRedirect(page, second.code);

  await page.reload();
  expect((await shownShortLink(page)).code).toBe(second.code);
});

test("a member sees and copies an existing short link but cannot regenerate it", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  const share = await signIn(page, memberEmail, "192.0.2.243");
  const { code } = await prisma.event.findUniqueOrThrow({ where: { id: managedEventId }, select: { shortCode: true } }).then((event) => ({ code: event.shortCode }));
  expect(code).toMatch(SHORT_CODE);
  const shown = await shownShortLink(page);
  expect(shown.code).toBe(code);

  await share.getByRole("button", { name: /^Copy the short link to / }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe(shown.url);
  await expect(share.getByRole("button", { name: /Regenerate/ })).toHaveCount(0);
  await expect(share.getByRole("button", { name: "Create short link" })).toHaveCount(0);
});

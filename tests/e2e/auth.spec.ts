import { createCipheriv, createHash, randomBytes, randomUUID } from "node:crypto";
import * as OTPAuth from "otpauth";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { expect, test } from "@playwright/test";

const prisma = new PrismaClient();
const suffix = randomUUID();
const email = `auth-${suffix}@example.test`;
const password = "browser-test-password";
let userId: string;

test.beforeAll(async () => {
  const user = await prisma.user.create({ data: { email, name: "Auth browser test", passwordHash: await bcrypt.hash(password, 12), emailVerified: new Date() } });
  userId = user.id;
});
test.afterAll(async () => {
  if (userId) {
    await prisma.verificationToken.deleteMany({ where: { identifier: { in: [`reset:${email}`, `email-verification:${userId}`, `mfa:${userId}`] } } });
    await prisma.user.deleteMany({ where: { id: userId } });
  }
  await prisma.$disconnect();
});

test("login rejects bad credentials, honors local return paths, and clears revoked sessions", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.231" });
  await page.goto("/login?callbackUrl=%2Faccount%2Fsecurity");
  await page.getByRole("textbox", { name: /^Email/ }).fill(email);
  await page.locator('input[type="password"]:visible').fill("incorrect-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid email or password" })).toBeVisible();
  await page.locator('input[type="password"]:visible').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/account\/security$/);
  const cookies = await context.cookies();
  const sessionCookie = cookies.find((cookie) => cookie.name === "yuyu.session-token.v2");
  expect(Boolean(sessionCookie?.httpOnly && sessionCookie.sameSite === "Lax")).toBe(true);
  await prisma.user.update({ where: { id: userId }, data: { sessionVersion: { increment: 1 } } });
  const response = await page.request.get("/api/auth/session");
  expect(await response.json()).toBeNull();
  await page.goto("/account/security");
  await expect(page).toHaveURL(/\/login$/);
});

test("unverified accounts cannot sign in", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.232" });
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });
  try {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /^Email/ }).fill(email);
    await page.locator('input[type="password"]:visible').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resend verification email" })).toBeVisible();
    expect(await (await page.request.get("/api/auth/session")).json()).toBeNull();
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { emailVerified: new Date() } });
  }
});

test("credential callback requires CSRF proof", async ({ request }) => {
  const response = await request.post("/api/auth/callback/credentials", {
    headers: { "cf-connecting-ip": "192.0.2.233" },
    form: { email, password },
    maxRedirects: 0,
  });
  expect(response.headers()["location"]).toContain("MissingCSRF");
  expect(await (await request.get("/api/auth/session")).json()).toBeNull();
});


test("password login challenges for MFA and accepts an authenticator code", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.234" });
  const secret = new OTPAuth.Secret({ size: 20 });
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(process.env.MFA_ENCRYPTION_KEY!, "base64"), iv);
  const encrypted = Buffer.concat([cipher.update(secret.base32, "utf8"), cipher.final()]);
  const stored = ["v1", iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
  await prisma.user.update({ where: { id: userId }, data: { mfaSecretEncrypted: stored, mfaEnabledAt: new Date() } });
  try {
    await page.goto("/login");
    await page.getByRole("textbox", { name: /^Email/ }).fill(email);
    await page.locator('input[type="password"]:visible').fill(password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Verify it's you" })).toBeVisible();
    const otp = new OTPAuth.TOTP({ secret, algorithm: "SHA1", digits: 6, period: 30 });
    await page.getByLabel("Authenticator or recovery code").fill(otp.generate());
    await page.getByRole("button", { name: "Verify and sign in" }).click();
    await expect(page).toHaveURL(/\/dashboard$/);
  } finally {
    await prisma.user.update({ where: { id: userId }, data: { mfaSecretEncrypted: null, mfaEnabledAt: null, sessionVersion: { increment: 1 } } });
  }
});

test("reset links change the password once and revoke sessions", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.235" });
  const token = randomBytes(32).toString("hex");
  await prisma.verificationToken.create({ data: { identifier: `reset:${email}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 60_000) } });
  const before = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true } });
  const resetPath = `/reset-password?email=${encodeURIComponent(email)}&token=${token}`;
  await page.goto(resetPath);
  await page.getByLabel(/^New password/).fill("replacement-browser-password");
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/, { timeout: 10_000 });
  const after = await prisma.user.findUniqueOrThrow({ where: { id: userId }, select: { sessionVersion: true, passwordHash: true } });
  expect(after.sessionVersion).toBe(before.sessionVersion + 1);
  expect(await bcrypt.compare("replacement-browser-password", after.passwordHash!)).toBe(true);
  await page.goto(resetPath);
  await page.getByLabel(/^New password/).fill("another-browser-password");
  await page.getByRole("button", { name: "Save new password", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Invalid or expired reset link" })).toBeVisible();
});

test("email verification activates an account through a single-use confirmation", async ({ page, context }) => {
  await context.setExtraHTTPHeaders({ "cf-connecting-ip": "192.0.2.236" });
  const token = randomBytes(32).toString("hex");
  await prisma.user.update({ where: { id: userId }, data: { emailVerified: null } });
  await prisma.verificationToken.create({ data: { identifier: `email-verification:${userId}`, token: createHash("sha256").update(token).digest("hex"), expires: new Date(Date.now() + 60_000) } });
  const path = `/verify-email?token=${token}`;
  await page.goto(path);
  await page.getByRole("button", { name: "Confirm email", exact: true }).click();
  await expect(page).toHaveURL(/\/login\?verified=1$/);
  expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).emailVerified).not.toBeNull();
  await page.goto(path);
  await page.getByRole("button", { name: "Confirm email", exact: true }).click();
  await expect(page.getByRole("alert").filter({ hasText: "invalid or has expired" })).toBeVisible();
});

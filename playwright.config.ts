import { defineConfig, devices } from "@playwright/test";

const testPort = Number(process.env.PLAYWRIGHT_PORT || 3000);
const testBaseUrl = `http://127.0.0.1:${testPort}`;
const productionServer = process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1";
const defaultServerCommand = productionServer
  ? `PORT=${testPort} node .next/standalone/server.js`
  : `PORT=${testPort} npm run dev`;
// The payment specs drive a local fake Razorpay/Stripe. The app refuses that
// override in production, so it is strictly opt-in for development servers
// (PLAYWRIGHT_FAKE_PAYMENTS=1); every other run skips those specs.
const fakePayments = process.env.PLAYWRIGHT_FAKE_PAYMENTS === "1" && !productionServer;
const fakeProviderPort = Number(process.env.FAKE_PROVIDER_PORT || 4010);
const fakeProviderUrl = `http://127.0.0.1:${fakeProviderPort}`;

export default defineConfig({
  testDir: "./tests/e2e",
  // The ticket scenario seeds one isolated RSVP shared by this file.
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  use: {
    // Use IPv4 explicitly: on this workstation localhost/::1 is served by a
    // separate development app while Space Works Events is bound on 127.0.0.1.
    baseURL: testBaseUrl,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    {
      command: process.env.PLAYWRIGHT_SERVER_COMMAND || defaultServerCommand,
      url: `${testBaseUrl}/api/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
      // Fresh browsers sign in seeded staff: the sign-in protections have their own unit and integration tests.
      env: { STAFF_MFA_REQUIRED: "false", LOGIN_NEW_DEVICE_CHECK: "false", PWNED_PASSWORDS_CHECK: "false", ...(fakePayments ? { PAYMENTS_FAKE_PROVIDER_URL: fakeProviderUrl } : {}) },
    },
    ...(!fakePayments ? [] : [{
      command: `node tests/e2e/fake-payment-provider.mjs`,
      url: `${fakeProviderUrl}/health`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: { FAKE_PROVIDER_PORT: String(fakeProviderPort) },
    }]),
  ],
});

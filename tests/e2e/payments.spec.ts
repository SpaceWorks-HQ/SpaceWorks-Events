import { test } from "@playwright/test";
import { setUpPaymentsSuite } from "./helpers/payments";
import { paymentCheckoutTests } from "./helpers/payments-checkout";
import { paymentSetupTests } from "./helpers/payments-setup";
import { paymentTicketOptionTests } from "./helpers/payments-ticket-options";

// Drives a local fake Razorpay (tests/e2e/fake-payment-provider.mjs) against a
// development server. The app refuses PAYMENTS_FAKE_PROVIDER_URL in
// production, so this runs only with PLAYWRIGHT_FAKE_PAYMENTS=1.
test.skip(process.env.PLAYWRIGHT_FAKE_PAYMENTS !== "1" || process.env.PLAYWRIGHT_PRODUCTION_SERVER === "1", "Set PLAYWRIGHT_FAKE_PAYMENTS=1 with a development server.");
// Keys and webhook secrets must never be captured in trace artifacts.
test.use({ trace: "off" });
test.describe.configure({ mode: "serial", timeout: 180_000 });

setUpPaymentsSuite();
// The tests run in this order and build on each other: settings, then purchases, then other ticket options.
paymentSetupTests();
paymentCheckoutTests();
paymentTicketOptionTests();

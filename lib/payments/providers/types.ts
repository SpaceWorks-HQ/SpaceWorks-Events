/**
 * The payment provider seam. Razorpay (Payment Links) and Stripe (Checkout
 * Sessions) sit behind it; event, ticket and refund code never learns which
 * one is in use. Rules every provider keeps:
 *
 * - Hosted checkout only: the platform never sees card, UPI or bank details.
 * - Amounts are integer minor units (bigint); currencies are uppercase ISO.
 * - Every failure is a PaymentsUnavailable, never a vendor-shaped exception.
 * - Webhooks are verified over the raw body before anything is parsed.
 */

export type RefundState = "PENDING" | "SUCCEEDED" | "FAILED";

export type CheckoutRequest = {
  /** Our Payment id, echoed back so settlement never trusts payer input. */
  reference: string;
  amountMinor: bigint;
  currency: string;
  /** Event and ticket names only; no attendee details. */
  description: string;
  /** Where the provider sends the attendee after paying. */
  returnUrl: string;
  /** Where the provider sends the attendee if they leave the page (Stripe). */
  cancelUrl: string;
  /** When the seat hold ends; the provider page expires no earlier than its minimum. */
  expiresAt: Date;
  customerEmail?: string;
  idempotencyKey: string;
};

export type CheckoutResult = { checkoutId: string; checkoutUrl: string; };

export type CheckoutStatus =
  | { state: "open"; }
  | { state: "closed"; }
  | { state: "paid"; paymentId: string; amountMinor: bigint | null; currency: string | null; };

export type RefundRequest = {
  /** The provider's captured payment id (Razorpay pay_…, Stripe pi_…). */
  paymentId: string;
  amountMinor: bigint;
  currency: string;
  /** Our PaymentRefund id, echoed on refund webhooks. */
  reference: string;
  idempotencyKey: string;
};

export type RefundResult = { refundId: string; state: RefundState; };

export interface PaymentGateway {
  /** A cheap authenticated read that proves the keys work. */
  testConnection(): Promise<void>;
  createCheckout(request: CheckoutRequest): Promise<CheckoutResult>;
  getCheckoutStatus(checkoutId: string): Promise<CheckoutStatus>;
  /**
   * Close an open checkout so it can no longer be paid. Returns the state
   * afterwards: "closed" once cancelled or expired, "paid" when the attendee
   * paid first. Throws PaymentsUnavailable when the outcome is unknown.
   */
  cancelCheckout(checkoutId: string): Promise<CheckoutStatus>;
  createRefund(request: RefundRequest): Promise<RefundResult>;
}

export type PaidNotification = {
  checkoutId: string | null;
  reference: string | null;
  paymentId: string;
  amountMinor: bigint | null;
  currency: string | null;
};

export type RefundNotification = {
  refundId: string;
  paymentId: string | null;
  reference: string | null;
  state: RefundState;
  amountMinor: bigint | null;
};

/** A verified, provider-neutral webhook. Anything not listed is ignored. */
export type VerifiedWebhookEvent = {
  eventId: string;
  eventType: string;
  paid: PaidNotification | null;
  refunds: RefundNotification[];
};

/** The request did not carry a signature this provider accepts. Never settle it. */
export class WebhookVerificationError extends Error {
  constructor() {
    super("Webhook signature verification failed.");
    this.name = "WebhookVerificationError";
  }
}

/** Provider object ids are interpolated into API paths, so they must be plain tokens. */
export function isProviderId(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_]{3,255}$/.test(value);
}

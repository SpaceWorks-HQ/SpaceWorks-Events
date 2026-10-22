import { handleProviderWebhook, settleWebhookEvent } from "@/lib/payments/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Stripe settlement notifications, verified with the addressed organisation's own secret. */
export async function POST(request: Request, context: { params: Promise<{ webhookPathId: string; }>; }) {
  return handleProviderWebhook(request, "STRIPE", (await context.params).webhookPathId, settleWebhookEvent);
}

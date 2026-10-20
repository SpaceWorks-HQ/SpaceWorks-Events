import { handleProviderWebhook } from "@/lib/payments/webhooks";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Razorpay settlement notifications, verified with the addressed organisation's own secret. */
export async function POST(request: Request, context: { params: Promise<{ webhookPathId: string; }>; }) {
  return handleProviderWebhook(request, "RAZORPAY", (await context.params).webhookPathId);
}

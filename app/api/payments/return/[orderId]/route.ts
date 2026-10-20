import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { verifyPaymentReturn } from "@/lib/payments/returnLink";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEADERS = { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" };

/**
 * Where Razorpay and Stripe send the buyer after checkout. The signed,
 * expiring link keeps the order's access token out of the provider's
 * systems; it redirects to the order page, which confirms the payment.
 */
export async function GET(request: Request, context: { params: Promise<{ orderId: string; }>; }) {
  const { orderId } = await context.params;
  const url = new URL(request.url);
  if (!verifyPaymentReturn(orderId, url.searchParams.get("e"), url.searchParams.get("s"))) {
    return new NextResponse("Not found", { status: 404, headers: HEADERS });
  }
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { accessToken: true } });
  if (!order) return new NextResponse("Not found", { status: 404, headers: HEADERS });
  return new NextResponse(null, { status: 303, headers: { ...HEADERS, Location: `/order/${order.accessToken}?payment=return` } });
}

import { prisma } from "@/lib/db";
import { parseOrderToken, payNowResponse } from "@/lib/payments/payNow";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "Pay now" on the buyer's order page. */
export async function POST(request: Request, context: { params: Promise<{ token: string; }>; }) {
  const token = parseOrderToken((await context.params).token);
  const order = token ? await prisma.order.findUnique({ where: { accessToken: token }, select: { id: true } }) : null;
  return payNowResponse(request, order?.id ?? null);
}

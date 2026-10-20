import { prisma } from "@/lib/db";
import { payNowResponse } from "@/lib/payments/payNow";
import { parseTicketToken } from "@/lib/ticketCheckInState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** "Pay now" on a held ticket: pays its whole order. */
export async function POST(request: Request, context: { params: Promise<{ token: string; }>; }) {
  const token = parseTicketToken((await context.params).token);
  const rsvp = token ? await prisma.rSVP.findUnique({ where: { checkInToken: token }, select: { orderId: true } }) : null;
  return payNowResponse(request, rsvp?.orderId ?? null);
}

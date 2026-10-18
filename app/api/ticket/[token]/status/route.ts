import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import {
  emptyTicketResponse,
  findTicketCheckIn,
  parseTicketToken,
  TICKET_STATE_BASE_HEADERS,
  toTicketCheckInState,
} from "@/lib/ticketCheckInState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public, bearer-token check-in state for one ticket. Deliberately returns
 * only `{ checkedIn, checkedInAt }` so a leaked link reveals nothing else.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = parseTicketToken((await context.params).token);
  if (!token) return emptyTicketResponse(404);
  if (!(await checkRateLimitById("ticketStatus", `ip:${getClientIpFromHeaders(request.headers)}`))) {
    return emptyTicketResponse(429);
  }

  const ticket = await findTicketCheckIn(token);
  if (!ticket) return emptyTicketResponse(404);

  return Response.json(toTicketCheckInState(ticket.checkedInAt), { headers: TICKET_STATE_BASE_HEADERS });
}

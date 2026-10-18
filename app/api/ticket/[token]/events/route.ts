import { prisma } from "@/lib/db";
import { checkRateLimitById, getClientIpFromHeaders } from "@/lib/rateLimit";
import { subscribeTicketCheckedIn, type TicketCheckInUnsubscribe } from "@/lib/ticketCheckInEvents";
import {
  emptyTicketResponse,
  findTicketCheckIn,
  parseTicketToken,
  TICKET_STATE_BASE_HEADERS,
  toTicketCheckInState,
} from "@/lib/ticketCheckInState";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const HEARTBEAT_MS = 25_000;
/** Bounded lifetime; EventSource reconnects and re-reads the current state. */
const MAX_STREAM_MS = 10 * 60_000;
const SUBSCRIBE_WAIT_MS = 2_000;
/** Per-process ceiling on open ticket streams to bound memory and sockets. */
const MAX_OPEN_STREAMS = 5_000;

const SSE_HEADERS = {
  ...TICKET_STATE_BASE_HEADERS,
  "Content-Type": "text/event-stream; charset=utf-8",
  "Cache-Control": "no-store, no-transform",
  "X-Accel-Buffering": "no",
  Connection: "keep-alive",
} as const;

let openStreams = 0;

function frame(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

/**
 * Server-Sent Events for one ticket: an initial `state`, then a single
 * `checked-in` event when the attendee is admitted, then the stream closes.
 * The bearer token is used only for the initial lookup; subscriptions are
 * keyed by RSVP id.
 */
export async function GET(request: Request, context: { params: Promise<{ token: string }> }) {
  const token = parseTicketToken((await context.params).token);
  if (!token) return emptyTicketResponse(404);
  if (!(await checkRateLimitById("ticketEvents", `ip:${getClientIpFromHeaders(request.headers)}`))) {
    return emptyTicketResponse(429);
  }

  const ticket = await findTicketCheckIn(token);
  if (!ticket) return emptyTicketResponse(404);

  const encoder = new TextEncoder();

  if (ticket.checkedInAt) {
    const body = encoder.encode(frame("state", toTicketCheckInState(ticket.checkedInAt)));
    return new Response(body, { headers: SSE_HEADERS });
  }

  if (openStreams >= MAX_OPEN_STREAMS) return emptyTicketResponse(503);

  const { rsvpId } = ticket;
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      openStreams += 1;
      let closed = false;
      let initialSent = false;
      let pendingCheckedInAt: string | null = null;
      let unsubscribe: TicketCheckInUnsubscribe | null = null;
      let heartbeat: ReturnType<typeof setInterval> | undefined = undefined;
      let lifetime: ReturnType<typeof setTimeout> | undefined = undefined;

      const close = () => {
        if (closed) return;
        closed = true;
        openStreams -= 1;
        clearInterval(heartbeat);
        clearTimeout(lifetime);
        request.signal.removeEventListener("abort", close);
        unsubscribe?.();
        unsubscribe = null;
        try {
          controller.close();
        } catch {
          // Already closed or cancelled by the client.
        }
      };
      cleanup = close;

      const send = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          close();
        }
      };

      if (request.signal.aborted) return close();
      request.signal.addEventListener("abort", close, { once: true });

      // Subscribe before reading state so a check-in that commits in between
      // is still delivered.
      unsubscribe = subscribeTicketCheckedIn(rsvpId, ({ checkedInAt }) => {
        if (closed) return;
        if (!initialSent) {
          pendingCheckedInAt = checkedInAt;
          return;
        }
        send(frame("checked-in", { checkedInAt }));
        close();
      });

      try {
        let waitTimer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          unsubscribe.ready,
          new Promise<void>((resolve) => {
            waitTimer = setTimeout(resolve, SUBSCRIBE_WAIT_MS);
          }),
        ]);
        clearTimeout(waitTimer);
        if (closed) return;

        const current = await prisma.rSVP.findUnique({ where: { id: rsvpId }, select: { checkedInAt: true } });
        if (closed) return;
        if (!current) return close();

        send(frame("state", toTicketCheckInState(current.checkedInAt)));
        initialSent = true;
        if (current.checkedInAt) return close();
        if (pendingCheckedInAt) {
          send(frame("checked-in", { checkedInAt: pendingCheckedInAt }));
          return close();
        }
      } catch {
        console.warn("[ticket-events] could not read ticket state");
        return close();
      }

      heartbeat = setInterval(() => send(": ping\n\n"), HEARTBEAT_MS);
      lifetime = setTimeout(close, MAX_STREAM_MS);
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, { headers: SSE_HEADERS });
}

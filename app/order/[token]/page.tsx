import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft, Check } from "lucide-react";
import { AttendeeDetailsForm, ConfirmingPayment, HoldCountdown, PayNowButton } from "@/components/orders/OrderClient";
import { Button } from "@/components/ui/button";
import { Callout, Chip } from "@/components/ui/display";
import { formatDayShort, formatTime } from "@/lib/format/datetime";
import { loadOrderView, loadRouteMetadata } from "@/lib/views/app__order__token__page";

type Props = {
  params: Promise<{ token: string; }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> { return loadRouteMetadata(); }

const STATUS: Record<string, { label: string; tone: "success" | "warning" | "neutral"; }> = {
  PENDING: { label: "Awaiting payment", tone: "warning" },
  CONFIRMED: { label: "Confirmed", tone: "success" },
  EXPIRED: { label: "Released", tone: "neutral" },
  CANCELLED: { label: "Cancelled", tone: "neutral" },
};

export default async function OrderPage({ params, searchParams }: Props) {
  const order = await loadOrderView({ params, searchParams });
  const status = STATUS[order.status] ?? STATUS.PENDING!;
  return (
    <div className="mx-auto flex w-full max-w-[560px] flex-col gap-5 py-2 sm:py-6">
      {order.event ? (
        <Link href={order.event.href} className="inline-flex min-h-10 items-center gap-1.5 text-[15px] font-semibold text-ink-secondary hover:text-ink">
          <ArrowLeft aria-hidden className="size-4" />
          Event page
        </Link>
      ) : null}
      <header className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <Chip tone={status.tone} icon={order.status === "CONFIRMED" ? <Check /> : undefined}>{status.label}</Chip>
          {order.testMode ? <Chip tone="warning">Test mode</Chip> : null}
        </div>
        <h1 className="text-display-m break-words text-ink">{order.event?.title ?? "Your order"}</h1>
        <p className="text-body-ui text-ink-muted">
          Order {order.reference}
          {order.event ? ` · ${formatDayShort(new Date(order.event.start), order.event.timeZone)} ${formatTime(new Date(order.event.start), order.event.timeZone)} · ${order.event.organisation}` : ""}
        </p>
      </header>

      {order.status === "PENDING" && order.holdActive ? (
        <section className="flex flex-col gap-3">
          {order.returning ? <ConfirmingPayment /> : null}
          {order.holdExpiresAt ? <HoldCountdown expiresAt={order.holdExpiresAt} /> : null}
          {order.canPay ? <PayNowButton endpoint={`/api/orders/${order.token}/checkout`} /> : null}
        </section>
      ) : null}
      {order.status === "EXPIRED" || (order.status === "PENDING" && !order.holdActive) ? (
        <Callout tone="warning">
          The time to pay ran out, so these tickets went back on sale and nothing was charged.{" "}
          {order.event ? <Link href={order.event.href} className="font-semibold underline underline-offset-4">Order again</Link> : null}
        </Callout>
      ) : null}

      <section aria-labelledby="order-lines" className="rounded-xl border border-line bg-panel p-5">
        <h2 id="order-lines" className="sr-only">Order summary</h2>
        <dl className="flex flex-col gap-2">
          {order.lines.map((line) => (
            <div key={line.id} className="flex justify-between gap-3 text-body-ui">
              <dt className="text-ink-secondary">{line.label}</dt>
              <dd className="tabular-nums text-ink">{line.amount}</dd>
            </div>
          ))}
          <div className="mt-1 flex justify-between gap-3 border-t border-line pt-3 font-semibold">
            <dt className="text-ink">Total</dt>
            <dd className="tabular-nums text-ink">{order.free ? "Free" : order.total}</dd>
          </div>
        </dl>
      </section>

      <section aria-labelledby="order-tickets" className="flex flex-col gap-3">
        <h2 id="order-tickets" className="text-h4 text-ink">Tickets</h2>
        {order.tickets.some((ticket) => ticket.needsDetails) ? (
          <Callout tone="info">Add each attendee&apos;s name and email so they get their own ticket.</Callout>
        ) : null}
        <ul className="flex flex-col gap-3">
          {order.tickets.map((ticket) => (
            <li key={ticket.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-line bg-panel p-4">
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-ink">{ticket.label}</p>
                <p className="truncate text-caption text-ink-muted">{ticket.email ? `${ticket.name} · ${ticket.email}` : "No attendee yet"}</p>
              </div>
              {ticket.ticketHref ? (
                <Button asChild size="sm" variant="secondary"><Link href={ticket.ticketHref}>View ticket</Link></Button>
              ) : null}
              {!ticket.checkedIn ? <AttendeeDetailsForm orderToken={order.token} ticket={ticket} fields={order.fields} /> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

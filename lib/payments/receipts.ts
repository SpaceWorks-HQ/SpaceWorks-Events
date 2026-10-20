import "server-only";

import { PaymentRefundStatus, PaymentStatus } from "@prisma/client";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { prisma } from "@/lib/db";
import type { OnlineProvider } from "./http";
import { minorToDecimalString } from "./money";
import { loadPaymentAccount } from "./settings";

const COLLECTED = [PaymentStatus.PAID_ONLINE, PaymentStatus.PAID_OFFLINE];
const OFFLINE_METHODS: Record<string, string> = { CASH: "Cash", UPI: "UPI", BANK_TRANSFER: "Bank transfer", CARD_TERMINAL: "Card terminal", OTHER: "Other" };

/**
 * Ask the provider once how each online payment was made, and keep the
 * answer on the payment. A provider that can't answer now is asked again on
 * the next receipt; the receipt still shows the payment id meanwhile.
 */
async function fillPaymentMethods(organisationId: string, payments: Array<{ id: string; status: PaymentStatus; provider: string; externalPaymentId: string | null; methodType: string | null; }>) {
  for (const payment of payments) {
    if (payment.status !== PaymentStatus.PAID_ONLINE || payment.methodType || !payment.externalPaymentId || payment.provider === "OFFLINE") continue;
    try {
      const account = await loadPaymentAccount(organisationId, payment.provider as OnlineProvider);
      const method = account ? await account.gateway.getPaymentMethod(payment.externalPaymentId) : null;
      if (method) await prisma.payment.update({ where: { id: payment.id }, data: { methodType: method.type, methodSummary: method.summary } });
    } catch {
      // Best effort: the receipt is proof of payment without it.
    }
  }
}

export type Receipt = Awaited<ReturnType<typeof loadReceipt>>;

/** The receipt for a paid order, by its buyer link; null until money has been collected. */
export async function loadReceipt(accessToken: string) {
  const where = { accessToken };
  const first = await prisma.order.findUnique({ where, select: { organisationId: true, payments: { where: { status: { in: COLLECTED } }, select: { id: true, status: true, provider: true, externalPaymentId: true, methodType: true } } } });
  if (!first || first.payments.length === 0) return null;
  await fillPaymentMethods(first.organisationId, first.payments);
  const order = await prisma.order.findUniqueOrThrow({
    where,
    select: {
      reference: true, currency: true, subtotalMinor: true, discountMinor: true, totalMinor: true, testMode: true, buyerName: true, buyerEmail: true, createdAt: true,
      organisation: { select: { name: true, paymentSettings: { select: { receiptLegalName: true, receiptRegistrationNumber: true, receiptAddress: true } } } },
      event: { select: { title: true, startDateTime: true, timezone: true } },
      lines: { orderBy: { createdAt: "asc" }, select: { description: true, quantity: true, unitMinor: true, totalMinor: true } },
      payments: {
        where: { status: { in: COLLECTED } },
        orderBy: { paidAt: "asc" },
        select: {
          status: true, provider: true, amountMinor: true, externalPaymentId: true, paidAt: true, methodSummary: true, offlineMethod: true, offlineReference: true,
          refunds: { where: { status: { not: PaymentRefundStatus.FAILED } }, orderBy: { createdAt: "asc" }, select: { amountMinor: true, status: true, offline: true, createdAt: true, settledAt: true } },
        },
      },
    },
  });
  const details = order.organisation.paymentSettings;
  const paidMinor = order.payments.reduce((sum, payment) => sum + payment.amountMinor, BigInt(0));
  const refundedMinor = order.payments.flatMap((payment) => payment.refunds).reduce((sum, refund) => sum + refund.amountMinor, BigInt(0));
  return {
    number: order.reference,
    testMode: order.testMode,
    currency: order.currency,
    issuer: {
      name: details?.receiptLegalName || order.organisation.name,
      tradingName: details?.receiptLegalName && details.receiptLegalName !== order.organisation.name ? order.organisation.name : null,
      registrationNumber: details?.receiptRegistrationNumber ?? null,
      address: details?.receiptAddress ?? null,
    },
    buyer: { name: order.buyerName, email: order.buyerEmail },
    event: order.event ? { title: order.event.title, start: order.event.startDateTime, timeZone: order.event.timezone } : null,
    lines: order.lines.map((line) => ({ label: line.description, quantity: line.quantity, unitMinor: line.unitMinor, totalMinor: line.totalMinor })),
    subtotalMinor: order.subtotalMinor,
    discountMinor: order.discountMinor,
    totalMinor: order.totalMinor,
    paidMinor,
    refundedMinor,
    payments: order.payments.map((payment) => ({
      online: payment.status === PaymentStatus.PAID_ONLINE,
      provider: payment.provider === "RAZORPAY" ? "Razorpay" : payment.provider === "STRIPE" ? "Stripe" : null,
      method: payment.status === PaymentStatus.PAID_ONLINE ? payment.methodSummary : OFFLINE_METHODS[payment.offlineMethod ?? "OTHER"] ?? "Other",
      reference: payment.status === PaymentStatus.PAID_ONLINE ? payment.externalPaymentId : payment.offlineReference,
      amountMinor: payment.amountMinor,
      paidAt: payment.paidAt,
      refunds: payment.refunds.map((refund) => ({ amountMinor: refund.amountMinor, pending: refund.status === PaymentRefundStatus.PENDING, offline: refund.offline, at: refund.settledAt ?? refund.createdAt })),
    })),
  };
}

// ---------- PDF ----------

const INK = rgb(0.078, 0.173, 0.165);
const MUTED = rgb(0.29, 0.365, 0.357);
const LINE = rgb(0.9, 0.863, 0.812);
const ACCENT = rgb(0, 0.431, 0.388);

/** Helvetica speaks WinAnsi only; anything else (for example Devanagari) prints as "?". */
function winAnsi(text: string) {
  return text.replace(/[^\x20-\x7E -ÿ•·–—‘’“”…€]/g, "?").replace(/\s+/g, " ").trim();
}

function money(minor: bigint, currency: string) {
  return `${currency} ${minorToDecimalString(minor, currency)}`;
}

function when(date: Date, timeZone = "UTC") {
  return date.toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit", timeZone, timeZoneName: "short" });
}

function wrap(text: string, font: PDFFont, size: number, width: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const word of winAnsi(paragraph).split(" ")) {
      const next = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(next, size) > width && line) {
        lines.push(line);
        line = word;
      } else line = next;
    }
    if (line) lines.push(line);
  }
  return lines;
}

/** One A4 page; long orders continue on more pages. */
export async function createReceiptPdf(receipt: NonNullable<Receipt>) {
  const pdf = await PDFDocument.create();
  pdf.setTitle(`Receipt ${receipt.number}`);
  pdf.setProducer("Space Works Events");
  const regular = await pdf.embedFont(StandardFonts.Helvetica);
  const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const margin = 56;
  let page: PDFPage = pdf.addPage([595.28, 841.89]);
  const width = page.getWidth() - margin * 2;
  let y = page.getHeight() - margin;
  page.drawRectangle({ x: 0, y: page.getHeight() - 6, width: page.getWidth(), height: 6, color: ACCENT });

  const ensure = (space: number) => {
    if (y - space >= margin) return;
    page = pdf.addPage([595.28, 841.89]);
    y = page.getHeight() - margin;
  };
  const text = (value: string, options: { x?: number; size?: number; font?: PDFFont; color?: typeof INK; right?: number; } = {}) => {
    const size = options.size ?? 10;
    const font = options.font ?? regular;
    const safe = winAnsi(value);
    const x = options.right != null ? options.right - font.widthOfTextAtSize(safe, size) : options.x ?? margin;
    page.drawText(safe, { x, y, size, font, color: options.color ?? INK });
  };
  const rule = () => {
    page.drawLine({ start: { x: margin, y }, end: { x: margin + width, y }, thickness: 0.75, color: LINE });
  };
  const right = margin + width;

  text("Receipt", { size: 24, font: bold });
  text(`No. ${receipt.number}`, { size: 11, font: bold, right });
  y -= 18;
  text("Proof of payment", { color: MUTED });
  if (receipt.testMode) text("TEST MODE: no real money moved", { font: bold, color: rgb(0.725, 0.11, 0.11), right });
  y -= 30;

  // Who was paid, and who paid.
  const columnWidth = width / 2 - 12;
  const issuer = [
    ...(receipt.issuer.tradingName ? [`Trading as ${receipt.issuer.tradingName}`] : []),
    ...(receipt.issuer.registrationNumber ? [`Registration no. ${receipt.issuer.registrationNumber}`] : []),
    ...(receipt.issuer.address ? wrap(receipt.issuer.address, regular, 10, columnWidth) : []),
  ];
  const buyer = [receipt.buyer.email];
  const top = y;
  text("PAID TO", { size: 8, font: bold, color: MUTED });
  text("PAID BY", { size: 8, font: bold, color: MUTED, x: margin + width / 2 });
  y -= 15;
  for (const line of wrap(receipt.issuer.name, bold, 11, columnWidth)) { text(line, { font: bold, size: 11 }); y -= 14; }
  for (const line of issuer) { text(line, { color: MUTED }); y -= 13; }
  const leftEnd = y;
  y = top - 15;
  for (const line of wrap(receipt.buyer.name, bold, 11, columnWidth)) { text(line, { font: bold, size: 11, x: margin + width / 2 }); y -= 14; }
  for (const line of buyer) { text(line, { color: MUTED, x: margin + width / 2 }); y -= 13; }
  y = Math.min(leftEnd, y) - 16;

  if (receipt.event) {
    text("EVENT", { size: 8, font: bold, color: MUTED });
    y -= 15;
    for (const line of wrap(receipt.event.title, bold, 11, width)) { text(line, { font: bold, size: 11 }); y -= 14; }
    text(when(receipt.event.start, receipt.event.timeZone), { color: MUTED });
    y -= 26;
  }

  // What was bought.
  const qtyX = margin + width * 0.62;
  const unitX = margin + width * 0.8;
  text("ITEM", { size: 8, font: bold, color: MUTED });
  text("QTY", { size: 8, font: bold, color: MUTED, right: qtyX });
  text("PRICE", { size: 8, font: bold, color: MUTED, right: unitX });
  text("AMOUNT", { size: 8, font: bold, color: MUTED, right });
  y -= 8;
  rule();
  y -= 16;
  for (const line of receipt.lines) {
    const label = wrap(line.label, regular, 10, width * 0.55);
    ensure(14 * label.length + 8);
    text(String(line.quantity), { right: qtyX });
    text(money(line.unitMinor, receipt.currency), { right: unitX });
    text(money(line.totalMinor, receipt.currency), { right });
    for (const part of label) { text(part); y -= 14; }
    y -= 4;
  }
  rule();
  y -= 16;
  const total = (label: string, value: string, strong = false) => {
    ensure(18);
    text(label, { right: unitX, font: strong ? bold : regular, color: strong ? INK : MUTED });
    text(value, { right, font: strong ? bold : regular, size: strong ? 11 : 10 });
    y -= strong ? 18 : 15;
  };
  if (receipt.discountMinor > BigInt(0)) {
    total("Subtotal", money(receipt.subtotalMinor, receipt.currency));
    total("Discount", `-${money(receipt.discountMinor, receipt.currency)}`);
  }
  total("Total paid", money(receipt.paidMinor, receipt.currency), true);
  if (receipt.refundedMinor > BigInt(0)) total("Refunded", `-${money(receipt.refundedMinor, receipt.currency)}`);
  y -= 14;

  // How it was paid, with the provider's own reference.
  ensure(40);
  text("PAYMENT", { size: 8, font: bold, color: MUTED });
  y -= 16;
  for (const payment of receipt.payments) {
    ensure(60);
    const how = payment.online
      ? [payment.provider, payment.method].filter(Boolean).join(" · ")
      : `Paid to the organiser in person · ${payment.method}`;
    text(how, { font: bold });
    text(money(payment.amountMinor, receipt.currency), { right, font: bold });
    y -= 14;
    if (payment.paidAt) { text(`Paid ${when(payment.paidAt)}`, { color: MUTED }); y -= 13; }
    if (payment.reference) { text(`${payment.online ? `${payment.provider} payment ID` : "Reference"}: ${payment.reference}`, { color: MUTED }); y -= 13; }
    for (const refund of payment.refunds) {
      ensure(14);
      text(`${refund.pending ? "Refund in progress" : "Refunded"}${refund.offline ? " in person" : ""} ${when(refund.at)}`, { color: MUTED });
      text(`-${money(refund.amountMinor, receipt.currency)}`, { right, color: MUTED });
      y -= 13;
    }
    y -= 8;
  }

  ensure(40);
  y -= 8;
  rule();
  y -= 16;
  for (const line of wrap(`${receipt.issuer.name} received this payment for the order above through Space Works Events. Keep this receipt as proof of payment; quote the receipt number in any question about it.`, regular, 8.5, width)) {
    text(line, { size: 8.5, color: MUTED });
    y -= 11;
  }
  return pdf.save();
}

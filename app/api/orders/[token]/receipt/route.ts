import { parseOrderToken } from "@/lib/payments/payNow";
import { createReceiptPdf, loadReceipt } from "@/lib/payments/receipts";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** The buyer's receipt (proof of payment) as a PDF, by their order link. */
export async function GET(_request: Request, context: { params: Promise<{ token: string; }>; }) {
  const token = parseOrderToken((await context.params).token);
  const receipt = token ? await loadReceipt(token) : null;
  if (!receipt) return new Response("Not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  const pdf = await createReceiptPdf(receipt);
  return new Response(Buffer.from(pdf), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="receipt-${receipt.number}.pdf"`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

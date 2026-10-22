import type { OfflinePaymentMethod } from "@prisma/client";

/** The offline record as amended: the latest amendment of each field wins. */
export function effectiveOfflineRecord(payment: { offlineMethod: OfflinePaymentMethod | null; offlineReference: string | null; amendments: Array<{ field: string; newValue: string | null; }>; }) {
  let method: string | null = payment.offlineMethod;
  let reference = payment.offlineReference;
  for (const amendment of payment.amendments) {
    if (amendment.field === "offlineMethod") method = amendment.newValue;
    if (amendment.field === "offlineReference") reference = amendment.newValue;
  }
  return { method: method as OfflinePaymentMethod | null, reference };
}

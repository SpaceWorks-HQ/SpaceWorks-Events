import "server-only";
import { requireSuperAdminMfa } from "@/lib/permissions";

/** The frontend's explicit per-page guard also checks the VPS's fresh proof. */
export async function loadSuperAdminGate() {
  return requireSuperAdminMfa();
}

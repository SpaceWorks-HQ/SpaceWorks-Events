import { requireSuperAdmin } from "@/lib/permissions";

export async function loadSuperAdminMfaView() {
  await requireSuperAdmin();
  return {};
}

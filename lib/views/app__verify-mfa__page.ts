import { redirect } from "next/navigation";
import { requireAuth } from "@/lib/permissions";
import { safeAuthRedirect } from "@/lib/authRedirect";
import { staffMfaState } from "@/lib/staffMfa";

/** Signed-in staff who still owe an authenticator check this session; anyone else goes on. */
export async function loadVerifyMfaView({ searchParams }: { searchParams: Promise<{ next?: string; }>; }) {
  const session = await requireAuth();
  const next = safeAuthRedirect((await searchParams).next ?? "/dashboard");
  const state = await staffMfaState(session.user.id);
  if (state === "enrol") redirect("/account/security?mfa=required");
  if (state === "ok") redirect(next);
  return { next };
}

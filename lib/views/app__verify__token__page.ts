
import { isActionRateLimited } from "@/lib/actionRateLimit";
import type { VerifyView } from "@/lib/memberIds/verify";
import { lookupVerification } from "@/lib/memberIds/verifyLookup";
type Props = { params: Promise<{ token: string; }>; };
async function lookup(token: string): Promise<VerifyView | "limited"> {
  // Tight per-IP limit so the token space cannot be scanned.
  if (await isActionRateLimited("shortLink")) return "limited";
  return lookupVerification(token);
}


export async function loadVerifyView({ params }: Props) {

  const { token } = await params;
  const result = await lookup(token.trim());


  return { result };
}

import "server-only";

import { resolvePublicAddress } from "@/lib/net/publicAddress";

export const PRIVATE_WEBHOOK_ERROR = "That webhook address points to a private or local network. Set OPS_WEBHOOK_ALLOW_PRIVATE=1 to allow one, for example a Mattermost on the same network.";

/**
 * Whether the alert webhook's host resolves only to public addresses, so the
 * webhook (and its "Send test message", which reports the HTTP status) can't
 * be used to probe this host, its LAN or cloud metadata. A chat server on the
 * operator's own network needs the explicit OPS_WEBHOOK_ALLOW_PRIVATE=1.
 */
export async function isAllowedOpsWebhook(url: string) {
  try {
    const host = new URL(url).hostname.replace(/^\[|\]$/g, "");
    await resolvePublicAddress(host, process.env.OPS_WEBHOOK_ALLOW_PRIVATE === "1" ? { allowPrivate: true } : {});
    return true;
  } catch {
    return false;
  }
}

import "server-only";

import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

/**
 * Networks an organisation's server address may never reach: this host, its
 * LAN and cloud metadata. Kept as two lists: one list would also match IPv4
 * addresses against the IPv6 ranges that embed IPv4 (::ffff:0:0/96, NAT64).
 */
const BLOCKED_V4 = new BlockList();
const BLOCKED_V6 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12],
  ["192.0.0.0", 24], ["192.0.2.0", 24], ["192.168.0.0", 16], ["198.18.0.0", 15], ["198.51.100.0", 24], ["203.0.113.0", 24],
  ["224.0.0.0", 4], ["240.0.0.0", 4],
] as const) BLOCKED_V4.addSubnet(network, prefix, "ipv4");
for (const [network, prefix] of [
  ["::", 128], ["::1", 128], ["::ffff:0:0", 96], ["64:ff9b::", 96], ["100::", 64], ["2001:db8::", 32], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8],
] as const) BLOCKED_V6.addSubnet(network, prefix, "ipv6");

export class PrivateAddressError extends Error {
  override name = "PrivateAddressError";
  constructor() {
    super("That server address points to a private or local network.");
  }
}

export function isBlockedAddress(address: string) {
  const family = isIP(address);
  if (family === 0) return true;
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) {
    // An IPv4 address written as IPv6: judge the IPv4 address.
    const v4 = address.slice(7);
    if (isIP(v4) === 4) return BLOCKED_V4.check(v4, "ipv4");
  }
  return family === 4 ? BLOCKED_V4.check(address, "ipv4") : BLOCKED_V6.check(address, "ipv6");
}

/**
 * Resolve a host an organisation entered to one public address to connect
 * to. Every address it resolves to must be public, so a name can't hide a
 * private one. `allowPrivate` is for development and tests only.
 */
export async function resolvePublicAddress(host: string, options: { allowPrivate?: boolean; } = {}) {
  const allowPrivate = options.allowPrivate ?? process.env.NODE_ENV !== "production";
  const addresses = isIP(host) ? [{ address: host }] : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) throw new PrivateAddressError();
  if (!allowPrivate && addresses.some(({ address }) => isBlockedAddress(address))) throw new PrivateAddressError();
  return addresses[0]!.address;
}

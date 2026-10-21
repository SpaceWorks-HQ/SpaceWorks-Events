import "server-only";

import crypto from "crypto";

export const BREACHED_PASSWORD_MESSAGE = "This password has appeared in a data breach, so it isn't safe to use. Choose a different one.";

/**
 * Whether a password appears in the Have I Been Pwned breach corpus, by
 * k-anonymity: only the first five characters of its SHA-1 leave this server,
 * with padding so the response size reveals nothing. Any failure (offline,
 * slow, blocked) counts as "not found": the check never stops a sign-up.
 * `PWNED_PASSWORDS_CHECK=false` turns it off (air-gapped installs, tests).
 */
export async function isBreachedPassword(password: string): Promise<boolean> {
  if (process.env.PWNED_PASSWORDS_CHECK?.trim().toLowerCase() === "false") return false;
  const sha1 = crypto.createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = sha1.slice(0, 5);
  const suffix = sha1.slice(5);
  try {
    const response = await fetch(`https://api.pwnedpasswords.com/range/${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "SpaceWorks-Events" },
      signal: AbortSignal.timeout(3_000),
      cache: "no-store",
    });
    if (!response.ok) return false;
    const body = await response.text();
    return body.split("\n").some((line) => {
      const [hash, count] = line.trim().split(":");
      return hash === suffix && Number(count) > 0;
    });
  } catch {
    return false;
  }
}

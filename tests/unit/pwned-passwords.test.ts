import crypto from "crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { isBreachedPassword } from "@/lib/pwnedPasswords";

const sha1 = (value: string) => crypto.createHash("sha1").update(value).digest("hex").toUpperCase();
const rangeBody = (rows: string[]) => new Response(rows.join(String.fromCharCode(10)));

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe("breached-password check", () => {
  it("sends only the first five characters of the hash, padded, and finds a match", async () => {
    vi.stubEnv("PWNED_PASSWORDS_CHECK", "true");
    const hash = sha1("password123");
    const fetchMock = vi.fn(async () => rangeBody(["0018A45C4D1DEF81644B54AB7F969B88D65:0", `${hash.slice(5)}:2048`]));
    vi.stubGlobal("fetch", fetchMock);
    expect(await isBreachedPassword("password123")).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(`https://api.pwnedpasswords.com/range/${hash.slice(0, 5)}`);
    expect(url).not.toContain(hash.slice(5));
    expect((init.headers as Record<string, string>)["Add-Padding"]).toBe("true");
  });

  it("ignores padding rows with a zero count, and never blocks when the service is unreachable", async () => {
    vi.stubEnv("PWNED_PASSWORDS_CHECK", "true");
    const hash = sha1("a-long-unique-passphrase");
    vi.stubGlobal("fetch", vi.fn(async () => rangeBody([`${hash.slice(5)}:0`])));
    expect(await isBreachedPassword("a-long-unique-passphrase")).toBe(false);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    expect(await isBreachedPassword("password123")).toBe(false);
  });

  it("can be turned off", async () => {
    vi.stubEnv("PWNED_PASSWORDS_CHECK", "false");
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await isBreachedPassword("password123")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

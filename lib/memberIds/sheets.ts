import "server-only";

import { googleSheetCsvUrl, IMPORT_MAX_BYTES } from "./importRows";

/*
 * Fetch a public Google Sheet as CSV. The request URL is rebuilt from a
 * validated sheet id (lib/memberIds/importRows.ts), so only
 * docs.google.com is ever contacted, plus Google's own download host when
 * the export redirects there. No other redirect is followed, the body is
 * capped and the request times out.
 */

const TIMEOUT_MS = 10_000;

function allowedRedirect(location: string | null) {
  if (!location) return null;
  try {
    const url = new URL(location);
    if (url.protocol !== "https:" || url.port || url.username || url.password) return null;
    return url.hostname === "docs.google.com" || url.hostname.endsWith(".googleusercontent.com") ? url.toString() : null;
  } catch {
    return null;
  }
}

async function readCapped(response: Response) {
  const reader = response.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > IMPORT_MAX_BYTES) {
      await reader.cancel();
      throw new SheetFetchError("That sheet is larger than 2 MB. Split it, or export a CSV with fewer rows.");
    }
    chunks.push(value);
  }
  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}

export class SheetFetchError extends Error {}

export async function fetchGoogleSheetCsv(sheetUrl: string, fetcher: typeof fetch = fetch) {
  const url = googleSheetCsvUrl(sheetUrl);
  if (!url) throw new SheetFetchError("Paste a Google Sheets link that starts with https://docs.google.com/spreadsheets/d/.");
  let target = url;
  for (let hop = 0; hop < 3; hop += 1) {
    let response: Response;
    try {
      response = await fetcher(target, { redirect: "manual", signal: AbortSignal.timeout(TIMEOUT_MS), headers: { Accept: "text/csv" } });
    } catch {
      throw new SheetFetchError("Google Sheets didn't answer. Try again in a moment.");
    }
    if (response.status >= 300 && response.status < 400) {
      const next = allowedRedirect(response.headers.get("location"));
      // A redirect to the Google sign-in page means the sheet isn't public.
      if (!next || next.includes("accounts.google.com") || new URL(next).pathname.startsWith("/ServiceLogin")) break;
      target = next;
      continue;
    }
    if (!response.ok) break;
    const type = response.headers.get("content-type") ?? "";
    if (!type.includes("text/csv") && !type.includes("text/plain")) break;
    return readCapped(response);
  }
  throw new SheetFetchError("That sheet couldn't be read. In Google Sheets, choose Share → Anyone with the link → Viewer, then try again.");
}

import { isEmail, MEMBER_NAME_MAX, validateFieldValues, type ProgrammeFieldDef } from "./core";

/*
 * Importing members from a CSV file or a public Google Sheet: parsing,
 * the column mapping and de-duplication by email. Pure functions; the
 * network fetch for sheets lives in lib/memberIds/sheets.ts.
 */

export const IMPORT_MAX_ROWS = 2000;
export const IMPORT_MAX_COLUMNS = 40;
export const IMPORT_MAX_BYTES = 2 * 1024 * 1024;
export const IMPORT_CELL_MAX = 500;

/** RFC 4180 CSV: quoted fields, doubled quotes, CRLF or LF. Extra rows and columns are cut at the caps. */
export function parseCsv(text: string, maxRows = IMPORT_MAX_ROWS + 1): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  const source = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const pushCell = () => {
    if (row.length < IMPORT_MAX_COLUMNS) row.push(cell.slice(0, IMPORT_CELL_MAX));
    cell = "";
  };
  const pushRow = () => {
    pushCell();
    if (row.some((value) => value.trim() !== "")) rows.push(row);
    row = [];
  };
  for (let index = 0; index < source.length; index += 1) {
    if (rows.length >= maxRows) return rows;
    const char = source[index]!;
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          cell += '"';
          index += 1;
        } else quoted = false;
      } else cell += char;
      continue;
    }
    if (char === '"' && cell === "") quoted = true;
    else if (char === ",") pushCell();
    else if (char === "\n") pushRow();
    else if (char === "\r") {
      if (source[index + 1] === "\n") index += 1;
      pushRow();
    } else cell += char;
  }
  if (cell !== "" || row.length > 0) pushRow();
  return rows.slice(0, maxRows);
}

const SHEET_ID = /^[A-Za-z0-9_-]{20,100}$/;

/**
 * Only `https://docs.google.com/spreadsheets/d/<id>/…` is accepted. The
 * fetch URL is rebuilt from the validated id and tab number, so nothing the
 * organiser typed (host, path, query) reaches the server's request.
 */
export function googleSheetCsvUrl(input: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim());
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || url.hostname !== "docs.google.com" || url.port || url.username || url.password) return null;
  const match = /^\/spreadsheets\/d\/([^/]+)(?:\/.*)?$/.exec(url.pathname);
  if (!match || !SHEET_ID.test(match[1]!)) return null;
  const gidSource = url.searchParams.get("gid") ?? /(?:^|[#&])gid=([^&]*)/.exec(url.hash.slice(1))?.[1] ?? "0";
  if (!/^\d{1,12}$/.test(gidSource)) return null;
  return `https://docs.google.com/spreadsheets/d/${match[1]}/export?format=csv&gid=${gidSource}`;
}

export type ImportTarget = "" | "name" | "email" | `field:${string}`;

export type ImportTable = { headers: string[]; rows: string[][] };

/** First row as headers; rows padded to the header width. */
export function toImportTable(cells: string[][]): ImportTable {
  const [first = [], ...rest] = cells;
  const headers = first.map((header, index) => header.trim() || `Column ${index + 1}`);
  return { headers, rows: rest.slice(0, IMPORT_MAX_ROWS).map((row) => headers.map((_, index) => row[index] ?? "")) };
}

const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, "");

/** A best guess at the mapping: name and email by common header names, custom fields by label or key. */
export function autoMap(headers: string[], fields: Array<Pick<ProgrammeFieldDef, "key" | "label">>): ImportTarget[] {
  const used = new Set<ImportTarget>();
  return headers.map((header) => {
    const h = norm(header);
    let target: ImportTarget = "";
    if (["name", "fullname", "membername", "yourname"].includes(h)) target = "name";
    else if (["email", "emailaddress", "mail", "youremail"].includes(h)) target = "email";
    else {
      const field = fields.find((item) => norm(item.label) === h || norm(item.key) === h);
      if (field) target = `field:${field.key}`;
    }
    if (target && used.has(target)) return "";
    if (target) used.add(target);
    return target;
  });
}

export type ImportCandidate = { name: string; email: string; values: Record<string, string> };
export type ImportPlan = {
  members: ImportCandidate[];
  skipped: Array<{ row: number; reason: string }>;
  duplicates: number;
};

/**
 * Turn mapped rows into members. Rows without a name or a valid email are
 * skipped with a reason; an email already in the programme, or earlier in the
 * file, is a duplicate. Required custom fields are not enforced on import.
 */
export function planImport(table: ImportTable, mapping: ImportTarget[], fields: ProgrammeFieldDef[], existingEmails: ReadonlySet<string>): ImportPlan {
  const column = (target: ImportTarget) => mapping.indexOf(target);
  const nameColumn = column("name");
  const emailColumn = column("email");
  const seen = new Set<string>();
  const members: ImportCandidate[] = [];
  const skipped: ImportPlan["skipped"] = [];
  let duplicates = 0;
  table.rows.forEach((row, index) => {
    const rowNumber = index + 2; // header is row 1
    const name = (nameColumn >= 0 ? row[nameColumn] ?? "" : "").trim().slice(0, MEMBER_NAME_MAX);
    const email = (emailColumn >= 0 ? row[emailColumn] ?? "" : "").trim().toLowerCase();
    if (!name) return void skipped.push({ row: rowNumber, reason: "No name" });
    if (!isEmail(email)) return void skipped.push({ row: rowNumber, reason: "No valid email" });
    if (seen.has(email) || existingEmails.has(email)) {
      duplicates += 1;
      return;
    }
    const raw: Record<string, string> = {};
    mapping.forEach((target, columnIndex) => {
      if (target.startsWith("field:")) raw[target.slice("field:".length)] = row[columnIndex] ?? "";
    });
    const checked = validateFieldValues(fields, raw, { enforceRequired: false });
    if (!checked.ok) return void skipped.push({ row: rowNumber, reason: checked.error });
    seen.add(email);
    members.push({ name, email, values: checked.values });
  });
  return { members, skipped, duplicates };
}

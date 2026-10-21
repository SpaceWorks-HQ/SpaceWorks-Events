import "server-only";

import { recordAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { newVerifyToken } from "@/lib/memberIds/data";
import { IMPORT_MAX_ROWS, autoMap, parseCsv, planImport, toImportTable, type ImportTarget } from "@/lib/memberIds/importRows";
import { approveMembers } from "@/lib/memberIds/issue";
import { fetchGoogleSheetCsv, SheetFetchError } from "@/lib/memberIds/sheets";
import type { ImportPreview, ImportResult } from "../member-ids";
import type { ActionResult } from "../org";
import { requireProgramme, revalidate } from "./helpers";
import { commitInput, sourceInput } from "./schemas";

/*
 * The member import steps behind the `readIdImportSource` and
 * `commitIdImport` server actions in app/actions/member-ids.ts.
 */

export async function readIdImportSource(input: unknown): Promise<ActionResult<ImportPreview>> {
  const parsed = sourceInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Choose a CSV file of up to 2 MB, or paste a Google Sheets link." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId, parsed.data.source.kind === "sheet" ? "upload" : "action");
  if (!context.ok) return context;
  let text: string;
  if (parsed.data.source.kind === "csv") text = parsed.data.source.text;
  else {
    try {
      text = await fetchGoogleSheetCsv(parsed.data.source.url);
    } catch (error) {
      return { ok: false, error: error instanceof SheetFetchError ? error.message : "That sheet couldn't be read." };
    }
  }
  const cells = parseCsv(text, IMPORT_MAX_ROWS + 2);
  const table = toImportTable(cells);
  if (table.headers.length === 0 || table.rows.length === 0) return { ok: false, error: "That file has no rows. The first row should hold column names." };
  return { ok: true, data: { headers: table.headers, rows: table.rows, mapping: autoMap(table.headers, context.programme.fields), truncated: cells.length > IMPORT_MAX_ROWS + 1 } };
}

export async function commitIdImport(input: unknown): Promise<ActionResult<ImportResult>> {
  const parsed = commitInput.safeParse(input);
  if (!parsed.success) return { ok: false, error: "The import couldn't be read. Start again from the file." };
  const { headers, rows, approve } = parsed.data;
  const mapping = parsed.data.mapping as ImportTarget[];
  if (!mapping.includes("name") || !mapping.includes("email")) return { ok: false, error: "Match a column to Name and one to Email." };
  const context = await requireProgramme(parsed.data.organisationSlug, parsed.data.programmeId);
  if (!context.ok) return context;
  const { access, programme } = context;
  const existing = await prisma.idMember.findMany({ where: { programmeId: programme.id }, select: { email: true } });
  const plan = planImport({ headers, rows }, mapping, programme.fields, new Set(existing.map((member) => member.email)));
  const result = await prisma.$transaction(async (tx) => {
    const created = await tx.idMember.createManyAndReturn({
      data: plan.members.map((member) => ({
        programmeId: programme.id,
        organisationId: access.organisation.id,
        name: member.name,
        email: member.email,
        fieldValues: member.values,
        source: "IMPORT" as const,
        verifyToken: newVerifyToken(),
      })),
      skipDuplicates: true,
      select: { id: true },
    });
    const approved = approve ? await approveMembers(tx, programme, created.map((row) => row.id)) : 0;
    return { created: created.length, approved };
  }, { timeout: 30_000 });
  await recordAuditEvent({
    action: "ID_MEMBERS_IMPORTED",
    actorUserId: access.userId,
    organisationId: access.organisation.id,
    targetType: "IdProgramme",
    targetId: programme.id,
    metadata: { created: result.created, approved: result.approved, duplicates: plan.duplicates + (plan.members.length - result.created), skipped: plan.skipped.length },
  });
  revalidate(access, programme.id);
  return { ok: true, data: { ...result, duplicates: plan.duplicates + (plan.members.length - result.created), skipped: plan.skipped.slice(0, 50) } };
}

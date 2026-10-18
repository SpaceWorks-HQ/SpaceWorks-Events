import type { Prisma } from "@prisma/client";
import { recordAuditEvent } from "@/lib/audit";
import { download, jsonError, notFound, slugForFile } from "@/lib/badge/http";
import { tryAcquireRenderSlot } from "@/lib/badge/renderSlot";
import { prisma } from "@/lib/db";
import { authorizeProgrammeDownload, downloadRateLimited } from "@/lib/memberIds/access";
import { memberCardPerson, memberCardSelect, programmeBranding, programmeDesign, publicOrigin, type FieldRecord } from "@/lib/memberIds/data";
import { MEMBER_ID_BULK_PDF_LIMIT, MEMBER_ID_BULK_ZIP_LIMIT, renderMemberCardsPdf, renderMemberCardsZip } from "@/lib/memberIds/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ programmeId: string }> };

/** Approved members in a stable order, read in batches. */
async function* approvedPeople(where: Prisma.IdMemberWhereInput, fields: FieldRecord[], origin: string, limit: number) {
  let cursor: string | undefined;
  let yielded = 0;
  while (yielded < limit) {
    const rows = await prisma.idMember.findMany({
      where,
      orderBy: { id: "asc" },
      take: Math.min(50, limit - yielded),
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      select: memberCardSelect,
    });
    if (rows.length === 0) return;
    for (const row of rows) {
      yield memberCardPerson(row, fields, origin);
      yielded += 1;
    }
    cursor = rows.at(-1)!.id;
  }
}

/**
 * Every approved card: one PDF (front and back per member, ready for duplex
 * printing) or a ZIP with a PDF per member. `valid=1` leaves out expired cards.
 */
export async function GET(request: Request, context: Context) {
  const { programmeId } = await context.params;
  const access = await authorizeProgrammeDownload(programmeId);
  if (!access) return notFound();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  if (format !== "pdf" && format !== "zip") return jsonError(400, "Choose PDF or ZIP.");
  if (await downloadRateLimited(access.userId)) return jsonError(429, "Too many downloads. Please try again shortly.");

  const { programme } = access;
  const now = new Date();
  const where: Prisma.IdMemberWhereInput = {
    programmeId: programme.id,
    status: "APPROVED",
    ...(url.searchParams.get("valid") === "1" ? { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } : {}),
  };
  const limit = format === "zip" ? MEMBER_ID_BULK_ZIP_LIMIT : MEMBER_ID_BULK_PDF_LIMIT;
  const count = await prisma.idMember.count({ where });
  if (count === 0) return jsonError(422, "No approved cards yet. Approve members first.");
  if (count > limit) return jsonError(413, `This programme has ${count} approved cards. A ${format.toUpperCase()} download holds up to ${limit}.`);
  const release = tryAcquireRenderSlot();
  if (!release) return jsonError(429, "Another download is being prepared. Try again in a minute.");

  try {
    const input = { design: programmeDesign(programme, programme.organisation.name), fields: programme.fields, branding: programmeBranding(programme, programme.organisation.logoUrl) };
    const people = approvedPeople(where, programme.fields, publicOrigin(request), limit);
    const slug = slugForFile(programme.slug, "ids");
    const body = format === "zip"
      ? await renderMemberCardsZip(input, people, (person, index) => `${String(index).padStart(4, "0")}-${slugForFile(person.displayName, "member")}.pdf`)
      : await renderMemberCardsPdf(input, people, `${programme.name} ID cards`);
    await recordAuditEvent({ action: "ID_CARDS_EXPORTED", actorUserId: access.userId, organisationId: programme.organisationId, targetType: "IdProgramme", targetId: programme.id, metadata: { count, format } });
    return download(body, format === "zip" ? "application/zip" : "application/pdf", `id-cards-${slug}.${format}`);
  } catch {
    return jsonError(500, "The cards couldn't be prepared. Please try again.");
  } finally {
    release();
  }
}

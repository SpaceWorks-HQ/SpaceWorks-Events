import { recordAuditEvent } from "@/lib/audit";
import { download, jsonError, notFound, slugForFile } from "@/lib/badge/http";
import { prisma } from "@/lib/db";
import { authorizeProgrammeDownload, downloadRateLimited } from "@/lib/memberIds/access";
import { memberCardPerson, memberCardSelect, programmeBranding, programmeDesign, publicOrigin } from "@/lib/memberIds/data";
import { renderMemberCard } from "@/lib/memberIds/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ programmeId: string; memberId: string }> };

/** One member's card: a two-page PDF (front, back) or a 300 dpi PNG of one side. */
export async function GET(request: Request, context: Context) {
  const { programmeId, memberId } = await context.params;
  const access = await authorizeProgrammeDownload(programmeId);
  if (!access || memberId.length > 128) return notFound();

  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";
  if (format !== "pdf" && format !== "png") return jsonError(400, "Choose PDF or PNG.");
  if (await downloadRateLimited(access.userId)) return jsonError(429, "Too many downloads. Please try again shortly.");

  const { programme } = access;
  // The member must belong to this programme, which belongs to the caller's organisation.
  const member = await prisma.idMember.findFirst({ where: { id: memberId, programmeId: programme.id }, select: memberCardSelect });
  if (!member) return notFound();
  if (member.status !== "APPROVED") return jsonError(422, "Approve this member before downloading their card.");

  try {
    const body = await renderMemberCard(
      { design: programmeDesign(programme, programme.organisation.name), fields: programme.fields, branding: programmeBranding(programme, programme.organisation.logoUrl) },
      memberCardPerson(member, programme.fields, publicOrigin(request)),
      format,
      { side, title: `${member.name} ID card` },
    );
    await recordAuditEvent({ action: "ID_CARD_DOWNLOADED", actorUserId: access.userId, organisationId: programme.organisationId, targetType: "IdMember", targetId: member.id, metadata: { format } });
    const name = `id-card-${slugForFile(member.name, "member")}${format === "png" ? `-${side}` : ""}.${format}`;
    return download(body, format === "png" ? "image/png" : "application/pdf", name);
  } catch {
    return jsonError(500, "The card couldn't be prepared. Please try again.");
  }
}

import { auth } from "@/lib/auth";
import { download, jsonError, notFound, slugForFile } from "@/lib/badge/http";
import { downloadRateLimited, loadWalletMember } from "@/lib/memberIds/access";
import { memberCardPerson, programmeBranding, programmeDesign, publicOrigin } from "@/lib/memberIds/data";
import { renderMemberCard } from "@/lib/memberIds/render";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = { params: Promise<{ memberId: string }> };

/** The signed-in person's own approved card, as a PDF (front and back) or a PNG of one side. */
export async function GET(request: Request, context: Context) {
  const { memberId } = await context.params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return notFound();
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "pdf";
  const side = url.searchParams.get("side") === "back" ? "back" : "front";
  if (format !== "pdf" && format !== "png") return jsonError(400, "Choose PDF or PNG.");
  if (await downloadRateLimited(userId)) return jsonError(429, "Too many downloads. Please try again shortly.");

  const member = await loadWalletMember(userId, memberId);
  if (!member || member.status !== "APPROVED") return notFound();
  const { programme } = member;
  try {
    const body = await renderMemberCard(
      { design: programmeDesign(programme, programme.organisation.name), fields: programme.fields, branding: programmeBranding(programme, programme.organisation.logoUrl) },
      memberCardPerson(member, programme.fields, publicOrigin(request)),
      format,
      { side, title: `${member.name} ID card` },
    );
    return download(body, format === "png" ? "image/png" : "application/pdf", `id-card-${slugForFile(programme.name, "card")}${format === "png" ? `-${side}` : ""}.${format}`);
  } catch {
    return jsonError(500, "The card couldn't be prepared. Please try again.");
  }
}

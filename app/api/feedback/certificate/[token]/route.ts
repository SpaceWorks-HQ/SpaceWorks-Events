import sharp from "sharp";
import { parseCertificateTemplate } from "@/lib/certificateTemplate";
import { certificateMergeValues, renderCustomCertificate, standardCertificateSvg } from "@/lib/renderCertificate";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const filename = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 72) || "event";
export async function GET(_request: Request, context: RouteContext<"/api/feedback/certificate/[token]">) {
  const { token } = await context.params;
  const safeToken = token.trim();
  if (!/^[A-Za-z0-9_-]{8,128}$/.test(safeToken)) notFound();
  const response = await prisma.eventFeedbackResponse.findUnique({ where: { certificateToken: safeToken }, include: { form: { include: { event: { include: { organisation: { select: { name: true } } } } } }, rsvp: { include: { user: { select: { name: true } } } } } });
  // A token is issued only inside a certificate-mode submission transaction.
  // Later form-mode changes must not revoke an already issued certificate.
  if (!response || !response.certificateToken || !response.rsvp || response.rsvp.status !== "CONFIRMED") notFound();
  const attendee = response.rsvp.user?.name?.trim() || response.rsvp.guestName?.trim() || response.rsvp.guestEmail?.split("@")[0] || "Participant";
  const svg = standardCertificateSvg({ organisationName: response.form.event.organisation.name, attendee, eventTitle: response.form.event.title, issuedAt: response.submittedAt });
  const template = parseCertificateTemplate(response.certificateTemplate);
  const event = response.form.event;
  const values = certificateMergeValues({ name: attendee, eventTitle: event.title, eventStart: event.startDateTime, timeZone: event.timezone, organisationName: event.organisation.name, issuedAt: response.submittedAt });
  const jpeg = template ? await renderCustomCertificate(template, values, event.organisationId) : await sharp(Buffer.from(svg)).flatten({ background: "#ffffff" }).jpeg({ quality: 94, chromaSubsampling: "4:4:4" }).toBuffer();
  return new Response(jpeg, { headers: { "Content-Type": "image/jpeg", "Content-Disposition": `attachment; filename="${filename(response.form.event.title)}-certificate.jpg"`, "Cache-Control": "private, no-store", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff" } });
}

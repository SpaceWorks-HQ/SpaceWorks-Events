import "server-only";

import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { EMAIL_BUTTON_STYLE, EMAIL_COLORS, emailLayout } from "@/lib/email/brand";
import { assertEmailAccepted, getEmailTransport } from "@/lib/email/transporter";
import { cardState, formatCardDate } from "./core";
import { memberCardPerson, memberCardSelect, programmeBranding, programmeDesign, verifyUrl } from "./data";
import { renderMemberCard } from "./render";

/*
 * "Your ID card" email, delivered through the outbox. The queued payload
 * holds only the recipient and the member id; the card, its verify link and
 * the PDF are produced at send time, so the queue never stores the opaque
 * verify token, and a card revoked before sending is not sent.
 */

type OutboxClient = Prisma.TransactionClient | typeof prisma;

export const MEMBER_ID_EMAIL_KIND = "member-id-card";

export type MemberIdEmailPayload = { to: string; memberId: string };

export async function enqueueMemberIdCardEmails(client: OutboxClient, recipients: MemberIdEmailPayload[]) {
  if (recipients.length === 0) return { count: 0 };
  return client.outboxMessage.createMany({ data: recipients.map((payload) => ({ kind: MEMBER_ID_EMAIL_KIND, payload: payload as Prisma.InputJsonValue })) });
}

export function asMemberIdEmailPayload(value: Prisma.JsonValue): MemberIdEmailPayload | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const payload = value as Record<string, unknown>;
  if (typeof payload.to !== "string" || payload.to.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.to)) return null;
  if (typeof payload.memberId !== "string" || payload.memberId.length === 0 || payload.memberId.length > 64) return null;
  return { to: payload.to, memberId: payload.memberId };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

function fileSlug(value: string) {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "member";
}

/**
 * Send one queued card email. Returns "dropped" when the card no longer
 * exists, is not valid, or the address changed; the outbox then removes the
 * message without sending.
 */
export async function deliverMemberIdCardEmail(payload: MemberIdEmailPayload, messageId: string): Promise<"sent" | "dropped"> {
  const member = await prisma.idMember.findUnique({
    where: { id: payload.memberId },
    select: {
      ...memberCardSelect,
      programme: { select: { name: true, design: true, organisationId: true, watermarkUrl: true, fields: { orderBy: [{ sortOrder: "asc" }, { id: "asc" }], select: { key: true, label: true, type: true, placement: true } }, organisation: { select: { name: true, logoUrl: true } } } },
    },
  });
  if (!member || member.email !== payload.to.toLowerCase() || cardState(member) !== "valid") return "dropped";

  const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, "") ?? "";
  const { programme } = member;
  const organisationName = programme.organisation.name;
  const pdf = await renderMemberCard(
    { design: programmeDesign(programme, organisationName), fields: programme.fields, branding: programmeBranding(programme, programme.organisation.logoUrl) },
    memberCardPerson(member, programme.fields, base || "http://localhost:3000"),
    "pdf",
    { title: `${member.name} ID card` },
  );

  const name = escapeHtml(member.name);
  const programmeName = escapeHtml(programme.name);
  const organisation = escapeHtml(organisationName);
  const validUntil = member.expiresAt ? formatCardDate(member.expiresAt) : null;
  // Links only with an absolute public address; never localhost in a sent email.
  const check = base ? verifyUrl(member.verifyToken, base) : null;
  const wallet = base ? `${base}/account/ids` : null;
  const facts = [
    member.idNumber ? `<strong>ID number:</strong> ${escapeHtml(member.idNumber)}` : null,
    `<strong>Valid until:</strong> ${validUntil ? escapeHtml(validUntil) : "No expiry"}`,
  ].filter(Boolean).join("<br>");

  const html = emailLayout("Your ID card", `
            <h2 style="margin-top: 0; color: ${EMAIL_COLORS.ink}; font-size: 20px; font-weight: 600;">Your ${programmeName} card is ready</h2>
            <p style="font-size: 16px; line-height: 1.5; color: ${EMAIL_COLORS.inkMuted};">
              Hello ${name},<br><br>
              ${organisation} has issued your ID card. It's attached as a PDF (front and back), ready to print or keep on your phone.
            </p>
            <p style="font-size: 15px; line-height: 1.6; color: ${EMAIL_COLORS.ink}; background-color: ${EMAIL_COLORS.cream}; border-radius: 10px; padding: 12px 16px;">${facts}</p>
            ${wallet ? `<div style="text-align: center; margin: 28px 0;"><a href="${escapeHtml(wallet)}" style="${EMAIL_BUTTON_STYLE}">Open your ID wallet</a></div>
            <p style="font-size: 14px; color: ${EMAIL_COLORS.inkMuted}; line-height: 1.5;">Sign in with this email address to see the card in your wallet.</p>` : ""}
            ${check ? `<p style="font-size: 14px; color: ${EMAIL_COLORS.inkMuted}; line-height: 1.5;">Anyone can check the card is genuine by scanning its QR code, or at <a href="${escapeHtml(check)}" style="color: ${EMAIL_COLORS.teal}; text-decoration: underline; word-break: break-all;">this link</a>.</p>` : ""}`);
  const text = [
    `Your ${programme.name} card is ready`,
    "",
    `Hello ${member.name},`,
    `${organisationName} has issued your ID card. It's attached as a PDF (front and back).`,
    member.idNumber ? `ID number: ${member.idNumber}` : "",
    `Valid until: ${validUntil ?? "No expiry"}`,
    wallet ? `Your ID wallet: ${wallet}` : "",
    check ? `Check the card: ${check}` : "",
  ].filter((line, index) => line || index === 1).join("\n");

  const { transporter, from } = await getEmailTransport();
  if (!transporter) {
    console.log("[EMAIL MOCK] member ID card email queued");
    return "sent";
  }
  const result = await transporter.sendMail({
    messageId,
    from,
    to: member.email,
    subject: `Your ID card from ${organisationName}`,
    text,
    html,
    attachments: [{ filename: `${fileSlug(member.name)}-id-card.pdf`, content: Buffer.from(pdf), contentType: "application/pdf" }],
  });
  assertEmailAccepted(result);
  return "sent";
}

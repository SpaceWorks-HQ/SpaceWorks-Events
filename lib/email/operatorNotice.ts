import { getEmailTransport } from "./transporter";
import { EMAIL_COLORS, emailLayout } from "./brand";

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[char]!);
}

/** A plain operator message (test email, backup alert) to a super admin. */
export async function sendOperatorNotice(params: { to: string; subject: string; lines: string[]; messageId?: string }) {
  const { transporter, from } = await getEmailTransport();
  const subject = params.subject.replace(/[\u0000-\u001F\u007F]+/g, " ").trim().slice(0, 240);
  const text = `${params.lines.join("\n\n")}\n\nSpace Works Events`;
  const html = emailLayout(escapeHtml(subject), `
          <h2 style="margin-top:0; color:${EMAIL_COLORS.ink}; font-size:20px; font-weight:600;">${escapeHtml(subject)}</h2>
          ${params.lines.map((line) => `<p style="font-size:16px; line-height:1.5; color:${EMAIL_COLORS.inkMuted};">${escapeHtml(line)}</p>`).join("")}`);
  if (!transporter) { console.log("[EMAIL MOCK] operator notice queued"); return; }
  await transporter.sendMail({ messageId: params.messageId, from, to: params.to, subject, text, html });
}

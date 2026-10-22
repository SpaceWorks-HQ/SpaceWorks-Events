import { assertEmailAccepted, getEmailTransport } from "./transporter";
import { EMAIL_COLORS, emailLayout } from "./brand";

/** A one-time sign-in code, sent when a password sign-in looks unusual (a new device, or after failed attempts). */
export async function sendSignInCodeEmail(params: { to: string; code: string; messageId?: string; }): Promise<void> {
  const { transporter, from } = await getEmailTransport();
  const code = params.code.replace(/\D/g, "").slice(0, 6);
  const html = emailLayout("Your sign-in code", `
            <h2 style="margin-top: 0; color: ${EMAIL_COLORS.ink}; font-size: 20px; font-weight: 600;">Your sign-in code</h2>
            <p style="font-size: 16px; line-height: 1.5; color: ${EMAIL_COLORS.inkMuted};">
              Someone signed in to your Space Works Events account with your password from a device we haven't seen before. Enter this code to finish signing in. It expires in 10 minutes.
            </p>
            <p style="font-size: 32px; font-weight: 700; letter-spacing: 8px; color: ${EMAIL_COLORS.ink}; text-align: center; margin: 28px 0;">${code}</p>
            <p style="font-size: 13px; color: ${EMAIL_COLORS.inkMuted}; line-height: 1.5;">
              If this wasn't you, someone knows your password: reset it from the sign-in page now. Never share this code.
            </p>`);
  const text = `Your sign-in code: ${code}\n\nSomeone signed in to your Space Works Events account with your password from a device we haven't seen before. Enter this code to finish signing in. It expires in 10 minutes.\n\nIf this wasn't you, someone knows your password: reset it from the sign-in page now. Never share this code.`;
  if (!transporter) {
    // Never print the code, even in development logs.
    console.log("[EMAIL MOCK] sign-in code queued");
    return;
  }
  const result = await transporter.sendMail({ messageId: params.messageId, from, to: params.to, subject: "Your Space Works Events sign-in code", text, html });
  assertEmailAccepted(result);
}

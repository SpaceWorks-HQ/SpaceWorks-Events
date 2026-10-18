import { cardState, formatCardDate, type MemberStatus } from "./core";

/*
 * What the public verify page may show. Only a valid or expired card shows
 * who it belongs to; a revoked card shows its status alone; pending,
 * rejected and unknown tokens are all the same "not found", so the page
 * never confirms that a token or a person exists.
 */

export type VerifyState = "valid" | "expired" | "revoked" | "not-found";

export type VerifyMember = {
  status: MemberStatus;
  name: string;
  idNumber: string | null;
  expiresAt: Date | null;
  photoUrl: string | null;
  programmeName: string;
  organisationName: string;
};

export type VerifyView =
  | { state: "valid" | "expired"; name: string; idNumber: string | null; validUntil: string | null; photoUrl: string | null; programmeName: string; organisationName: string }
  | { state: "revoked" | "not-found" };

export function verificationView(member: VerifyMember | null, now = new Date()): VerifyView {
  if (!member) return { state: "not-found" };
  const state = cardState(member, now);
  if (state === "revoked") return { state: "revoked" };
  if (state !== "valid" && state !== "expired") return { state: "not-found" };
  return {
    state,
    name: member.name,
    idNumber: member.idNumber,
    validUntil: formatCardDate(member.expiresAt),
    photoUrl: member.photoUrl,
    programmeName: member.programmeName,
    organisationName: member.organisationName,
  };
}

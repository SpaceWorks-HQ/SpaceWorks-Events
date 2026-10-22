import type { CardState, FieldType, MemberStatus } from "@/lib/memberIds/core";

export type MemberRow = {
  id: string;
  name: string;
  email: string | null;
  photoUrl: string | null;
  status: MemberStatus;
  state: CardState;
  idNumber: string | null;
  validUntil: string | null;
  values: Record<string, string>;
  reason: string | null;
  source: "FORM" | "IMPORT" | "MANUAL";
};

export type FormField = { key: string; label: string; type: FieldType; required: boolean; options: string[] };
export type StatusAction = "approve" | "reject" | "revoke" | "reinstate";

export const FILTERS = [
  { id: "all", label: "All" },
  { id: "PENDING", label: "Waiting" },
  { id: "APPROVED", label: "Approved" },
  { id: "REJECTED", label: "Rejected" },
  { id: "REVOKED", label: "Revoked" },
] as const;

export const ACTION_COPY: Record<StatusAction, { verb: string; done: (n: number) => string }> = {
  approve: { verb: "Approve", done: (n) => `${n} ${n === 1 ? "card" : "cards"} approved and issued.` },
  reject: { verb: "Reject", done: (n) => `${n} ${n === 1 ? "request" : "requests"} rejected.` },
  revoke: { verb: "Revoke", done: (n) => `${n} ${n === 1 ? "card" : "cards"} revoked. Their check page now says Revoked.` },
  reinstate: { verb: "Reinstate", done: (n) => `${n} ${n === 1 ? "card" : "cards"} reinstated.` },
};

export type MemberIds = { organisationSlug: string; programmeId: string };

/** Runs a member action that reports a count, then shows the outcome. */
export type RunSimple = <T extends { count: number }>(task: () => Promise<{ ok: true; data?: T } | { ok: false; error: string }>, done: (n: number, data?: T) => string) => Promise<void>;

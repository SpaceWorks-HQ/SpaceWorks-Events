import type { IdCardAttendee } from "@/lib/badge/types";
import type { FieldPlacement, FieldType } from "@/lib/memberIds/core";

export type DesignerField = { key: string; label: string; placement: FieldPlacement; type: FieldType };

export function samplePerson(fields: DesignerField[], idPrefix: string): IdCardAttendee {
  return {
    displayName: "Priya Raman",
    email: "priya@example.com",
    checkInQrToken: "https://example.com/verify/preview",
    checkInDetails: [],
    registrationDetails: fields.map((field) => ({ key: field.key, label: field.label, value: field.type === "DATE" ? "14 Feb 1998" : /blood/i.test(field.label) ? "O+" : /role|title|position/i.test(field.label) ? "Volunteer lead" : /dep|team/i.test(field.label) ? "Workshops" : "Sample answer" })),
    photoUrl: null,
    idNumber: `${idPrefix}-${new Date().getUTCFullYear()}-0042`,
    validUntil: "31 Dec 2026",
  };
}

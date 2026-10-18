import type { RegistrationFieldType } from "@prisma/client";
import type { FieldSettings } from "@/lib/registrationFields";

/** A question as the public sign-up and feedback forms render it. */
export type RegistrationFieldDefinition = {
  key: string;
  label: string;
  type: RegistrationFieldType;
  required: boolean;
  options: string[];
  /** Registration questions only (feedback questions have none of these). */
  helpText?: string;
  placeholder?: string;
  settings?: FieldSettings;
};

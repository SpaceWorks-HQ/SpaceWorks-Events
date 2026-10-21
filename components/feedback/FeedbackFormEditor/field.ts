import type { RegistrationFieldType } from "@prisma/client";

export type Field = { id: string; key: string; label: string; type: RegistrationFieldType; required: boolean; options: string[] };

import type { RegistrationFieldType } from "@prisma/client";
import type { LucideIcon } from "lucide-react";
import { AlignLeft, AtSign, CalendarDays, CircleDot, Hash, ListChecks, Phone, SquareCheck, SquareChevronDown, TextCursorInput } from "lucide-react";
import { cn } from "@/lib/cn";

const ICONS: Record<RegistrationFieldType, LucideIcon> = {
  TEXT: TextCursorInput,
  TEXTAREA: AlignLeft,
  RADIO: CircleDot,
  SELECT: SquareChevronDown,
  MULTI_SELECT: ListChecks,
  CHECKBOX: SquareCheck,
  EMAIL: AtSign,
  PHONE: Phone,
  NUMBER: Hash,
  DATE: CalendarDays,
};

/** Decorative icon for a question type; the friendly type label always sits next to it. */
export function FieldTypeIcon({ type, className }: { type: RegistrationFieldType; className?: string }) {
  const Icon = ICONS[type] ?? TextCursorInput;
  return <Icon aria-hidden className={cn("size-4 shrink-0", className)} />;
}

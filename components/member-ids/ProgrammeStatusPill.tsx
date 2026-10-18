import { Chip, type ChipTone } from "@/components/ui/display";

const STATUS: Record<"DRAFT" | "ACTIVE" | "CLOSED", { label: string; tone: ChipTone }> = {
  DRAFT: { label: "Draft", tone: "neutral" },
  ACTIVE: { label: "Active", tone: "success" },
  CLOSED: { label: "Closed", tone: "outline" },
};

export function ProgrammeStatusPill({ status }: { status: keyof typeof STATUS }) {
  return <Chip tone={STATUS[status].tone} size="sm">{STATUS[status].label}</Chip>;
}

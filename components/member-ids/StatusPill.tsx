import { BadgeCheck, CircleSlash, Clock, Hourglass, XCircle } from "lucide-react";
import { Chip, type ChipTone } from "@/components/ui/display";
import { CARD_STATE_LABELS, type CardState } from "@/lib/memberIds/core";

/** Card status as a pill: colour always paired with a word. */
const TONES: Record<CardState, { tone: ChipTone; icon: typeof BadgeCheck }> = {
  valid: { tone: "success", icon: BadgeCheck },
  expired: { tone: "warning", icon: Clock },
  revoked: { tone: "danger", icon: CircleSlash },
  pending: { tone: "info", icon: Hourglass },
  rejected: { tone: "neutral", icon: XCircle },
};

export function MemberStatusPill({ state, size = "md" }: { state: CardState; size?: "sm" | "md" }) {
  const { tone, icon: Icon } = TONES[state];
  return <Chip tone={tone} size={size} icon={<Icon />}>{CARD_STATE_LABELS[state]}</Chip>;
}

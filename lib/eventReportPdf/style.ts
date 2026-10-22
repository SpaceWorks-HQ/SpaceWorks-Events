import "server-only";

import { rgb, type Color, type PDFFont } from "pdf-lib";
import { percentOf } from "@/components/event-dashboard/analytics/metrics";

// ---------- Colour (Space Works palette; tints are cream deepened toward ink) ----------

export function hex(value: string): Color {
  const n = Number.parseInt(value.slice(1), 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

export const C = {
  canvas: hex("#FFFFFF"),
  subtle: hex("#FFF4E8"),
  muted: hex("#F8EBDC"),
  track: hex("#EFE3D4"),
  border: hex("#E6DCCF"),
  ink: hex("#142C2A"),
  textSecondary: hex("#2E4442"),
  textMuted: hex("#4A5D5B"),
  teal: hex("#006E63"),
  orange: hex("#FF7447"),
  successBg: hex("#DFFF8F"),
  successFg: hex("#142C2A"),
  warningBg: hex("#FFD447"),
  warningFg: hex("#142C2A"),
  dangerBg: hex("#FDE2E2"),
  dangerFg: hex("#B91C1C"),
};

// ---------- Small helpers ----------

export type Style = { font: PDFFont; size: number; color: Color; tracking?: number };

export const PAGE: [number, number] = [595.28, 841.89];
export const MARGIN = 48;
export const CONTENT_WIDTH = PAGE[0] - MARGIN * 2;
export const TOP = PAGE[1] - 72;
export const BOTTOM = 76;

export function plural(count: number, one: string, many = `${one}s`) {
  return `${count.toLocaleString("en-GB")} ${count === 1 ? one : many}`;
}

export function percentLabel(part: number, whole: number) {
  const value = percentOf(part, whole);
  return value == null ? "–" : `${value}%`;
}

export function roundedRectPath(width: number, height: number, radius: number) {
  const r = Math.max(0, Math.min(radius, width / 2, height / 2));
  return `M ${r} 0 H ${width - r} Q ${width} 0 ${width} ${r} V ${height - r} Q ${width} ${height} ${width - r} ${height} H ${r} Q 0 ${height} 0 ${height - r} V ${r} Q 0 0 ${r} 0 Z`;
}

export const PRIVACY: Record<string, string> = { PUBLIC: "Public", HIDDEN_LINK: "Anyone with the link", APPROVAL_REQUIRED: "Approval required", INVITE_ONLY: "Invite only" };

export const SPONSOR_TIERS: Record<string, string> = { PLATINUM: "Platinum", GOLD: "Gold", SILVER: "Silver", PARTNER: "Partners", COMMUNITY_PARTNER: "Community partners" };

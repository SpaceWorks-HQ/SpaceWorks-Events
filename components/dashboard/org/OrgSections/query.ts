import type { OrgEventView } from "@/lib/orgDashboard";

export type OrgQuery = { view: OrgEventView; q: string; pages: number; month: string | undefined };

/** Builds `?…` for this page, keeping the other filters. */
export function orgHref(base: string, query: OrgQuery, change: Partial<OrgQuery>) {
  const next = { ...query, ...change };
  const params = new URLSearchParams();
  if (next.view !== "upcoming") params.set("view", next.view);
  if (next.q) params.set("q", next.q);
  if (next.pages > 1) params.set("show", String(next.pages));
  if (next.month) params.set("month", next.month);
  const value = params.toString();
  return value ? `${base}?${value}` : base;
}

import "server-only";

import type { DashboardHome, HomeEventRow, HomeLiveEvent, HomeStat } from "@/lib/dashboardHome";
import type { loadOrganisationRevenue } from "@/lib/payments/revenue";

export type OrgEventView = "upcoming" | "draft" | "past";

export type OrgEventRow = HomeEventRow & {
  privacy: string;
  publicPath: string | null;
  checkInHref: string | null;
  linkable: boolean;
  /** Past events: "34 of 40 came" and feedback responses. */
  outcome: { came: number; going: number; feedback: number; } | null;
};

export type OrgSeriesCard = { id: string; title: string; rule: string; isDraft: boolean; next: { start: Date; timezone: string; going: number; } | null; };

export type OrgCalendar = {
  label: string;
  prevKey: string;
  nextKey: string;
  cells: Array<{ day: number | null; dots: string[]; today: boolean; }>;
  events: number;
  seriesDates: number;
};

export type OrgDashboard = {
  members: { total: number; owners: number; admins: number; members: number; initials: string[]; };
  needsYou: DashboardHome["needsYou"];
  next: DashboardHome["next"];
  live: HomeLiveEvent | null;
  calendar: OrgCalendar;
  stats: HomeStat[];
  events: { view: OrgEventView; rows: OrgEventRow[]; total: number; hasMore: boolean; counts: { upcoming: number; draft: number; past: number; }; };
  series: { cards: OrgSeriesCard[]; total: number; };
  setup: { hasProfile: boolean; hasEvent: boolean; hasTeam: boolean; hasPublished: boolean; } | null;
  /** Organisers only: the best-attended recent events and how many people come back. */
  insights: OrgInsights | null;
  /** Organisers only: money taken over the same window, per currency. */
  revenue: OrgRevenue | null;
};

export type OrgRevenue = { windowDays: number; currencies: Awaited<ReturnType<typeof loadOrganisationRevenue>>; };

export type OrgInsights = {
  windowDays: number;
  topEvents: Array<{ id: string; title: string; href: string; came: number; going: number }>;
  /** Share of people who came to two or more events; withheld below 10 people. */
  returning: { people: number; returning: number; percent: number } | null;
};

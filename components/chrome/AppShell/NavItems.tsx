"use client";

import type { ReactNode } from "react";
import Link from "next/link";
import { cn } from "@/lib/cn";
import type { ShellOrganisation } from "@/lib/appShell";
import { Tooltip } from "@/components/ui/menu";

export const roleLabel: Record<ShellOrganisation["role"], string> = {
  OWNER: "Owner",
  ADMIN: "Admin",
  MEMBER: "Member",
  COLLABORATOR: "Collaborator",
};

/** Shows a tooltip with the label only when the sidebar is collapsed to icons. */
export function RailTip({ collapsed, label, children }: { collapsed: boolean; label: string; children: ReactNode }) {
  return collapsed ? <Tooltip content={label} side="right">{children}</Tooltip> : <>{children}</>;
}

export function NavItem({
  href,
  icon,
  children,
  active,
  indent = false,
  collapsed,
  onNavigate,
  badge,
}: {
  href: string;
  icon: ReactNode;
  children: string;
  active: boolean;
  indent?: boolean;
  collapsed: boolean;
  onNavigate?: () => void;
  badge?: ReactNode;
}) {
  return (
    <RailTip collapsed={collapsed} label={children}>
      <Link
        href={href}
        onClick={onNavigate}
        aria-current={active ? "page" : undefined}
        aria-label={collapsed ? children : undefined}
        className={cn(
          "relative flex min-h-11 items-center gap-2.5 rounded-[10px] text-[15px] text-ink transition-colors hover:bg-sidebar-hover [&_svg]:size-[18px] [&_svg]:shrink-0",
          collapsed ? "justify-center px-0" : "px-3",
          indent && !collapsed && "pl-6 text-sm",
          active && "bg-sidebar-active font-semibold text-on-sidebar-active hover:bg-sidebar-active",
        )}
      >
        {/* The expanded sidebar is text-only (brand spec D9); the collapsed rail has no room for words, so it keeps the icon. */}
        {collapsed ? <span aria-hidden className="inline-flex">{icon}</span> : <span className="min-w-0 flex-1 truncate">{children}</span>}
        {badge}
      </Link>
    </RailTip>
  );
}

export function currentOrganisationSlug(pathname: string | null) {
  const match = /^\/dashboard\/([^/]+)/.exec(pathname ?? "");
  if (!match || match[1] === "org" || match[1] === "security") return null;
  return decodeURIComponent(match[1]!);
}

export function PendingBadge({ count, collapsed }: { count: number; collapsed: boolean }) {
  if (count <= 0) return null;
  const label = `${count} waiting for approval`;
  return collapsed ? (
    <span className="absolute right-1.5 top-1.5 size-2 rounded-full bg-highlight ring-2 ring-sidebar" title={label}>
      <span className="sr-only">{label}</span>
    </span>
  ) : (
    <span className="shrink-0 rounded-full bg-highlight px-[7px] text-xs font-semibold leading-5 tabular-nums text-on-highlight" title={label}>
      {count}
      <span className="sr-only"> waiting for approval</span>
    </span>
  );
}

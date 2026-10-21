"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  ArrowUpRight,
  CalendarDays,
  ChevronsUpDown,
  Home,
  IdCard,
  Menu as MenuIcon,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Repeat,
  Settings,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/cn";
import type { ShellOrganisation, ShellUser } from "@/lib/appShell";
import { SIDEBAR_COLLAPSED, SIDEBAR_COOKIE } from "@/lib/sidebar";
import { SpaceWorksEventsLogo, SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { OrgLogo } from "@/components/ui/display";
import { IconButton } from "@/components/ui/button";
import { Menu, MenuContent, MenuItem, MenuLabel, MenuSeparator, MenuTrigger } from "@/components/ui/menu";
import { BrandHomeLink } from "./SiteHeader";
import { AccountMenu } from "./AppShell/AccountMenu";
import { currentOrganisationSlug, NavItem, PendingBadge, RailTip, roleLabel } from "./AppShell/NavItems";

function SidebarContents({
  user,
  organisations,
  collapsed = false,
  onToggleCollapsed,
  onNavigate,
}: {
  user: ShellUser;
  organisations: ShellOrganisation[];
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  onNavigate?: () => void;
}) {
  const pathname = usePathname() ?? "";
  const slug = currentOrganisationSlug(pathname);
  const current = slug ? organisations.find((organisation) => organisation.slug === slug) ?? null : null;
  const base = current ? `/dashboard/${current.slug}` : "";
  const isAdmin = current?.role === "OWNER" || current?.role === "ADMIN";
  const isMember = current && current.role !== "COLLABORATOR";
  const onEventsPage = Boolean(current) && (pathname === base || pathname.startsWith(`${base}/event/`));

  return (
    <div className={cn("flex h-full flex-col gap-4 py-3.5", collapsed ? "px-2.5" : "px-3")}>
      <div className={cn("flex gap-2 pt-1", collapsed ? "flex-col items-center" : "items-start justify-between pl-2")}>
        {collapsed ? (
          <Link href="/dashboard" aria-label="Space Works Events home" className="inline-flex rounded-md p-1">
            <SpaceWorksLogo variant="app-icon" height={32} label={null} />
          </Link>
        ) : (
          <BrandHomeLink href="/dashboard" stacked />
        )}
        {onToggleCollapsed ? (
          <IconButton label={collapsed ? "Expand sidebar" : "Collapse sidebar"} size="sm" variant="quiet" onClick={onToggleCollapsed} aria-expanded={!collapsed}>
            {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
          </IconButton>
        ) : null}
      </div>

      {current ? (
        <>
          <Menu>
            <MenuTrigger
              aria-label={collapsed ? `Switch organisation, current: ${current.name}` : undefined}
              className={cn(
                "group w-full overflow-hidden rounded-[10px] border border-line bg-panel text-left transition-colors hover:border-line-strong",
                collapsed && "flex justify-center p-1.5",
              )}
            >
              {collapsed ? (
                <OrgLogo name={current.name} src={current.logoUrl} size="md" />
              ) : (
                <>
                  <span className="flex min-h-[58px] items-center gap-2.5 px-2.5 py-2">
                    <OrgLogo name={current.name} src={current.logoUrl} size="md" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[15px] font-semibold text-ink">{current.name}</span>
                      <span className="block text-caption text-ink-muted">{roleLabel[current.role]}</span>
                    </span>
                    <ChevronsUpDown aria-hidden className="mt-1 size-4 shrink-0 text-ink-muted" />
                    <span className="sr-only">Switch organisation</span>
                  </span>
                </>
              )}
            </MenuTrigger>
            <MenuContent align="start" side={collapsed ? "right" : "bottom"} className="min-w-[240px]">
              <MenuLabel>Organisations</MenuLabel>
              {organisations.map((organisation) => (
                <MenuItem key={organisation.slug} asChild>
                  <Link href={`/dashboard/${organisation.slug}`} onClick={onNavigate}>
                    <span className="flex items-center gap-2.5">
                      <OrgLogo name={organisation.name} src={organisation.logoUrl} size="sm" />
                      <span className="min-w-0 truncate">{organisation.name}</span>
                    </span>
                  </Link>
                </MenuItem>
              ))}
              <MenuSeparator />
              <MenuItem asChild icon={<Home />}>
                <Link href="/dashboard" onClick={onNavigate}>All organisations</Link>
              </MenuItem>
              <MenuItem asChild icon={<Plus />}>
                <Link href="/dashboard/org/new" onClick={onNavigate}>New organisation</Link>
              </MenuItem>
            </MenuContent>
          </Menu>

          <nav aria-label="Organisation" className="flex flex-col gap-1">
            {collapsed ? null : <p className="px-3 pb-0.5 text-overline text-ink-muted">Workspace</p>}
            <NavItem href={base} icon={<CalendarDays />} active={onEventsPage} collapsed={collapsed} onNavigate={onNavigate}>Events</NavItem>
            {isMember ? (
              <NavItem href={`${base}#series`} icon={<Repeat />} active={pathname.startsWith(`${base}/series/`)} collapsed={collapsed} onNavigate={onNavigate}>Series</NavItem>
            ) : null}
            {isMember ? (
              <NavItem href={`${base}/members`} icon={<Users />} active={pathname.startsWith(`${base}/members`)} collapsed={collapsed} onNavigate={onNavigate}>Members</NavItem>
            ) : null}
            {isMember ? (
              <NavItem href={`${base}/ids`} icon={<IdCard />} active={pathname.startsWith(`${base}/ids`)} collapsed={collapsed} onNavigate={onNavigate}>Member IDs</NavItem>
            ) : null}
            {isAdmin ? (
              // API access lives inside Settings (owners only), not in the menu.
              <NavItem href={`${base}/settings`} icon={<Settings />} active={pathname.startsWith(`${base}/settings`)} collapsed={collapsed} onNavigate={onNavigate}>Settings</NavItem>
            ) : null}
          </nav>
        </>
      ) : (
        <nav aria-label="Workspace" className="flex flex-col gap-1">
          <NavItem href="/dashboard" icon={<Home />} active={pathname === "/dashboard"} collapsed={collapsed} onNavigate={onNavigate}>Home</NavItem>
          {collapsed ? <span aria-hidden className="mx-auto my-2 h-px w-6 bg-line" /> : <p className="mt-4 px-3 pb-0.5 text-overline text-ink-muted">Organisations</p>}
          {organisations.map((organisation) => (
            <RailTip key={organisation.slug} collapsed={collapsed} label={organisation.name}>
              <Link
                href={`/dashboard/${organisation.slug}`}
                onClick={onNavigate}
                aria-label={collapsed ? organisation.name : undefined}
                className={cn(
                  "relative flex min-h-11 items-center gap-2.5 rounded-[10px] text-[15px] text-ink transition-colors hover:bg-sidebar-hover",
                  collapsed ? "justify-center" : "px-3",
                )}
              >
                <OrgLogo name={organisation.name} src={organisation.logoUrl} size="sm" className="size-6 rounded-[7px] text-[10px]" />
                {collapsed ? null : <span className="min-w-0 flex-1 truncate">{organisation.name}</span>}
                <PendingBadge count={organisation.pendingApprovals} collapsed={collapsed} />
              </Link>
            </RailTip>
          ))}
          <NavItem href="/dashboard/org/new" icon={<Plus />} active={pathname === "/dashboard/org/new"} collapsed={collapsed} onNavigate={onNavigate}>New organisation</NavItem>
        </nav>
      )}

      <div className="mt-auto flex flex-col gap-2">
        {current && current.role !== "COLLABORATOR" ? (
          <RailTip collapsed={collapsed} label="View public page">
            <Link
              href={`/${current.slug}`}
              onClick={onNavigate}
              aria-label={collapsed ? "View public page" : undefined}
              className={cn(
                "inline-flex min-h-11 items-center gap-1 rounded-[10px] text-sm font-medium text-ink underline-offset-4",
                collapsed ? "justify-center hover:bg-sidebar-hover" : "px-3 hover:underline",
              )}
            >
              {collapsed ? null : "View public page"}
              <ArrowUpRight aria-hidden className="size-4" />
            </Link>
          </RailTip>
        ) : null}
        <AccountMenu user={user} collapsed={collapsed} onNavigate={onNavigate} />
      </div>
    </div>
  );
}

/**
 * Dashboard app shell (docs/DESIGN.md §4.13): a 256px Citron sidebar with
 * text-only navigation on desktop that collapses to a 68px icon rail (remembered in a cookie so the server renders
 * the same width), and a top bar with a menu sheet below the md breakpoint.
 */
export function AppShell({ user, organisations, initialCollapsed = false, children }: { user: ShellUser; organisations: ShellOrganisation[]; initialCollapsed?: boolean; children: ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(initialCollapsed);
  const toggleCollapsed = () => {
    setCollapsed((value) => {
      const next = !value;
      document.cookie = `${SIDEBAR_COOKIE}=${next ? SIDEBAR_COLLAPSED : "expanded"}; Path=/; Max-Age=31536000; SameSite=Lax${window.location.protocol === "https:" ? "; Secure" : ""}`;
      return next;
    });
  };
  return (
    <div className="flex min-h-dvh flex-col md:flex-row">
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 overflow-y-auto overflow-x-hidden border-r border-line bg-sidebar transition-[width] duration-200 ease-yy motion-reduce:transition-none md:block",
          collapsed ? "w-[68px]" : "w-[256px]",
        )}
      >
        <SidebarContents user={user} organisations={organisations} collapsed={collapsed} onToggleCollapsed={toggleCollapsed} />
      </aside>

      <div className="sticky top-0 z-40 flex h-14 items-center justify-between border-b border-line bg-canvas px-4 md:hidden">
        <Link href="/dashboard" aria-label="Space Works Events home" className="inline-flex shrink-0 items-center rounded-md">
          <SpaceWorksEventsLogo height={30} label={null} />
        </Link>
        <DialogPrimitive.Root open={menuOpen} onOpenChange={setMenuOpen}>
          <DialogPrimitive.Trigger asChild>
            <IconButton label="Open navigation menu">
              <MenuIcon />
            </IconButton>
          </DialogPrimitive.Trigger>
          <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(20,44,42,0.48)]" />
            <DialogPrimitive.Content className="fixed inset-y-0 left-0 z-50 w-[min(280px,86vw)] overflow-y-auto border-r border-line bg-sidebar shadow-float focus:outline-none">
              <DialogPrimitive.Title className="sr-only">Navigation</DialogPrimitive.Title>
              <DialogPrimitive.Description className="sr-only">Dashboard navigation</DialogPrimitive.Description>
              <DialogPrimitive.Close asChild>
                <IconButton label="Close navigation menu" size="sm" className="absolute right-3 top-3 z-10">
                  <X />
                </IconButton>
              </DialogPrimitive.Close>
              <SidebarContents user={user} organisations={organisations} onNavigate={() => setMenuOpen(false)} />
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
      </div>

      <main id="main-content" tabIndex={-1} className="min-w-0 flex-1 px-4 py-6 focus:outline-none sm:px-6 md:px-10 md:py-9">
        <div className="mx-auto w-full max-w-[1200px]">{children}</div>
      </main>
    </div>
  );
}

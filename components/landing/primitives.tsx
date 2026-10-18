import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/cn";

/* Shared building blocks for the Space Works Events public pages. */

/** 1160px content column (140px side margins at 1440). */
export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-[1160px] px-4 sm:px-6 xl:px-0", className)}>{children}</div>;
}

/** Overline + Display/M title + optional Body L lead. */
export function SectionHeading({ overline, title, lead, className, id, as: Heading = "h2" }: { overline: string; title: ReactNode; lead?: ReactNode; className?: string; id?: string; as?: "h1" | "h2" }) {
  return (
    <div className={cn("flex max-w-[680px] flex-col gap-2", className)}>
      <p className="text-overline text-ink-muted">{overline}</p>
      <Heading id={id} className="text-display-m text-ink">{title}</Heading>
      {lead ? <p className="text-body-l text-ink-secondary">{lead}</p> : null}
    </div>
  );
}

const tileTones = {
  teal: "bg-accent-soft text-ink",
  citron: "bg-sw-citron text-sw-ink",
  sky: "bg-sw-sky text-sw-ink",
  yellow: "bg-sw-yellow text-sw-ink",
} as const;

export type IconTileTone = keyof typeof tileTones;

/** A brand icon (24px grid, 2px stroke) on a soft square tile. Decorative: the heading beside it names the thing. */
export function IconTile({ icon: Icon, tone = "teal", size = "md", className }: { icon: LucideIcon; tone?: IconTileTone; size?: "md" | "lg"; className?: string }) {
  return (
    <span aria-hidden className={cn("inline-flex shrink-0 items-center justify-center rounded-[12px]", size === "lg" ? "size-16 [&_svg]:size-7" : "size-12 [&_svg]:size-6", tileTones[tone], className)}>
      <Icon />
    </span>
  );
}

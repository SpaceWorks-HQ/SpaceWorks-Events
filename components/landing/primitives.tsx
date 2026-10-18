import type { ReactNode } from "react";
import { ThemedImage } from "@/components/ui/themed-image";
import { cn } from "@/lib/cn";

/* Shared building blocks for Yuyu's own public pages (Figma "Landing page" canvas 117:288). */

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

/** A 7×7 dot icon from /public/landing with its dark-theme twin (`<name>-dark.svg`). */
export function DotIcon({ name, size = 54, className }: { name: string; size?: number; className?: string }) {
  return <ThemedImage src={`/landing/${name}.svg`} darkSrc={`/landing/${name}-dark.svg`} width={size} height={size} className={cn("shrink-0", className)} />;
}

import { SpaceWorksEventsLogo, SpaceWorksLogo } from "./SpaceWorksLogo";

export type DotLockupLayout = "horizontal" | "stacked" | "tagline";
export type DotLockupSize = "sm" | "md" | "lg";

const HEIGHT: Record<DotLockupSize, number> = { sm: 32, md: 32, lg: 48 };

/**
 * @deprecated Use `SpaceWorksEventsLogo` (headers) or `<SpaceWorksLogo variant="lockup-stacked" />`
 * from `@/components/brand/SpaceWorksLogo`.
 */
export function DotLockup({ layout = "horizontal", size = "sm", label = "Space Works Events", className }: { layout?: DotLockupLayout; size?: DotLockupSize; label?: string | null; className?: string }) {
  if (layout === "stacked") return <SpaceWorksLogo variant="lockup-stacked" height={64} label={label === null ? null : "Space Works"} className={className} />;
  return <SpaceWorksEventsLogo height={HEIGHT[size]} label={label} className={className} />;
}

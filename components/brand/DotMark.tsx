import { SpaceWorksLogo } from "./SpaceWorksLogo";

export type DotMarkVariant = "auto" | "full" | "bright" | "onMarigold" | "mono";

/** @deprecated Use `SPACE_WORKS_LOGO_ARTWORK` from `@/components/brand/SpaceWorksLogo`. */
export const DOT_MARK_MIN_SIZE = 16;

/**
 * @deprecated Use `<SpaceWorksLogo variant="symbol" />` from `@/components/brand/SpaceWorksLogo`.
 * Draws the Space Works symbol at 48px and above and the app-icon tile below
 * (the brand's small-size exception); `mono` uses the one-colour ink symbol.
 */
export function DotMark({ size = 32, variant = "auto", label = "Space Works", className }: { size?: number; variant?: DotMarkVariant; label?: string | null; className?: string }) {
  if (size < 48) return <SpaceWorksLogo variant="app-icon" height={size} label={label} className={className} />;
  return <SpaceWorksLogo variant="symbol" tone={variant === "mono" ? "ink" : "full"} height={size} label={label} className={className} />;
}

import { DotGrid } from "./DotGrid";
import { BRAND_DIAMOND, type DotFaceMood } from "./patterns";

/**
 * @deprecated The Yuyu dot faces are retired; replace with copy or an icon.
 * Kept so existing imports compile: every mood now draws the same neutral,
 * decorative dot diamond in Space Works colours at the requested size.
 */
export function DotFace({
  size = 136,
  label,
  className,
  colors,
}: {
  mood: DotFaceMood;
  size?: number;
  label?: string;
  className?: string;
  colors?: Partial<Record<string, string>>;
  hover?: boolean;
}) {
  // 7 dots + 6 quarter-dot gaps = 8.5 dots across.
  return <DotGrid pattern={BRAND_DIAMOND} dot={size / 8.5} label={label} className={className} colors={colors} />;
}

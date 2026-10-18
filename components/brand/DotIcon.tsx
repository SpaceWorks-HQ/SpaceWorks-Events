import { DotGrid } from "./DotGrid";
import { ICONS, type DotIconName } from "./patterns";

/**
 * @deprecated Yuyu dot icons are retired; use a lucide-react icon. Kept so
 * existing imports compile; the dots are drawn in Space Works colours.
 */
export function DotIcon({ name, size = 54, label, className, colors }: { name: DotIconName; size?: number; label?: string; className?: string; colors?: Partial<Record<string, string>> }) {
  // 7 dots + 6 gaps of a third of a dot = 9 dots across.
  const dot = size / 9;
  return <DotGrid pattern={ICONS[name]} dot={dot} gap={dot / 3} label={label} className={className} colors={colors} />;
}

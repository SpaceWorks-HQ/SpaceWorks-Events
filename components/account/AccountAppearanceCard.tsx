"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { SegmentedControl } from "@/components/ui/choice";
import { useAppColorMode, type ColorModePreference } from "@/components/providers";
import { AccountCard } from "@/components/account/AccountCard";

const OPTIONS = [
  { value: "light", label: "Light", icon: <Sun aria-hidden /> },
  { value: "dark", label: "Dark", icon: <Moon aria-hidden /> },
  { value: "system", label: "System", icon: <Monitor aria-hidden /> },
] as const satisfies ReadonlyArray<{ value: ColorModePreference; label: string; icon: React.ReactNode }>;

/** Colour mode for this browser, using the same storage as the sidebar toggle. */
export function AccountAppearanceCard() {
  const { preference, setColorModePreference } = useAppColorMode();
  return (
    <AccountCard id="account-appearance" title="Appearance" description="Choose how Yuyu looks in this browser.">
      <div className="flex flex-col gap-2">
        <SegmentedControl<ColorModePreference>
          ariaLabel="Colour mode"
          value={preference}
          onValueChange={(next) => setColorModePreference(next)}
          options={OPTIONS}
          className="self-start"
        />
        <p className="text-caption text-ink-muted">System follows your device setting. Saved in this browser only.</p>
      </div>
    </AccountCard>
  );
}

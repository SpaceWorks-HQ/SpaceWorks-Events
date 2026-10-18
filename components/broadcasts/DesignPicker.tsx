"use client";

import * as RadioGroupPrimitive from "@radix-ui/react-radio-group";
import { Check } from "lucide-react";
import { BROADCAST_DESIGNS, type BroadcastDesignId } from "@/lib/email/broadcastDesigns";
import { getAccentTokens, normalizeAccentHex } from "@/lib/theme/accent";

/**
 * Choose how a broadcast looks. Each option is a tiny drawing of the design
 * in this event's own colour (and cover photo), so the choice is visual; the
 * full preview below shows the real email.
 */
export function DesignPicker({
  value,
  onChange,
  accentColor,
  coverImageUrl,
}: {
  value: BroadcastDesignId;
  onChange: (design: BroadcastDesignId) => void;
  accentColor: string | null;
  coverImageUrl: string | null;
}) {
  const accent = normalizeAccentHex(accentColor);
  const onAccent = getAccentTokens(accent, "light")["--yy-on-accent"];
  return (
    <RadioGroupPrimitive.Root
      value={value}
      onValueChange={(next) => onChange(next as BroadcastDesignId)}
      aria-label="Email design"
      className="grid grid-cols-3 gap-2"
    >
      {BROADCAST_DESIGNS.map((design) => (
        <RadioGroupPrimitive.Item
          key={design.id}
          value={design.id}
          title={design.description}
          className="group relative flex min-w-0 flex-col gap-1.5 rounded-xl border border-line bg-canvas p-1.5 text-left outline-none transition-colors hover:bg-subtle focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 data-[state=checked]:border-ink data-[state=checked]:shadow-[inset_0_0_0_0.5px_var(--color-ink)]"
        >
          <Thumbnail design={design.id} accent={accent} onAccent={onAccent} cover={coverImageUrl} />
          <span className="px-0.5 pb-0.5">
            <span className="block text-[12px] font-semibold leading-tight text-ink">{design.name}</span>
            {design.id === "photo" && !coverImageUrl ? <span className="block text-[11px] leading-tight text-ink-muted">Add a cover to use a photo</span> : null}
          </span>
          <span aria-hidden className="absolute right-2.5 top-2.5 hidden size-4 items-center justify-center rounded-full bg-ink text-canvas group-data-[state=checked]:flex">
            <Check className="size-3" strokeWidth={3} />
          </span>
        </RadioGroupPrimitive.Item>
      ))}
    </RadioGroupPrimitive.Root>
  );
}

/** Abstract lines standing in for the message body. */
function Lines({ color = "#d8d6d0", button }: { color?: string; button: string }) {
  return (
    <span className="flex flex-col gap-[3px] px-2 py-1.5">
      <span className="h-[3px] w-4/5 rounded-full" style={{ backgroundColor: color }} />
      <span className="h-[3px] w-full rounded-full" style={{ backgroundColor: color }} />
      <span className="h-[3px] w-3/5 rounded-full" style={{ backgroundColor: color }} />
      <span className="mt-0.5 h-[7px] w-7 rounded-full" style={{ backgroundColor: button }} />
    </span>
  );
}

function Thumbnail({ design, accent, onAccent, cover }: { design: BroadcastDesignId; accent: string; onAccent: string; cover: string | null }) {
  const frame = "flex aspect-[4/3] w-full flex-col overflow-hidden rounded-lg";
  switch (design) {
    case "minimal":
      return (
        <span aria-hidden className={`${frame} border border-line bg-white`}>
          <span className="mx-2 mt-2 h-[3px] w-8 rounded-full bg-[#8a8990]" />
          <span className="mx-2 mt-1.5 h-px bg-[#e7e6e2]" />
          <Lines button="#18181B" />
        </span>
      );
    case "accent":
      return (
        <span aria-hidden className={`${frame} bg-[#f4f4f2] p-1`}>
          <span className="flex flex-1 flex-col overflow-hidden rounded-md bg-white">
            <span className="flex h-[38%] flex-col justify-end gap-[3px] px-2 pb-1.5" style={{ backgroundColor: accent }}>
              <span className="h-[3px] w-6 rounded-full opacity-70" style={{ backgroundColor: onAccent }} />
              <span className="h-[5px] w-12 rounded-full" style={{ backgroundColor: onAccent }} />
            </span>
            <Lines button={accent} />
          </span>
        </span>
      );
    case "photo":
      return (
        <span aria-hidden className={`${frame} bg-[#f4f4f2] p-1`}>
          <span className="flex flex-1 flex-col overflow-hidden rounded-md bg-white">
            {cover ? (
              // eslint-disable-next-line @next/next/no-img-element -- tiny decorative thumbnail of the organiser's own cover
              <img src={cover} alt="" className="h-[38%] w-full object-cover" />
            ) : (
              <span className="h-[38%] w-full" style={{ background: `linear-gradient(135deg, ${accent}, #f59e0b)` }} />
            )}
            <span className="mx-2 mt-1 h-[5px] w-12 rounded-full bg-[#1c1b1f]" />
            <Lines button={accent} />
          </span>
        </span>
      );
    case "letter":
      return (
        <span aria-hidden className={`${frame} bg-[#f6f1e9] p-1`}>
          <span className="flex flex-1 flex-col items-center overflow-hidden rounded-sm border border-[#e9e1d3] bg-[#fffdf8]">
            <span className="mt-2 font-serif text-[10px] italic leading-none text-[#2b2a28]">Aa</span>
            <span className="mt-1 h-px w-4/5 bg-[#e9e1d3]" />
            <span className="w-full">
              <Lines color="#e6dccb" button={accent} />
            </span>
          </span>
        </span>
      );
    default:
      return (
        <span aria-hidden className={`${frame} bg-[#f8f9fa] p-1`}>
          <span className="flex flex-1 flex-col overflow-hidden rounded-md border border-[#e0e0e0] bg-white">
            <span className="flex h-[30%] items-center justify-center bg-[#18181B]">
              <span className="h-[4px] w-10 rounded-full bg-white" />
            </span>
            <Lines button="#18181B" />
          </span>
        </span>
      );
  }
}

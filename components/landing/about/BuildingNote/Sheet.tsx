"use client";

import { type ReactNode } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/cn";
import { HAIRLINE, INK, LETTER, PAPER, PAPER_BACK, PAPER_LINE } from "./materials";

/** The three thirds of the letter: the middle faces us, the top and bottom fold over it. */
export function SheetPanels({ panel, open = false }: { panel: number; open?: boolean }) {
  return (
    <>
      <PaperFace className="absolute inset-0">
        <Lines count={4} />
      </PaperFace>
      <Fold name="top" panel={panel} open={open}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-55">{LETTER.overline}</p>
        <p className="mt-1 font-accent text-[15px] font-medium leading-tight">{LETTER.title}</p>
        <div className="mt-3"><Lines count={2} /></div>
      </Fold>
      <Fold name="bottom" panel={panel} open={open}>
        <Lines count={3} />
        <p className="mt-3 text-right text-[14px] font-semibold opacity-75">— {LETTER.signature}</p>
      </Fold>
    </>
  );
}

/** One folded third of the letter: printed side, paper back, and a shade that lifts as it opens. */
export function Fold({ name, panel, open = false, children }: { name: "top" | "bottom"; panel: number; open?: boolean; children: ReactNode }) {
  const top = name === "top";
  const marker = top ? { "data-top": "" } : { "data-bottom": "" };
  const shadeMarker = top ? { "data-top-shade": "" } : { "data-bottom-shade": "" };
  return (
    <motion.div
      {...marker}
      className={cn("absolute inset-x-0 [transform-style:preserve-3d]", top ? "bottom-full origin-bottom" : "top-full origin-top")}
      style={{ height: panel }}
      initial={{ rotateX: open ? 0 : top ? -178 : 178 }}
    >
      <PaperFace className="absolute inset-0 [backface-visibility:hidden]">
        {children}
        <motion.div {...shadeMarker} className="pointer-events-none absolute inset-0 bg-sw-ink" style={{ opacity: open ? 0 : 0.28 }} />
      </PaperFace>
      <div
        className="absolute inset-0 rounded-[3px] [backface-visibility:hidden] [transform:rotateX(180deg)]"
        style={{ background: `linear-gradient(${top ? "180deg" : "0deg"}, ${PAPER_BACK}, #EFE6DB)`, boxShadow: `inset 0 0 0 1px ${HAIRLINE}` }}
      />
    </motion.div>
  );
}

export function PaperFace({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[3px] px-6 py-4", className)} style={{ background: PAPER, color: INK, boxShadow: `inset 0 0 0 1px ${HAIRLINE}` }}>
      {children}
    </div>
  );
}

export function Lines({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-[11px]">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="block h-[2px] rounded-full" style={{ background: PAPER_LINE, width: index === count - 1 ? "58%" : "100%" }} />
      ))}
    </div>
  );
}

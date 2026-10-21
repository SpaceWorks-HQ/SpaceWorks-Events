"use client";

import { type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { AIRMAIL, ENVELOPE, ENVELOPE_FLAP, ENVELOPE_POCKET, ENVELOPE_SIDES, FLAP_CLIP, FLAP_EDGE, HAIRLINE, INK, LETTER } from "./materials";

/* ---------- Envelope pieces ---------- */

export function EnvelopeBody() {
  return (
    <>
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE, boxShadow: `inset 0 0 0 1px ${HAIRLINE}` }} />
      <span className="absolute inset-0 rounded-[10px] opacity-75" style={{ background: ENVELOPE_SIDES, clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
      <span className="absolute inset-0 rounded-[10px] opacity-75" style={{ background: ENVELOPE_SIDES, transform: "scaleX(-1)", clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
    </>
  );
}

export function Pocket({ children }: { children?: ReactNode }) {
  return (
    <span className="absolute inset-0 rounded-[10px]">
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE_POCKET, clipPath: "polygon(0 100%, 0 0, 50% 54%, 100% 0, 100% 100%)" }} />
      <span
        className="pointer-events-none absolute inset-0 rounded-[10px] p-[5px]"
        style={{ background: AIRMAIL, WebkitMask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)", WebkitMaskComposite: "xor", maskComposite: "exclude" }}
      />
      {children}
    </span>
  );
}

export function Label() {
  return (
    <span className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-3 text-left" style={{ color: INK }}>
      <span>
        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">{LETTER.overline}</span>
        <span className="mt-0.5 block font-accent text-[16px] font-medium leading-tight">{LETTER.title}</span>
      </span>
      <span className="hidden shrink-0 text-[12px] font-semibold opacity-60 transition-opacity group-hover:opacity-100 sm:inline">Open the letter →</span>
    </span>
  );
}

export function ClosedEnvelope() {
  return (
    <span className="relative block size-full">
      <EnvelopeBody />
      <Pocket>
        <Label />
      </Pocket>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[58%] origin-top rounded-t-[10px] transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] [transform:perspective(900px)_rotateX(0deg)] group-hover:[transform:perspective(900px)_rotateX(16deg)] motion-reduce:transition-none"
        style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: FLAP_EDGE }}
      />
      <WaxSeal className="absolute left-1/2 top-[58%] size-[60px] -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 group-hover:rotate-[-12deg] motion-reduce:transition-none" />
    </span>
  );
}

/** A small isometric box, drawn for the seal (not the logo). */
export function BoxGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round">
      <path d="M12 3 20 7.5 12 12 4 7.5Z" />
      <path d="M4 7.5V16.5L12 21V12" />
      <path d="M20 7.5V16.5L12 21" />
    </svg>
  );
}

/** The seal: the page's one Workshop Orange moment, with a Deep Ink box pressed into it. */
export function WaxSeal({ className, half }: { className?: string; half?: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={cn("grid place-items-center rounded-[47%_53%_49%_51%] text-sw-ink", className)}
      style={{
        background: "radial-gradient(circle at 32% 26%, color-mix(in srgb, #FF7447 78%, #FFF4E8), #FF7447 70%)",
        boxShadow: `inset 0 0 0 1.5px ${HAIRLINE}`,
        // A jagged crack down the middle when split.
        clipPath:
          half === "left"
            ? "polygon(0 0, 54% 0, 47% 18%, 55% 33%, 44% 52%, 53% 70%, 45% 86%, 51% 100%, 0 100%)"
            : half === "right"
              ? "polygon(54% 0, 100% 0, 100% 100%, 51% 100%, 45% 86%, 53% 70%, 44% 52%, 55% 33%, 47% 18%)"
              : undefined,
      }}
    >
      <span className="grid size-[64%] place-items-center rounded-full border-[1.5px] border-[rgb(20_44_42/0.35)]">
        <BoxGlyph />
      </span>
    </span>
  );
}

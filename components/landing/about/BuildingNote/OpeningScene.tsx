"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, useAnimate } from "framer-motion";
import { ENVELOPE_FLAP, ENVELOPE_RATIO, FLAP_BACK_CLIP, FLAP_CLIP, FLAP_EDGE, LAYOUT_ID, LINER, wait } from "./materials";
import { EnvelopeBody, Label, Pocket, WaxSeal } from "./Envelope";
import { SheetPanels } from "./Sheet";

/**
 * One continuous choreography with springs and overlaps: the envelope arrives
 * from the page (shared layout), the seal is pressed and cracks, the flap
 * swings open showing its lining, the letter slides out as the envelope gives
 * a little, the envelope drops away, and the letter unfolds its thirds.
 */
export function OpeningScene({ onDone }: { onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const [width] = useState(() => (typeof window === "undefined" ? 420 : Math.min(window.innerWidth * 0.86, 420)));
  const height = width / ENVELOPE_RATIO;
  const panel = Math.round(height * 0.56);
  const started = useRef(false);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const play = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    // Closing mid-opening unmounts the scene; stop quietly instead of animating detached parts.
    const step = (selector: string, keyframes: Record<string, unknown>, options: Record<string, unknown>): Promise<unknown> =>
      alive.current && scope.current ? Promise.resolve(animate(selector, keyframes as never, options as never)) : Promise.resolve();
    const spring = (stiffness: number, damping: number, mass = 1) => ({ type: "spring" as const, stiffness, damping, mass });
    const envelope = "[data-env]";

    // A breath after arriving, then press the seal.
    await wait(60);
    await step("[data-seal]", { scale: [1, 0.9, 1.05], rotate: [0, -5, 2] }, { duration: 0.3, ease: "easeInOut" });

    // Crack: the halves tumble away under gravity, at slightly different speeds.
    step("[data-seal-left]", { x: -60, y: height * 1.5, rotate: -110, opacity: [1, 1, 0] }, { duration: 0.85, ease: [0.45, 0, 0.85, 0.35] });
    step("[data-seal-right]", { x: 74, y: height * 1.6, rotate: 135, opacity: [1, 1, 0] }, { duration: 0.9, ease: [0.45, 0, 0.85, 0.35] });
    step("[data-label]", { opacity: 0 }, { duration: 0.3 });
    await wait(70);

    // The flap swings back on a soft spring; its face darkens as it turns edge-on.
    step("[data-flap]", { rotateX: -180 }, spring(85, 12));
    step("[data-flap-shade]", { opacity: [0, 0.4, 0.08] }, { duration: 0.65, ease: "easeInOut" });
    await wait(270);
    step("[data-flap-wrap]", { zIndex: 0 }, { duration: 0 });
    await wait(130);

    // The letter slides out; the envelope gives a little as it is pulled.
    step(envelope, { y: [0, 7, 0], rotate: [-1.5, -0.4, -1.2] }, { duration: 0.65, ease: "easeInOut" });
    await step("[data-sheet]", { y: -height * 0.66, rotate: [-1.5, 1.4] }, spring(95, 15));

    // Lifted clear: the letter comes forward while the envelope drops away.
    step("[data-sheet]", { zIndex: 20 }, { duration: 0 });
    step(envelope, { y: "120vh", rotate: 16, x: 30 }, { duration: 0.95, ease: [0.5, 0, 0.9, 0.5] });
    const centre = height / 2 - panel / 2 - height * 0.08;
    await step("[data-sheet]", { y: centre, scale: 1.12, rotate: -0.6 }, spring(105, 16));

    // Unfold: the top third swings up, then the bottom third down, overlapping.
    step("[data-top]", { rotateX: 0 }, spring(100, 13));
    step("[data-top-shade]", { opacity: 0 }, { duration: 0.5, ease: "easeOut" });
    await wait(200);
    step("[data-bottom]", { rotateX: 0 }, spring(100, 13));
    step("[data-sheet]", { rotate: 0 }, spring(90, 14));
    await step("[data-bottom-shade]", { opacity: 0 }, { duration: 0.5, ease: "easeOut" });
    await wait(220);
    if (alive.current) onDone();
  }, [animate, height, onDone, panel, scope]);

  // Start once the envelope has arrived from the page, or shortly after if it didn't travel.
  useEffect(() => {
    const fallback = window.setTimeout(() => void play(), 650);
    return () => window.clearTimeout(fallback);
  }, [play]);

  return (
    <motion.div
      ref={scope}
      layoutId={LAYOUT_ID}
      onLayoutAnimationComplete={() => void play()}
      transition={{ layout: { type: "spring", stiffness: 170, damping: 22, mass: 0.8 } }}
      className="relative [perspective:1400px]"
      style={{ width, height }}
    >
      {/* Back of the envelope */}
      <motion.div data-env className="absolute inset-0" style={{ zIndex: 1, rotate: -1.5 }}>
        <EnvelopeBody />
      </motion.div>

      {/* The folded letter (a tri-fold): the middle third faces us; the top and bottom thirds are folded over it. */}
      <motion.div data-sheet className="absolute [transform-style:preserve-3d]" style={{ left: "7%", right: "7%", top: height * 0.08, height: panel, zIndex: 2 }}>
        <SheetPanels panel={panel} />
      </motion.div>

      {/* Front of the envelope */}
      <motion.div data-env className="absolute inset-0" style={{ zIndex: 3, rotate: -1.5 }}>
        <Pocket>
          <motion.span data-label className="absolute inset-0">
            <Label />
          </motion.span>
        </Pocket>
      </motion.div>

      {/* The flap: two-sided, hinged at the top edge; drops behind the letter once open */}
      <motion.div data-env data-flap-wrap className="pointer-events-none absolute inset-0 [perspective:1400px]" style={{ zIndex: 4, rotate: -1.5 }}>
        <motion.div data-flap className="absolute inset-x-0 top-0 h-[58%] origin-top [transform-style:preserve-3d]">
          <div className="absolute inset-0 rounded-t-[10px] [backface-visibility:hidden]" style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: FLAP_EDGE }}>
            <motion.div data-flap-shade className="absolute inset-0 bg-sw-ink" style={{ opacity: 0, clipPath: FLAP_CLIP }} />
          </div>
          {/* The lining is on the flipped back face, so its triangle is drawn upside down here to
              land the right way up once the flap is open: wide along the fold, point outward. */}
          <div className="absolute inset-0 rounded-b-[10px] [backface-visibility:hidden] [transform:rotateX(180deg)]" style={{ background: LINER, clipPath: FLAP_BACK_CLIP }} />
        </motion.div>
      </motion.div>

      {/* The seal, in two halves that part when it cracks */}
      <div className="pointer-events-none absolute left-1/2 top-[58%]" style={{ zIndex: 6 }}>
        <motion.div data-seal className="absolute -left-[30px] -top-[30px] size-[60px]">
          <motion.div data-seal-left className="absolute inset-0"><WaxSeal half="left" className="size-[60px]" /></motion.div>
          <motion.div data-seal-right className="absolute inset-0"><WaxSeal half="right" className="size-[60px]" /></motion.div>
        </motion.div>
      </div>
    </motion.div>
  );
}

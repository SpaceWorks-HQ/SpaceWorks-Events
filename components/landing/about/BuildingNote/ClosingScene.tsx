"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { motion, useAnimate } from "framer-motion";
import { ENVELOPE_RATIO } from "./materials";
import { SheetPanels } from "./Sheet";

/**
 * Closing: the letter shrinks into the open sheet, folds its bottom third up
 * and its top third down, then flies back and tucks into the envelope, which
 * is already waiting on the page as the backdrop fades.
 */
export function ClosingScene({ target, onFly, onDone }: { target: DOMRect | null; onFly: () => void; onDone: () => void }) {
  const [scope, animate] = useAnimate();
  const [width] = useState(() => (typeof window === "undefined" ? 420 : Math.min(window.innerWidth * 0.86, 420)));
  const panel = Math.round((width / ENVELOPE_RATIO) * 0.56);
  const callbacks = useRef({ onFly, onDone });
  useLayoutEffect(() => {
    callbacks.current = { onFly, onDone };
  });

  useEffect(() => {
    // Development runs effects twice (mount, cleanup, mount) and the cleanup
    // stops this scope's animations, so each run checks it is still current
    // and the second run starts the sequence cleanly from the beginning.
    let current = true;
    const ease = [0.45, 0, 0.25, 1] as const;
    void (async () => {
      const sheet = scope.current as HTMLElement;
      // Cross-fade in from the shrinking letter at the same spot.
      await animate(sheet, { opacity: [0, 1], scale: [1.32, 1.12], x: 0, y: 0, rotate: 0 }, { duration: 0.34, ease: [0.2, 0.8, 0.2, 1] });
      if (!current) return;
      animate("[data-bottom-shade]", { opacity: [0, 0.28] }, { duration: 0.4, ease });
      await animate("[data-bottom]", { rotateX: [0, 178] }, { duration: 0.4, ease });
      if (!current) return;
      animate("[data-top-shade]", { opacity: [0, 0.28] }, { duration: 0.4, ease });
      await animate("[data-top]", { rotateX: [0, -178] }, { duration: 0.4, ease });
      if (!current || !sheet.isConnected) return;

      // Home: the envelope reappears on the page and the backdrop fades while the letter flies over.
      callbacks.current.onFly();
      const here = sheet.getBoundingClientRect();
      const toX = target ? target.left + target.width / 2 - (here.left + here.width / 2) : 0;
      const toY = target ? target.top + target.height * 0.42 - (here.top + here.height / 2) : 140;
      const scale = target ? Math.max(0.3, ((target.width * 0.8) / here.width) * 1.12) : 0.6;
      await animate(sheet, { x: toX, y: toY, scale, rotate: -1.5 }, { duration: 0.7, ease: [0.4, 0, 0.2, 1] });
      if (!current) return;
      // Tuck in: a small slide down into the pocket as it fades.
      await animate(sheet, { y: toY + 10, opacity: 0, scale: scale * 0.97 }, { duration: 0.22, ease: "easeIn" });
      if (current) callbacks.current.onDone();
    })();
    return () => {
      current = false;
    };
  }, [animate, scope, target]);

  return (
    <div className="relative [perspective:1400px]" style={{ width: width * 0.86, height: panel }}>
      <motion.div ref={scope} className="absolute inset-0 [transform-style:preserve-3d]" style={{ opacity: 0 }}>
        <SheetPanels panel={panel} open />
      </motion.div>
    </div>
  );
}

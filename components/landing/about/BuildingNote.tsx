"use client";

import { useEffect, useRef, useState } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { X } from "lucide-react";
import { cn } from "@/lib/cn";
import { ENVELOPE_RATIO, LAYOUT_ID, LETTER, type Phase } from "./BuildingNote/materials";
import { ClosedEnvelope } from "./BuildingNote/Envelope";
import { OpeningScene } from "./BuildingNote/OpeningScene";
import { ClosingScene } from "./BuildingNote/ClosingScene";
import { ReadingLetter } from "./BuildingNote/ReadingLetter";

/**
 * The team's note on the About page: a sealed airmail envelope that lifts off
 * the page, breaks its seal, opens, slides out a folded letter that unfolds,
 * and settles into a letter to read. Closing folds the letter back up and
 * tucks it into the envelope. Reduced motion skips straight to the letter.
 */
export function BuildingNote({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const [phase, setPhase] = useState<Phase>("closed");
  const reduceMotion = useReducedMotion();
  const closeButton = useRef<HTMLButtonElement>(null);
  const reading = open && (Boolean(reduceMotion) || phase === "reading");
  const trigger = useRef<HTMLButtonElement>(null);
  const [target, setTarget] = useState<DOMRect | null>(null);
  // While the folded letter flies home, the envelope is already back on the page
  // and the backdrop fades; when the letter tucks in, the envelope dips gently.
  const [flying, setFlying] = useState(false);
  const [returned, setReturned] = useState(0);

  const finishClosing = () => {
    setOpen(false);
    setPhase("closed");
    setFlying(false);
    setReturned((count) => count + 1);
  };

  const requestClose = () => {
    if (phase === "closing") return;
    // Mid-opening, or with reduced motion, just close. While reading, fold the letter away first.
    if (reduceMotion || phase !== "reading") {
      setOpen(false);
      setPhase("closed");
      return;
    }
    setFlying(false);
    setTarget(trigger.current?.getBoundingClientRect() ?? null);
    setPhase("closing");
  };

  useEffect(() => {
    if (reading) closeButton.current?.focus({ preventScroll: true });
  }, [reading]);

  return (
    <DialogPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        if (next) {
          setOpen(true);
          setPhase("opening");
        } else {
          requestClose();
        }
      }}
    >
      <DialogPrimitive.Trigger asChild>
        <button
          ref={trigger}
          type="button"
          className={cn(
            "group relative block w-full max-w-[420px] rounded-[12px] text-left outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4",
            className,
          )}
          aria-label="Open the note from the Space Works team"
        >
          <span className="block w-full" style={{ aspectRatio: ENVELOPE_RATIO }}>
            {/* While it is open the envelope lives in the dialog; this keeps its place on the page. */}
            {open && !reduceMotion && !flying ? null : (
              <motion.span
                layoutId={reduceMotion || flying ? undefined : LAYOUT_ID}
                className="block size-full"
                transition={{ layout: { type: "spring", stiffness: 140, damping: 22 } }}
              >
                <motion.span
                  key={returned}
                  className="block size-full"
                  initial={false}
                  animate={returned && !reduceMotion ? { y: [0, 5, 0] } : { y: 0 }}
                  transition={{ duration: 0.5, ease: [0.3, 0, 0.3, 1] }}
                >
                  <ClosedEnvelope />
                </motion.span>
              </motion.span>
            )}
          </span>
        </button>
      </DialogPrimitive.Trigger>

      <AnimatePresence>
        {open ? (
          <DialogPrimitive.Portal forceMount>
            <DialogPrimitive.Overlay asChild forceMount>
              <motion.div
                className="fixed inset-0 z-50 bg-[rgb(20_44_42/0.62)] backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: flying ? 0 : 1, transition: { duration: flying ? 0.6 : 0.5, ease: "easeInOut" } }}
                exit={{ opacity: 0, transition: { duration: 0.2 } }}
              />
            </DialogPrimitive.Overlay>
            <DialogPrimitive.Content
              forceMount
              aria-describedby={undefined}
              onOpenAutoFocus={(event) => event.preventDefault()}
              className="fixed inset-0 z-50 flex items-center justify-center overflow-hidden outline-none"
            >
              <DialogPrimitive.Title className="sr-only">{`${LETTER.overline}: ${LETTER.title}`}</DialogPrimitive.Title>
              <DialogPrimitive.Close asChild>
                <button
                  ref={closeButton}
                  type="button"
                  aria-label="Close the letter"
                  className="absolute right-4 top-4 z-30 inline-flex size-11 items-center justify-center rounded-[10px] bg-sw-cream text-sw-ink transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sw-cream"
                >
                  <X className="size-5" />
                </button>
              </DialogPrimitive.Close>

              {/* Each stage is its own full-screen, centred layer, so stages cross-fade in place. */}
              <AnimatePresence>
                {phase === "closing" ? (
                  <motion.div key="closing" className="absolute inset-0 grid place-items-center">
                    <ClosingScene target={target} onFly={() => setFlying(true)} onDone={finishClosing} />
                  </motion.div>
                ) : reading ? (
                  <motion.div key="letter" className="absolute inset-0 grid place-items-center" exit={{ opacity: 1, transition: { duration: 0.34 } }}>
                    <ReadingLetter reduceMotion={Boolean(reduceMotion)} />
                  </motion.div>
                ) : (
                  <motion.div key="scene" className="absolute inset-0 grid place-items-center" exit={{ opacity: 0, scale: 1.03, transition: { duration: 0.35, ease: "easeOut" } }}>
                    <OpeningScene onDone={() => setPhase("reading")} />
                    <button
                      type="button"
                      onClick={() => setPhase("reading")}
                      className="fixed bottom-6 left-1/2 z-30 min-h-11 -translate-x-1/2 whitespace-nowrap rounded-[10px] bg-sw-ink/70 px-4 py-2 text-sm font-semibold text-sw-cream underline-offset-4 backdrop-blur-sm hover:underline"
                    >
                      Skip to the letter
                    </button>
                  </motion.div>
                )}
              </AnimatePresence>
            </DialogPrimitive.Content>
          </DialogPrimitive.Portal>
        ) : null}
      </AnimatePresence>
    </DialogPrimitive.Root>
  );
}

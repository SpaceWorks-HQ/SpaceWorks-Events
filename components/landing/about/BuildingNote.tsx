"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { AnimatePresence, motion, useAnimate, useReducedMotion, type Variants } from "framer-motion";
import { X } from "lucide-react";
import { DotMark } from "@/components/brand/DotMark";
import { cn } from "@/lib/cn";

/* ---------- The letter ---------- */

const LETTER = {
  overline: "A building note",
  title: "From RForum to Yuyu",
  intro: [
    "Last year, at the T4GC Summit, we built RForum.",
    "The idea was simple: how can we make an event feel more engaging for the people attending it?",
    "RForum became an open-source platform focused on attendee engagement—a space for conversations, participation, and interaction within an event.",
    "But after the summit, another question stayed with us: what if we could build something that helped run the entire event? Not just engagement. Everything.",
    "That question eventually became Yuyu.",
    "This year, I started building Yuyu as the next piece of the event ecosystem we began with RForum—but with a much larger scope.",
  ],
  list: [
    "Registration and free tickets",
    "Attendee management",
    "Event schedules and sessions",
    "On-ground check-in",
    "Managing the event experience",
    "Post-event feedback",
  ],
  outro: [
    "The goal wasn't to build another ticketing platform. It was to build an open-source event management suite that supports the complete lifecycle of an event—before, during, and after it happens.",
    "RForum started with one part of the event experience. Yuyu is our attempt to connect the rest of it.",
    "And that's what I like most about how it came together:",
  ],
  closing: ["One summit.", "One problem.", "One open-source project.", "And then the question: what should we build next?", "That question became Yuyu."],
  signature: "Abhiram",
};

/* ---------- Materials (paper stays paper in both themes) ---------- */

const PAPER = "#FBF7EF";
const PAPER_BACK = "#F1EADB";
const PAPER_LINE = "rgba(120, 98, 60, 0.14)";
const INK = "#2B2620";
const ENVELOPE = "linear-gradient(160deg, #F1E4CA, #E2CDA6)";
const ENVELOPE_FLAP = "linear-gradient(172deg, #F8EEDA 10%, #DCC39A)";
const ENVELOPE_POCKET = "linear-gradient(12deg, #E8D6B3, #F6EBD5)";
const ENVELOPE_SIDES = "linear-gradient(115deg, #EBDDBF, #D7BF96)";
// The inside of the flap: a soft lining with the brand's marigold dots.
const LINER = "radial-gradient(circle, rgba(240, 160, 40, 0.38) 1.4px, transparent 1.6px) 0 0 / 11px 11px, linear-gradient(180deg, #FFF6E6, #F6E3C4)";
const ENVELOPE_RATIO = 1.62;
const FLAP_CLIP = "polygon(0 0, 100% 0, 50% 100%)";
const FLAP_BACK_CLIP = "polygon(0 100%, 100% 100%, 50% 0)";

const LAYOUT_ID = "building-note-envelope";
type Phase = "closed" | "opening" | "reading" | "closing";

const wait = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms));

/**
 * The builder's note on the About page: a sealed envelope that lifts off the
 * page, breaks its seal, opens, slides out a folded letter that unfolds, and
 * settles into a letter to read. Reduced motion skips straight to the letter.
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
          aria-label="Open the building note, From RForum to Yuyu"
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
                className="fixed inset-0 z-50 bg-[rgba(17,17,19,0.6)] backdrop-blur-[3px]"
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
                  className="absolute right-4 top-4 z-30 inline-flex size-11 items-center justify-center rounded-full bg-white/90 text-[#18181B] shadow-float transition-colors hover:bg-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
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
                      className="fixed bottom-6 left-1/2 z-30 -translate-x-1/2 whitespace-nowrap rounded-full bg-black/30 px-4 py-2 text-sm font-semibold text-white/85 underline-offset-4 backdrop-blur-sm hover:text-white hover:underline"
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

/* ---------- Envelope pieces ---------- */

function EnvelopeBody() {
  return (
    <>
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE }} />
      <span className="absolute inset-0 rounded-[10px] opacity-75" style={{ background: ENVELOPE_SIDES, clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
      <span className="absolute inset-0 rounded-[10px] opacity-75" style={{ background: ENVELOPE_SIDES, transform: "scaleX(-1)", clipPath: "polygon(0 0, 50% 54%, 0 100%)" }} />
    </>
  );
}

function Pocket({ children }: { children?: ReactNode }) {
  return (
    <span className="absolute inset-0 rounded-[10px]">
      <span className="absolute inset-0 rounded-[10px]" style={{ background: ENVELOPE_POCKET, clipPath: "polygon(0 100%, 0 0, 50% 54%, 100% 0, 100% 100%)" }} />
      {children}
    </span>
  );
}

function Label() {
  return (
    <span className="absolute inset-x-5 bottom-4 flex items-end justify-between gap-3 text-left" style={{ color: INK }}>
      <span>
        <span className="block text-[11px] font-bold uppercase tracking-[0.16em] opacity-60">{LETTER.overline}</span>
        <span className="block font-serif text-[19px] italic leading-tight">{LETTER.title}</span>
      </span>
      <span className="shrink-0 text-[12px] font-semibold opacity-60 transition-opacity group-hover:opacity-100">Open the letter →</span>
    </span>
  );
}

function ClosedEnvelope() {
  return (
    <span className="relative block size-full transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] group-hover:-translate-y-1.5 group-hover:-rotate-1 motion-reduce:transition-none">
      <span className="absolute inset-0 rounded-[10px] shadow-[0_22px_40px_-18px_rgba(60,40,10,0.45)] transition-shadow duration-500 group-hover:shadow-[0_32px_50px_-20px_rgba(60,40,10,0.5)]" />
      <EnvelopeBody />
      <Pocket>
        <Label />
      </Pocket>
      <span
        aria-hidden
        className="absolute inset-x-0 top-0 h-[58%] origin-top rounded-t-[10px] transition-transform duration-500 ease-[cubic-bezier(.2,.8,.2,1)] [transform:perspective(900px)_rotateX(0deg)] group-hover:[transform:perspective(900px)_rotateX(16deg)] motion-reduce:transition-none"
        style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: "drop-shadow(0 2px 2px rgba(110, 80, 30, 0.25))" }}
      />
      <WaxSeal className="absolute left-1/2 top-[58%] size-[60px] -translate-x-1/2 -translate-y-1/2 transition-transform duration-500 group-hover:rotate-[-10deg] group-hover:scale-105" />
    </span>
  );
}

function WaxSeal({ className, half }: { className?: string; half?: "left" | "right" }) {
  return (
    <span
      aria-hidden
      className={cn("grid place-items-center rounded-[47%_53%_49%_51%] shadow-[2px_5px_8px_rgba(70,30,15,0.45),inset_1px_1px_4px_rgba(255,200,170,0.5)]", className)}
      style={{
        background: "radial-gradient(circle at 32% 26%, #DB5B3D, #962C16 72%)",
        // A jagged crack down the middle when split.
        clipPath:
          half === "left"
            ? "polygon(0 0, 54% 0, 47% 18%, 55% 33%, 44% 52%, 53% 70%, 45% 86%, 51% 100%, 0 100%)"
            : half === "right"
              ? "polygon(54% 0, 100% 0, 100% 100%, 51% 100%, 45% 86%, 53% 70%, 44% 52%, 55% 33%, 47% 18%)"
              : undefined,
      }}
    >
      <span className="grid size-[64%] place-items-center rounded-full border border-[rgba(255,214,190,0.45)] opacity-90 [filter:brightness(0)_invert(0.86)_sepia(0.5)]">
        <DotMark size={20} label={null} />
      </span>
    </span>
  );
}

/* ---------- The opening ---------- */

/**
 * One continuous choreography with springs and overlaps: the envelope arrives
 * from the page (shared layout), the seal is pressed and cracks, the flap
 * swings open showing its lining, the letter slides out as the envelope gives
 * a little, the envelope drops away, and the letter unfolds its thirds.
 */
function OpeningScene({ onDone }: { onDone: () => void }) {
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
        <div className="absolute inset-0 rounded-[10px] shadow-[0_34px_60px_-24px_rgba(0,0,0,0.6)]" />
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
          <div className="absolute inset-0 rounded-t-[10px] [backface-visibility:hidden]" style={{ background: ENVELOPE_FLAP, clipPath: FLAP_CLIP, filter: "drop-shadow(0 2px 2px rgba(110, 80, 30, 0.25))" }}>
            <motion.div data-flap-shade className="absolute inset-0 bg-[#5a3d14]" style={{ opacity: 0, clipPath: FLAP_CLIP }} />
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

/** The three thirds of the letter: the middle faces us, the top and bottom fold over it. */
function SheetPanels({ panel, open = false }: { panel: number; open?: boolean }) {
  return (
    <>
      <PaperFace className="absolute inset-0">
        <Lines count={4} />
      </PaperFace>
      <Fold name="top" panel={panel} open={open}>
        <p className="text-[10px] font-bold uppercase tracking-[0.18em] opacity-55">{LETTER.overline}</p>
        <p className="mt-1 font-serif text-[18px] italic leading-tight">{LETTER.title}</p>
        <div className="mt-3"><Lines count={2} /></div>
      </Fold>
      <Fold name="bottom" panel={panel} open={open}>
        <Lines count={3} />
        <p className="mt-3 text-right font-serif text-[16px] italic opacity-75">— {LETTER.signature}</p>
      </Fold>
    </>
  );
}

/**
 * Closing: the letter shrinks into the open sheet, folds its bottom third up
 * and its top third down, then flies back and tucks into the envelope, which
 * is already waiting on the page as the backdrop fades.
 */
function ClosingScene({ target, onFly, onDone }: { target: DOMRect | null; onFly: () => void; onDone: () => void }) {
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

/** One folded third of the letter: printed side, paper back, and a shade that lifts as it opens. */
function Fold({ name, panel, open = false, children }: { name: "top" | "bottom"; panel: number; open?: boolean; children: ReactNode }) {
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
        <motion.div {...shadeMarker} className="pointer-events-none absolute inset-0 bg-[#6b5530]" style={{ opacity: open ? 0 : 0.28 }} />
      </PaperFace>
      <div
        className="absolute inset-0 rounded-[3px] [backface-visibility:hidden] [transform:rotateX(180deg)]"
        style={{ background: `linear-gradient(${top ? "180deg" : "0deg"}, ${PAPER_BACK}, #E9E0CD)`, boxShadow: "0 4px 10px rgba(74,52,29,0.18)" }}
      />
    </motion.div>
  );
}

function PaperFace({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <div className={cn("overflow-hidden rounded-[3px] px-6 py-4 shadow-[0_8px_20px_rgba(74,52,29,0.22)]", className)} style={{ background: PAPER, color: INK }}>
      {children}
    </div>
  );
}

function Lines({ count }: { count: number }) {
  return (
    <div className="flex flex-col gap-[11px]">
      {Array.from({ length: count }, (_, index) => (
        <span key={index} className="block h-[2px] rounded-full" style={{ background: PAPER_LINE, width: index === count - 1 ? "58%" : "100%" }} />
      ))}
    </div>
  );
}

/* ---------- The letter to read ---------- */

const settle: Variants = {
  hidden: { opacity: 0, y: 10, scale: 0.97 },
  shown: { opacity: 1, y: 0, scale: 1, transition: { type: "spring", stiffness: 140, damping: 20, staggerChildren: 0.045, delayChildren: 0.12 } },
};
const line: Variants = {
  hidden: { opacity: 0, y: 6 },
  shown: { opacity: 1, y: 0, transition: { duration: 0.45, ease: [0.2, 0.8, 0.2, 1] } },
};
const quiet: Variants = { hidden: { opacity: 0 }, shown: { opacity: 1, transition: { duration: 0.12 } } };

function ReadingLetter({ reduceMotion }: { reduceMotion: boolean }) {
  const item = reduceMotion ? quiet : line;
  return (
    <motion.article
      variants={reduceMotion ? quiet : settle}
      initial="hidden"
      animate="shown"
      exit={{ opacity: 0, scale: 0.68, transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] } }}
      className="relative mx-4 max-h-[calc(100dvh-32px)] w-full max-w-[640px] overflow-y-auto rounded-[6px] shadow-[0_30px_80px_-20px_rgba(0,0,0,0.55)]"
      style={{ background: PAPER, color: INK }}
    >
      <div className="px-6 py-10 sm:px-12 sm:py-14">
        <motion.header variants={item} className="flex items-start justify-between gap-4 border-b pb-6" style={{ borderColor: PAPER_LINE }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-55">{LETTER.overline}</p>
            <h2 className="mt-2 font-serif text-[30px] italic leading-[1.1] sm:text-[36px]">{LETTER.title}</h2>
          </div>
          <span className="mt-1 shrink-0 opacity-80"><DotMark size={34} label={null} /></span>
        </motion.header>

        <div className="mt-7 flex flex-col gap-4 font-serif text-[17px] leading-[1.7] sm:text-[18px]">
          {LETTER.intro.map((paragraph) => <motion.p key={paragraph} variants={item}>{paragraph}</motion.p>)}
          <motion.ul variants={item} className="my-1 flex flex-col gap-1.5 border-l-2 pl-5" style={{ borderColor: "#C2410C" }}>
            {LETTER.list.map((entry) => <li key={entry}>{entry}</li>)}
          </motion.ul>
          {LETTER.outro.map((paragraph) => <motion.p key={paragraph} variants={item}>{paragraph}</motion.p>)}
          <motion.p variants={item} className="flex flex-col gap-0.5 italic">
            {LETTER.closing.map((text) => <span key={text}>{text}</span>)}
          </motion.p>
        </div>

        <motion.footer variants={item} className="mt-10 flex items-end justify-between gap-4">
          <p className="font-serif text-[22px] italic">— {LETTER.signature}</p>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-45">Yuyu · open source</p>
        </motion.footer>
      </div>
    </motion.article>
  );
}

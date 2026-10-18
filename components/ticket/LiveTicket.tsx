"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion, type TargetAndTransition } from "framer-motion";
import { Check } from "lucide-react";
import { useTicketCheckIn, type TicketCheckInState } from "@/components/ticket/useTicketCheckIn";
import { Chip } from "@/components/ui/display";
import { formatTime, formatTimeZoneName } from "@/lib/format/datetime";
import { cn } from "@/lib/cn";

type LiveTicketValue = TicketCheckInState & {
  /** The ripped paper edges are showing (the stub is about to leave or has left). */
  ripping: boolean;
  /** The stub has been torn away and the checked-in panel replaces it. */
  torn: boolean;
  reduceMotion: boolean;
};

const LiveTicketContext = createContext<LiveTicketValue | null>(null);

function useLiveTicket(): LiveTicketValue {
  return (
    useContext(LiveTicketContext) ?? {
      checkedIn: false,
      checkedInAt: null,
      justCheckedIn: false,
      ripping: false,
      torn: false,
      reduceMotion: false,
    }
  );
}

/**
 * Watches a ticket for a live check-in and drives the tear-away. Everything it
 * wraps is server-rendered; without JavaScript the ticket simply stays as is.
 */
export function LiveTicketProvider(props: {
  token: string;
  initialCheckedIn: boolean;
  initialCheckedInAt: string | null;
  /** Only confirmed tickets carry a QR worth watching. */
  enabled: boolean;
  children: ReactNode;
}) {
  const { token, initialCheckedIn, initialCheckedInAt, enabled, children } = props;
  const live = useTicketCheckIn(token, { checkedIn: initialCheckedIn, checkedInAt: initialCheckedInAt }, { enabled });
  const reduceMotion = useReducedMotion() ?? false;
  // A ticket that loaded already checked in renders straight in its final,
  // torn state (server-rendered, no animation, no watcher).
  const [ripping, setRipping] = useState(initialCheckedIn);
  const [torn, setTorn] = useState(initialCheckedIn);
  const [announcement, setAnnouncement] = useState("");

  useEffect(() => {
    if (!live.justCheckedIn) return;
    let second = 0;
    // Ripped edges appear a frame before the stub leaves, so the departing stub keeps them.
    const first = requestAnimationFrame(() => {
      setRipping(!reduceMotion);
      setAnnouncement("You're checked in. Enjoy the event.");
      second = requestAnimationFrame(() => setTorn(true));
    });
    try {
      navigator.vibrate?.([35, 60, 70]);
    } catch {
      // Vibration is a nicety; some browsers throw without a user gesture.
    }
    return () => {
      cancelAnimationFrame(first);
      cancelAnimationFrame(second);
    };
    // reduceMotion is read once, when the check-in arrives.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [live.justCheckedIn]);

  return (
    <LiveTicketContext.Provider value={{ ...live, ripping, torn, reduceMotion }}>
      {children}
      <p role="status" aria-live="polite" className="sr-only">{announcement}</p>
    </LiveTicketContext.Provider>
  );
}

/** The "Checked in" chip for a check-in that happened while the page was open. */
export function LiveCheckedInChip() {
  const { justCheckedIn } = useLiveTicket();
  if (!justCheckedIn) return null;
  return (
    <span className="yy-success-in inline-flex">
      <Chip tone="success" icon={<Check />}>Checked in</Chip>
    </span>
  );
}

/** Hides its children (for example "Cancel registration") once a live check-in lands. */
export function HideAfterLiveCheckIn({ children }: { children: ReactNode }) {
  const { justCheckedIn } = useLiveTicket();
  return justCheckedIn ? null : <>{children}</>;
}

const STUB_FALL: TargetAndTransition = {
  // Peel from the left at the perforation (hinged top-right), then drop away under gravity.
  x: [null, -4, -36],
  y: [null, 14, 380],
  rotate: [null, -9, -26],
  opacity: [1, 1, 0],
  transition: { duration: 0.9, times: [0, 0.3, 1], ease: ["easeOut", [0.55, 0, 0.9, 0.45]] },
};

/**
 * The ticket card: a main part and a perforated QR stub. On a live check-in
 * the stub tears along the perforation and falls away, the main part keeps a
 * ripped edge, and a "You're checked in" panel takes the stub's place. A
 * ticket that loaded already checked in starts in that final state.
 */
export function LiveTicketCard(props: { main: ReactNode; stub: ReactNode | null; timeZone: string }) {
  const { main, stub, timeZone } = props;
  const { checkedInAt, justCheckedIn, ripping, torn, reduceMotion } = useLiveTicket();
  const time = checkedInAt && !Number.isNaN(Date.parse(checkedInAt))
    ? `${formatTime(checkedInAt, timeZone)} ${formatTimeZoneName(checkedInAt, timeZone)}`
    : null;
  // Without the tear (reduced motion) the main part closes up into a whole card.
  const sealed = torn && !ripping;

  return (
    <article className="relative">
      <div className={cn("relative rounded-xl", ripping ? null : "shadow-raised")}>
        <div className={ripping ? "yy-ticket-shadow" : undefined}>
          <div
            className={cn(
              "relative overflow-hidden rounded-t-xl border border-line bg-canvas",
              sealed ? "rounded-b-xl" : "border-b-0",
              ripping ? "yy-ripped-bottom" : null,
            )}
          >
            {main}
            {sealed ? null : (
              <>
                <span aria-hidden className="absolute -bottom-3 -left-2 size-5 rounded-full border border-line bg-subtle" />
                <span aria-hidden className="absolute -bottom-3 -right-2 size-5 rounded-full border border-line bg-subtle" />
              </>
            )}
          </div>
        </div>
        <AnimatePresence initial={false} mode="popLayout">
          {torn ? null : (
            <motion.div
              key="stub"
              className="relative w-full"
              style={{ transformOrigin: "100% 0%" }}
              exit={reduceMotion ? { opacity: 0, transition: { duration: 0.12 } } : STUB_FALL}
            >
              <div className={ripping ? "yy-ticket-shadow" : undefined}>
                <div className={cn("relative overflow-hidden rounded-b-xl border border-t-0 border-line bg-canvas", ripping ? "yy-ripped-top" : null)}>
                  <div aria-hidden className="mx-6 border-t-2 border-dashed border-line" />
                  <span aria-hidden className="absolute -left-2 -top-2 size-5 rounded-full border border-line bg-subtle" />
                  <span aria-hidden className="absolute -right-2 -top-2 size-5 rounded-full border border-line bg-subtle" />
                  {stub}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <AnimatePresence initial={false}>
        {torn ? (
          <motion.div
            key="checked-in"
            initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: -10, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            transition={reduceMotion ? { duration: 0.12 } : { duration: 0.4, delay: 0.45, ease: [0.2, 0.8, 0.2, 1] }}
            className="mt-3 flex flex-col items-center gap-2 rounded-xl border border-dashed border-line-strong bg-success-bg px-6 py-7 text-center"
          >
            <motion.span
              aria-hidden
              initial={reduceMotion || !justCheckedIn ? false : { scale: 0, rotate: -25 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.7, type: "spring", stiffness: 420, damping: 16 }}
              className="mb-1 grid size-16 place-items-center rounded-full bg-success-solid text-white"
            >
              <Check className="size-9" strokeWidth={3} />
            </motion.span>
            <p className="font-display text-[26px] font-extrabold leading-tight tracking-[-0.02em] text-ink">You&apos;re checked in</p>
            {time ? <p className="text-[15px] font-bold text-ink-secondary">at {time}</p> : null}
            <p className="text-body-ui text-ink-secondary">Enjoy the event</p>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </article>
  );
}

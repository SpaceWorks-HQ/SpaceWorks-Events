"use client";

import { motion, type Variants } from "framer-motion";
import { SpaceWorksLogo } from "@/components/brand/SpaceWorksLogo";
import { INK, LETTER, PAPER, PAPER_LINE } from "./materials";

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

export function ReadingLetter({ reduceMotion }: { reduceMotion: boolean }) {
  const item = reduceMotion ? quiet : line;
  return (
    <motion.article
      variants={reduceMotion ? quiet : settle}
      initial="hidden"
      animate="shown"
      exit={{ opacity: 0, scale: 0.68, transition: { duration: 0.34, ease: [0.4, 0, 0.2, 1] } }}
      className="relative mx-4 max-h-[calc(100dvh-32px)] w-full max-w-[640px] overflow-y-auto rounded-[6px] shadow-float"
      style={{ background: PAPER, color: INK }}
    >
      <div className="px-6 py-10 sm:px-12 sm:py-14">
        <motion.header variants={item} className="flex items-start justify-between gap-4 border-b pb-6" style={{ borderColor: PAPER_LINE }}>
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] opacity-55">{LETTER.overline}</p>
            <h2 className="mt-2 font-accent text-[26px] font-medium leading-[1.15] sm:text-[32px]" style={{ color: INK }}>{LETTER.title}</h2>
          </div>
          <SpaceWorksLogo variant="symbol" height={48} adaptive={false} label={null} className="mt-1" />
        </motion.header>

        <div className="mt-7 flex flex-col gap-4 text-[17px] leading-[1.7] sm:text-[18px]">
          {LETTER.intro.map((paragraph) => <motion.p key={paragraph} variants={item}>{paragraph}</motion.p>)}
          <motion.ul variants={item} className="my-1 flex flex-col gap-1.5 border-l-2 pl-5" style={{ borderColor: "#006E63" }}>
            {LETTER.list.map((entry) => <li key={entry}>{entry}</li>)}
          </motion.ul>
          {LETTER.outro.map((paragraph) => <motion.p key={paragraph} variants={item}>{paragraph}</motion.p>)}
          <motion.p variants={item} className="flex flex-col gap-0.5 font-semibold">
            {LETTER.closing.map((text) => <span key={text}>{text}</span>)}
          </motion.p>
        </div>

        <motion.footer variants={item} className="mt-10 flex items-end justify-between gap-4">
          <p className="text-[20px] font-semibold">— {LETTER.signature}</p>
          <p className="text-[12px] font-semibold uppercase tracking-[0.14em] opacity-60">Space Works Events · open source</p>
        </motion.footer>
      </div>
    </motion.article>
  );
}

import { MoodTile } from "@/components/brand/MoodTile";

/** A fixed, decorative QR-like pattern for the sample ticket. It encodes nothing. */
const SAMPLE_QR = [
  "1111111010111",
  "1000001001001",
  "1011101011101",
  "1011101000101",
  "1011101011001",
  "1000001010111",
  "1111111010101",
  "0000000011000",
  "1101011100110",
  "0110100011011",
  "1011011101001",
  "0100110010110",
  "1110101101011",
];

function SampleQr() {
  return (
    <svg viewBox="0 0 13 13" className="block size-[70px] text-[#142C2A]" shapeRendering="crispEdges" aria-hidden>
      {SAMPLE_QR.flatMap((row, y) => [...row].map((bit, x) => (bit === "1" ? <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} fill="currentColor" /> : null)))}
    </svg>
  );
}

export function HeroVisual() {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[552px] pb-[176px] sm:h-[680px] sm:pb-0">
      <div className="relative overflow-hidden rounded-[16px] border border-line bg-panel sm:absolute sm:left-[30px] sm:top-0 sm:w-[460px]">
        {/* Cover: simple shapes in brand colours. The orange quarter is this page's one bold moment. */}
        <div className="relative h-[150px] overflow-hidden bg-sw-teal">
          <span className="absolute -left-8 top-6 size-36 rounded-full bg-sw-citron" />
          <span className="absolute left-[150px] top-10 size-20 rounded-[16px] bg-sw-sky" />
          <span className="absolute -bottom-10 right-16 size-32 rounded-tl-full bg-sw-orange" />
          <span className="absolute right-4 top-4 size-10 rounded-full bg-sw-yellow" />
        </div>
        <div className="flex flex-col gap-4 p-6">
          <div className="flex gap-2">
            <span className="rounded-full bg-sw-citron px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-sw-ink">Free</span>
            <span className="rounded-full border border-line bg-surface px-[11px] py-1 text-[13px] font-semibold leading-[1.4] text-ink">In person</span>
          </div>
          <p className="text-[28px] font-semibold leading-tight text-ink sm:text-[32px]">Kochi Maker Night</p>
          <div className="flex items-center gap-3.5">
            <span className="flex h-[60px] w-14 shrink-0 flex-col items-center overflow-hidden rounded-[10px] border border-line bg-panel">
              <span className="w-full bg-primary py-[3px] text-center text-[11px] font-semibold uppercase leading-[1.3] tracking-[0.08em] text-on-primary">Nov</span>
              <span className="text-[22px] font-semibold leading-[1.35] tabular-nums text-ink">14</span>
            </span>
            <span className="flex min-w-0 flex-col">
              <span className="text-label text-ink">Saturday, 14 November · 6:00 PM</span>
              <span className="text-body-ui text-ink-muted">Space Works, Kochi</span>
            </span>
          </div>
          <div className="flex flex-col gap-2">
            <div className="flex justify-between">
              <span className="text-label tabular-nums text-ink">48 going</span>
              <span className="text-caption tabular-nums text-ink-muted">12 spots left</span>
            </div>
            {/* 48 of 60 places, drawn as building blocks (Yuyu's dot meter, in Space Works shapes). */}
            <span className="grid grid-cols-[repeat(15,minmax(0,1fr))] gap-1">
              {Array.from({ length: 15 }, (_, index) => (
                <span key={index} className={index < 12 ? "block h-3 rounded-[3px] bg-primary dark:bg-sw-citron" : "block h-3 rounded-[3px] bg-track"} />
              ))}
            </span>
          </div>
          <span className="inline-flex h-11 w-full items-center justify-center rounded-full bg-primary text-[15px] font-semibold text-on-primary">Register — it’s free</span>
        </div>
      </div>

      <div className="group absolute bottom-0 right-0 flex w-[290px] max-w-[88%] flex-col gap-3.5 rounded-[16px] border border-line-strong bg-panel p-5 sm:bottom-auto sm:left-[262px] sm:right-auto sm:top-[476px]">
        <div className="flex items-center gap-3">
          <MoodTile mood="cheering" size={48} />
          <div className="flex min-w-0 flex-col items-start gap-1">
            <p className="text-[20px] font-semibold leading-tight text-ink">You’re in, Meera!</p>
            <span className="rounded-full bg-sw-citron px-2.5 py-0.5 text-[12px] font-semibold text-sw-ink">Registered</span>
          </div>
        </div>
        {/* Perforation with punched notches, like the live ticket. */}
        <span className="relative -mx-5 block">
          <span className="mx-5 block border-t-2 border-dashed border-line-strong" />
          <span className="absolute -left-2.5 -top-[9px] size-5 rounded-full border border-line-strong bg-canvas" />
          <span className="absolute -right-2.5 -top-[9px] size-5 rounded-full border border-line-strong bg-canvas" />
        </span>
        <div className="flex items-center gap-3.5">
          <span className="shrink-0 rounded-[10px] border border-line bg-white p-2">
            <SampleQr />
          </span>
          <p className="text-caption text-ink-muted">Show this at the door. It updates the moment you are checked in.</p>
        </div>
      </div>
    </div>
  );
}

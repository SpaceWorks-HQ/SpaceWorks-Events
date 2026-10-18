"use client";

import { useEffect, useRef, useState } from "react";

const FRAME_HEIGHT = 620;
const WIDTHS = { desktop: 680, mobile: 390 } as const;

/**
 * The server-rendered email in a sandboxed iframe, laid out at a real desktop
 * or phone width and scaled down to fit a narrow column, so the preview shows
 * the layout a recipient actually gets.
 */
export function BroadcastPreviewFrame({ html, width, dimmed }: { html: string; width: keyof typeof WIDTHS; dimmed: boolean }) {
  const boxRef = useRef<HTMLDivElement | null>(null);
  const [available, setAvailable] = useState<number>(WIDTHS.desktop);
  const frameWidth = WIDTHS[width];

  useEffect(() => {
    const box = boxRef.current;
    if (!box) return;
    const measure = () => setAvailable(box.clientWidth || WIDTHS.desktop);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  const scale = Math.min(1, available / frameWidth);
  return (
    <div ref={boxRef} className="w-full overflow-hidden">
      <div className="mx-auto" style={{ width: frameWidth * scale, height: FRAME_HEIGHT * scale }}>
        <iframe
          title="Email preview"
          sandbox=""
          srcDoc={html}
          className="origin-top-left rounded-lg border border-line bg-[#f8f9fa] transition-opacity duration-200"
          style={{ width: frameWidth, height: FRAME_HEIGHT, transform: `scale(${scale})`, opacity: dimmed ? 0.6 : 1 }}
        />
      </div>
    </div>
  );
}

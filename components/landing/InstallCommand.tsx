"use client";

import { useEffect, useState } from "react";
import { Check, Copy } from "lucide-react";
import { INSTALL_COMMAND } from "@/lib/openSource";

/** The one-line installer in a terminal card, with a button that copies the exact command. */
export function InstallCommand() {
  const [status, setStatus] = useState<"idle" | "copied" | "failed">("idle");

  useEffect(() => {
    if (status === "idle") return;
    const reset = window.setTimeout(() => setStatus("idle"), 2000);
    return () => window.clearTimeout(reset);
  }, [status]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setStatus("copied");
    } catch {
      setStatus("failed");
    }
  };

  const [command, pipe] = INSTALL_COMMAND.split(" | ");
  const url = command.replace("curl -fsSL ", "");

  return (
    <div className="overflow-hidden rounded-[16px] border border-line bg-sw-ink text-sw-cream">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 px-5 py-3">
        <p className="text-label text-sw-cream/80">Terminal</p>
        <button
          type="button"
          onClick={copy}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-[14px] font-medium text-sw-cream transition-colors hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sw-citron"
        >
          {status === "copied" ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" />}
          <span aria-live="polite">{status === "copied" ? "Copied" : status === "failed" ? "Select and copy below" : "Copy command"}</span>
        </button>
      </div>
      <pre className="overflow-x-auto px-5 py-4 font-mono text-[13px] leading-6 sm:text-[14px]">
        <code className="select-all">
          <span aria-hidden className="select-none text-sw-citron">$ </span>curl -fsSL \{"\n"}  {url} \{"\n"}  | {pipe}
        </code>
      </pre>
    </div>
  );
}

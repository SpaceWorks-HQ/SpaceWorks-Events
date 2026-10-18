"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { DotFace } from "@/components/brand/DotFace";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    if (process.env.NODE_ENV === "development") console.error("[ui] route error", error);
    else console.error("[ui] route error");
  }, [error]);
  return (
    <div className="mx-auto flex max-w-[520px] flex-col items-center gap-4 px-4 py-16 text-center">
      <DotFace mood="sad" size={96} />
      <h1 className="text-h1 text-ink">Something went wrong</h1>
      <p className="text-body-ui text-ink-secondary">Please try again. If this keeps happening, contact the operator of this Yuyu instance.</p>
      <Button variant="primary" onClick={reset}>Try again</Button>
    </div>
  );
}

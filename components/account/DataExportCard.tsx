"use client";

import { useState } from "react";
import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cn } from "@/lib/cn";

export const ACCOUNT_DATA_EXPORT_URL = "/api/exports/account";

function filenameFrom(header: string | null) {
  const match = header?.match(/filename="([^"]+)"/);
  return match?.[1] ?? "yuyu-account-data.json";
}

/**
 * "Download my data": fetches the signed-in user's own JSON export so rate-limit
 * and sign-in failures can be shown inline instead of as a broken download.
 */
export function DataExportCard({ className }: { className?: string }) {
  const [state, setState] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function download() {
    setError(null);
    setState("loading");
    try {
      const response = await fetch(ACCOUNT_DATA_EXPORT_URL, { credentials: "same-origin", cache: "no-store" });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "You've downloaded your data several times recently. Please try again in an hour."
            : response.status === 401
              ? "Your session has ended. Sign in again to download your data."
              : "We couldn't prepare your download. Please try again.",
        );
        setState("idle");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = filenameFrom(response.headers.get("content-disposition"));
      document.body.appendChild(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setState("done");
    } catch {
      setError("We couldn't prepare your download. Check your connection and try again.");
      setState("idle");
    }
  }

  return (
    <section id="data-export" aria-labelledby="data-export-title" className={cn("rounded-2xl border border-line bg-canvas p-5 sm:p-6", className)}>
      <div className="flex flex-col gap-4 md:flex-row md:items-center">
        <div className="min-w-0 flex-1">
          <h2 id="data-export-title" className="text-h4 text-ink">Download my data</h2>
          <p className="mt-0.5 text-body-ui text-ink-muted">
            A JSON file with your profile, organisations, registrations and answers, feedback, and event roles. Passwords, security codes and ticket links are never included.
          </p>
        </div>
        <Button type="button" variant="secondary" onClick={download} loading={state === "loading"} loadingLabel="Preparing…" startIcon={<Download />} className="self-start md:self-center">
          Download my data
        </Button>
      </div>
      <div aria-live="polite">
        {error ? <Callout tone="danger" role="alert" className="mt-4">{error}</Callout> : null}
        {state === "done" && !error ? <p className="mt-3 text-sm text-ink-muted">Your download has started.</p> : null}
      </div>
    </section>
  );
}

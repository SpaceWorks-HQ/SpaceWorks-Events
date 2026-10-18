"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Download, FileArchive, Mail, RefreshCw } from "lucide-react";
import { emailIdCards, renewIdMembers } from "@/app/actions/member-ids";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { ConfirmDialog } from "@/components/ui/dialog";
import { emailQueuedNotice } from "@/lib/memberIds/core";
import { fetchDownload } from "./download";

type Busy = "pdf" | "zip" | "email" | "renew" | null;

/** Whole-programme actions: bulk downloads, email every valid card, renew every card. */
export function ProgrammeActions({ organisationSlug, programmeId, approved }: { organisationSlug: string; programmeId: string; approved: number }) {
  const router = useRouter();
  const [busy, setBusy] = useState<Busy>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [confirm, setConfirm] = useState<"email" | "renew" | null>(null);
  const exportUrl = `/api/exports/member-ids/${programmeId}/cards`;

  const run = async (kind: Exclude<Busy, null>, task: () => Promise<string | { ok: boolean; text: string }>) => {
    setBusy(kind);
    setNotice(null);
    try {
      const outcome = await task();
      if (typeof outcome === "string") setNotice({ tone: "danger", text: outcome });
      else setNotice({ tone: outcome.ok ? "success" : "danger", text: outcome.text });
    } catch {
      setNotice({ tone: "danger", text: "That didn't work. Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  };

  const download = (format: "pdf" | "zip") => run(format, async () => {
    const error = await fetchDownload(`${exportUrl}?format=${format}`);
    return error ?? { ok: true, text: format === "zip" ? "ZIP downloaded: one PDF per member." : "PDF downloaded: front then back for every member." };
  });

  return (
    <section aria-label="Programme actions" className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" startIcon={<Download />} disabled={approved === 0} loading={busy === "pdf"} loadingLabel="Preparing PDF…" onClick={() => download("pdf")}>All cards (PDF)</Button>
        <Button size="sm" variant="secondary" startIcon={<FileArchive />} disabled={approved === 0} loading={busy === "zip"} loadingLabel="Preparing ZIP…" onClick={() => download("zip")}>All cards (ZIP)</Button>
        <Button size="sm" variant="secondary" startIcon={<Mail />} disabled={approved === 0} loading={busy === "email"} onClick={() => setConfirm("email")}>Email all cards</Button>
        <Button size="sm" variant="quiet" startIcon={<RefreshCw />} disabled={approved === 0} loading={busy === "renew"} onClick={() => setConfirm("renew")}>Renew all</Button>
      </div>
      <div aria-live="polite">
        {notice ? <Callout tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>{notice.text}</Callout> : null}
      </div>
      <ConfirmDialog
        open={confirm !== null}
        destructive={false}
        title={confirm === "email" ? "Email every valid card?" : "Renew every approved card?"}
        message={confirm === "email"
          ? "Members with a valid card who joined themselves or haven't been emailed yet get their card as a PDF and a link to their ID wallet. Nobody is emailed twice in 24 hours, and your organisation can send a limited number of card emails a day."
          : "Validity restarts from today under this programme's rule (Settings). Revoked cards stay revoked."}
        confirmLabel={confirm === "email" ? "Send emails" : "Renew cards"}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const kind = confirm;
          setConfirm(null);
          if (kind === "email") {
            void run("email", async () => {
              const result = await emailIdCards({ organisationSlug, programmeId });
              return result.ok ? { ok: true, text: emailQueuedNotice(result.data ?? { count: 0, skippedRecent: 0, skippedLimit: 0 }) } : { ok: false, text: result.error };
            });
          } else if (kind === "renew") {
            void run("renew", async () => {
              const result = await renewIdMembers({ organisationSlug, programmeId });
              if (result.ok) router.refresh();
              return result.ok ? { ok: true, text: `${result.data?.count ?? 0} cards renewed.` } : { ok: false, text: result.error };
            });
          }
        }}
      />
    </section>
  );
}

"use client";

import { useState, useTransition } from "react";
import { Copy, Link as LinkIcon, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/dialog";
import { useToast } from "@/components/feedback/ToastProvider";
import { createEventShortLink, regenerateEventShortLink } from "@/app/actions/shortLink";

/**
 * The event's short link in the Share card. Members see and copy an existing
 * link; only organisation owners/admins (`canManage`) can create or replace
 * one. The server actions enforce the same rule.
 */
export function ShortLinkControl({
  organisationSlug,
  eventId,
  title,
  origin,
  initialCode,
  canManage,
  published,
}: {
  organisationSlug: string;
  eventId: string;
  title: string;
  origin: string;
  initialCode: string | null;
  canManage: boolean;
  published: boolean;
}) {
  const { showToast } = useToast();
  const [code, setCode] = useState(initialCode);
  const [confirming, setConfirming] = useState(false);
  const [creating, startCreate] = useTransition();
  const [regenerating, startRegenerate] = useTransition();

  if (!code && !canManage) return null;

  const create = () =>
    startCreate(async () => {
      const result = await createEventShortLink({ organisationSlug, eventId });
      if (result.ok) {
        setCode(result.code);
        showToast("Short link created", "success", null, 2500);
      } else showToast(result.error, "error");
    });

  const regenerate = () =>
    startRegenerate(async () => {
      const result = await regenerateEventShortLink({ organisationSlug, eventId });
      setConfirming(false);
      if (result.ok) {
        setCode(result.code);
        showToast("New short link created", "success", null, 2500);
      } else showToast(result.error, "error");
    });

  if (!code) {
    return (
      <Button size="sm" variant="secondary" className="self-start" startIcon={<LinkIcon />} loading={creating} loadingLabel="Creating…" onClick={create}>
        Create short link
      </Button>
    );
  }

  // Inlined rather than importing lib/shortLink, which pulls Node crypto into the client bundle.
  const url = `${origin}/${code}`;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      showToast("Short link copied", "success", null, 2500);
    } catch {
      showToast("Could not copy the short link", "error");
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <p className="text-label text-ink">Short link</p>
      <p className="truncate rounded-lg bg-subtle px-3 py-2.5 font-mono text-[13px] text-ink" title={url}>
        {url.replace(/^https?:\/\//, "")}
      </p>
      <div className="flex flex-wrap gap-2">
        {published ? (
          <Button variant="quiet" size="sm" startIcon={<Copy />} aria-label={`Copy the short link to ${title}`} onClick={copy}>
            Copy short link
          </Button>
        ) : null}
        {canManage ? (
          <Button variant="quiet" size="sm" startIcon={<RefreshCw />} aria-label={`Regenerate the short link to ${title}`} disabled={regenerating} onClick={() => setConfirming(true)}>
            Regenerate
          </Button>
        ) : null}
      </div>
      {canManage ? (
        <ConfirmDialog
          open={confirming}
          title="Regenerate short link?"
          message="The old short link will stop working. Anyone using it will need the new one."
          confirmLabel="Regenerate"
          loading={regenerating}
          onConfirm={regenerate}
          onCancel={() => setConfirming(false)}
        />
      ) : null}
    </div>
  );
}

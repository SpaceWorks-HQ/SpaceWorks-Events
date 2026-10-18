"use client";

import { Link2 } from "lucide-react";
import { Button, IconButton } from "@/components/ui/button";
import { useToast } from "@/components/feedback/ToastProvider";

/** Copies an event's public page URL (a path on this Yuyu install). `compact` renders an icon button for list rows. */
export function CopyEventLink({ path, title, compact = false }: { path: string; title: string; compact?: boolean }) {
  const { showToast } = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}${path}`);
      showToast("Event link copied", "success", null, 2500);
    } catch {
      showToast("Could not copy the event link", "error");
    }
  };
  if (compact) {
    return (
      <IconButton label={`Copy the link to ${title}`} variant="secondary" size="sm" onClick={copy}>
        <Link2 aria-hidden />
      </IconButton>
    );
  }
  return (
    <Button variant="quiet" startIcon={<Link2 />} aria-label={`Copy the link to ${title}`} onClick={copy}>
      Copy link
    </Button>
  );
}

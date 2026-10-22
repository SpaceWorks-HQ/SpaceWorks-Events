"use client";

import { BrandLoader } from "@/components/brand/BrandLoader";
import { Monitor, Smartphone } from "lucide-react";
import { SegmentedControl } from "@/components/ui/choice";
import { Callout } from "@/components/ui/display";
import { BroadcastPreviewFrame } from "../BroadcastPreviewFrame";
import { DesignPicker } from "../DesignPicker";
import type { BroadcastDesignId } from "@/lib/email/broadcastDesigns";

export function PreviewSection({ previewWidth, setPreviewWidth, design, setDesign, brand, hasContent, preview, previewReady }: {
  previewWidth: "desktop" | "mobile";
  setPreviewWidth: (value: "desktop" | "mobile") => void;
  design: BroadcastDesignId;
  setDesign: (value: BroadcastDesignId) => void;
  brand: { accentColor: string | null; coverImageUrl: string | null };
  hasContent: boolean;
  preview: { key: string; subject: string; html: string; error: string | null };
  previewReady: boolean;
}) {
  return (
    <section aria-labelledby="broadcast-preview" className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="broadcast-preview" className="text-overline text-ink-muted">Preview · as sent</h2>
        <SegmentedControl
          ariaLabel="Preview width"
          size="sm"
          value={previewWidth}
          onValueChange={setPreviewWidth}
          options={[
            { value: "mobile", label: "Phone", icon: <Smartphone aria-hidden />, ariaLabel: "Mobile width" },
            { value: "desktop", label: "Desktop", icon: <Monitor aria-hidden />, ariaLabel: "Desktop width" },
          ]}
        />
      </div>
      <div className="flex flex-col gap-2 rounded-xl border border-line bg-panel p-3">
        <p className="text-label text-ink">Design</p>
        <DesignPicker value={design} onChange={setDesign} accentColor={brand.accentColor} coverImageUrl={brand.coverImageUrl} />
      </div>
      <p className="text-caption text-ink-muted">
        Rendered by the server with example values, exactly as it will arrive. Each attendee sees their own name and, when confirmed, their own ticket link.
      </p>
      {!hasContent ? (
        <Callout tone="info">Add a subject and a message to see the preview.</Callout>
      ) : preview.error && previewReady ? (
        <Callout tone="danger">{preview.error}</Callout>
      ) : (
        <div className="relative flex flex-col gap-2 rounded-xl border border-line bg-muted p-2.5 sm:p-3.5">
          {!previewReady ? (
            <div aria-live="polite" className="absolute right-3 top-3 z-[1] flex items-center gap-2 rounded-full bg-panel px-2.5 py-1 text-caption text-ink-secondary">
              <BrandLoader size={20} label="Updating preview" /> Updating…
            </div>
          ) : null}
          <p className="px-1 text-label text-ink-muted [overflow-wrap:anywhere]">
            Subject: <span className="font-bold text-ink">{preview.subject || "…"}</span>
          </p>
          <BroadcastPreviewFrame html={preview.html} width={previewWidth} dimmed={!previewReady} />
        </div>
      )}
    </section>
  );
}

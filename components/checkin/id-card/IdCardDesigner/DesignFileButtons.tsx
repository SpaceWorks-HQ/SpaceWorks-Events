"use client";

import { useRef } from "react";
import { Button } from "@/components/ui/button";
import { exportIdCardDesign, importIdCardDesign, type IdCardPrintSettings } from "@/lib/idCardPrint";

export function DesignFileButtons({
  settings,
  eventTitle,
  organisationName,
  onImport,
  onError,
}: {
  settings: IdCardPrintSettings;
  eventTitle: string;
  organisationName: string;
  onImport: (settings: IdCardPrintSettings) => void;
  onError: (message: string) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="quiet"
        title="Save this design as a file, to reuse it for another event"
        onClick={() => {
          const blob = new Blob([exportIdCardDesign(settings)], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const link = document.createElement("a");
          link.href = url;
          link.download = "badge-design.json";
          link.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        }}
      >
        Export design
      </Button>
      <Button size="sm" variant="quiet" onClick={() => fileInput.current?.click()}>Import design</Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        hidden
        onChange={async (event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (!file) return;
          if (file.size > 200_000) return onError("That file is too large to be a badge design.");
          const next = importIdCardDesign(await file.text(), eventTitle, organisationName);
          if (next) onImport(next);
          else onError("That file isn't a badge design. Choose a .json file exported from the badge designer.");
        }}
      />
    </div>
  );
}

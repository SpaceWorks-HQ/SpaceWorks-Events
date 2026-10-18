"use client";

import { useEffect, useState } from "react";
import { MonitorSmartphone } from "lucide-react";
import { Button } from "@/components/ui/button";

type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

export function InstallCheckInAppButton() {
  const [promptEvent, setPromptEvent] = useState<InstallPromptEvent | null>(null);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as InstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  if (!promptEvent) return null;
  return (
    <Button
      size="sm"
      variant="secondary"
      onClick={() => {
        const current = promptEvent;
        setPromptEvent(null);
        void current.prompt();
      }}
    >
      <MonitorSmartphone aria-hidden className="size-4" />
      Install check-in app
    </Button>
  );
}

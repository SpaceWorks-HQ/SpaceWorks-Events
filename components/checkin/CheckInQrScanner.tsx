"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "@/components/ui/button";

type Html5QrcodeLike = {
  start: (
    camera: { facingMode: string } | string,
    // html5-qrcode supports more options; keep this permissive for runtime compatibility.
    config: Record<string, unknown>,
    onSuccess: (text: string) => void,
    onError: (error: unknown) => void,
  ) => Promise<void>;
  stop: () => Promise<void>;
};

export function CheckInQrScanner(props: {
  onScan: (text: string) => void;
  disabled?: boolean;
}) {
  const { onScan, disabled } = props;
  const reactId = useId();
  const regionId = `checkin-qr-${reactId.replace(/:/g, "")}`;
  const scannerRef = useRef<Html5QrcodeLike | null>(null);
  const onScanRef = useRef(onScan);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastRef = useRef<{ text: string; at: number }>({ text: "", at: 0 });

  useEffect(() => {
    onScanRef.current = onScan;
  }, [onScan]);

  const stop = useCallback(async () => {
    const s = scannerRef.current;
    scannerRef.current = null;
    if (s) {
      try {
        await s.stop();
      } catch {
        /* ignore */
      }
    }
    setRunning(false);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const { Html5Qrcode } = await import("html5-qrcode");
      await stop();
      const scanner = new Html5Qrcode(regionId) as unknown as Html5QrcodeLike;
      scannerRef.current = scanner;
      await scanner.start(
        { facingMode: "environment" },
        {
          fps: 12,
          // Responsive box improves decode success on small/large screens.
          qrbox: (viewfinderWidth: number, viewfinderHeight: number) => {
            const size = Math.floor(
              Math.min(viewfinderWidth, viewfinderHeight) * 0.62,
            );
            return { width: size, height: size };
          },
          aspectRatio: 1,
          disableFlip: true,
          experimentalFeatures: { useBarCodeDetectorIfSupported: true },
        },
        (decoded) => {
          const now = Date.now();
          if (
            decoded === lastRef.current.text &&
            now - lastRef.current.at < 1800
          ) {
            return;
          }
          lastRef.current = { text: decoded, at: now };
          onScanRef.current(decoded);
        },
        () => {},
      );
      setRunning(true);
    } catch (e) {
      const name = e && typeof e === "object" && "name" in e ? String(e.name) : "";
      setError(name === "NotAllowedError"
        ? "Camera access was denied. Allow camera access or use manual code entry."
        : name === "NotFoundError"
          ? "No camera was found. Use manual code entry."
          : "Could not start the camera. Try manual code entry.");
      scannerRef.current = null;
      setRunning(false);
    }
  }, [regionId, stop]);

  useEffect(() => {
    return () => {
      void stop();
    };
  }, [stop]);

  return (
    <div className="flex flex-col gap-3">
      <div className="relative overflow-hidden rounded-xl bg-[#232326]">
        <div id={regionId} aria-label="Camera preview for ticket QR scanning" className="min-h-[300px] w-full" />
        {!running ? (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-6 p-6">
            <span className="relative block size-44">
              <span className="absolute left-0 top-0 size-10 rounded-tl-xl border-l-[3px] border-t-[3px] border-white" />
              <span className="absolute right-0 top-0 size-10 rounded-tr-xl border-r-[3px] border-t-[3px] border-white" />
              <span className="absolute bottom-0 left-0 size-10 rounded-bl-xl border-b-[3px] border-l-[3px] border-white" />
              <span className="absolute bottom-0 right-0 size-10 rounded-br-xl border-b-[3px] border-r-[3px] border-white" />
            </span>
            <span className="text-sm font-semibold text-white">Hold the ticket QR inside the frame</span>
          </div>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {!running ? (
          <Button variant="primary" onClick={() => void start()} disabled={disabled}>
            <Camera aria-hidden className="size-[18px]" />
            Start camera
          </Button>
        ) : (
          <Button variant="secondary" onClick={() => void stop()} disabled={disabled}>
            <CameraOff aria-hidden className="size-[18px]" />
            Stop camera
          </Button>
        )}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger-fg">
          {error}
        </p>
      ) : null}
    </div>
  );
}

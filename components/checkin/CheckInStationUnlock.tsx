"use client";

import { useRef, useState } from "react";
import { Delete } from "lucide-react";
import { normalizeStationPin } from "@/lib/stationPin";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/display";
import { cn } from "@/lib/cn";

const PIN_LENGTH = 8;
const keypadKey = "flex h-16 items-center justify-center rounded-lg border border-line bg-canvas font-display text-2xl font-bold text-ink transition-colors hover:bg-subtle active:bg-muted disabled:opacity-50";

export function CheckInStationUnlock({ organisationSlug, eventSlug }: { organisationSlug: string; eventSlug: string }) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [focused, setFocused] = useState(true);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const update = (next: string) => {
    setPin(normalizeStationPin(next));
    setError(null);
  };
  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (pending) return;
    if (pin.length !== PIN_LENGTH) {
      setError("Enter the complete 8-digit station PIN.");
      return;
    }
    setPending(true);
    setError(null);
    try {
      const response = await fetch("/api/check-in/station", { method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", body: JSON.stringify({ organisationSlug, eventSlug, action: "unlock", pin }) });
      const result = response.headers.get("content-type")?.includes("application/json")
        ? ((await response.json()) as { ok: boolean; error?: string })
        : { ok: false, error: "Unable to open this check-in station." };
      if (!result.ok) setError(result.error ?? "Unable to open this check-in station.");
      else window.location.reload();
    } catch {
      setError("Unable to open this check-in station.");
    } finally {
      setPending(false);
    }
  };

  return (
    <form onSubmit={submit} className="mx-auto grid w-full max-w-[880px] items-center gap-10 py-6 md:min-h-[60vh] md:grid-cols-2 md:gap-16">
      <div className="flex flex-col gap-4">
        <p className="text-[15px] font-semibold text-ink-secondary">Venue check-in</p>
        <h1 className="text-display-l text-ink">Enter the station PIN</h1>
        <p id="station-pin-help" className="text-body-ui text-ink-secondary">Ask an organiser for the 8-digit PIN. It unlocks check-in on this device only.</p>
        {error ? <Callout tone="danger" role="alert">{error}</Callout> : null}
        <label htmlFor="station-pin" className="sr-only">Station PIN</label>
        {/* One real input keeps typing, paste and one-time-code autofill working; the boxes mirror it. */}
        <div className="relative" onClick={() => inputRef.current?.focus()}>
          <input
            ref={inputRef}
            id="station-pin"
            name="station-pin"
            type="text"
            value={pin}
            onChange={(event) => update(event.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={PIN_LENGTH}
            autoComplete="one-time-code"
            spellCheck={false}
            aria-describedby="station-pin-help station-pin-count"
            autoFocus
            required
            className="absolute inset-0 size-full cursor-text opacity-0"
          />
          <div aria-hidden className="grid grid-cols-8 gap-1.5 sm:gap-2">
            {Array.from({ length: PIN_LENGTH }, (_, index) => (
              <span
                key={index}
                className={cn(
                  "flex aspect-[4/5] items-center justify-center rounded-md border bg-canvas text-2xl text-ink",
                  focused && index === Math.min(pin.length, PIN_LENGTH - 1) ? "border-2 border-primary" : "border-line",
                )}
              >
                {index < pin.length ? "•" : ""}
              </span>
            ))}
          </div>
        </div>
        <p id="station-pin-count" className="text-caption text-ink-muted">{pin.length}/8 digits</p>
      </div>

      <div className="flex flex-col gap-3">
        <div className="grid grid-cols-3 gap-2.5">
          {["1", "2", "3", "4", "5", "6", "7", "8", "9"].map((digit) => (
            <button key={digit} type="button" className={keypadKey} onClick={() => update(pin + digit)} disabled={pending || pin.length >= PIN_LENGTH}>
              {digit}
            </button>
          ))}
          <button type="button" className={cn(keypadKey, "bg-muted text-xl")} onClick={() => update("")} disabled={pending || pin.length === 0}>
            Clear
          </button>
          <button type="button" className={keypadKey} onClick={() => update(pin + "0")} disabled={pending || pin.length >= PIN_LENGTH}>
            0
          </button>
          <button type="button" className={cn(keypadKey, "bg-muted")} onClick={() => update(pin.slice(0, -1))} disabled={pending || pin.length === 0} aria-label="Delete last digit">
            <Delete aria-hidden className="size-6" />
          </button>
        </div>
        <Button type="submit" variant="primary" size="lg" fullWidth loading={pending} disabled={pin.length !== PIN_LENGTH}>
          Open check-in
        </Button>
      </div>
    </form>
  );
}

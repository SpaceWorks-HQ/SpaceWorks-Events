"use client";

import { useEffect } from "react";

const DEVICE_KEY = "swe.device";

/** This browser's random id, so sign-ins from a new device can be told apart. It proves nothing on its own. */
export function deviceId() {
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing && /^[a-f0-9]{64}$/.test(existing)) return existing;
    const bytes = new Uint8Array(32);
    window.crypto.getRandomValues(bytes);
    const created = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
    window.localStorage.setItem(DEVICE_KEY, created);
    return created;
  } catch {
    return undefined;
  }
}

/**
 * Browser and password-manager autofill can populate inputs without
 * dispatching an input/change event. Read the DOM values back so the
 * visible fields and the submitted credentials never diverge.
 */
export function useAutofillSync(sync: () => unknown) {
  useEffect(() => {
    const run = () => { sync(); };
    const animationFrame = window.requestAnimationFrame(run);
    const timeout = window.setTimeout(run, 250);
    window.addEventListener("pageshow", run);
    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearTimeout(timeout);
      window.removeEventListener("pageshow", run);
    };
  }, [sync]);
}

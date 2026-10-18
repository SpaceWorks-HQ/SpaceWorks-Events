"use client";

import { useCallback, useEffect, useRef } from "react";

type PetState = "walk" | "run" | "sit" | "sleep";

const EDGE = 12;
const WANDER_AFTER_MS = 4_500;
const SLEEP_AFTER_MS = 15_000;

/**
 * A small decorative box buddy that lives along the bottom of the 404 page: a
 * cardboard box on legs with the Space Works symbol's teal and orange flaps.
 * It runs toward the pointer (or a tap on touch screens), watches the pointer,
 * leaves fading footprints, wanders and naps when ignored, and wags its tail
 * flap and sends up hearts when patted.
 * Purely decorative: hidden from assistive tech and click-through (it never
 * blocks page controls), and it sits still for reduced-motion users.
 */
export function NotFoundPet() {
  const layerRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);

  const pat = useCallback(() => {
    const pet = petRef.current;
    if (!pet || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pet.dataset.happy = "true";
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement("span");
      heart.className = "yy-pet-heart";
      heart.style.left = `${24 + i * 12}px`;
      heart.style.animationDelay = `${i * 120}ms`;
      pet.appendChild(heart);
      window.setTimeout(() => heart.remove(), 1400);
    }
    window.setTimeout(() => {
      if (petRef.current) delete petRef.current.dataset.happy;
    }, 1400);
  }, []);

  useEffect(() => {
    const layer = layerRef.current;
    const pet = petRef.current;
    const body = bodyRef.current;
    if (!layer || !pet || !body) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const petWidth = () => pet.offsetWidth || 64;
    const maxX = () => Math.max(EDGE, window.innerWidth - petWidth() - EDGE);
    let x = reduceMotion ? maxX() - 8 : Math.min(maxX(), window.innerWidth * 0.18);
    let target = x;
    let facing = 1;
    let state: PetState = "sit";
    let lastInput = performance.now();
    let nextWander = 0;
    let hop = 0; // 0..1 progress of a hop arc
    let hopping = false;
    let stepDistance = 0;
    let pointer = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    let frame = 0;

    const setState = (next: PetState) => {
      if (state === next) return;
      state = next;
      pet.dataset.state = next;
    };

    const render = () => {
      const lift = hopping ? Math.sin(hop * Math.PI) * 46 : 0;
      pet.style.transform = `translate3d(${x}px, ${-lift}px, 0)`;
      body.style.transform = `scaleX(${facing})`;
      // Eyes look toward the pointer (mirrored when facing left).
      const headX = x + petWidth() * (facing > 0 ? 0.72 : 0.28);
      const headY = window.innerHeight - 52 - lift;
      const dx = pointer.x - headX;
      const dy = pointer.y - headY;
      const length = Math.hypot(dx, dy) || 1;
      pet.style.setProperty("--look-x", `${((dx / length) * 1.6 * facing).toFixed(2)}px`);
      pet.style.setProperty("--look-y", `${((dy / length) * 1.4).toFixed(2)}px`);
    };

    const dropPaw = () => {
      const paw = document.createElement("span");
      paw.className = "yy-pet-paw";
      paw.style.left = `${x + petWidth() / 2 + (Math.random() * 10 - 5)}px`;
      paw.style.transform = `rotate(${facing > 0 ? 90 : -90}deg)`;
      layer.appendChild(paw);
      window.setTimeout(() => paw.remove(), 1800);
    };

    const goTo = (clientX: number, withHop = false) => {
      lastInput = performance.now();
      target = Math.min(maxX(), Math.max(EDGE, clientX - petWidth() / 2));
      if (withHop && !hopping) {
        hopping = true;
        hop = 0;
      }
      if (state === "sleep") setState("sit");
    };

    const onPointerMove = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      if (event.pointerType === "mouse" || event.buttons > 0) goTo(event.clientX);
      else lastInput = performance.now();
    };
    const onPointerDown = (event: PointerEvent) => {
      pointer = { x: event.clientX, y: event.clientY };
      // The layer is click-through, so detect a pat by position instead of a click handler.
      const bounds = pet.getBoundingClientRect();
      if (event.clientX >= bounds.left && event.clientX <= bounds.right && event.clientY >= bounds.top - 8 && event.clientY <= bounds.bottom) {
        lastInput = performance.now();
        if (state === "sleep") setState("sit");
        pat();
        return;
      }
      goTo(event.clientX, true);
    };
    const onResize = () => {
      x = Math.min(x, maxX());
      target = Math.min(target, maxX());
      render();
    };

    pet.dataset.state = state;
    render();
    window.addEventListener("resize", onResize);
    if (reduceMotion) return () => window.removeEventListener("resize", onResize);

    window.addEventListener("pointermove", onPointerMove, { passive: true });
    window.addEventListener("pointerdown", onPointerDown, { passive: true });

    let previous = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(48, now - previous) / 16.67; // frames at 60fps
      previous = now;
      const idleFor = now - lastInput;

      if (idleFor > SLEEP_AFTER_MS && Math.abs(target - x) < 2) {
        setState("sleep");
      } else if (idleFor > WANDER_AFTER_MS && now > nextWander && state !== "sleep") {
        target = EDGE + Math.random() * (maxX() - EDGE);
        nextWander = now + 3_000 + Math.random() * 3_500;
      }

      const dx = target - x;
      if (Math.abs(dx) > 2 && state !== "sleep") {
        const fast = Math.abs(dx) > 220;
        const speed = Math.min(Math.abs(dx) * 0.06, fast ? 7.5 : 3.2) * dt;
        const move = Math.sign(dx) * Math.max(0.6, speed);
        x += Math.abs(move) > Math.abs(dx) ? dx : move;
        facing = dx > 0 ? 1 : -1;
        setState(fast ? "run" : "walk");
        stepDistance += Math.abs(move);
        if (stepDistance > 34) {
          stepDistance = 0;
          dropPaw();
        }
      } else if (state !== "sleep") {
        setState("sit");
      }

      if (hopping) {
        hop += 0.045 * dt;
        if (hop >= 1) {
          hopping = false;
          hop = 0;
        }
      }
      render();
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerdown", onPointerDown);
    };
  }, [pat]);

  return (
    <div ref={layerRef} aria-hidden className="pointer-events-none fixed inset-0 z-30 overflow-hidden">
      <div ref={petRef} className="yy-pet absolute bottom-2 left-0 w-14 select-none sm:bottom-3 sm:w-[72px]">
        <span className="yy-pet-zzz">z</span>
        <span className="yy-pet-zzz">z</span>
        <div ref={bodyRef} className="yy-pet-body">
          {/* A little cardboard box on legs, with the Space Works symbol's teal and
              orange flaps for ears and tail. Brand fills with Deep Ink lines; the legs
              and shadow follow the text ink so they read in both modes. */}
          <svg viewBox="0 0 80 64" className="block w-full overflow-visible" strokeLinejoin="round" strokeLinecap="round">
            <ellipse cx="40" cy="61" rx="26" ry="3" className="fill-ink opacity-10" />
            <path className="yy-pet-tail fill-sw-teal stroke-sw-ink" d="M17 30 L7 20 L11 16 L21 26 Z" strokeWidth="1.8" />
            <rect className="yy-pet-leg yy-pet-leg-a fill-ink" x="17" y="45" width="6" height="13" rx="3" />
            <rect className="yy-pet-leg yy-pet-leg-b fill-ink" x="27" y="45" width="6" height="13" rx="3" />
            <rect className="yy-pet-leg yy-pet-leg-b fill-ink" x="38" y="45" width="6" height="13" rx="3" />
            <rect className="yy-pet-leg yy-pet-leg-a fill-ink" x="48" y="45" width="6" height="13" rx="3" />
            <g className="yy-pet-torso">
              <rect className="fill-sw-citron stroke-sw-ink" x="12" y="25" width="44" height="24" rx="4" strokeWidth="2" />
              <path className="fill-none stroke-sw-ink opacity-40" d="M13 33 H44" strokeWidth="1.6" strokeDasharray="3 3" />
              <g className="yy-pet-head">
                <path className="yy-pet-ear fill-sw-teal stroke-sw-ink" d="M45 15 L57 15 L54 6 L40 7 Z" strokeWidth="1.8" />
                <path className="yy-pet-ear fill-sw-orange stroke-sw-ink" d="M60 15 L72 15 L78 8 L64 6 Z" strokeWidth="1.8" />
                <rect className="fill-sw-cream stroke-sw-ink" x="44" y="12" width="29" height="27" rx="5" strokeWidth="2" />
                <circle cx="50" cy="31" r="2.4" className="fill-sw-sky" />
                <circle cx="68" cy="31" r="2.4" className="fill-sw-sky" />
                <g className="yy-pet-eyes">
                  <g className="yy-pet-pupils">
                    <circle cx="53.5" cy="24" r="3" className="fill-sw-ink" />
                    <circle cx="64.5" cy="24" r="3" className="fill-sw-ink" />
                    <circle cx="54.5" cy="23" r="0.9" className="fill-sw-cream" />
                    <circle cx="65.5" cy="23" r="0.9" className="fill-sw-cream" />
                  </g>
                </g>
                <g className="yy-pet-sleepy-eyes">
                  <path d="M50.5 24.5 q3 2.6 6 0" className="fill-none stroke-sw-ink" strokeWidth="1.8" />
                  <path d="M61.5 24.5 q3 2.6 6 0" className="fill-none stroke-sw-ink" strokeWidth="1.8" />
                </g>
                <path d="M57 30 q2 2 4 0" className="fill-none stroke-sw-ink" strokeWidth="1.6" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

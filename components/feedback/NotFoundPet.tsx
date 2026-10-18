"use client";

import { useCallback, useEffect, useRef } from "react";

type PetState = "walk" | "run" | "sit" | "sleep";

const EDGE = 12;
/** Golden coat: Warm Yellow and Workshop Orange mixed 70/30; shading 50/50. */
const COAT = "color-mix(in srgb, var(--sw-yellow) 70%, var(--sw-orange))";
const SHADE = "color-mix(in srgb, var(--sw-yellow) 50%, var(--sw-orange))";
const WANDER_AFTER_MS = 4_500;
const SLEEP_AFTER_MS = 15_000;

/**
 * A small decorative golden retriever that lives along the bottom of the 404
 * page. It runs toward the pointer (or a tap on touch screens), watches the
 * pointer, leaves fading paw prints, wanders and naps when ignored, and wags,
 * flops its ear, sticks its tongue out and sends up hearts when patted.
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
          {/* A golden retriever drawn in brand colours: the coat is Warm Yellow and
              Workshop Orange mixed 70/30 (50/50 in the shading), Warm Cream for the
              snout and highlights, Deep Ink for lines, eyes and nose, and a Maker
              Teal collar with a Citron tag. The tongue (Workshop Orange) shows when
              the dog is happy. */}
          <svg viewBox="0 0 80 64" className="block w-full overflow-visible" strokeLinejoin="round" strokeLinecap="round">
            <ellipse cx="40" cy="61" rx="26" ry="3" className="fill-ink opacity-10" />
            {/* Feathery tail, hinged at the rump */}
            <g className="yy-pet-tail">
              <path
                className="stroke-sw-ink"
                style={{ fill: SHADE }}
                d="M20 32 C12 31 6 26 3 17 C6 20 9 21 11 21 C8 18 7 14 8 10 C12 17 17 23 23 27 Z"
                strokeWidth="1.6"
              />
              <path className="fill-none stroke-sw-cream opacity-70" d="M8 15 C10 20 14 24 19 27" strokeWidth="1.2" />
            </g>
            {/* Legs with cream paws */}
            {[
              { x: 18, side: "a" },
              { x: 28, side: "b" },
              { x: 41, side: "b" },
              { x: 51, side: "a" },
            ].map((leg) => (
              <g key={leg.x} className={`yy-pet-leg yy-pet-leg-${leg.side}`}>
                <rect x={leg.x} y="42" width="7" height="15" rx="3.5" className="stroke-sw-ink" style={{ fill: COAT }} strokeWidth="1.6" />
                <ellipse cx={leg.x + 3.5} cy="56.5" rx="4" ry="2" className="fill-sw-cream stroke-sw-ink" strokeWidth="1.4" />
              </g>
            ))}
            <g className="yy-pet-torso">
              <rect x="13" y="25" width="46" height="22" rx="11" className="stroke-sw-ink" style={{ fill: COAT }} strokeWidth="2" />
              {/* Shaded back and a fluffy cream chest */}
              <path d="M20 27 C30 24 44 24 54 27" className="fill-none opacity-80" style={{ stroke: SHADE }} strokeWidth="3" />
              <ellipse cx="34" cy="42" rx="13" ry="3.2" className="fill-sw-cream opacity-60" />
              <g className="yy-pet-head">
                {/* Collar and tag */}
                <path d="M51 31 C54 37 60 39 66 37" className="fill-none stroke-sw-teal" strokeWidth="3.4" />
                <circle cx="60" cy="40.5" r="2.4" className="fill-sw-citron stroke-sw-ink" strokeWidth="1.2" />
                <circle cx="61" cy="22" r="13" className="stroke-sw-ink" style={{ fill: COAT }} strokeWidth="2" />
                {/* Snout, nose, mouth and tongue */}
                <ellipse cx="71" cy="27" rx="8" ry="6" className="fill-sw-cream stroke-sw-ink" strokeWidth="1.8" />
                <ellipse cx="77" cy="24.6" rx="2.6" ry="2.1" className="fill-sw-ink" />
                <path className="yy-pet-tongue fill-sw-orange stroke-sw-ink" d="M70 30.5 C70 36 75 36 75 30.5 Z" strokeWidth="1.2" />
                <path d="M68 29.5 Q71.5 32.5 76 29" className="fill-none stroke-sw-ink" strokeWidth="1.4" />
                {/* Floppy ear */}
                <path
                  className="yy-pet-ear stroke-sw-ink"
                  style={{ fill: SHADE }}
                  d="M53 12 C46 13 44 23 47 31 C50 33 54 30 56 24 C57 19 56 14 53 12 Z"
                  strokeWidth="1.8"
                />
                <g className="yy-pet-eyes">
                  <g className="yy-pet-pupils">
                    <circle cx="60.5" cy="19" r="2.5" className="fill-sw-ink" />
                    <circle cx="67.5" cy="18.5" r="2.3" className="fill-sw-ink" />
                    <circle cx="61.3" cy="18.2" r="0.8" className="fill-sw-cream" />
                    <circle cx="68.2" cy="17.7" r="0.75" className="fill-sw-cream" />
                  </g>
                </g>
                <g className="yy-pet-sleepy-eyes">
                  <path d="M58 19.5 q2.5 2.2 5 0" className="fill-none stroke-sw-ink" strokeWidth="1.6" />
                  <path d="M65.2 19 q2.4 2.1 4.8 0" className="fill-none stroke-sw-ink" strokeWidth="1.6" />
                </g>
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useRef } from "react";

type PetState = "walk" | "run" | "sit" | "sleep";

const EDGE = 12;
const WANDER_AFTER_MS = 4_500;
const SLEEP_AFTER_MS = 15_000;

/**
 * A small decorative pup that lives along the bottom of the 404 page. It runs
 * toward the pointer (or a tap on touch screens), watches the pointer, leaves
 * fading paw prints, wanders and naps when ignored, and wags when petted.
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
      heart.textContent = "♥";
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
          <svg viewBox="0 0 80 64" className="block w-full overflow-visible">
            <ellipse cx="40" cy="61" rx="26" ry="3" className="fill-ink opacity-10" />
            <path className="yy-pet-tail fill-none stroke-accent" d="M16 38 C 8 36, 5 27, 9 20" strokeWidth="6" strokeLinecap="round" />
            <rect className="yy-pet-leg yy-pet-leg-a fill-accent" x="20" y="44" width="7" height="14" rx="3.5" />
            <rect className="yy-pet-leg yy-pet-leg-b fill-accent" x="31" y="44" width="7" height="14" rx="3.5" />
            <rect className="yy-pet-leg yy-pet-leg-b fill-accent" x="44" y="44" width="7" height="14" rx="3.5" />
            <rect className="yy-pet-leg yy-pet-leg-a fill-accent" x="54" y="44" width="7" height="14" rx="3.5" />
            <g className="yy-pet-torso">
              <rect className="fill-accent" x="14" y="26" width="50" height="24" rx="12" />
              <ellipse cx="38" cy="44" rx="15" ry="5" className="fill-white opacity-25" />
              <g className="yy-pet-head">
                <path className="fill-accent" d="M48 16 L51 2 L59 12 Z" />
                <path className="fill-accent" d="M64 12 L72 2 L74 16 Z" />
                <path d="M51 7 L53 13 L56 12 Z" className="fill-white opacity-40" />
                <circle cx="61" cy="25" r="16" className="fill-accent" />
                <circle cx="52" cy="31" r="3" className="fill-white opacity-25" />
                <circle cx="71" cy="31" r="3" className="fill-white opacity-25" />
                <g className="yy-pet-eyes">
                  <circle cx="55" cy="23" r="4.2" className="fill-white" />
                  <circle cx="67" cy="23" r="4.2" className="fill-white" />
                  <g className="yy-pet-pupils">
                    <circle cx="55" cy="23" r="2.3" fill="#18181B" />
                    <circle cx="67" cy="23" r="2.3" fill="#18181B" />
                  </g>
                </g>
                <g className="yy-pet-sleepy-eyes">
                  <path d="M51.5 24 q3.5 3 7 0" className="fill-none" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" />
                  <path d="M63.5 24 q3.5 3 7 0" className="fill-none" stroke="#18181B" strokeWidth="1.8" strokeLinecap="round" />
                </g>
                <path d="M59.5 29 q1.5 1.6 3 0" className="fill-none" stroke="#18181B" strokeWidth="1.6" strokeLinecap="round" />
                <circle cx="61" cy="28" r="1.4" fill="#18181B" />
              </g>
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}

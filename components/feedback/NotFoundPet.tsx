"use client";

import { useCallback, useEffect, useRef } from "react";

type PetState = "walk" | "run" | "sit" | "sleep";

const EDGE = 12;
const WANDER_AFTER_MS = 4_500;
const SLEEP_AFTER_MS = 15_000;

/**
 * Patch, the Space Works mascot, trotting along the bottom of the 404 page. Patch runs toward the
 * pointer (or a tap on touch screens), leaves fading paw prints, wanders and naps when ignored, and
 * closes its eyes happily and sends up hearts when patted.
 *
 * The artwork is the design system's walk cycle (SpaceWorks-Design `mascot/original/walk/` and the
 * approved left-facing `walk-left/`), eight frames per direction in one sprite sheet each under
 * `public/brand/patch/`. Patch is never flipped or redrawn here: heading left uses the left-facing
 * sheet. Purely decorative: hidden from assistive tech and click-through (it never blocks page
 * controls), and it sits still for reduced-motion users.
 */
export function NotFoundPet() {
  const layerRef = useRef<HTMLDivElement>(null);
  const petRef = useRef<HTMLDivElement>(null);

  const pat = useCallback(() => {
    const pet = petRef.current;
    if (!pet || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    pet.dataset.happy = "true";
    for (let i = 0; i < 3; i++) {
      const heart = document.createElement("span");
      heart.className = "yy-pet-heart";
      heart.style.left = `${30 + i * 14}%`;
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
    if (!layer || !pet) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const petWidth = () => pet.offsetWidth || 88;
    const maxX = () => Math.max(EDGE, window.innerWidth - petWidth() - EDGE);
    let x = reduceMotion ? maxX() - 8 : Math.min(maxX(), window.innerWidth * 0.18);
    let target = x;
    let state: PetState = "sit";
    let lastInput = performance.now();
    let nextWander = 0;
    let hop = 0; // 0..1 progress of a hop arc
    let hopping = false;
    let stepDistance = 0;
    let frame = 0;

    const setState = (next: PetState) => {
      if (state === next) return;
      state = next;
      pet.dataset.state = next;
    };
    const face = (direction: "left" | "right") => {
      if (pet.dataset.facing !== direction) pet.dataset.facing = direction;
    };

    const render = () => {
      const lift = hopping ? Math.sin(hop * Math.PI) * 46 : 0;
      pet.style.transform = `translate3d(${x}px, ${-lift}px, 0)`;
    };

    const dropPaw = () => {
      const paw = document.createElement("span");
      paw.className = "yy-pet-paw";
      paw.style.left = `${x + petWidth() / 2 + (Math.random() * 10 - 5)}px`;
      paw.style.transform = `rotate(${pet.dataset.facing === "left" ? -90 : 90}deg)`;
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
      if (event.pointerType === "mouse" || event.buttons > 0) goTo(event.clientX);
      else lastInput = performance.now();
    };
    const onPointerDown = (event: PointerEvent) => {
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
    face(reduceMotion ? "left" : "right");
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
        face(dx > 0 ? "right" : "left");
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
      <div ref={petRef} className="yy-pet absolute bottom-1 left-0 w-[88px] select-none sm:bottom-2 sm:w-[104px]">
        <span className="yy-pet-zzz">z</span>
        <span className="yy-pet-zzz">z</span>
        <div className="yy-pet-sprite" />
      </div>
    </div>
  );
}

"use client";

import { useEffect } from "react";

/** Makes every agent blob look toward the pointer when it is nearby. Respects reduced motion. */
export function useAvatarGaze() {
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    let point: { x: number; y: number } | null = null;
    const paint = () => {
      frame = 0;
      const blobs = document.querySelectorAll<HTMLElement>(".agent-blob");
      blobs.forEach((blob) => {
        if (!point) { blob.style.removeProperty("--ex"); blob.style.removeProperty("--ey"); return; }
        const rect = blob.getBoundingClientRect();
        const dx = point.x - (rect.left + rect.width / 2);
        const dy = point.y - (rect.top + rect.height / 2);
        const distance = Math.hypot(dx, dy);
        if (distance > 260 || distance === 0) { blob.style.removeProperty("--ex"); blob.style.removeProperty("--ey"); return; }
        const pull = Math.min(1, distance / 90);
        blob.style.setProperty("--ex", `${((dx / distance) * pull * 2.6).toFixed(2)}px`);
        blob.style.setProperty("--ey", `${((dy / distance) * pull * 2.2).toFixed(2)}px`);
      });
    };
    const move = (event: PointerEvent) => { point = { x: event.clientX, y: event.clientY }; if (!frame) frame = requestAnimationFrame(paint); };
    const leave = () => { point = null; if (!frame) frame = requestAnimationFrame(paint); };
    window.addEventListener("pointermove", move, { passive: true });
    document.documentElement.addEventListener("pointerleave", leave);
    return () => { window.removeEventListener("pointermove", move); document.documentElement.removeEventListener("pointerleave", leave); if (frame) cancelAnimationFrame(frame); };
  }, []);
}

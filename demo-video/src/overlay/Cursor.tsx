import React, { useLayoutEffect, useRef } from "react";
import { useCurrentFrame } from "remotion";
import { smooth } from "../lib/anim";
import type { Waypoint } from "../timeline";

// Pointer that travels between UI elements. Targets are `data-anchor` ids,
// measured in the camera layer's own coordinate space on every frame, so the
// cursor lands on the real element whatever the layout, scroll or zoom.
// Position is written imperatively in a layout effect (no extra render pass),
// which keeps each frame a pure function of the frame number.

const RIPPLE = 18;
const PRESS = 5;

export function Cursor({
  waypoints,
  clicks,
  carry,
}: {
  waypoints: Waypoint[];
  clicks: number[];
  carry?: React.ReactNode;
}) {
  const f = useCurrentFrame();
  const ref = useRef<HTMLDivElement>(null);

  const lastClick = [...clicks].reverse().find((c) => c <= f);
  const sinceClick = lastClick === undefined ? Infinity : f - lastClick;
  const pressed = sinceClick < PRESS;
  const rippleP = sinceClick < RIPPLE ? sinceClick / RIPPLE : -1;

  useLayoutEffect(() => {
    // Looked up through the DOM, not a parent ref: on a fresh mount (every
    // renderStill / render worker) child layout effects run before the
    // parent's ref is attached.
    const el = ref.current;
    const root = el?.closest<HTMLElement>("[data-camera-root]");
    if (!root || !el) return;
    const rr = root.getBoundingClientRect();
    const scale = rr.width / root.offsetWidth;

    const pos = (wp: Waypoint): { x: number; y: number } | null => {
      if (Array.isArray(wp.to)) return { x: wp.to[0], y: wp.to[1] };
      const node = root.querySelector(`[data-anchor="${wp.to}"]`);
      if (!node) return wp.fb ? { x: wp.fb[0], y: wp.fb[1] } : null;
      const r = node.getBoundingClientRect();
      return {
        x: (r.left + r.width / 2 - rr.left) / scale + (wp.dx ?? 0),
        y: (r.top + r.height / 2 - rr.top) / scale + (wp.dy ?? 0),
      };
    };

    let i = 0;
    while (i < waypoints.length - 1 && waypoints[i + 1].t <= f) i++;
    const cur = waypoints[i];
    const nxt = waypoints[i + 1];
    let p = pos(cur);
    if (nxt) {
      const start = nxt.t - (nxt.dur ?? 18);
      if (f > start) {
        const q = pos(nxt);
        const k = smooth(Math.min(1, (f - start) / (nxt.dur ?? 18)));
        if (p && q) p = { x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k };
        else p = q ?? p;
      }
    }
    if (!p) {
      el.style.opacity = "0";
      return;
    }
    el.style.opacity = "1";
    el.style.transform = `translate(${p.x}px, ${p.y}px)`;
  });

  return (
    <div
      ref={ref}
      style={{ position: "absolute", left: 0, top: 0, opacity: 0, pointerEvents: "none", zIndex: 100 }}
    >
      {rippleP >= 0 && (
        <span
          style={{
            position: "absolute",
            left: -26,
            top: -26,
            width: 52,
            height: 52,
            borderRadius: 9999,
            border: "3px solid rgba(29, 78, 216, 0.55)",
            background: "rgba(59, 130, 246, 0.18)",
            transform: `scale(${0.2 + rippleP * 0.9})`,
            opacity: 1 - rippleP,
          }}
        />
      )}
      {carry && (
        <div style={{ position: "absolute", left: 18, top: 22 }}>{carry}</div>
      )}
      <svg
        width="28"
        height="32"
        viewBox="0 0 28 32"
        style={{
          position: "absolute",
          left: -3,
          top: -2,
          transform: pressed ? "scale(0.86)" : "none",
          transformOrigin: "3px 2px",
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.3))",
        }}
      >
        <path
          d="M3 2 L3 25 L9 19.5 L13 28.5 L17 26.8 L13 18 L21 18 Z"
          fill="#111827"
          stroke="#ffffff"
          strokeWidth="2"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

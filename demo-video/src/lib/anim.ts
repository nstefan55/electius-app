import { Easing, interpolate } from "remotion";

export const smooth = Easing.bezier(0.45, 0, 0.2, 1);
export const easeOut = Easing.bezier(0.16, 1, 0.3, 1);

export const clamp = (v: number, lo: number, hi: number) =>
  Math.min(hi, Math.max(lo, v));

// 0 → 1 over [start, start + dur], eased.
export const prog = (
  f: number,
  start: number,
  dur: number,
  easing: (t: number) => number = smooth,
) =>
  interpolate(f, [start, start + dur], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing,
  });

// Typewriter: how much of `text` is visible at frame f.
export const typed = (text: string, f: number, start: number, cpf: number) =>
  text.slice(0, clamp(Math.floor((f - start) * cpf), 0, text.length));

export const typeEnd = (text: string, start: number, cpf: number) =>
  start + Math.ceil(text.length / cpf);

// Caret blink: visible for 16 frames, hidden for 14.
export const caretOn = (f: number) => f % 30 < 16;

// Piecewise-eased interpolation across keyframes {t, ...numbers}.
export type Kf = { t: number } & Record<string, number>;
export function keyframes<K extends Kf>(f: number, kfs: K[]): K {
  if (f <= kfs[0].t) return kfs[0];
  const last = kfs[kfs.length - 1];
  if (f >= last.t) return last;
  let i = 0;
  while (i < kfs.length - 1 && kfs[i + 1].t <= f) i++;
  const a = kfs[i];
  const b = kfs[i + 1];
  const p = smooth((f - a.t) / (b.t - a.t));
  const out: Record<string, number> = { t: f };
  for (const key of Object.keys(a)) {
    if (key === "t") continue;
    out[key] = a[key] + (b[key] - a[key]) * p;
  }
  return out as K;
}

// Croatian plural category (CLDR "hr"): one / few / other.
export function hrPlural(n: number): "one" | "few" | "other" {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "one";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "few";
  return "other";
}

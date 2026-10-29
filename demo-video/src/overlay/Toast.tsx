import { Check } from "lucide-react";
import { useCurrentFrame } from "remotion";
import { C, FONT, SHADOW } from "../theme";
import { easeOut, prog } from "../lib/anim";

// react-hot-toast look (AppToaster: top-center, rounded-md, border, shadow-md).
export function Toast({ text, from, dur }: { text: string; from: number; dur: number }) {
  const f = useCurrentFrame();
  if (f < from || f > from + dur) return null;
  const inP = prog(f, from, 12, easeOut);
  const outP = prog(f, from + dur - 10, 10);
  const y = -40 * (1 - inP) - 20 * outP;
  return (
    <div
      style={{
        position: "absolute",
        top: 16,
        left: 0,
        right: 0,
        display: "flex",
        justifyContent: "center",
        zIndex: 60,
        opacity: inP * (1 - outP),
        transform: `translateY(${y}px) scale(${0.85 + 0.15 * inP})`,
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderRadius: 8,
          border: `1px solid ${C.border}`,
          background: C.white,
          padding: "12px 16px",
          fontSize: 16,
          fontFamily: FONT.body,
          color: C.neutral800,
          boxShadow: SHADOW.md,
        }}
      >
        <span
          style={{
            width: 20,
            height: 20,
            borderRadius: 9999,
            background: "#61d345",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Check size={13} color="#fff" strokeWidth={3.2} />
        </span>
        {text}
      </div>
    </div>
  );
}

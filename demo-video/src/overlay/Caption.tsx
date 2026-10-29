import { interpolate, useCurrentFrame } from "remotion";
import { C, FONT } from "../theme";
import { easeOut, prog } from "../lib/anim";

export type Cue = { from: number; to: number; tag: string; text: string };

// Lower-third narration card (outside the camera layer, so it never zooms).
export function Captions({ cues }: { cues: Cue[] }) {
  const f = useCurrentFrame();
  return (
    <>
      {cues.map((c) => {
        if (f < c.from - 2 || f > c.to + 2) return null;
        const inP = prog(f, c.from, 16, easeOut);
        const outP = prog(f, c.to - 10, 10);
        const o = inP * (1 - outP);
        return (
          <div
            key={c.from}
            style={{
              position: "absolute",
              left: 56,
              bottom: 52,
              maxWidth: 820,
              opacity: o,
              transform: `translateY(${interpolate(inP, [0, 1], [24, 0]) + outP * 8}px)`,
              display: "flex",
              alignItems: "stretch",
              borderRadius: 16,
              overflow: "hidden",
              boxShadow: "0 18px 40px rgba(2, 12, 32, 0.35)",
              zIndex: 200,
            }}
          >
            <div
              style={{
                background: C.brand700,
                color: C.white,
                fontFamily: FONT.heading,
                fontWeight: 600,
                fontSize: 20,
                padding: "0 22px",
                display: "flex",
                alignItems: "center",
                whiteSpace: "nowrap",
              }}
            >
              {c.tag}
            </div>
            <div
              style={{
                background: "rgba(15, 30, 54, 0.94)",
                color: C.white,
                fontFamily: FONT.body,
                fontSize: 24,
                lineHeight: 1.35,
                padding: "16px 24px",
              }}
            >
              {c.text}
            </div>
          </div>
        );
      })}
    </>
  );
}

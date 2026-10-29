import { AbsoluteFill, Img, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { easeOut, prog } from "../lib/anim";
import { Backdrop } from "./Intro";

export const END_DURATION = 150;

export function EndCard() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 2, fps, config: { damping: 15, stiffness: 110 } });
  const tag = prog(f, 16, 22, easeOut);
  const links = prog(f, 30, 22, easeOut);
  const fadeOut = prog(f, END_DURATION - 20, 20);
  return (
    <Backdrop>
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", flexDirection: "column" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 22, transform: `scale(${0.85 + 0.15 * logo})`, opacity: logo }}>
          <Img src={staticFile("img/logo-mark-white.png")} style={{ width: 96, height: 96 }} />
          <span style={{ fontFamily: FONT.heading, fontWeight: 700, fontSize: 88, letterSpacing: "-0.025em", color: C.white }}>
            Electius
          </span>
        </div>
        <div
          style={{
            marginTop: 26,
            fontFamily: FONT.body,
            fontSize: 32,
            color: "rgba(255,255,255,0.85)",
            opacity: tag,
            transform: `translateY(${(1 - tag) * 14}px)`,
          }}
        >
          Sigurno elektroničko glasovanje za organizacije
        </div>
        <div
          style={{
            marginTop: 40,
            display: "flex",
            gap: 18,
            fontFamily: FONT.body,
            fontSize: 22,
            fontWeight: 600,
            color: C.white,
            opacity: links,
          }}
        >
          <span style={{ padding: "12px 24px", borderRadius: 9999, background: C.brand700 }}>electius.com</span>
          <span style={{ padding: "12px 24px", borderRadius: 9999, border: "1px solid rgba(255,255,255,0.25)" }}>
            contact@electius.com
          </span>
        </div>
        <div style={{ position: "absolute", bottom: 54, fontFamily: FONT.body, fontSize: 17, color: "rgba(255,255,255,0.5)", opacity: links }}>
          Demo prikaz · svi prikazani podaci su izmišljeni
        </div>
      </AbsoluteFill>
      <AbsoluteFill style={{ background: "#000", opacity: fadeOut }} />
    </Backdrop>
  );
}

import React from "react";
import { AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame, useVideoConfig } from "remotion";
import { C, FONT } from "../theme";
import { ORG } from "../data";
import { easeOut, prog } from "../lib/anim";

export const INTRO_DURATION = 165;

export function Backdrop({ children }: { children?: React.ReactNode }) {
  const f = useCurrentFrame();
  const drift = Math.sin(f / 60) * 40;
  return (
    <AbsoluteFill style={{ background: "#0c1c33", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: -200,
          background: `radial-gradient(60% 55% at ${30 + drift / 10}% 20%, rgba(37,99,235,0.45) 0%, rgba(37,99,235,0) 60%),
             radial-gradient(50% 50% at 85% 90%, rgba(29,78,216,0.35) 0%, rgba(29,78,216,0) 60%),
             linear-gradient(160deg, #1e3a5f 0%, #10233f 60%, #0a1729 100%)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.035) 1px, transparent 1px)",
          backgroundSize: "64px 64px",
          transform: `translateY(${(f * 0.4) % 64}px)`,
          maskImage: "radial-gradient(70% 70% at 50% 45%, black 30%, transparent 100%)",
        }}
      />
      {children}
    </AbsoluteFill>
  );
}

export function Intro() {
  const f = useCurrentFrame();
  const { fps } = useVideoConfig();
  const logo = spring({ frame: f - 4, fps, config: { damping: 14, stiffness: 120 } });
  const word = prog(f, 14, 20, easeOut);
  const kicker = prog(f, 34, 18, easeOut);
  const title = prog(f, 46, 24, easeOut);
  const chip = prog(f, 72, 22, easeOut);
  const out = prog(f, INTRO_DURATION - 16, 16);

  return (
    <Backdrop>
      <AbsoluteFill
        style={{
          alignItems: "center",
          justifyContent: "center",
          flexDirection: "column",
          opacity: 1 - out,
          transform: `scale(${1 + out * 0.04})`,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Img
            src={staticFile("img/logo-mark-white.png")}
            style={{ width: 84, height: 84, transform: `scale(${logo}) rotate(${(1 - logo) * -40}deg)` }}
          />
          <span
            style={{
              fontFamily: FONT.heading,
              fontWeight: 700,
              fontSize: 76,
              letterSpacing: "-0.025em",
              color: C.white,
              opacity: word,
              transform: `translateX(${(1 - word) * -24}px)`,
            }}
          >
            Electius
          </span>
        </div>

        <div
          style={{
            marginTop: 54,
            fontFamily: FONT.body,
            fontSize: 22,
            fontWeight: 600,
            letterSpacing: "0.22em",
            color: "#93c5fd",
            opacity: kicker,
            transform: `translateY(${(1 - kicker) * 12}px)`,
          }}
        >
          DEMO · ADMINISTRATORSKI PRIKAZ
        </div>
        <div
          style={{
            marginTop: 18,
            fontFamily: FONT.heading,
            fontWeight: 700,
            fontSize: 84,
            lineHeight: 1.08,
            textAlign: "center",
            color: C.white,
            opacity: title,
            transform: `translateY(${interpolate(title, [0, 1], [30, 0])}px)`,
          }}
        >
          Izrada izbora za
          <br />
          <span style={{ color: "#60a5fa" }}>Studentski zbor</span>
        </div>

        <div
          style={{
            marginTop: 48,
            display: "flex",
            alignItems: "center",
            gap: 16,
            padding: "12px 26px 12px 12px",
            borderRadius: 9999,
            background: "rgba(255,255,255,0.08)",
            border: "1px solid rgba(255,255,255,0.14)",
            opacity: chip,
            transform: `translateY(${(1 - chip) * 16}px)`,
          }}
        >
          <Img src={staticFile("img/org-logo.png")} style={{ width: 52, height: 52, borderRadius: 12 }} />
          <div style={{ fontFamily: FONT.body, color: C.white }}>
            <div style={{ fontSize: 24, fontWeight: 600 }}>{ORG}</div>
            <div style={{ fontSize: 16, color: "rgba(255,255,255,0.65)" }}>Demo korisnik · izmišljeni podaci</div>
          </div>
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}

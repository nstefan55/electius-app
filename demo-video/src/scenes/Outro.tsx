import { AbsoluteFill, useCurrentFrame } from "remotion";
import { Check, Mail, ShieldCheck, Smartphone } from "lucide-react";
import { C, FONT } from "../theme";
import { CANDIDATES, VOTER_COUNT } from "../data";
import { easeOut, prog } from "../lib/anim";
import { Backdrop } from "./Intro";

export const OUTRO_DURATION = 260;

const ITEMS = [
  {
    icon: Mail,
    title: "Pozivnice e-poštom",
    body: `Svaki od ${VOTER_COUNT} studenata dobiva jednokratnu, vremenski ograničenu poveznicu za glasovanje.`,
  },
  {
    icon: Smartphone,
    title: "Glasovanje u manje od 2 minute",
    body: "Bez računa i lozinke, na mobitelu ili računalu — glas se nikada ne povezuje s glasačem.",
  },
  {
    icon: ShieldCheck,
    title: "Rezultati i revizija",
    body: "Automatski rezultati, provjera kvoruma, PDF izvještaj i kriptografska potvrda svakog glasa.",
  },
];

// Voter "cast" screen (vote-flow.tsx step 3) inside a phone.
function PhoneBallot() {
  const f = useCurrentFrame();
  const pick = f >= 150 ? 0 : -1;
  const tapP = prog(f, 146, 14);
  return (
    <div
      style={{
        width: 400,
        height: 820,
        borderRadius: 60,
        background: "#0b1220",
        padding: 14,
        boxShadow: "0 50px 100px rgba(0,0,0,0.5), 0 0 0 2px rgba(255,255,255,0.08)",
      }}
    >
      <div style={{ width: "100%", height: "100%", borderRadius: 48, overflow: "hidden", background: C.neutral50, position: "relative", fontFamily: FONT.body }}>
        <div style={{ height: 44, display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0 30px", fontSize: 14, fontWeight: 600, color: C.neutral800 }}>
          <span>9:41</span>
          <span style={{ width: 100, height: 28, borderRadius: 9999, background: "#0b1220" }} />
          <span>5G</span>
        </div>
        <div style={{ display: "flex", justifyContent: "center", gap: 8, paddingTop: 10 }}>
          {[1, 2, 3, 4, 5].map((n) => (
            <span
              key={n}
              style={{
                width: n === 3 ? 12 : 8,
                height: n === 3 ? 12 : 8,
                borderRadius: 9999,
                background: n === 3 ? C.brand500 : n < 3 ? C.brand700 : C.neutral200,
              }}
            />
          ))}
        </div>
        <div style={{ margin: "14px 16px 0", borderRadius: 12, border: `1px solid ${C.neutral200}`, background: C.white, padding: 20, display: "flex", flexDirection: "column", gap: 16, boxShadow: "0 1px 3px rgba(0,0,0,0.1)" }}>
          <div style={{ fontFamily: FONT.heading, fontSize: 24, fontWeight: 700, color: C.neutral800 }}>Dajte svoj glas</div>
          <div style={{ marginTop: -10, fontSize: 14, color: C.neutral600 }}>Odaberite jednog kandidata.</div>
          {CANDIDATES.map((c, i) => {
            const sel = pick === i;
            return (
              <div
                key={c.name}
                style={{
                  position: "relative",
                  borderRadius: 16,
                  border: `2px solid ${sel ? C.brand700 : C.neutral200}`,
                  background: sel ? C.brand50 : C.white,
                  padding: "14px 16px",
                  transform: i === 0 && tapP > 0 && tapP < 1 ? `scale(${1 - Math.sin(tapP * Math.PI) * 0.03})` : "none",
                }}
              >
                {sel && (
                  <span style={{ position: "absolute", right: 12, top: 12, width: 24, height: 24, borderRadius: 9999, background: C.brand700, color: C.white, display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={14} />
                  </span>
                )}
                <div style={{ fontFamily: FONT.heading, fontSize: 16, fontWeight: 600, color: C.neutral800 }}>{c.name}</div>
                <div style={{ marginTop: 2, fontSize: 13, color: C.neutral600 }}>{c.role}</div>
              </div>
            );
          })}
          <div style={{ height: 52, borderRadius: 8, background: pick >= 0 ? C.brand700 : "#93a8d8", color: C.white, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16, fontWeight: 600 }}>
            Nastavi
          </div>
        </div>
      </div>
    </div>
  );
}

export function Outro() {
  const f = useCurrentFrame();
  const head = prog(f, 6, 22, easeOut);
  const phone = prog(f, 20, 30, easeOut);
  const out = prog(f, OUTRO_DURATION - 16, 16);
  return (
    <Backdrop>
      <AbsoluteFill style={{ opacity: 1 - out }}>
        <div style={{ position: "absolute", left: 140, top: 170, width: 900 }}>
          <div style={{ fontFamily: FONT.body, fontSize: 20, fontWeight: 600, letterSpacing: "0.2em", color: "#93c5fd", opacity: head }}>
            NAKON IZRADE
          </div>
          <div
            style={{
              marginTop: 12,
              fontFamily: FONT.heading,
              fontSize: 64,
              fontWeight: 700,
              color: C.white,
              opacity: head,
              transform: `translateY(${(1 - head) * 20}px)`,
            }}
          >
            Što slijedi?
          </div>
          <div style={{ marginTop: 40, display: "flex", flexDirection: "column", gap: 26 }}>
            {ITEMS.map(({ icon: Icon, title, body }, i) => {
              const p = prog(f, 34 + i * 22, 22, easeOut);
              return (
                <div
                  key={title}
                  style={{
                    display: "flex",
                    gap: 24,
                    alignItems: "flex-start",
                    padding: "24px 28px",
                    borderRadius: 18,
                    background: "rgba(255,255,255,0.06)",
                    border: "1px solid rgba(255,255,255,0.12)",
                    opacity: p,
                    transform: `translateX(${(1 - p) * -40}px)`,
                  }}
                >
                  <span
                    style={{
                      width: 60,
                      height: 60,
                      borderRadius: 16,
                      background: C.brand700,
                      color: C.white,
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <Icon size={30} />
                  </span>
                  <div>
                    <div style={{ fontFamily: FONT.heading, fontSize: 28, fontWeight: 600, color: C.white }}>{title}</div>
                    <div style={{ marginTop: 6, fontFamily: FONT.body, fontSize: 21, lineHeight: 1.45, color: "rgba(255,255,255,0.75)" }}>
                      {body}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div
          style={{
            position: "absolute",
            right: 190,
            top: 130,
            opacity: phone,
            transform: `translateY(${(1 - phone) * 80}px) rotate(${(1 - phone) * 4}deg)`,
          }}
        >
          <PhoneBallot />
        </div>
      </AbsoluteFill>
    </Backdrop>
  );
}

import React from "react";
import { useCurrentFrame } from "remotion";
import { QRCodeSVG } from "qrcode.react";
import { ChevronRight, CircleCheckBig, QrCode } from "lucide-react";
import { C, FONT, SHADOW } from "../../theme";
import { CANDIDATES, ELECTION, VOTER_COUNT } from "../../data";
import { TL } from "../../timeline";
import { easeOut, hrPlural, prog } from "../../lib/anim";
import { OutlineButton, PrimaryButton } from "../primitives";

// Port of wizard-success.tsx ("Izbori su izrađeni" + QR code toggle).

export const VOTE_URL = `https://electius.com/vote/${ELECTION.id}`;

export function Success({ scroll }: { scroll: number }) {
  const f = useCurrentFrame();
  const enter = prog(f, TL.success, 18, easeOut);
  const iconPop = prog(f, TL.success + 6, 16, easeOut);
  const qrShown = f >= TL.successQr + 2;
  const qrP = prog(f, TL.successQr + 2, 16, easeOut);
  const qrPressed = f >= TL.successQr && f < TL.successQr + 5;

  const rows: [string, React.ReactNode][] = [
    ["Način", "Jedan izbor"],
    ["Kandidati", `${CANDIDATES.length} ${hrPlural(CANDIDATES.length) === "one" ? "kandidat" : "kandidata"}`],
    ["Glasači", `${VOTER_COUNT.toLocaleString("hr-HR")} glasača`],
    ["Zatvara se", ELECTION.closesDisplay],
    ["ID izbora", <span key="id" style={{ fontFamily: FONT.mono }}>{ELECTION.id}</span>],
  ];

  return (
    <div style={{ height: "100%", overflow: "hidden" }}>
      <div style={{ transform: `translateY(${-scroll}px)` }}>
        <div
          style={{
            margin: "0 auto",
            width: 576,
            padding: "56px 0",
            opacity: enter,
            transform: `translateY(${(1 - enter) * 24}px) scale(${0.97 + 0.03 * enter})`,
          }}
        >
          <div
            style={{
              borderRadius: 16,
              border: `1px solid ${C.border}`,
              background: C.white,
              padding: "44px 40px",
              textAlign: "center",
              boxShadow: SHADOW.md,
            }}
          >
            <div
              style={{
                margin: "0 auto 22px",
                width: 72,
                height: 72,
                borderRadius: 9999,
                background: C.success50,
                color: "#16A34A",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                transform: `scale(${0.4 + 0.6 * iconPop})`,
              }}
            >
              <CircleCheckBig size={36} />
            </div>
            <h1 style={{ margin: 0, fontFamily: FONT.heading, fontSize: 26, lineHeight: 1.25, fontWeight: 700, color: C.neutral800 }}>
              Izbori su izrađeni
            </h1>
            <p style={{ margin: "10px 0 0", fontSize: 16, lineHeight: 1.5, color: C.muted }}>
              <span style={{ fontWeight: 600, color: C.neutral800 }}>{ELECTION.title}</span> je spremno. Izborima upravljate
              s njihove stranice ili popisa izbora.
            </p>

            <div
              style={{
                margin: "28px 0",
                borderRadius: 12,
                border: `1px solid ${C.border}`,
                background: C.neutral50,
                padding: "20px 22px",
                textAlign: "left",
                display: "grid",
                gridTemplateColumns: "130px 1fr",
                columnGap: 16,
                rowGap: 11,
                fontSize: 14,
              }}
            >
              {rows.map(([label, value]) => (
                <React.Fragment key={label}>
                  <span style={{ color: C.neutral400 }}>{label}</span>
                  <span style={{ fontWeight: 500, color: C.neutral800, wordBreak: "break-all" }}>{value}</span>
                </React.Fragment>
              ))}
            </div>

            {qrShown && (
              <div
                data-anchor="succ-qr-panel"
                style={{
                  marginBottom: 30,
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  borderRadius: 16,
                  border: `1px solid ${C.border}`,
                  background: C.white,
                  padding: 26,
                  textAlign: "center",
                  opacity: qrP,
                  transform: `scale(${0.94 + 0.06 * qrP})`,
                }}
              >
                <div style={{ width: 196, height: 196, borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, padding: 14, boxShadow: SHADOW.xs }}>
                  <QRCodeSVG value={VOTE_URL} level="M" style={{ width: "100%", height: "100%" }} />
                </div>
                <h2 style={{ margin: "18px 0 0", fontFamily: FONT.heading, fontSize: 18, lineHeight: 1.25, fontWeight: 600, color: C.neutral800 }}>
                  {ELECTION.title}
                </h2>
                <span style={{ marginTop: 8, display: "inline-flex", height: 22, alignItems: "center", borderRadius: 9999, background: C.brand50, padding: "0 10px", fontSize: 12, fontWeight: 600, color: C.brand700 }}>
                  Standardni
                </span>
                <div style={{ marginTop: 12, fontSize: 13.5, lineHeight: 1.5, color: C.muted }}>
                  Jedan izbor · {VOTER_COUNT.toLocaleString("hr-HR")} glasača · Zatvara se {ELECTION.closesDisplay}
                </div>
                <div style={{ marginTop: 14, maxWidth: "100%", borderRadius: 8, border: `1px solid ${C.border}`, background: C.neutral50, padding: "10px 14px", fontFamily: FONT.mono, fontSize: 12.5, color: C.neutral800, wordBreak: "break-all" }}>
                  {VOTE_URL}
                </div>
                <p style={{ margin: "14px 0 0", maxWidth: 320, fontSize: 12.5, lineHeight: 1.5, color: C.neutral600 }}>
                  Glasači skeniraju ovaj kod za otvaranje glasačkog listića. Glas ostaje anoniman — kod vodi na izbore, nikad na osobu.
                </p>
              </div>
            )}

            <div style={{ display: "flex", flexWrap: "wrap", justifyContent: "center", gap: 12 }}>
              <OutlineButton height={48} style={{ padding: "0 22px" }}>
                Izradi nove
              </OutlineButton>
              <OutlineButton anchor="succ-qr" height={48} color={C.brand700} borderColor="#BFDBFE" pressed={qrPressed}>
                <QrCode size={18} />
                {qrShown ? "Sakrij QR kod" : "Izradi QR kod"}
              </OutlineButton>
              <PrimaryButton height={48}>
                Idi na izbore
                <ChevronRight size={18} />
              </PrimaryButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

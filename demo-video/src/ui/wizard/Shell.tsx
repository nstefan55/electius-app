import React from "react";
import { Check, ChevronLeft, ChevronRight, Eye, Save, X } from "lucide-react";
import { C, FONT, SHADOW } from "../../theme";
import { OutlineButton, PrimaryButton } from "../primitives";

// Port of election-wizard.tsx chrome: top bar, 5-step stepper, scroll body,
// footer nav. Modal = 90vw × 90vh of the 1800×960 viewport.

export const MODAL = { x: 90, y: 48, w: 1620, h: 864 };

const STEPS = ["Osnovni podaci", "Kandidati", "Popis glasača", "Postavke", "Pregled"];

export const stepLabel = (n: number) => `Korak ${n} od 5 · ${STEPS[n - 1]}`;

function Stepper({ step }: { step: number }) {
  return (
    <div
      style={{
        flexShrink: 0,
        borderBottom: `1px solid ${C.border}`,
        background: C.white,
        padding: "18px 28px",
      }}
    >
      <div style={{ margin: "0 auto", maxWidth: 896, display: "flex", alignItems: "center" }}>
        {STEPS.map((name, i) => {
          const n = i + 1;
          const done = n < step;
          const current = n === step;
          return (
            <div key={name} style={{ display: "flex", alignItems: "center", flex: n < 5 ? 1 : undefined }}>
              <div style={{ display: "flex", alignItems: "center", gap: 10, flexShrink: 0 }}>
                <span
                  style={{
                    width: 30,
                    height: 30,
                    borderRadius: 9999,
                    border: `1.5px solid ${done || current ? C.brand700 : C.border}`,
                    background: done || current ? C.brand700 : C.white,
                    color: done || current ? C.white : C.neutral400,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontFamily: FONT.heading,
                    fontSize: 14,
                    fontWeight: 600,
                  }}
                >
                  {done ? <Check size={15} strokeWidth={2.6} /> : n}
                </span>
                <span
                  style={{
                    fontFamily: FONT.heading,
                    fontSize: 14,
                    whiteSpace: "nowrap",
                    fontWeight: current ? 600 : 500,
                    color: current ? C.neutral800 : done ? C.brand700 : C.neutral400,
                  }}
                >
                  {name}
                </span>
              </div>
              {n < 5 && (
                <span
                  style={{
                    margin: "0 14px",
                    height: 2,
                    minWidth: 20,
                    flex: 1,
                    borderRadius: 9999,
                    background: done ? C.brand700 : C.neutral200,
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function WizardShell({
  step,
  scroll,
  nextPressed,
  createPressed,
  creating,
  children,
}: {
  step: number;
  scroll: number;
  nextPressed: boolean;
  createPressed: boolean;
  creating: boolean;
  children: React.ReactNode;
}) {
  return (
    <div style={{ display: "flex", height: "100%", flexDirection: "column" }}>
      {/* Top bar */}
      <div
        style={{
          height: 68,
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          borderBottom: `1px solid ${C.border}`,
          background: C.white,
          padding: "0 28px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <span
            style={{
              width: 44,
              height: 44,
              borderRadius: 8,
              border: `1px solid ${C.border}`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: C.muted,
            }}
          >
            <X size={20} />
          </span>
          <div>
            <div style={{ fontFamily: FONT.heading, fontSize: 18, lineHeight: 1.25, fontWeight: 600, color: C.neutral800 }}>
              Izrada izbora
            </div>
            <div style={{ marginTop: 1, fontSize: 13, color: C.muted }}>{stepLabel(step)}</div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, color: C.neutral600 }}>
            <Eye size={15} />
            Anonimno i provjerljivo
          </span>
          <span style={{ display: "inline-flex", alignItems: "center", gap: 7, height: 40, padding: "0 6px", fontSize: 15, fontWeight: 600, color: C.muted }}>
            <Save size={17} />
            Spremi kao skicu
          </span>
        </div>
      </div>

      <Stepper step={step} />

      {/* Scroll body */}
      <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
        <div style={{ transform: `translateY(${-scroll}px)` }}>
          <div style={{ margin: "0 auto", maxWidth: 768, padding: "36px 28px 64px" }}>{children}</div>
        </div>
      </div>

      {/* Footer nav */}
      <div style={{ flexShrink: 0, borderTop: `1px solid ${C.border}`, background: C.white, padding: "16px 28px" }}>
        <div style={{ margin: "0 auto", maxWidth: 768, display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16 }}>
          <OutlineButton disabled={step === 1}>
            <ChevronLeft size={18} />
            Natrag
          </OutlineButton>
          <span style={{ fontSize: 13, color: C.neutral600 }}>{stepLabel(step)}</span>
          {step === 5 ? (
            <span data-anchor="btn-next">
              <PrimaryButton anchor="btn-create" pressed={createPressed} style={{ opacity: creating ? 0.6 : 1 }}>
                <Check size={18} strokeWidth={2.4} />
                {creating ? "Izrada…" : "Izradi izbore"}
              </PrimaryButton>
            </span>
          ) : (
            <PrimaryButton anchor="btn-next" pressed={nextPressed}>
              Nastavi
              <ChevronRight size={18} />
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  );
}

export function ModalFrame({
  children,
  p,
}: {
  children: React.ReactNode;
  p: number; // open progress 0..1
}) {
  return (
    <div style={{ position: "absolute", inset: 0, zIndex: 40 }}>
      <div style={{ position: "absolute", inset: 0, background: `rgba(0,0,0,${0.4 * p})` }} />
      <div
        style={{
          position: "absolute",
          left: MODAL.x,
          top: MODAL.y,
          width: MODAL.w,
          height: MODAL.h,
          borderRadius: 16,
          overflow: "hidden",
          background: C.neutral50,
          boxShadow: SHADOW.lg,
          opacity: p,
          transform: `scale(${0.96 + 0.04 * p}) translateY(${(1 - p) * 16}px)`,
        }}
      >
        {children}
      </div>
    </div>
  );
}

import React from "react";
import { ArrowLeft, ArrowRight, Lock, RotateCw } from "lucide-react";
import { BROWSER, C, FONT, VIEWPORT } from "../theme";

// Minimal Chromium-style window around the app viewport.
export function BrowserFrame({
  url,
  children,
}: {
  url: string;
  children: React.ReactNode;
}) {
  return (
    <div
      style={{
        position: "absolute",
        left: BROWSER.x,
        top: BROWSER.y,
        width: BROWSER.w,
        borderRadius: 14,
        overflow: "hidden",
        background: C.white,
        boxShadow:
          "0 40px 80px rgba(2, 12, 32, 0.45), 0 8px 24px rgba(2, 12, 32, 0.25), 0 0 0 1px rgba(255,255,255,0.06)",
      }}
    >
      <div
        style={{
          height: BROWSER.chrome,
          background: "#eef1f5",
          borderBottom: `1px solid ${C.border}`,
          display: "flex",
          alignItems: "center",
          gap: 18,
          padding: "0 18px",
        }}
      >
        <div style={{ display: "flex", gap: 8 }}>
          {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
            <span key={c} style={{ width: 12, height: 12, borderRadius: 9999, background: c }} />
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, color: C.neutral400 }}>
          <ArrowLeft size={16} />
          <ArrowRight size={16} />
          <RotateCw size={15} />
        </div>
        <div
          style={{
            flex: 1,
            maxWidth: 760,
            height: 30,
            borderRadius: 9999,
            background: C.white,
            border: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            gap: 8,
            padding: "0 14px",
            fontFamily: FONT.body,
            fontSize: 13,
            color: C.muted,
          }}
        >
          <Lock size={12} color={C.neutral600} />
          <span>{url}</span>
        </div>
      </div>
      <div style={{ position: "relative", width: VIEWPORT.w, height: VIEWPORT.h, overflow: "hidden" }}>
        {children}
      </div>
    </div>
  );
}

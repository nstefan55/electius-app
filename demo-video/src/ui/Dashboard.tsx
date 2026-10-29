import React from "react";
import { Img, staticFile } from "remotion";
import {
  Archive,
  BarChart3,
  Bell,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
  EllipsisVertical,
  House,
  PanelLeft,
  Plus,
  Users,
  CircleCheck,
  ChartColumn,
} from "lucide-react";
import { C, FONT, SHADOW, VIEWPORT } from "../theme";
import { ADMIN, DASHBOARD, ORG } from "../data";
import { Avatar, ProBadge } from "./primitives";

// Port of the (app) shell + /home page (sidebar-nav.tsx, dashboard-header.tsx,
// stat-cards.tsx, live-hero.tsx, recent-elections.tsx) with Croatian copy.

const SIDEBAR_W = 264;

const NAV = [
  { label: "Početna", icon: House, active: true },
  { label: "Izbori", icon: CheckCircle2 },
  { label: "Rezultati", icon: BarChart3 },
  { label: "Arhiva", icon: Archive },
  { label: "Glasači", icon: Users },
];

const STATUS = {
  ACTIVE: { label: "Aktivan", fg: C.success700, bg: C.success50, dot: C.statusActive },
  SCHEDULED: { label: "Zakazan", fg: C.warning700, bg: C.warning50, dot: C.statusScheduled },
  CLOSED: { label: "Zatvoren", fg: C.error700, bg: C.error50, dot: C.statusClosed },
  DRAFT: { label: "Skica", fg: C.brand700, bg: C.brand50, dot: C.statusDraft },
} as const;

export type StatusKey = keyof typeof STATUS;

export function StatusChip({ status }: { status: StatusKey }) {
  const s = STATUS[status];
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        height: 22,
        padding: "0 10px",
        borderRadius: 9999,
        background: s.bg,
        color: s.fg,
        fontSize: 12,
        fontWeight: 500,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9999, background: s.dot }} />
      {s.label}
    </span>
  );
}

function Sidebar() {
  return (
    <div
      style={{
        width: SIDEBAR_W,
        height: "100%",
        background: C.brand900,
        color: C.white,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
      }}
    >
      <div style={{ height: 64, display: "flex", alignItems: "center", gap: 10, padding: "0 24px" }}>
        <Img src={staticFile("img/logo-mark-white.png")} style={{ width: 30, height: 30 }} />
        <span style={{ fontFamily: FONT.heading, fontSize: 20, fontWeight: 700, letterSpacing: "-0.025em" }}>
          Electius
        </span>
      </div>
      <div style={{ padding: 12, display: "flex", flexDirection: "column", gap: 4, flex: 1 }}>
        {NAV.map(({ label, icon: Icon, active }) => (
          <div
            key={label}
            style={{
              height: 44,
              display: "flex",
              alignItems: "center",
              gap: 12,
              borderRadius: 8,
              padding: "0 16px",
              fontSize: 16,
              fontWeight: active ? 600 : 400,
              background: active ? C.brand700 : "transparent",
              color: active ? C.white : "rgba(255,255,255,0.75)",
            }}
          >
            <Icon size={20} />
            {label}
          </div>
        ))}
      </div>
      <div style={{ borderTop: "1px solid rgba(255,255,255,0.1)", padding: 12 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 12px" }}>
          <Avatar name={ADMIN.name} size={38} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 14, fontWeight: 600 }}>{ADMIN.name}</div>
            <div style={{ fontSize: 12, color: "rgba(255,255,255,0.6)", lineHeight: 1.375 }}>{ORG}</div>
          </div>
          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
            <ProBadge />
            <ChevronsUpDown size={16} color="rgba(255,255,255,0.6)" />
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({ label, value, hint, tone, Icon }: {
  label: string; value: string; hint: string; tone: string; Icon: React.ComponentType<{ size?: number; color?: string }>;
}) {
  return (
    <div
      style={{
        flex: 1,
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        background: C.white,
        padding: "20px 22px",
        boxShadow: SHADOW.xs,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <span style={{ fontSize: 14, color: C.muted }}>{label}</span>
        <span
          style={{
            width: 30, height: 30, borderRadius: 9999, display: "flex", alignItems: "center", justifyContent: "center",
            background: tone === "success" ? C.success50 : C.brand50,
          }}
        >
          <Icon size={16} color={tone === "success" ? C.success700 : C.brand700} />
        </span>
      </div>
      <div style={{ fontFamily: FONT.heading, fontSize: 32, fontWeight: 700, color: C.neutral800, marginTop: 6 }}>
        {value}
      </div>
      <div style={{ fontSize: 13, marginTop: 2, color: tone === "success" ? C.success700 : C.muted }}>{hint}</div>
    </div>
  );
}

export function Dashboard({ pressNew = false }: { pressNew?: boolean }) {
  const icons = [CircleCheck, Users, ChartColumn, Archive];
  return (
    <div style={{ width: VIEWPORT.w, height: VIEWPORT.h, display: "flex", background: C.neutral50 }}>
      <Sidebar />
      <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0 }}>
        {/* Top bar */}
        <div
          style={{
            height: 64,
            background: C.white,
            borderBottom: `1px solid ${C.border}`,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "0 28px",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: 14, color: C.neutral800 }}>
            <PanelLeft size={20} color={C.muted} />
            <span style={{ fontFamily: FONT.heading, fontWeight: 600, fontSize: 17 }}>Početna</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 18 }}>
            <span style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: C.muted }}>
              <span style={{ width: 8, height: 8, borderRadius: 9999, background: C.success500 }} />
              Ažurirano upravo sada
            </span>
            <span
              style={{
                width: 40, height: 40, borderRadius: 8, border: `1px solid ${C.border}`,
                display: "flex", alignItems: "center", justifyContent: "center",
              }}
            >
              <Bell size={18} color={C.muted} />
            </span>
          </div>
        </div>

        <div style={{ padding: "30px 36px", display: "flex", flexDirection: "column", gap: 24 }}>
          {/* Header */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div style={{ fontFamily: FONT.heading, fontSize: 30, fontWeight: 700, letterSpacing: "-0.025em", color: C.neutral800, lineHeight: "36px" }}>
                Početna
              </div>
              <div style={{ marginTop: 6, fontSize: 15, color: C.muted }}>{ORG}</div>
            </div>
            <span
              data-anchor="btn-new"
              style={{
                display: "inline-flex",
                height: 48,
                alignItems: "center",
                gap: 8,
                borderRadius: 8,
                background: pressNew ? C.brand600 : C.brand700,
                padding: "0 22px",
                fontSize: 16,
                fontWeight: 600,
                color: C.white,
                boxShadow: SHADOW.xs,
                transform: pressNew ? "scale(0.97)" : "none",
              }}
            >
              <Plus size={20} />
              Novi izbor
            </span>
          </div>

          {/* Stat cards */}
          <div style={{ display: "flex", gap: 16 }}>
            {DASHBOARD.stats.map((s, i) => (
              <StatCard key={s.label} {...s} Icon={icons[i]} />
            ))}
          </div>

          {/* Live hero */}
          <div style={{ borderRadius: 12, background: C.brand900, color: C.white, padding: 30, boxShadow: SHADOW.md, display: "flex", justifyContent: "space-between", gap: 32 }}>
            <div style={{ flex: 1 }}>
              <div style={{ display: "inline-flex", alignItems: "center", gap: 6, borderRadius: 9999, padding: "4px 10px", background: "rgba(34,197,94,0.15)", marginBottom: 14 }}>
                <span style={{ width: 7, height: 7, borderRadius: 9999, background: C.success500 }} />
                <span style={{ fontSize: 12, fontWeight: 600, letterSpacing: "0.025em", color: C.success500 }}>
                  Uživo — glasovanje u tijeku
                </span>
              </div>
              <div style={{ fontFamily: FONT.heading, fontSize: 24, fontWeight: 600, lineHeight: 1.375 }}>{DASHBOARD.live.name}</div>
              <div style={{ marginTop: 8, fontSize: 14, color: "rgba(255,255,255,0.65)" }}>{DASHBOARD.live.meta}</div>
              <div style={{ marginTop: 20, maxWidth: 448, height: 8, borderRadius: 9999, background: "rgba(255,255,255,0.15)", overflow: "hidden" }}>
                <div style={{ width: `${DASHBOARD.live.pct}%`, height: "100%", borderRadius: 9999, background: C.success500 }} />
              </div>
              <div style={{ marginTop: 12, fontSize: 14, color: "rgba(255,255,255,0.85)" }}>
                {DASHBOARD.live.voted} od {DASHBOARD.live.total} glasača dalo je svoj glas
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 14 }}>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: FONT.heading, fontSize: 56, fontWeight: 700, lineHeight: 1 }}>{DASHBOARD.live.pct}%</div>
                <div style={{ marginTop: 4, fontSize: 13, color: "rgba(255,255,255,0.6)" }}>izlaznost uživo</div>
              </div>
              <span style={{ display: "inline-flex", alignItems: "center", gap: 4, height: 48, padding: "0 24px", borderRadius: 8, background: C.white, color: C.brand700, fontSize: 15, fontWeight: 600 }}>
                Pogledaj rezultate uživo <ChevronRight size={20} />
              </span>
            </div>
          </div>

          {/* Recent elections */}
          <div style={{ borderRadius: 12, border: `1px solid ${C.border}`, background: C.white, padding: "22px 26px", boxShadow: SHADOW.xs }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
              <div>
                <div style={{ fontFamily: FONT.heading, fontSize: 18, fontWeight: 600, color: C.neutral800 }}>Nedavni izbori</div>
                <div style={{ fontSize: 13, color: C.muted, marginTop: 2 }}>11 izbora · 1 aktivnih</div>
              </div>
              <span style={{ fontSize: 14, fontWeight: 600, color: C.brand700 }}>Pogledaj sve</span>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1.4fr 1.2fr 32px", fontSize: 13, color: C.muted, marginTop: 18, paddingBottom: 8, borderBottom: `1px solid ${C.neutral100}` }}>
              <span>Izbor</span><span>Status</span><span>Izlaznost</span><span>Razdoblje glasovanja</span><span />
            </div>
            {DASHBOARD.recent.map((r) => (
              <div key={r.name} style={{ display: "grid", gridTemplateColumns: "2.2fr 1fr 1.4fr 1.2fr 32px", alignItems: "center", padding: "12px 0", borderBottom: `1px solid ${C.neutral100}` }}>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: C.neutral800 }}>{r.name}</div>
                  <div style={{ fontSize: 13, color: C.muted }}>{r.type}</div>
                </div>
                <div><StatusChip status={r.status} /></div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, paddingRight: 24 }}>
                  <div style={{ flex: 1, height: 6, borderRadius: 9999, background: C.neutral100, overflow: "hidden" }}>
                    <div style={{ width: `${r.pct}%`, height: "100%", background: STATUS[r.status].dot }} />
                  </div>
                  <span style={{ fontSize: 13, color: C.neutral800, width: 36, textAlign: "right" }}>{r.pct}%</span>
                </div>
                <div style={{ fontSize: 14, color: C.neutral800 }}>{r.window}</div>
                <EllipsisVertical size={16} color={C.neutral400} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

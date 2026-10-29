import React from "react";
import { Check } from "lucide-react";
import { C, FONT, SHADOW } from "../theme";
import { caretOn } from "../lib/anim";
import { useCurrentFrame } from "remotion";

// Inline-style ports of the app's wizard building blocks
// (src/components/elections/wizard/wizard-shared.tsx). Tailwind units → px.

export const initials = (name: string) =>
  name
    .split(" ")
    .map((p) => p[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();

export function Avatar({
  name,
  size,
  bg = C.brand500,
  color = C.white,
  fontSize = 15,
}: {
  name: string;
  size: number;
  bg?: string;
  color?: string;
  fontSize?: number;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: bg,
        color,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: FONT.heading,
        fontWeight: 600,
        fontSize,
        flexShrink: 0,
      }}
    >
      {initials(name)}
    </span>
  );
}

export function ProBadge() {
  return (
    <span
      style={{
        display: "inline-flex",
        height: 18,
        alignItems: "center",
        borderRadius: 9999,
        padding: "0 7px",
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.025em",
        background: C.proBg,
        color: C.proFg,
        flexShrink: 0,
      }}
    >
      PRO
    </span>
  );
}

export function Caret({ show = true }: { show?: boolean }) {
  const f = useCurrentFrame();
  return (
    <span
      style={{
        display: "inline-block",
        width: 1.5,
        height: "1.15em",
        marginLeft: 1,
        verticalAlign: "text-bottom",
        background: C.neutral950,
        opacity: show && caretOn(f) ? 1 : 0,
      }}
    />
  );
}

export function Input({
  value,
  placeholder,
  focused = false,
  height = 44,
  fontSize = 15,
  mono = false,
  align = "left",
  anchor,
  style,
}: {
  value: string;
  placeholder?: string;
  focused?: boolean;
  height?: number;
  fontSize?: number;
  mono?: boolean;
  align?: "left" | "right";
  anchor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      data-anchor={anchor}
      style={{
        width: "100%",
        height,
        borderRadius: 8,
        border: `1px solid ${focused ? C.brand700 : C.border}`,
        boxShadow: focused ? SHADOW.focus : "none",
        background: C.white,
        padding: "0 14px",
        fontSize,
        color: C.neutral950,
        display: "flex",
        alignItems: "center",
        justifyContent: align === "right" ? "flex-end" : "flex-start",
        whiteSpace: "nowrap",
        overflow: "hidden",
        fontFamily: mono ? FONT.mono : FONT.body,
        ...style,
      }}
    >
      {value ? (
        <span>{value}</span>
      ) : (
        !focused && <span style={{ color: C.neutral400 }}>{placeholder}</span>
      )}
      {focused && <Caret />}
      {focused && !value && placeholder && (
        <span style={{ color: C.neutral400 }}>{placeholder}</span>
      )}
    </div>
  );
}

export function Textarea({
  value,
  placeholder,
  focused = false,
  anchor,
}: {
  value: string;
  placeholder?: string;
  focused?: boolean;
  anchor?: string;
}) {
  return (
    <div
      data-anchor={anchor}
      style={{
        width: "100%",
        minHeight: 96,
        borderRadius: 8,
        border: `1px solid ${focused ? C.brand700 : C.border}`,
        boxShadow: focused ? SHADOW.focus : "none",
        background: C.white,
        padding: "12px 14px",
        fontSize: 15,
        lineHeight: 1.5,
        color: C.neutral950,
      }}
    >
      {value ? <span>{value}</span> : null}
      {focused && <Caret />}
      {!value && <span style={{ color: C.neutral400 }}>{placeholder}</span>}
    </div>
  );
}

export function FieldLabel({
  children,
  size = "sm",
}: {
  children: React.ReactNode;
  size?: "sm" | "xs";
}) {
  return (
    <span
      style={
        size === "sm"
          ? {
              display: "block",
              marginBottom: 7,
              fontSize: 14,
              fontWeight: 600,
              color: C.neutral800,
            }
          : {
              display: "block",
              marginBottom: 6,
              fontSize: 13,
              fontWeight: 600,
              color: C.muted,
            }
      }
    >
      {children}
    </span>
  );
}

export const Optional = () => (
  <span style={{ fontWeight: 400, color: C.neutral400 }}> · neobavezno</span>
);

export function StepCard({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        borderRadius: 12,
        border: `1px solid ${C.border}`,
        background: C.white,
        padding: 28,
        boxShadow: SHADOW.sm,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function StepHeading({ title, sub }: { title: string; sub: string }) {
  return (
    <>
      <h1
        style={{
          margin: 0,
          fontFamily: FONT.heading,
          fontSize: 24,
          lineHeight: "32px",
          fontWeight: 600,
          color: C.neutral800,
        }}
      >
        {title}
      </h1>
      <p
        style={{
          margin: "8px 0 28px",
          fontSize: 15,
          lineHeight: 1.5,
          color: C.muted,
        }}
      >
        {sub}
      </p>
    </>
  );
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        marginTop: 22,
        marginBottom: 10,
        fontSize: 14,
        fontWeight: 600,
        color: C.neutral800,
      }}
    >
      {children}
    </div>
  );
}

export function CheckDot({ size = 20 }: { size?: number }) {
  return (
    <span
      style={{
        width: size,
        height: size,
        borderRadius: 9999,
        background: C.brand700,
        color: C.white,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
      }}
    >
      <Check size={size * 0.6} strokeWidth={3} />
    </span>
  );
}

export function SelectCard({
  title,
  desc,
  selected,
  hover = false,
  disabled = false,
  badge,
  anchor,
}: {
  title: string;
  desc: string;
  selected: boolean;
  hover?: boolean;
  disabled?: boolean;
  badge?: React.ReactNode;
  anchor?: string;
}) {
  const border = disabled
    ? "rgba(229,231,235,0.7)"
    : selected
      ? C.brand700
      : hover
        ? C.brand500
        : C.border;
  return (
    <div
      data-anchor={anchor}
      style={{
        borderRadius: 12,
        border: `1.5px solid ${border}`,
        padding: 16,
        background: disabled ? C.neutral50 : selected ? C.brand50 : C.white,
        opacity: disabled ? 0.75 : 1,
      }}
    >
      <div
        style={{
          display: "flex",
          minHeight: 22,
          alignItems: "center",
          justifyContent: "space-between",
          gap: 8,
        }}
      >
        <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
          <span
            style={{
              fontFamily: FONT.heading,
              fontSize: 15,
              fontWeight: 600,
              color: disabled ? C.neutral400 : selected ? C.brand700 : C.neutral800,
            }}
          >
            {title}
          </span>
          {badge}
        </span>
        {selected && <CheckDot />}
      </div>
      <div
        style={{
          marginTop: 6,
          fontSize: 13,
          lineHeight: 1.375,
          color: disabled ? "rgba(156,163,175,0.7)" : C.muted,
        }}
      >
        {desc}
      </div>
    </div>
  );
}

// iOS-style switch; `p` is the on-ness 0..1 so the thumb can animate.
export function Toggle({ p, anchor }: { p: number; anchor?: string }) {
  const bg = p > 0.5 ? C.brand700 : C.neutral200;
  return (
    <span
      data-anchor={anchor}
      style={{
        display: "block",
        height: 28,
        width: 46,
        flexShrink: 0,
        borderRadius: 9999,
        padding: 3,
        background: bg,
      }}
    >
      <span
        style={{
          display: "block",
          width: 22,
          height: 22,
          borderRadius: 9999,
          background: C.white,
          boxShadow: SHADOW.sm,
          transform: `translateX(${18 * p}px)`,
        }}
      />
    </span>
  );
}

export function ModeTabs({
  mode,
  manual,
  csv,
  anchorPrefix,
}: {
  mode: "manual" | "csv";
  manual: string;
  csv: string;
  anchorPrefix: string;
}) {
  const tab = (on: boolean): React.CSSProperties => ({
    height: 34,
    borderRadius: 7,
    padding: "0 16px",
    fontSize: 14,
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    background: on ? C.white : "transparent",
    color: on ? C.brand700 : C.muted,
    boxShadow: on ? SHADOW.xs : "none",
  });
  return (
    <div
      style={{
        marginBottom: 22,
        display: "inline-flex",
        borderRadius: 10,
        background: C.neutral100,
        padding: 4,
      }}
    >
      <span data-anchor={`${anchorPrefix}-manual`} style={tab(mode === "manual")}>
        {manual}
      </span>
      <span data-anchor={`${anchorPrefix}-csv`} style={tab(mode === "csv")}>
        {csv}
      </span>
    </div>
  );
}

export function PrimaryButton({
  children,
  height = 46,
  pressed = false,
  anchor,
  style,
}: {
  children: React.ReactNode;
  height?: number;
  pressed?: boolean;
  anchor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      data-anchor={anchor}
      style={{
        display: "inline-flex",
        height,
        alignItems: "center",
        gap: 8,
        borderRadius: 8,
        background: pressed ? C.brand600 : C.brand700,
        padding: "0 24px",
        fontSize: 15,
        fontWeight: 600,
        color: C.white,
        boxShadow: SHADOW.xs,
        whiteSpace: "nowrap",
        transform: pressed ? "scale(0.97)" : "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

export function OutlineButton({
  children,
  height = 46,
  color = C.neutral800,
  borderColor = C.border,
  disabled = false,
  pressed = false,
  anchor,
  style,
}: {
  children: React.ReactNode;
  height?: number;
  color?: string;
  borderColor?: string;
  disabled?: boolean;
  pressed?: boolean;
  anchor?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span
      data-anchor={anchor}
      style={{
        display: "inline-flex",
        height,
        alignItems: "center",
        gap: 8,
        borderRadius: 8,
        border: `1px solid ${borderColor}`,
        background: pressed ? C.brand50 : C.white,
        padding: "0 20px",
        fontSize: 15,
        fontWeight: 600,
        color: disabled ? C.neutral300 : color,
        whiteSpace: "nowrap",
        transform: pressed ? "scale(0.97)" : "none",
        ...style,
      }}
    >
      {children}
    </span>
  );
}

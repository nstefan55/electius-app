// Electius design tokens — copied from src/app/globals.css (@theme + :root)
// so the recreated screens use exactly the app's palette, radii and shadows.

export const C = {
  brand900: "#1e3a5f",
  brand700: "#1d4ed8",
  brand600: "#2563eb",
  brand500: "#3b82f6",
  brand100: "#dbeafe",
  brand50: "#eff6ff",

  neutral950: "#0a0a0a",
  neutral800: "#1f2937",
  neutral600: "#4b5563",
  neutral400: "#9ca3af",
  neutral300: "#d1d5db",
  neutral200: "#e5e7eb",
  neutral100: "#f3f4f6",
  neutral50: "#f9fafb",

  success700: "#15803d",
  success500: "#22c55e",
  success50: "#f0fdf4",
  error700: "#b91c1c",
  error500: "#ef4444",
  error50: "#fef2f2",
  warning700: "#b45309",
  warning500: "#f59e0b",
  warning50: "#fffbeb",

  statusActive: "#10b981",
  statusScheduled: "#f59e0b",
  statusClosed: "#ef4444",
  statusDraft: "#3b82f6",
  statusArchived: "#6b7280",

  border: "#e5e7eb",
  muted: "#4b5563",
  white: "#ffffff",

  proBg: "#F5F3FF",
  proFg: "#6D28D9",
};

export const FONT = {
  heading: "Poppins, sans-serif",
  body: "'Noto Sans', sans-serif",
  mono: "'Roboto Mono', monospace",
};

export const SHADOW = {
  xs: "0 1px 2px rgba(0, 0, 0, 0.05)",
  sm: "0 1px 3px rgba(0, 0, 0, 0.1), 0 1px 2px rgba(0, 0, 0, 0.06)",
  md: "0 4px 6px rgba(0, 0, 0, 0.07), 0 2px 4px rgba(0, 0, 0, 0.06)",
  lg: "0 10px 15px rgba(0, 0, 0, 0.1), 0 4px 6px rgba(0, 0, 0, 0.05)",
  focus: "0 0 0 3px rgba(29, 78, 216, 0.3)",
};

// Video + virtual screen geometry. Everything inside the camera layer is laid
// out in "screen" pixels (1920×1080); the browser viewport is 1800×960.
export const VIDEO = { width: 1920, height: 1080, fps: 30 };
export const BROWSER = { x: 60, y: 36, w: 1800, chrome: 46 };
export const VIEWPORT = { w: 1800, h: 960 };

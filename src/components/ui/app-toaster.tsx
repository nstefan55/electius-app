"use client";

import { Toaster } from "react-hot-toast";

// Shared toast host — one visual config for both the (app) shell and the
// (auth) funnel (top-center per the dashboard-phase-4 decision).
export function AppToaster() {
  return (
    <Toaster
      position="top-center"
      toastOptions={{
        className:
          "!rounded-md !border !border-border !bg-card !text-sm !text-neutral-800 !shadow-md",
      }}
    />
  );
}

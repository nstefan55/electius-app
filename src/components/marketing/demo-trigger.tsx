"use client";

import type { ReactNode } from "react";
import { BALLOT_DEMO_ID } from "./ballot-demo";

// Otvara jedini <BallotDemo /> u korijenu stranice. Tri okidača (hero, završni CTA,
// podnožje) dijele jedan modal preko id-a — bez konteksta i bez podignutog stanja.
export function DemoTrigger({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <button
      type="button"
      className={className}
      onClick={() => {
        const el = document.getElementById(BALLOT_DEMO_ID);
        if (el instanceof HTMLDialogElement) el.showModal();
      }}
    >
      {children}
    </button>
  );
}

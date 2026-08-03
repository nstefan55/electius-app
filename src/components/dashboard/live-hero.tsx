"use client";

import { useEffect, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import {
  formatCount,
  formatVotingDate,
  sortRecent,
  type DashboardElection,
} from "@/lib/elections-view";
import { fetchTurnout } from "@/actions/dashboard";
import { cn } from "@/lib/utils";

// Featured live-voting hero: the active election with the most ballots cast.
// Renders nothing when no election is active. Turnout refreshes by polling —
// ponytail: no websockets, Vercel serverless has no persistent connections.
// LIVE-results elections poll faster; others just keep the panel reasonably fresh.
export function LiveHero({ elections }: { elections: DashboardElection[] }) {
  const t = useTranslations("dashboard.page");
  const locale = useLocale();

  const hero =
    sortRecent(elections)
      .filter((e) => e.status === "ACTIVE")
      .sort((a, b) => b.voted - a.voted)[0] ?? null;

  const heroId = hero?.id;
  const isLive = hero?.resultsMode === "LIVE";
  const [turnout, setTurnout] = useState(
    hero ? { voters: hero.voters, voted: hero.voted } : null,
  );

  useEffect(() => {
    if (!heroId) return;
    const ms = isLive ? 15_000 : 60_000;
    const timer = setInterval(async () => {
      // Mreža padne → samo preskoči ciklus. Bez hvatanja, svaki neuspjeli
      // poll baca neuhvaćeni rejection u konzolu, zauvijek.
      try {
        const next = await fetchTurnout(heroId);
        if (next) setTurnout(next);
      } catch {
        // sljedeći tick pokušava ponovno
      }
    }, ms);
    return () => clearInterval(timer);
  }, [heroId, isLive]);

  if (!hero) return null;

  const voters = turnout?.voters ?? hero.voters;
  const voted = turnout?.voted ?? hero.voted;
  const pct = voters > 0 ? Math.round((voted / voters) * 100) : 0;

  return (
    <div className="rounded-lg bg-brand-900 p-6 text-white shadow-md sm:p-8">
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
        <div className="min-w-0 sm:flex-1">
          {/* Samo LIVE izbori smiju tvrditi da su rezultati uživo — kod
              AFTER_CLOSE su zapečaćeni do zatvaranja. */}
          <div
            className={cn(
              "mb-3.5 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1",
              isLive ? "bg-success-500/15" : "bg-white/10",
            )}
          >
            <span
              className={cn(
                "size-1.75 rounded-full",
                isLive ? "animate-pulse bg-success-500" : "bg-white/50",
              )}
            />
            <span
              className={cn(
                "text-xs font-semibold tracking-wide",
                isLive ? "text-success-500" : "text-white/70",
              )}
            >
              {isLive ? t("live.badge") : t("live.badgeAuto")}
            </span>
          </div>
          <h2 className="font-heading text-2xl leading-snug font-semibold">
            {hero.name}
          </h2>
          <p className="mt-2 text-sm text-white/65">
            {t("live.meta", {
              type: hero.type,
              closes: formatVotingDate(hero.closes, locale),
            })}
          </p>
          <div className="mt-5 flex max-w-md items-center">
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/15">
              <div
                className="h-full rounded-full bg-success-500 transition-[width] duration-700 ease-out"
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
          <p className="mt-3 text-sm text-white/85">
            {t("live.progress", {
              voted: formatCount(voted, locale),
              total: formatCount(voters, locale),
            })}
          </p>
        </div>
        <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end sm:justify-start sm:gap-3.5">
          <div className="text-left sm:text-right">
            <div className="font-heading text-5xl leading-none font-bold sm:text-[3.5rem]">
              {pct}%
            </div>
            <div className="mt-1 text-[0.8125rem] text-white/60">
              {isLive ? t("live.turnoutLabel") : t("live.turnoutLabelAuto")}
            </div>
          </div>
          {/* Zapečaćeni rezultati nemaju što pokazati — vodi na pregled izbora. */}
          <Link
            href={
              isLive ? `/elections/${hero.id}/results` : `/elections/${hero.id}`
            }
            className="inline-flex h-12 items-center gap-1 rounded-md bg-white px-6 text-[0.9375rem] font-semibold text-brand-700 transition-colors hover:bg-brand-50"
          >
            {isLive ? t("live.viewResults") : t("live.viewElection")}
            <ChevronRight className="size-5 flex-none" />
          </Link>
        </div>
      </div>
    </div>
  );
}

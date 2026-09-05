import { getLocale, getTranslations } from "next-intl/server";
import {
  CalendarDays,
  CircleCheckBig,
  CircleX,
  Clock,
  Flag,
  ShieldCheck,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { BallotState } from "@/lib/services/vote.service";
import {
  BTN_PRIMARY_XL,
  BTN_SECONDARY_LG,
  formatVoterDateTime,
  HelpCard,
  StateHero,
  VoterAlert,
  VoterCard,
} from "./voter-ui";

// Server-rendered non-happy states (voter-flow spec §1, prototype sections
// 03 Link problems + 04 Election timing). Full designed screens — the generic
// link-expired NotFoundCard stays reserved for genuinely unmatched URLs.

type StateScreen = Exclude<
  BallotState,
  { state: "ballot" } | { state: "qrEntry" }
>;

export async function VoterStateScreen({ ballot }: { ballot: StateScreen }) {
  const t = await getTranslations("voter.flow");
  const locale = await getLocale();

  if (ballot.state === "invalid") {
    return (
      <VoterCard>
        <StateHero
          icon={CircleX}
          tone="error"
          title={t("invalid.title")}
          sub={t("invalid.sub")}
          topPad
        />
        <HelpCard title={t("help.title")} body={t("help.body")} />
      </VoterCard>
    );
  }

  const { election } = ballot;
  // Wizard placeholder (endsAt <= startsAt) = open-ended close date.
  const hasClose =
    new Date(election.endsAt).getTime() > new Date(election.startsAt).getTime();
  const closes = hasClose ? formatVoterDateTime(election.endsAt, locale) : null;

  if (ballot.state === "expired") {
    return (
      <VoterCard>
        <StateHero
          icon={Clock}
          tone="warning"
          title={t("expired.title")}
          sub={`${t("expired.sub")} ${closes ? t("expired.openUntil", { closes }) : t("expired.openStill")}`}
          topPad
        />
        <Link href={`/vote/${election.id}`} className={BTN_PRIMARY_XL}>
          {t("expired.cta")}
        </Link>
        <HelpCard title={t("help.title")} body={t("help.body")} />
      </VoterCard>
    );
  }

  if (ballot.state === "used") {
    return (
      <VoterCard>
        <StateHero
          icon={ShieldCheck}
          tone="brand"
          title={t("used.title")}
          sub={t("used.sub")}
          topPad
        />
        <VoterAlert
          variant="success"
          icon={CircleCheckBig}
          title={t("used.alertTitle")}
        >
          {t("used.alertBody")}
        </VoterAlert>
      </VoterCard>
    );
  }

  if (ballot.state === "notStarted") {
    return (
      <VoterCard>
        <StateHero
          icon={CalendarDays}
          tone="brand"
          title={t("notStarted.title")}
          sub={
            ballot.hasToken ? t("notStarted.sub") : t("notStarted.subGeneric")
          }
          topPad
        />
        <div className="flex flex-col gap-3 rounded-lg border border-neutral-200 bg-neutral-50 p-4 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-neutral-600">
              {t("notStarted.opensLabel")}
            </span>
            <span className="font-heading font-semibold text-brand-700">
              {formatVoterDateTime(election.startsAt, locale)}
            </span>
          </div>
          {closes ? (
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-neutral-600">
                {t("notStarted.closesLabel")}
              </span>
              <span className="font-semibold text-neutral-950">{closes}</span>
            </div>
          ) : null}
        </div>
        {ballot.hasToken ? (
          <p className="text-center text-xs text-neutral-600">
            {t("notStarted.keep")}
          </p>
        ) : null}
      </VoterCard>
    );
  }

  // closed — voted / not-voted / no-token (QR visitor) variants.
  const sub = closes ? t("closed.sub", { closes }) : t("closed.subNoDate");
  return (
    <VoterCard>
      <StateHero
        icon={Flag}
        tone="neutral"
        title={t("closed.title")}
        sub={ballot.voted === false ? `${sub} ${t("closed.notUsedNote")}` : sub}
        topPad
      />
      {ballot.voted ? (
        <VoterAlert
          variant="success"
          icon={CircleCheckBig}
          title={t("closed.votedNote")}
        />
      ) : null}
      {election.resultsVisible ? (
        <Link href={`/results/${election.id}`} className={BTN_SECONDARY_LG}>
          {t("closed.resultsCta")}
        </Link>
      ) : (
        <p className="text-center text-sm text-neutral-600">
          {t("closed.noResults")}
        </p>
      )}
      <p className="text-center text-xs text-neutral-600">{t("closed.anon")}</p>
    </VoterCard>
  );
}

import { getLocale, getTranslations } from "next-intl/server";
import type { PublicResultsElection } from "@/lib/db/elections";
import { turnoutPct } from "@/lib/elections-view";
import { rankCandidates } from "@/lib/results-view";
import { formatVoterDateTime } from "./voter-ui";

// Javni prikaz rezultata (public-results-page-spec §3, design Voter Flow.dc.html
// §07 frame 7.1). Poslužiteljska komponenta — ništa se ovdje ne miče, pa nema
// "use client".
//
// Stranica NIŠTA ne računa: izlaznost, poredak i udjeli dolaze iz zajedničkih
// funkcija (invarijanta #5). Peta površina koja bi sama izvela "tko je
// pobijedio" način je da jedni izbori dobiju dva odgovora.
//
// Nema zajedničke Badge/Card komponente za biračke rute (ui/ ih nema, a nijedan
// biraki zaslon ne uvozi ui/card) — oznake i kartice se slažu ovdje po
// vrijednostima iz design-system §7.8/§7.9. Uvoz administratorske komponente u
// (voter) rutu ne dolazi u obzir.
export async function PublicResults({
  election,
}: {
  election: PublicResultsElection;
}) {
  const t = await getTranslations("voter.results");
  const locale = await getLocale();

  const voters = election._count.voters;
  const votesCast = election._count.votes;

  // Redci ostaju u redoslijedu s listića (orderIndex). rankCandidates pronalazi
  // vodećeg, ne presložuje listić — `isWinner` je istinit za SVE izjednačene
  // vodeće, pa se izjednačenje prikazuje bez ijedne dodatne grane, a predložak
  // koji bi čitao ranked[0] izmislio bi pobjednika koji ne postoji.
  const ranked = rankCandidates(
    election.options.map((o) => ({
      id: o.id,
      text: o.text,
      description: null,
      votes: o._count.votes,
    })),
    votesCast,
  );
  const rank = new Map(ranked.map((r) => [r.id, r]));
  const byBallotOrder = election.options.flatMap((o) => {
    const r = rank.get(o.id);
    return r ? [r] : [];
  });

  // Čarobnjak upisuje endsAt === startsAt kad rok nije zadan — tada meta redak
  // ispušta datum, isto kao state-screens.tsx.
  const hasClose =
    new Date(election.endsAt).getTime() > new Date(election.startsAt).getTime();
  const org = election.organization.name;

  return (
    <div className="flex flex-col gap-4.5 py-8">
      {/* Zaglavlje */}
      <div className="flex flex-col items-start gap-2.5">
        <span className="inline-flex h-5 items-center rounded-full bg-neutral-100 px-2 text-xs font-medium text-neutral-600">
          {t("closedBadge")}
        </span>
        <h1 className="font-heading text-3xl leading-tight font-bold text-neutral-800">
          {election.title}
        </h1>
        <p className="text-sm text-neutral-600">
          {hasClose
            ? t("meta", {
                org,
                closes: formatVoterDateTime(election.endsAt, locale),
              })
            : t("metaNoDate", { org })}
        </p>
      </div>

      {/* Odaziv — brojnik su listići, nazivnik cijeli popis birača. Isti
          nazivnik koriste nadzorna ploča, pregled, CSV i PDF: dvije stranice
          koje isti izbor prikazuju s dva postotka su kvar koji ova jedna
          funkcija sprječava. */}
      <div className="flex items-center justify-between gap-3 rounded-lg border border-neutral-200 bg-white p-4 shadow-sm">
        <span className="text-sm text-neutral-600">{t("turnoutLabel")}</span>
        <span className="text-sm font-semibold text-neutral-950">
          {turnoutPct(votesCast, voters)}%
        </span>
      </div>

      {/* Kandidati */}
      <div className="flex flex-col gap-2.5">
        {byBallotOrder.map((c) => (
          <div
            key={c.id}
            className="rounded-lg border border-neutral-200 bg-white p-4 shadow-sm"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="truncate font-heading text-base font-semibold text-neutral-800">
                  {c.text}
                </span>
                {c.isWinner && (
                  <span className="inline-flex h-5 shrink-0 items-center rounded-full bg-success-50 px-2 text-xs font-medium text-success-700">
                    {t("winner")}
                  </span>
                )}
              </div>
              <span className="shrink-0 text-sm text-neutral-600">
                {c.votes} · {c.pct}%
              </span>
            </div>
            {/* Nazivnik su predani listići, pa kod višestrukog izbora zbroj svih
                udjela prelazi 100 % — i to je točno. Pojedinačna traka ipak
                nikad ne prelazi 100 %: jedan listić bira opciju najviše jednom
                (PK spoja je (voteId, optionId)), pa je c.votes <= votesCast. */}
            <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-neutral-100">
              <div
                className={`h-full rounded-full ${
                  c.isWinner ? "bg-brand-700" : "bg-neutral-400"
                }`}
                style={{ width: `${c.pct}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-center text-xs leading-relaxed text-neutral-600">
        {t("anon")}
      </p>
    </div>
  );
}

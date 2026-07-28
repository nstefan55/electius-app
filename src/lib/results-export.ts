import { csvDate, toCsv, type ExportLocale } from "@/lib/csv";
import { turnoutPct } from "@/lib/elections-view";
import {
  quorumOutcome,
  rankCandidates,
  sharePct,
  winnerOutcome,
  type OptionTally,
} from "@/lib/results-view";
import hr from "../../messages/hr.json";
import en from "../../messages/en.json";

// Redci CSV izvoza rezultata; zapisivač je u lib/csv.ts.
//
// Ovdje se NIŠTA ne računa: pobjednik, udjeli, izlaznost i kvorum dolaze iz
// results-view.ts i elections-view.ts, isti kao na zaslonu i u PDF izvještaju.
// Drugi izračun značio bi treći postotak za jedne izbore.

export interface ResultsExportData {
  orgName: string;
  title: string;
  electionType: string;
  votingType: string;
  opens: string; // ISO
  closes: string; // ISO
  voters: number;
  votesCast: number;
  quorumThreshold: number | null;
  options: OptionTally[]; // redoslijed s listića (orderIndex)
}

export interface ResultsExportLabels {
  field: string;
  value: string;
  org: string;
  election: string;
  type: string;
  opens: string;
  closes: string;
  winner: string;
  winnerTie: string;
  winnerNone: string;
  winnerTied: string;
  voters: string;
  votesCast: string;
  turnout: string;
  quorum: string;
  quorumMet: string;
  quorumNotMet: string;
  quorumRequired: string;
  quorumAchieved: string;
  candidate: string;
  role: string;
  votes: string;
  share: string;
  types: Record<string, string>;
  methods: Record<string, string>;
  fileSuffix: string;
}

// Brojevi bez razdjelnika tisućica: hrvatski format ubacuje razmak, a tablični
// kalkulator ga onda čita kao tekst, ne kao broj.
const pct = (n: number) => `${n}%`;

// Čisto: podaci unutra, datoteka van — sve ovisno o jeziku dolazi kao argument.
export function buildResultsCsv(
  data: ResultsExportData,
  labels: ResultsExportLabels,
  delimiter: string,
): string {
  const { voters, votesCast, options } = data;

  // rankCandidates SAMO za pobjednika — tablica ostaje u redoslijedu s listića.
  const outcome = winnerOutcome(rankCandidates(options, votesCast));
  const winnerRows: string[][] =
    outcome.kind === "single"
      ? [[labels.winner, outcome.candidates[0].text]]
      : outcome.kind === "tie"
        ? [
            [labels.winner, labels.winnerTie],
            ...outcome.candidates.map((c) => [labels.winnerTied, c.text]),
          ]
        : [[labels.winner, labels.winnerNone]];

  // Bez praga nema nijednog retka o kvorumu — isto kao kartica na zaslonu.
  const quorum =
    data.quorumThreshold === null
      ? null
      : quorumOutcome(voters, votesCast, data.quorumThreshold);
  const quorumRows: string[][] = quorum
    ? [
        [labels.quorum, quorum.met ? labels.quorumMet : labels.quorumNotMet],
        [
          labels.quorumRequired,
          `${pct(quorum.requiredPct)} (${quorum.requiredVoters})`,
        ],
        [
          labels.quorumAchieved,
          `${pct(quorum.achievedPct)} (${quorum.achievedVoters})`,
        ],
      ]
    : [];

  const rows: string[][] = [
    [labels.field, labels.value],
    [labels.org, data.orgName],
    [labels.election, data.title],
    [
      labels.type,
      `${labels.types[data.electionType] ?? data.electionType} · ${
        labels.methods[data.votingType] ?? data.votingType
      }`,
    ],
    [labels.opens, csvDate(new Date(data.opens))],
    [labels.closes, csvDate(new Date(data.closes))],
    ...winnerRows,
    [labels.voters, String(voters)],
    [labels.votesCast, String(votesCast)],
    [labels.turnout, pct(turnoutPct(votesCast, voters))],
    ...quorumRows,

    [], // prazan redak dijeli zaglavlje od tablice
    [labels.candidate, labels.role, labels.votes, labels.share],
    ...options.map((o) => [
      o.text,
      // description je nullable — prazna ćelija, nikad "null".
      o.description ?? "",
      String(o.votes),
      // Nazivnik su predani listići: kod višestrukog izbora zbroj prelazi 100 %.
      pct(sharePct(o.votes, votesCast)),
    ]),
  ];

  return toCsv(rows, delimiter);
}

const CATALOGS = { hr, en } as const;

// Route handleri su izvan next-intl konteksta, pa se katalozi čitaju izravno
// (isto kao voter-export.ts). Oznake koje zaslon već ima se PONOVNO KORISTE —
// isti broj mora nositi isto ime u datoteci i na ekranu.
export function resultsExportLabels(locale: ExportLocale): ResultsExportLabels {
  const c = CATALOGS[locale].dashboard.election.results;
  const step1 = CATALOGS[locale].dashboard.wizard.step1;
  const label = (v: { label: string }) => v.label;

  return {
    ...c.export,
    org: c.dOrg,
    type: c.dType,
    winner: c.winner,
    winnerTie: c.winnerTie,
    winnerNone: c.winnerNone,
    voters: c.statTotalVoters,
    votesCast: c.statVotesCast,
    turnout: c.statTurnout,
    quorum: c.statQuorum,
    quorumMet: c.quorumMet,
    quorumNotMet: c.quorumNotMet,
    types: Object.fromEntries(
      Object.entries(step1.types).map(([k, v]) => [k, label(v)]),
    ),
    methods: Object.fromEntries(
      Object.entries(step1.methods).map(([k, v]) => [k, label(v)]),
    ),
  };
}

import { turnoutPct } from "@/lib/elections-view";
import {
  quorumOutcome,
  rankCandidates,
  sharePct,
  winnerOutcome,
  type QuorumOutcome,
} from "@/lib/results-view";
import type { VoterExportRow } from "@/lib/voter-export";

// Prijenosivost podataka (GDPR čl. 20) — cijela organizacija u jednom JSON
// dokumentu. Čista funkcija: podaci unutra, dokument van, bez baze i zaglavlja.
//
// Ovdje se NIŠTA ne računa: izlaznost, pobjednik, udjeli i kvorum dolaze iz
// results-view.ts i elections-view.ts, isti kao na zaslonu, u CSV-u i u PDF
// izvještaju. Izvoz koji se ne slaže sa stranicom rezultata gori je od nikakvog.

// Verzija oblika, ne aplikacije: čitatelj mora moći prepoznati promjenu sheme.
export const EXPORT_VERSION = 1;

// Ključevi su stabilan engleski i kad je sučelje hrvatsko — strojno čitljiv
// izlaz čija shema ovisi o jeziku nije prenosiv.

export interface ExportOptionSource {
  id: string;
  text: string;
  description: string | null;
  orderIndex: number;
  votes: number;
}

export interface ExportVoteSource {
  voteHash: string;
  createdAt: Date;
  optionIds: string[];
}

export interface ExportArchiveSource {
  merkleRoot: string;
  proofData: unknown;
  electionData: unknown;
  expiresAt: Date | null;
  createdAt: Date;
}

export interface ExportElectionSource {
  id: string;
  title: string;
  description: string | null;
  electionType: string;
  votingType: string;
  status: string;
  startsAt: Date;
  endsAt: Date;
  resultsVisible: boolean;
  resultsMode: string;
  allowAbstain: boolean;
  quorumThreshold: number | null;
  autoCloseOnDeadline: boolean;
  voterReminder24h: boolean;
  adminTurnoutReminder: boolean;
  sealedResults: boolean;
  createdAt: Date;
  updatedAt: Date;
  options: ExportOptionSource[];
  // Isti tip koji nosi CSV izvoz popisa: pet sigurnih polja i ništa više, pa je
  // izvoz tokena greška prevođenja, a ne propust u pregledu koda.
  voters: VoterExportRow[];
  votes: ExportVoteSource[];
  archive: ExportArchiveSource | null;
}

export interface ExportSource {
  organization: {
    name: string;
    type: string | null;
    contactEmail: string;
    logoUrl: string | null;
    createdAt: Date;
  };
  // Samo administrator koji je zatražio izvoz — tuđi osobni podaci nisu njegovi
  // za preuzimanje.
  admin: {
    name: string;
    email: string;
    emailVerified: boolean;
    isPro: boolean;
    createdAt: Date;
  };
  elections: ExportElectionSource[];
}

export interface ExportVote {
  voteHash: string;
  // Dan, ne točan trenutak: točan zapis vremena po listiću je upravo veza koju
  // nasumičan batchOrder i leksikografski poredak listova brišu. Nijedan zaslon
  // ga ne prikazuje (graf zbraja po danima), pa ga ni izvoz ne otkriva.
  day: string; // YYYY-MM-DD (UTC)
  optionIds: string[];
}

export interface ExportResults {
  voters: number;
  votesCast: number;
  turnoutPct: number;
  winner: {
    kind: "none" | "single" | "tie";
    // Izjednačenje nosi SVE vodeće — pobjednik se nikad ne bira prešutno.
    candidateIds: string[];
  };
  // Bez praga nema objekta — isto kao kartica na zaslonu, koja tada ne postoji.
  quorum: QuorumOutcome | null;
  // Nazivnik su predani listići: kod višestrukog izbora zbroj prelazi 100 %.
  // Postotak stoji ovdje da čitatelj ne mora pogađati nazivnik; broj glasova je
  // u options[] — jedan broj, jedan dom.
  shares: { optionId: string; sharePct: number }[];
}

export interface ExportPayload {
  exportedAt: string;
  exportVersion: number;
  organization: {
    name: string;
    type: string | null;
    contactEmail: string;
    logoUrl: string | null;
    createdAt: string;
  };
  admin: {
    name: string;
    email: string;
    emailVerified: boolean;
    isPro: boolean;
    createdAt: string;
  };
  elections: ExportElection[];
}

export interface ExportElection {
  id: string;
  title: string;
  description: string | null;
  electionType: string;
  votingType: string;
  status: string;
  startsAt: string;
  endsAt: string;
  settings: {
    resultsVisible: boolean;
    resultsMode: string;
    allowAbstain: boolean;
    quorumThreshold: number | null;
    autoCloseOnDeadline: boolean;
    voterReminder24h: boolean;
    adminTurnoutReminder: boolean;
    sealedResults: boolean;
  };
  createdAt: string;
  updatedAt: string;
  options: {
    id: string;
    text: string;
    description: string | null;
    orderIndex: number;
    votes: number;
  }[];
  voters: {
    firstName: string | null;
    lastName: string | null;
    email: string;
    status: string;
    createdAt: string;
  }[];
  votes: ExportVote[];
  results: ExportResults;
  archive: {
    merkleRoot: string;
    proofData: unknown;
    electionData: unknown;
    expiresAt: string | null;
    createdAt: string;
  } | null;
}

const day = (d: Date) => d.toISOString().slice(0, 10);

export function buildOrganizationExport(
  source: ExportSource,
  exportedAt: Date,
): ExportPayload {
  return {
    exportedAt: exportedAt.toISOString(),
    exportVersion: EXPORT_VERSION,
    // Polje po polje, nikad spread: tipovi ne skidaju suvišna svojstva u
    // izvođenju, pa bi prošireni `select` tiho izvezao stupac koji nitko nije
    // odobrio (ista obrana kao projekcija sesije u (app)/layout.tsx).
    organization: {
      name: source.organization.name,
      type: source.organization.type,
      contactEmail: source.organization.contactEmail,
      logoUrl: source.organization.logoUrl,
      createdAt: source.organization.createdAt.toISOString(),
    },
    admin: {
      name: source.admin.name,
      email: source.admin.email,
      emailVerified: source.admin.emailVerified,
      isPro: source.admin.isPro,
      createdAt: source.admin.createdAt.toISOString(),
    },
    elections: source.elections.map(buildElection),
  };
}

function buildElection(e: ExportElectionSource): ExportElection {
  const voters = e.voters.length;
  const votesCast = e.votes.length;

  // rankCandidates SAMO za pobjednika — options[] ostaje u redoslijedu s listića.
  const ranked = rankCandidates(
    e.options.map((o) => ({
      id: o.id,
      text: o.text,
      description: o.description,
      votes: o.votes,
    })),
    votesCast,
  );
  const outcome = winnerOutcome(ranked);

  return {
    id: e.id,
    title: e.title,
    description: e.description,
    electionType: e.electionType,
    votingType: e.votingType,
    status: e.status,
    startsAt: e.startsAt.toISOString(),
    endsAt: e.endsAt.toISOString(),
    settings: {
      resultsVisible: e.resultsVisible,
      resultsMode: e.resultsMode,
      allowAbstain: e.allowAbstain,
      quorumThreshold: e.quorumThreshold,
      autoCloseOnDeadline: e.autoCloseOnDeadline,
      voterReminder24h: e.voterReminder24h,
      adminTurnoutReminder: e.adminTurnoutReminder,
      sealedResults: e.sealedResults,
    },
    createdAt: e.createdAt.toISOString(),
    updatedAt: e.updatedAt.toISOString(),
    options: e.options.map((o) => ({
      id: o.id,
      text: o.text,
      description: o.description,
      orderIndex: o.orderIndex,
      votes: o.votes,
    })),
    voters: e.voters.map((v) => ({
      firstName: v.firstName,
      lastName: v.lastName,
      email: v.email,
      status: v.status,
      createdAt: v.createdAt.toISOString(),
    })),
    votes: e.votes.map((v) => ({
      voteHash: v.voteHash,
      day: day(v.createdAt),
      // Sortirano: redoslijed unosa iz baze ne smije reći ništa o listiću.
      optionIds: [...v.optionIds].sort(),
    })),
    results: {
      voters,
      votesCast,
      turnoutPct: turnoutPct(votesCast, voters),
      winner: {
        kind: outcome.kind,
        candidateIds: outcome.candidates.map((c) => c.id),
      },
      quorum:
        e.quorumThreshold === null
          ? null
          : quorumOutcome(voters, votesCast, e.quorumThreshold),
      shares: e.options.map((o) => ({
        optionId: o.id,
        sharePct: sharePct(o.votes, votesCast),
      })),
    },
    archive: e.archive
      ? {
          merkleRoot: e.archive.merkleRoot,
          // Cijelo stablo ide van namjerno: bez njega pečat nije provjerljiv
          // izvan aplikacije, a to je jedina svrha arhive. Upozorenje o skupu
          // listova vrijedi za JAVNU stranicu provjere, ne za izvoz koji
          // administrator ionako dobiva s hashevima.
          proofData: e.archive.proofData,
          electionData: e.archive.electionData,
          expiresAt: e.archive.expiresAt?.toISOString() ?? null,
          createdAt: e.archive.createdAt.toISOString(),
        }
      : null,
  };
}

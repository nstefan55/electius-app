// Derivacije za zbroj glasova (election-results-id-phase-2). Čiste funkcije —
// istu logiku kasnije koriste CSV izvoz i PDF izvještaj, pa jedni izbori nikad
// ne mogu dobiti dva različita odgovora na "tko je pobijedio".
//
// Izlaznost i kvorum NAMJERNO ostaju u elections-view.ts: dijele ih i nadzorna
// ploča i pregled izbora, a jedna definicija postotka je cijela poanta.
import { quorumRequiredVoters, turnoutPct } from "@/lib/elections-view";

export interface OptionTally {
  id: string;
  text: string;
  description: string | null;
  votes: number;
}

export interface RankedCandidate extends OptionTally {
  pct: number;
  isWinner: boolean;
}

// Udio u predanim listićima. Kod višestrukog izbora zbroj svih udjela prelazi
// 100 % — jedan listić bira više opcija — i to je točno: svaki postotak znači
// "koliko je listića odabralo ovu opciju".
export const sharePct = (votes: number, votesCast: number) =>
  votesCast > 0 ? Math.round((votes / votesCast) * 100) : 0;

// Udio u UKUPNOM biračkom tijelu — isti izračun kao izlaznost, ali odgovara na
// drugo pitanje: "koliki dio svih birača je glasao za ovog kandidata".
// Pobjednička kartica prikazuje ovaj broj i na zaslonu i u PDF izvještaju, pa
// mora biti jedna funkcija: dva ista izraza na dva mjesta raziđu se prvom
// izmjenom. Ne miješati sa sharePct — nazivnik je drugi.
export const voterSharePct = turnoutPct;

// Poredak za grafiku: po broju glasova silazno. CSV ostaje u redoslijedu s
// listića (orderIndex) jer tablicu čitatelj ionako sortira sam.
//
// `isWinner` je istinit za SVE izjednačene vodeće — pobjednik se nikad ne bira
// prešutno. Bez ijednog glasa nema pobjednika (top === 0 → nitko nije označen).
export const rankCandidates = (
  options: OptionTally[],
  votesCast: number,
): RankedCandidate[] => {
  const top = options.reduce((max, o) => Math.max(max, o.votes), 0);
  return [...options]
    .sort((a, b) => b.votes - a.votes)
    .map((o) => ({
      ...o,
      pct: sharePct(o.votes, votesCast),
      isWinner: top > 0 && o.votes === top,
    }));
};

export interface WinnerOutcome {
  kind: "none" | "single" | "tie";
  candidates: RankedCandidate[];
}

// Izjednačenje se prikazuje kao izjednačenje, s poimeničnim popisom svih
// vodećih. Isto pravilo obvezuje CSV i PDF.
export const winnerOutcome = (ranked: RankedCandidate[]): WinnerOutcome => {
  const leaders = ranked.filter((c) => c.isWinner);
  if (leaders.length === 0) return { kind: "none", candidates: [] };
  return { kind: leaders.length > 1 ? "tie" : "single", candidates: leaders };
};

export interface QuorumOutcome {
  requiredPct: number;
  requiredVoters: number;
  achievedPct: number;
  achievedVoters: number;
  met: boolean;
}

// Kvorum je ispunjen kad je broj listića dosegnuo prag — jednako je dovoljno.
export const quorumOutcome = (
  voters: number,
  voted: number,
  thresholdPct: number,
): QuorumOutcome => {
  const requiredVoters = quorumRequiredVoters(voters, thresholdPct);
  return {
    requiredPct: thresholdPct,
    requiredVoters,
    achievedPct: turnoutPct(voted, voters),
    achievedVoters: voted,
    met: voted >= requiredVoters,
  };
};

export interface DayBucket {
  day: string; // YYYY-MM-DD (UTC)
  votes: number;
}

// Dnevni zbroj listića za stupčasti graf. Samo agregat — nikad pojedinačni
// zapis, vrijeme glasanja ni batchOrder.
//
// ponytail: prikazuje samo dane na kojima ima glasova (bez popune praznih) i
// zadržava zadnjih MAX_DAYS. Za dulje izbore s prazninama dodaj popunu raspona.
const MAX_DAYS = 14;

export const bucketVotesByDay = (timestamps: Date[]): DayBucket[] => {
  const counts = new Map<string, number>();
  for (const ts of timestamps) {
    const day = ts.toISOString().slice(0, 10);
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([day, votes]) => ({ day, votes }))
    .sort((a, b) => a.day.localeCompare(b.day))
    .slice(-MAX_DAYS);
};

// Inicijali za krug uz ime kandidata: prva slova prve dvije riječi.
export const candidateInitials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => [...w][0] ?? "")
    .join("")
    .toUpperCase();

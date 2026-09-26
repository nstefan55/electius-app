import type { MerkleProofStep } from "@/lib/services/merkle.service";

// Provjera koda u PREGLEDNIKU — javna stranica /verify/[id]. Namjerno druga
// izvedba istog algoritma (MERKLE_ALGORITHM, merkle.service.ts): tamo je Node
// `crypto` i server-only, ovdje Web Crypto koji radi u pregledniku. Dvije
// implementacije koje se slažu nad istim stablom su dokaz, ne dupliciranje —
// test ih vrti jednu protiv druge.
//
// Poslužitelj šalje samo put do korijena (log₂ n bratskih hasheva) i objavljeni
// korijen, nikad `leaves` ni `tree`. Put koji ne vodi do već objavljenog
// korijena poslužitelj ne može krivotvoriti, pa preglednik ne mora vjerovati
// Electiusu — samo korijenu iz službenog izvještaja organizacije.

// randomBytes(32) u hexu (vote.service.ts newVoteReceipt).
export const RECEIPT_PATTERN = /^[0-9a-f]{64}$/;

// Birači lijepe kôd iz .txt potvrde, s razmacima i prijelomima redaka.
export function normalizeReceipt(input: string): string {
  return input.replace(/\s+/g, "").toLowerCase();
}

export interface VerifyElection {
  title: string;
  organizationName: string;
}

// Odgovor POST /api/verify. Nepostojeći izbori i nepoznat kôd su ISTI odgovor —
// stanje izbora saznaje samo onaj tko ima pravi kôd.
export type VerifyResult =
  | { kind: "notFound" }
  | { kind: "recorded"; election: VerifyElection } // u bazi, još nije zapečaćeno
  | {
      kind: "sealed";
      election: VerifyElection;
      root: string;
      sealedAt: string; // ISO
      path: MerkleProofStep[];
    }
  // Zapečaćeno, ali puta nema: stari kodovi (D2) ili obrezano stablo.
  | { kind: "legacy" | "pruned"; election: VerifyElection };

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(input),
  );
  return Array.from(new Uint8Array(digest), (b) =>
    b.toString(16).padStart(2, "0"),
  ).join("");
}

// Fold puta od lista do korijena: `position` je strana BRATA (ne našeg čvora),
// pa određuje redoslijed konkatenacije — brat lijevo ⇒ SHA-256(brat + mi).
// Prazan put nije dokaz (vidi verifyMerkleProof).
export async function verifyProofInBrowser(
  leaf: string,
  path: MerkleProofStep[],
  root: string,
): Promise<boolean> {
  if (path.length === 0) return false;

  // for…of, ne reduce: async reducer bi kao `acc` dobio Promise.
  let acc = leaf;
  for (const { hash, position } of path) {
    acc = await sha256Hex(position === "left" ? hash + acc : acc + hash);
  }
  return acc === root;
}

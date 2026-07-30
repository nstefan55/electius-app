import "server-only";

import { createHash } from "crypto";

// Merkle stablo nad voteHashevima — stadij 3 lanca integriteta (stadij 1
// publikacija, stadij 2 glasanje). Sve je ovdje čisto i determinističko: isti
// skup hasheva uvijek daje isti korijen, bez obzira na redoslijed unosa.
//
// ALGORITAM JE UGOVOR. Zapisan je u proofData.algorithm da ga treća strana
// može reimplementirati bez ove baze, bez ovog koda i bez povjerenja u
// Electius. Ne mijenjaj pravila ispod bez nove verzije stringa.
//
//   1. Listovi = svi voteHashevi izbora (64-hex), sortirani leksikografski
//      rastuće. Sortiranje uništava svaki signal o vremenu glasanja (uz
//      batchOrder) i čini stablo izvedivim iz golog skupa hasheva.
//   2. Roditelj = SHA-256(lijeviHex + desniHex) — UTF-8 konkatenacija dva
//      64-hex stringa, izlaz hex.
//   3. Neparan broj čvorova: zadnji se duplira (bitcoin-style).
//   4. Razina po razina do jednog korijena.

export const MERKLE_ALGORITHM = "sha256-hex-concat/dup-last/lex-asc";
export const MERKLE_LEAF_ORDERING = "lexicographic-asc";

function sha256Hex(input: string): string {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

// Izbori bez glasova su legalni za pečaćenje — korijen je hash praznog stringa,
// pa je i praznina dokazivo zapečaćena.
export const EMPTY_MERKLE_ROOT = sha256Hex("");

export interface MerkleTree {
  root: string;
  leaves: string[]; // sortirani ulaz
  tree: string[][]; // sve razine, listovi prvi, korijen zadnji
}

export interface MerkleProofStep {
  hash: string; // bratski čvor
  position: "left" | "right"; // na kojoj strani stoji BRAT, ne naš čvor
}

export interface MerkleProof {
  leaf: string;
  path: MerkleProofStep[];
}

export function buildMerkleTree(voteHashes: string[]): MerkleTree {
  const leaves = [...voteHashes].sort();

  if (leaves.length === 0) {
    return { root: EMPTY_MERKLE_ROOT, leaves, tree: [[]] };
  }

  const tree: string[][] = [leaves];
  let level = leaves;

  // do-while, ne while: jedan list mora proći kroz isto pravilo i dati
  // SHA-256(list + list). Bez toga bi korijen bio sam voteHash — manje stablo,
  // ali dva pravila umjesto jednog, a svako nedokumentirano odstupanje je
  // mjesto gdje se dvije implementacije razilaze.
  do {
    const next: string[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i];
      const right = level[i + 1] ?? left; // neparan → zadnji se duplira
      next.push(sha256Hex(left + right));
    }
    tree.push(next);
    level = next;
  } while (level.length > 1);

  return { root: level[0], leaves, tree };
}

// Bratski lanac do korijena. Putevi se NE spremaju u proofData — izvedivi su iz
// stabla, a spremanje bi bilo O(n log n) hasheva za podatke koje verifikator
// ionako ponovno izračuna.
export function merkleProof(tree: string[][], leaf: string): MerkleProof {
  const path: MerkleProofStep[] = [];
  let index = tree[0]?.indexOf(leaf) ?? -1;
  if (index === -1) return { leaf, path };

  // Zadnja razina je korijen i nema brata, pa staje na tree.length - 1.
  for (let level = 0; level < tree.length - 1; level++) {
    const nodes = tree[level];
    const isRight = index % 2 === 1;
    const sibling = isRight ? nodes[index - 1] : (nodes[index + 1] ?? nodes[index]);
    path.push({ hash: sibling, position: isRight ? "left" : "right" });
    index = Math.floor(index / 2);
  }

  return { leaf, path };
}

// Čisti fold — postoji da testovi (i buduća javna stranica za provjeru koda)
// vrte ISTI kod koji je puteve i generirao.
//
// `position` je strana BRATA, ne našeg čvora, pa određuje redoslijed
// konkatenacije: brat lijevo ⇒ brat ide prvi. Obrnut redoslijed i dalje prolazi
// na parnim stablima (na dupliranim razinama brat je jednak čvoru, pa je
// simetrično) — zato neparno stablo ima vlastiti test.
export function verifyMerkleProof(
  leaf: string,
  path: MerkleProofStep[],
  root: string,
): boolean {
  // Prazan put nije dokaz. Kod kojeg nema u stablu nikad nije bio zapečaćen, a
  // fold bi ga bez ovoga usporedio sa samim sobom i odgovorio slučajno točno.
  if (path.length === 0) return false;

  const computed = path.reduce(
    (acc, { hash, position }) =>
      position === "left" ? sha256Hex(hash + acc) : sha256Hex(acc + hash),
    leaf,
  );

  return computed === root;
}

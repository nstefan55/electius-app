import { createHash, randomBytes } from "crypto";
import { describe, expect, it } from "vitest";
import {
  buildMerkleTree,
  merkleProof,
  verifyMerkleProof,
} from "@/lib/services/merkle.service";
import {
  normalizeReceipt,
  RECEIPT_PATTERN,
  verifyProofInBrowser,
} from "./merkle-verify";

const receipts = (n: number) =>
  Array.from({ length: n }, () => randomBytes(32).toString("hex"));

describe("verifyProofInBrowser", () => {
  // Druga implementacija istog algoritma mora se slagati s prvom na svakom
  // listu — uključujući neparna stabla, gdje obrnut redoslijed konkatenacije
  // prolazi na parnim razinama i pada tek na dupliranoj.
  for (const n of [1, 2, 3, 4, 5, 7, 8, 9]) {
    it(`agrees with merkle.service for every leaf of a ${n}-leaf tree`, async () => {
      const { root, leaves, tree } = buildMerkleTree(receipts(n));
      for (const leaf of leaves) {
        const { path } = merkleProof(tree, leaf);
        expect(verifyMerkleProof(leaf, path, root)).toBe(true);
        expect(await verifyProofInBrowser(leaf, path, root)).toBe(true);
      }
    });
  }

  it("uses the sibling side for concatenation order (3-leaf tree)", async () => {
    const { root, leaves, tree } = buildMerkleTree(receipts(3));
    const { path } = merkleProof(tree, leaves[2]);
    const flipped = path.map((s) => ({
      ...s,
      position: s.position === "left" ? ("right" as const) : ("left" as const),
    }));
    expect(await verifyProofInBrowser(leaves[2], flipped, root)).toBe(false);
  });

  it("rejects a forged sibling, a wrong root and a foreign leaf", async () => {
    const { root, leaves, tree } = buildMerkleTree(receipts(6));
    const { path } = merkleProof(tree, leaves[1]);
    const forged = [{ ...path[0], hash: "0".repeat(64) }, ...path.slice(1)];
    expect(await verifyProofInBrowser(leaves[1], forged, root)).toBe(false);
    expect(await verifyProofInBrowser(leaves[1], path, "f".repeat(64))).toBe(false);
    expect(await verifyProofInBrowser(receipts(1)[0], path, root)).toBe(false);
  });

  // Kôd kojeg nema u stablu dobiva prazan put. Fold bez ove zaštite bi list
  // usporedio sam sa sobom — a jedno-listno stablo ionako ima korijen H(l+l).
  it("treats an empty path as not proven", async () => {
    const leaf = receipts(1)[0];
    expect(await verifyProofInBrowser(leaf, [], leaf)).toBe(false);
  });

  it("hashes the UTF-8 hex concatenation, as the algorithm string says", async () => {
    const [a, b] = receipts(2).sort();
    const root = createHash("sha256").update(a + b, "utf8").digest("hex");
    expect(
      await verifyProofInBrowser(a, [{ hash: b, position: "right" }], root),
    ).toBe(true);
  });
});

describe("normalizeReceipt", () => {
  it("strips whitespace and line breaks and lowercases a pasted code", () => {
    const code = receipts(1)[0];
    const pasted = ` ${code.slice(0, 32).toUpperCase()}\r\n${code.slice(32)} `;
    expect(normalizeReceipt(pasted)).toBe(code);
    expect(RECEIPT_PATTERN.test(normalizeReceipt(pasted))).toBe(true);
  });

  it("does not make a short or non-hex code valid", () => {
    expect(RECEIPT_PATTERN.test(normalizeReceipt("abc"))).toBe(false);
    expect(RECEIPT_PATTERN.test(normalizeReceipt("g".repeat(64)))).toBe(false);
  });
});

import { randomBytes } from "crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { buildMerkleTree, verifyMerkleProof } from "./merkle.service";

vi.mock("@/lib/prisma", () => ({
  prisma: { vote: { findFirst: vi.fn() } },
}));

const { prisma } = await import("@/lib/prisma");
const { verifyReceipt, RANDOM_RECEIPTS_SINCE } = await import(
  "./verification.service"
);
const findFirst = vi.mocked(prisma.vote.findFirst);

const receipts = (n: number) =>
  Array.from({ length: n }, () => randomBytes(32).toString("hex"));

const AFTER_CUTOFF = new Date(RANDOM_RECEIPTS_SINCE.getTime() + 86_400_000);

function row(overrides: { startsAt?: Date; archive?: unknown } = {}) {
  return {
    election: {
      title: "Izbori",
      startsAt: overrides.startsAt ?? AFTER_CUTOFF,
      organization: { name: "Org" },
      archive: overrides.archive ?? null,
    },
  } as never;
}

function archiveOf(leaves: string[], prunedAt: Date | null = null) {
  const { root, tree } = buildMerkleTree(leaves);
  return {
    merkleRoot: root,
    proofData: { root, tree, leaves: [...leaves].sort() },
    prunedAt,
    createdAt: new Date("2026-10-01T10:00:00Z"),
  };
}

beforeEach(() => findFirst.mockReset());

describe("verifyReceipt", () => {
  // Kôd mora pripadati OVIM izborima — to je cijelo pravilo protiv proročišta.
  it("scopes the lookup to the election AND the code", async () => {
    findFirst.mockResolvedValue(null);
    await verifyReceipt("el1", "a".repeat(64));
    expect(findFirst.mock.calls[0][0]!.where).toEqual({
      electionId: "el1",
      voteHash: "a".repeat(64),
    });
  });

  it("answers notFound, with nothing else, for an unknown code or election", async () => {
    findFirst.mockResolvedValue(null);
    expect(await verifyReceipt("x", "a".repeat(64))).toEqual({
      kind: "notFound",
    });
  });

  it("answers recorded, with no root and no path, before the seal", async () => {
    findFirst.mockResolvedValue(row());
    expect(await verifyReceipt("e", "a".repeat(64))).toEqual({
      kind: "recorded",
      election: { title: "Izbori", organizationName: "Org" },
    });
  });

  it("serves a path that proves the code against the stored root", async () => {
    const leaves = receipts(5);
    const code = leaves[3];
    const archive = archiveOf(leaves);
    findFirst.mockResolvedValue(row({ archive }));

    const res = await verifyReceipt("e", code);
    if (res.kind !== "sealed") throw new Error(`expected sealed, got ${res.kind}`);
    expect(res.root).toBe(archive.merkleRoot);
    expect(verifyMerkleProof(code, res.path, res.root)).toBe(true);
  });

  // Put nosi jednog brata na razini 0 — i NIŠTA više od lišća.
  it("never ships the leaf set: other leaves stay out of the response", async () => {
    const leaves = receipts(8).sort();
    findFirst.mockResolvedValue(row({ archive: archiveOf(leaves) }));

    const json = JSON.stringify(await verifyReceipt("e", leaves[0]));
    expect(json).not.toContain('"leaves"');
    expect(json).not.toContain('"tree"');
    expect(json).toContain(leaves[1]); // brat — neizbježan
    for (const other of leaves.slice(2)) expect(json).not.toContain(other);
  });

  it("returns an empty path when the code is in the DB but not in the tree", async () => {
    findFirst.mockResolvedValue(row({ archive: archiveOf(receipts(4)) }));
    const res = await verifyReceipt("e", receipts(1)[0]);
    expect(res).toMatchObject({ kind: "sealed", path: [] });
  });

  // D2: stari kodovi su razbijljivi, a brat bi otkrio tuđi listić.
  it("serves no path for an election that started before the random-receipt cutoff", async () => {
    const leaves = receipts(4);
    findFirst.mockResolvedValue(
      row({
        startsAt: new Date(RANDOM_RECEIPTS_SINCE.getTime() - 1),
        archive: archiveOf(leaves),
      }),
    );
    const res = await verifyReceipt("e", leaves[0]);
    expect(res.kind).toBe("legacy");
    expect(res).not.toHaveProperty("path");
  });

  it("answers pruned when the tree was pruned or is missing", async () => {
    const leaves = receipts(4);
    findFirst.mockResolvedValue(
      row({ archive: archiveOf(leaves, new Date()) }),
    );
    expect((await verifyReceipt("e", leaves[0])).kind).toBe("pruned");

    findFirst.mockResolvedValue(
      row({
        archive: { ...archiveOf(leaves), proofData: { pruned: true } },
      }),
    );
    expect((await verifyReceipt("e", leaves[0])).kind).toBe("pruned");
  });
});

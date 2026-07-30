import { describe, expect, it } from "vitest";
import {
  buildMerkleTree,
  EMPTY_MERKLE_ROOT,
  MERKLE_ALGORITHM,
  merkleProof,
  verifyMerkleProof,
} from "./merkle.service";

// Vektori su izračunati NEZAVISNOM implementacijom pravila iz specifikacije, ne
// ovim modulom — pa hvataju tihu promjenu algoritma, a ne samo regresiju.
// Algoritam je javni ugovor (proofData.algorithm): mijenja se samo s novom
// verzijom stringa.
const leaf = (c: string) => c.repeat(64);

const FOUR = [leaf("1"), leaf("2"), leaf("3"), leaf("4")];
const FOUR_ROOT =
  "ffedc040c97fee35e2ce8782d3073f82a390b62b3830c11701d7444dd842a631";

const THREE = [leaf("a"), leaf("b"), leaf("c")];
const THREE_ROOT =
  "f372961e0178fea099eb05057b8b6a363a21f7ee2456e6e17a8f92990d01d1f9";

describe("buildMerkleTree", () => {
  it("gradi poznati korijen za fiksni skup od 4 lista", () => {
    expect(buildMerkleTree(FOUR).root).toBe(FOUR_ROOT);
  });

  it("neparan broj čvorova duplira zadnji (3 lista)", () => {
    expect(buildMerkleTree(THREE).root).toBe(THREE_ROOT);
  });

  it("jedan list prolazi kroz isto pravilo — korijen NIJE sam list", () => {
    const { root, tree } = buildMerkleTree([leaf("1")]);
    expect(root).not.toBe(leaf("1"));
    // listovi + jedna razina hashiranja
    expect(tree).toHaveLength(2);
    expect(tree[1]).toEqual([root]);
  });

  it("prazan skup je legalan — korijen je hash praznog stringa", () => {
    const { root, leaves, tree } = buildMerkleTree([]);
    expect(root).toBe(EMPTY_MERKLE_ROOT);
    expect(root).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
    expect(leaves).toEqual([]);
    expect(tree).toEqual([[]]);
  });

  it("redoslijed unosa ne mijenja korijen (sortiranje ubija signal o vremenu)", () => {
    const shuffled = [leaf("3"), leaf("1"), leaf("4"), leaf("2")];
    expect(buildMerkleTree(shuffled).root).toBe(FOUR_ROOT);
  });

  it("listovi su leksikografski sortirani i ulaz se ne mutira", () => {
    const input = [leaf("3"), leaf("1"), leaf("2")];
    const copy = [...input];
    const { leaves } = buildMerkleTree(input);
    expect(leaves).toEqual([leaf("1"), leaf("2"), leaf("3")]);
    expect(input).toEqual(copy);
  });

  it("ugovor algoritma je zapisan", () => {
    expect(MERKLE_ALGORITHM).toBe("sha256-hex-concat/dup-last/lex-asc");
  });
});

describe("merkleProof + verifyMerkleProof", () => {
  it("svaki list se dokazuje protiv korijena (parni broj listova)", () => {
    const { root, tree, leaves } = buildMerkleTree(FOUR);
    for (const l of leaves) {
      const { path } = merkleProof(tree, l);
      expect(verifyMerkleProof(l, path, root)).toBe(true);
    }
  });

  // Neparno stablo je mjesto gdje pogrešan poredak konkatenacije puca: na
  // dupliranim razinama brat je jednak čvoru, pa simetrija skriva grešku.
  it("svaki list se dokazuje protiv korijena (neparan broj listova)", () => {
    const { root, tree, leaves } = buildMerkleTree(THREE);
    for (const l of leaves) {
      const { path } = merkleProof(tree, l);
      expect(verifyMerkleProof(l, path, root)).toBe(true);
    }
  });

  it("izmijenjen list ne prolazi", () => {
    const { root, tree } = buildMerkleTree(FOUR);
    const { path } = merkleProof(tree, leaf("2"));
    expect(verifyMerkleProof(leaf("9"), path, root)).toBe(false);
  });

  it("podmetnut bratski čvor ne prolazi", () => {
    const { root, tree } = buildMerkleTree(FOUR);
    const { path } = merkleProof(tree, leaf("2"));
    const forged = path.map((s, i) =>
      i === 0 ? { ...s, hash: leaf("f") } : s,
    );
    expect(verifyMerkleProof(leaf("2"), forged, root)).toBe(false);
  });

  it("zamijenjena strana brata ne prolazi", () => {
    const { root, tree } = buildMerkleTree(FOUR);
    const { path } = merkleProof(tree, leaf("2"));
    const flipped = path.map((s) => ({
      ...s,
      position: s.position === "left" ? ("right" as const) : ("left" as const),
    }));
    expect(verifyMerkleProof(leaf("2"), flipped, root)).toBe(false);
  });

  it("pogrešan korijen ne prolazi", () => {
    const { tree } = buildMerkleTree(FOUR);
    const { path } = merkleProof(tree, leaf("2"));
    expect(verifyMerkleProof(leaf("2"), path, THREE_ROOT)).toBe(false);
  });

  it("list koji nije u stablu daje prazan put i ne prolazi", () => {
    const { root, tree } = buildMerkleTree(FOUR);
    const { path } = merkleProof(tree, leaf("9"));
    expect(path).toEqual([]);
    expect(verifyMerkleProof(leaf("9"), path, root)).toBe(false);
  });

  it("dokaz nosi list koji je tražen", () => {
    const { tree } = buildMerkleTree(FOUR);
    expect(merkleProof(tree, leaf("3")).leaf).toBe(leaf("3"));
  });
});

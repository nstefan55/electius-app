import { describe, expect, it } from "vitest";
import {
  bucketVotesByDay,
  candidateInitials,
  quorumOutcome,
  rankCandidates,
  sharePct,
  winnerOutcome,
  type OptionTally,
} from "./results-view";

function option(overrides: Partial<OptionTally> & { id: string }): OptionTally {
  return {
    text: `Candidate ${overrides.id}`,
    description: null,
    votes: 0,
    ...overrides,
  };
}

describe("sharePct", () => {
  it("rounds to a whole percent", () => {
    expect(sharePct(142, 281)).toBe(51);
    expect(sharePct(1, 3)).toBe(33);
  });

  it("is 0 rather than NaN when nothing was cast", () => {
    expect(sharePct(0, 0)).toBe(0);
  });

  it("allows shares to exceed 100% in total on multi-choice", () => {
    // One ballot picking both options => each option is on 100% of ballots.
    expect(sharePct(1, 1) + sharePct(1, 1)).toBe(200);
  });
});

describe("rankCandidates", () => {
  it("orders by vote count descending", () => {
    const ranked = rankCandidates(
      [
        option({ id: "b", votes: 98 }),
        option({ id: "a", votes: 142 }),
        option({ id: "c", votes: 41 }),
      ],
      281,
    );

    expect(ranked.map((c) => c.id)).toEqual(["a", "b", "c"]);
    expect(ranked.map((c) => c.pct)).toEqual([51, 35, 15]);
  });

  it("marks a single leader as the winner", () => {
    const ranked = rankCandidates(
      [option({ id: "a", votes: 10 }), option({ id: "b", votes: 4 })],
      14,
    );

    expect(ranked.filter((c) => c.isWinner).map((c) => c.id)).toEqual(["a"]);
  });

  it("marks EVERY tied leader, never just the first", () => {
    const ranked = rankCandidates(
      [
        option({ id: "a", votes: 7 }),
        option({ id: "b", votes: 7 }),
        option({ id: "c", votes: 2 }),
      ],
      16,
    );

    expect(ranked.filter((c) => c.isWinner).map((c) => c.id)).toEqual([
      "a",
      "b",
    ]);
  });

  it("declares nobody the winner when no votes exist", () => {
    const ranked = rankCandidates(
      [option({ id: "a" }), option({ id: "b" })],
      0,
    );

    expect(ranked.every((c) => !c.isWinner)).toBe(true);
    expect(ranked.every((c) => c.pct === 0)).toBe(true);
  });

  it("does not mutate the input array", () => {
    const input = [option({ id: "a", votes: 1 }), option({ id: "b", votes: 9 })];
    rankCandidates(input, 10);
    expect(input.map((c) => c.id)).toEqual(["a", "b"]);
  });
});

describe("winnerOutcome", () => {
  const rank = (votes: number[]) =>
    rankCandidates(
      votes.map((v, i) => option({ id: String(i), votes: v })),
      votes.reduce((s, v) => s + v, 0),
    );

  it("reports a single winner", () => {
    const out = winnerOutcome(rank([10, 4]));
    expect(out.kind).toBe("single");
    expect(out.candidates).toHaveLength(1);
  });

  it("reports a tie with every tied candidate", () => {
    const out = winnerOutcome(rank([7, 7, 2]));
    expect(out.kind).toBe("tie");
    expect(out.candidates.map((c) => c.votes)).toEqual([7, 7]);
  });

  it("reports none when there are no votes at all", () => {
    const out = winnerOutcome(rank([0, 0]));
    expect(out.kind).toBe("none");
    expect(out.candidates).toEqual([]);
  });

  it("reports none when the election has no candidates", () => {
    expect(winnerOutcome([]).kind).toBe("none");
  });
});

describe("quorumOutcome", () => {
  it("is met exactly at the boundary", () => {
    // 50% of 412 => 206 required; 206 cast is enough.
    const out = quorumOutcome(412, 206, 50);
    expect(out.requiredVoters).toBe(206);
    expect(out.met).toBe(true);
  });

  it("is not met one ballot short", () => {
    expect(quorumOutcome(412, 205, 50).met).toBe(false);
  });

  it("ceils the requirement — a fraction of a voter is not enough", () => {
    // 50% of 101 => 50.5 => 51 required.
    const out = quorumOutcome(101, 50, 50);
    expect(out.requiredVoters).toBe(51);
    expect(out.met).toBe(false);
  });

  it("reports achieved turnout using the shared percentage rule", () => {
    const out = quorumOutcome(412, 281, 50);
    expect(out.achievedPct).toBe(68);
    expect(out.achievedVoters).toBe(281);
    expect(out.requiredPct).toBe(50);
  });
});

describe("bucketVotesByDay", () => {
  it("groups timestamps into UTC day buckets, ascending", () => {
    const buckets = bucketVotesByDay([
      new Date("2026-07-03T09:00:00.000Z"),
      new Date("2026-07-01T23:59:59.000Z"),
      new Date("2026-07-03T21:15:00.000Z"),
      new Date("2026-07-01T00:00:00.000Z"),
    ]);

    expect(buckets).toEqual([
      { day: "2026-07-01", votes: 2 },
      { day: "2026-07-03", votes: 2 },
    ]);
  });

  it("is empty when no votes exist", () => {
    expect(bucketVotesByDay([])).toEqual([]);
  });

  it("keeps only the most recent 14 days", () => {
    const stamps = Array.from(
      { length: 20 },
      (_, i) => new Date(`2026-07-${String(i + 1).padStart(2, "0")}T12:00:00.000Z`),
    );
    const buckets = bucketVotesByDay(stamps);

    expect(buckets).toHaveLength(14);
    expect(buckets[0].day).toBe("2026-07-07");
    expect(buckets.at(-1)?.day).toBe("2026-07-20");
  });
});

describe("candidateInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(candidateInitials("Ana Kovačević")).toBe("AK");
    expect(candidateInitials("Marko Ivan Horvat")).toBe("MI");
  });

  it("handles a single name and stray whitespace", () => {
    expect(candidateInitials("  Ivana  ")).toBe("I");
  });

  it("keeps Croatian diacritics upper-cased correctly", () => {
    expect(candidateInitials("Špiro Čavić")).toBe("ŠČ");
  });
});

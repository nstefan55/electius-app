import { describe, expect, it } from "vitest";
import {
  buildOrganizationExport,
  EXPORT_VERSION,
  type ExportElectionSource,
  type ExportSource,
} from "@/lib/organization-export";
import { turnoutPct } from "@/lib/elections-view";
import {
  quorumOutcome,
  rankCandidates,
  sharePct,
  winnerOutcome,
} from "@/lib/results-view";

const EXPORTED_AT = new Date("2026-08-03T10:00:00.000Z");

function election(
  overrides: Partial<ExportElectionSource> = {},
): ExportElectionSource {
  return {
    id: "e1",
    title: "Izbor predsjednika",
    description: null,
    electionType: "STANDARD",
    votingType: "SINGLE_CHOICE",
    status: "CLOSED",
    startsAt: new Date("2026-07-01T00:00:00.000Z"),
    endsAt: new Date("2026-07-05T23:59:00.000Z"),
    resultsVisible: true,
    resultsMode: "AFTER_CLOSE",
    allowAbstain: false,
    quorumThreshold: null,
    voterReminder24h: false,
    adminTurnoutReminder: false,
    sealedResults: false,
    createdAt: new Date("2026-06-20T08:00:00.000Z"),
    updatedAt: new Date("2026-07-06T08:00:00.000Z"),
    options: [
      { id: "o1", text: "Ana", description: "Tajnica", orderIndex: 0, votes: 2 },
      { id: "o2", text: "Ivan", description: null, orderIndex: 1, votes: 1 },
    ],
    voters: [
      {
        firstName: "Ana",
        lastName: "Horvat",
        email: "ana@vvg.hr",
        status: "VOTED",
        createdAt: new Date("2026-06-21T08:00:00.000Z"),
      },
      {
        firstName: null,
        lastName: null,
        email: "ivan@vvg.hr",
        status: "INVITED",
        createdAt: new Date("2026-06-21T08:00:00.000Z"),
      },
    ],
    votes: [
      {
        voteHash: "aaa",
        createdAt: new Date("2026-07-02T09:41:07.318Z"),
        optionIds: ["o1"],
      },
      {
        voteHash: "bbb",
        createdAt: new Date("2026-07-03T14:02:55.001Z"),
        optionIds: ["o1"],
      },
      {
        voteHash: "ccc",
        createdAt: new Date("2026-07-03T22:10:00.000Z"),
        optionIds: ["o2"],
      },
    ],
    archive: null,
    ...overrides,
  };
}

function source(elections: ExportElectionSource[] = [election()]): ExportSource {
  return {
    organization: {
      name: "Veleučilište u Zagrebu",
      type: "UNIVERSITY",
      contactEmail: "ured@vvg.hr",
      logoUrl: null,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
    admin: {
      name: "Nikola Štefančić",
      email: "admin@vvg.hr",
      emailVerified: true,
      isPro: false,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    },
    elections,
  };
}

describe("buildOrganizationExport — document shape", () => {
  it("stamps the export time and a schema version", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.exportedAt).toBe("2026-08-03T10:00:00.000Z");
    expect(out.exportVersion).toBe(EXPORT_VERSION);
  });

  it("carries the organization and the requesting admin", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.organization.contactEmail).toBe("ured@vvg.hr");
    expect(out.admin.email).toBe("admin@vvg.hr");
  });

  it("exports every voter with null names as null, never the string 'null'", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.elections[0].voters).toHaveLength(2);
    expect(out.elections[0].voters[1].firstName).toBeNull();
    expect(JSON.stringify(out)).not.toContain('"null"');
  });
});

describe("buildOrganizationExport — what must never leave", () => {
  // Projekcija je polje po polje, pa suvišan stupac iz proširenog `select`-a ne
  // može proći. Test to dokazuje podmetanjem vrijednosti koju tipovi ne vide:
  // sa spreadom bi test pao, i to je jedini način da pad bude vidljiv.
  it("drops fields the payload type does not declare", () => {
    const planted = source();
    Object.assign(planted.admin, {
      stripeCustomerId: "cus_SENTINEL",
      password: "scrypt:SENTINEL",
    });
    Object.assign(planted.organization, { id: "org_SENTINEL" });

    const serialized = JSON.stringify(
      buildOrganizationExport(planted, EXPORTED_AT),
    );
    expect(serialized).not.toContain("SENTINEL");
    expect(serialized).not.toContain("password");
    expect(serialized).not.toContain("stripe");
  });

  // Točan trenutak po listiću je veza koju nasumičan batchOrder i leksikografski
  // poredak listova brišu — izvoz ga ne smije vratiti.
  it("truncates ballot timestamps to the day", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.elections[0].votes.map((v) => v.day)).toEqual([
      "2026-07-02",
      "2026-07-03",
      "2026-07-03",
    ]);
    // Ni sat, ni minuta, ni milisekunda nigdje u zapisu listića.
    expect(JSON.stringify(out.elections[0].votes)).not.toContain("09:41");
    expect(JSON.stringify(out.elections[0].votes)).not.toContain("T");
  });

  it("keeps the ballot's option ids in a stable order, not insertion order", () => {
    const out = buildOrganizationExport(
      source([
        election({
          votingType: "MULTI_CHOICE",
          votes: [
            {
              voteHash: "aaa",
              createdAt: new Date("2026-07-02T09:00:00.000Z"),
              optionIds: ["o2", "o1"],
            },
          ],
        }),
      ]),
      EXPORTED_AT,
    );
    expect(out.elections[0].votes[0].optionIds).toEqual(["o1", "o2"]);
  });
});

describe("buildOrganizationExport — derived numbers match the shipped views", () => {
  it("turnout equals turnoutPct for the same input", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    const r = out.elections[0].results;
    expect(r.voters).toBe(2);
    expect(r.votesCast).toBe(3);
    expect(r.turnoutPct).toBe(turnoutPct(3, 2));
  });

  it("winner equals winnerOutcome for the same input", () => {
    const e = election();
    const expected = winnerOutcome(
      rankCandidates(
        e.options.map((o) => ({
          id: o.id,
          text: o.text,
          description: o.description,
          votes: o.votes,
        })),
        e.votes.length,
      ),
    );
    const out = buildOrganizationExport(source([e]), EXPORTED_AT);

    expect(out.elections[0].results.winner.kind).toBe(expected.kind);
    expect(out.elections[0].results.winner.candidateIds).toEqual(
      expected.candidates.map((c) => c.id),
    );
  });

  it("names every leader on a tie — never a silent winner", () => {
    const out = buildOrganizationExport(
      source([
        election({
          options: [
            { id: "o1", text: "Ana", description: null, orderIndex: 0, votes: 2 },
            { id: "o2", text: "Ivan", description: null, orderIndex: 1, votes: 2 },
          ],
        }),
      ]),
      EXPORTED_AT,
    );
    const winner = out.elections[0].results.winner;
    expect(winner.kind).toBe("tie");
    expect(winner.candidateIds).toEqual(["o1", "o2"]);
  });

  it("reports no winner when nobody voted", () => {
    const out = buildOrganizationExport(
      source([
        election({
          votes: [],
          options: [
            { id: "o1", text: "Ana", description: null, orderIndex: 0, votes: 0 },
            { id: "o2", text: "Ivan", description: null, orderIndex: 1, votes: 0 },
          ],
        }),
      ]),
      EXPORTED_AT,
    );
    expect(out.elections[0].results.winner).toEqual({
      kind: "none",
      candidateIds: [],
    });
    expect(out.elections[0].results.turnoutPct).toBe(0);
  });

  it("shares divide by ballots cast, so multi-choice exceeds 100%", () => {
    const out = buildOrganizationExport(
      source([
        election({
          votingType: "MULTI_CHOICE",
          options: [
            { id: "o1", text: "Ana", description: null, orderIndex: 0, votes: 3 },
            { id: "o2", text: "Ivan", description: null, orderIndex: 1, votes: 2 },
          ],
        }),
      ]),
      EXPORTED_AT,
    );
    const shares = out.elections[0].results.shares;
    expect(shares).toEqual([
      { optionId: "o1", sharePct: sharePct(3, 3) },
      { optionId: "o2", sharePct: sharePct(2, 3) },
    ]);
    expect(shares[0].sharePct + shares[1].sharePct).toBeGreaterThan(100);
  });

  it("shares stay in ballot order while the winner is ranked", () => {
    const out = buildOrganizationExport(
      source([
        election({
          options: [
            { id: "o1", text: "Ana", description: null, orderIndex: 0, votes: 1 },
            { id: "o2", text: "Ivan", description: null, orderIndex: 1, votes: 2 },
          ],
        }),
      ]),
      EXPORTED_AT,
    );
    expect(out.elections[0].options.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(out.elections[0].results.shares.map((s) => s.optionId)).toEqual([
      "o1",
      "o2",
    ]);
    expect(out.elections[0].results.winner.candidateIds).toEqual(["o2"]);
  });

  it("omits quorum entirely when no threshold is set", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.elections[0].results.quorum).toBeNull();
  });

  it("quorum equals quorumOutcome for the same input", () => {
    const out = buildOrganizationExport(
      source([election({ quorumThreshold: 50 })]),
      EXPORTED_AT,
    );
    expect(out.elections[0].results.quorum).toEqual(quorumOutcome(2, 3, 50));
  });
});

describe("buildOrganizationExport — archive", () => {
  it("carries the seal and the whole proof so it verifies offline", () => {
    const proofData = { algorithm: "sha256-hex-concat/dup-last/lex-asc" };
    const out = buildOrganizationExport(
      source([
        election({
          status: "ARCHIVED",
          archive: {
            merkleRoot: "e3b0c442",
            proofData,
            electionData: { title: "Izbor predsjednika" },
            expiresAt: new Date("2027-07-06T08:00:00.000Z"),
            createdAt: new Date("2026-07-06T08:00:00.000Z"),
          },
        }),
      ]),
      EXPORTED_AT,
    );
    expect(out.elections[0].archive).toEqual({
      merkleRoot: "e3b0c442",
      proofData,
      electionData: { title: "Izbor predsjednika" },
      expiresAt: "2027-07-06T08:00:00.000Z",
      createdAt: "2026-07-06T08:00:00.000Z",
    });
  });

  it("is null on an unsealed election, never an empty object", () => {
    const out = buildOrganizationExport(source(), EXPORTED_AT);
    expect(out.elections[0].archive).toBeNull();
  });

  it("keeps a Pro archive's open-ended retention as null", () => {
    const out = buildOrganizationExport(
      source([
        election({
          archive: {
            merkleRoot: "e3b0c442",
            proofData: {},
            electionData: {},
            expiresAt: null,
            createdAt: new Date("2026-07-06T08:00:00.000Z"),
          },
        }),
      ]),
      EXPORTED_AT,
    );
    expect(out.elections[0].archive?.expiresAt).toBeNull();
  });
});

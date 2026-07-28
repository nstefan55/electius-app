import { describe, expect, it } from "vitest";
import {
  formatVotingDate,
  formatVotingDateTime,
  quorumRequiredVoters,
  timeLeftParts,
  turnoutPct,
  matchesTurnout,
  matchesWindow,
  resultsAccess,
  resultsDetailAccess,
  resultsRows,
  sortRecent,
  voterCounts,
  windowYears,
  type DashboardElection,
} from "@/lib/elections-view";

function election(overrides: Partial<DashboardElection>): DashboardElection {
  return {
    id: "1",
    name: "Test",
    type: "STANDARD",
    status: "DRAFT",
    resultsMode: "AFTER_CLOSE",
    voters: 0,
    voted: 0,
    opens: "",
    closes: "",
    ...overrides,
  };
}

describe("sortRecent", () => {
  it("orders Active > Scheduled > Closed > Draft", () => {
    const input = [
      election({ id: "draft", status: "DRAFT" }),
      election({ id: "closed", status: "CLOSED" }),
      election({ id: "active", status: "ACTIVE" }),
      election({ id: "scheduled", status: "SCHEDULED" }),
    ];

    expect(sortRecent(input).map((e) => e.id)).toEqual([
      "active",
      "scheduled",
      "closed",
      "draft",
    ]);
  });

  it("excludes archived elections", () => {
    const input = [
      election({ id: "kept", status: "ACTIVE" }),
      election({ id: "dropped", status: "ARCHIVED" }),
    ];

    expect(sortRecent(input).map((e) => e.id)).toEqual(["kept"]);
  });
});

describe("matchesTurnout", () => {
  it("always matches on 'all'", () => {
    expect(matchesTurnout({ voters: 0, voted: 0 }, "all")).toBe(true);
  });

  it("'none' matches zero voters or zero votes", () => {
    expect(matchesTurnout({ voters: 0, voted: 0 }, "none")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 0 }, "none")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 1 }, "none")).toBe(false);
  });

  it("zero-voter rows only match 'none'", () => {
    expect(matchesTurnout({ voters: 0, voted: 0 }, "high")).toBe(false);
    expect(matchesTurnout({ voters: 0, voted: 0 }, "medium")).toBe(false);
    expect(matchesTurnout({ voters: 0, voted: 0 }, "low")).toBe(false);
  });

  it("buckets on rounded percentage boundaries", () => {
    expect(matchesTurnout({ voters: 100, voted: 75 }, "high")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 74 }, "high")).toBe(false);
    expect(matchesTurnout({ voters: 100, voted: 74 }, "medium")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 40 }, "medium")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 39 }, "medium")).toBe(false);
    expect(matchesTurnout({ voters: 100, voted: 39 }, "low")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 1 }, "low")).toBe(true);
    expect(matchesTurnout({ voters: 100, voted: 0 }, "low")).toBe(false);
  });
});

describe("matchesWindow", () => {
  const closes = "2026-06-24T00:00:00.000Z";

  it("always matches on 'all'", () => {
    expect(matchesWindow({ status: "DRAFT", closes: "" }, "all")).toBe(true);
  });

  it("'unscheduled' keys on DRAFT status, not on dates", () => {
    expect(matchesWindow({ status: "DRAFT", closes }, "unscheduled")).toBe(true);
    expect(matchesWindow({ status: "ACTIVE", closes }, "unscheduled")).toBe(false);
  });

  it("matches the close-date year for non-draft rows", () => {
    expect(matchesWindow({ status: "ACTIVE", closes }, "2026")).toBe(true);
    expect(matchesWindow({ status: "ACTIVE", closes }, "2025")).toBe(false);
    expect(matchesWindow({ status: "DRAFT", closes }, "2026")).toBe(false);
  });
});

describe("windowYears", () => {
  it("derives distinct non-draft close years, newest first", () => {
    const input = [
      election({ status: "CLOSED", closes: "2025-03-09T00:00:00.000Z" }),
      election({ status: "ACTIVE", closes: "2026-06-24T00:00:00.000Z" }),
      election({ status: "ACTIVE", closes: "2026-06-23T00:00:00.000Z" }),
      election({ status: "DRAFT", closes: "2024-01-01T00:00:00.000Z" }),
    ];

    expect(windowYears(input)).toEqual(["2026", "2025"]);
  });
});

describe("formatVotingDate", () => {
  const iso = "2026-06-18T00:00:00.000Z";

  it("keeps the existing en format (month-first, short month)", () => {
    expect(formatVotingDate(iso, "en")).toBe("Jun 18");
  });

  it("formats hr day-first with Croatian month abbreviation", () => {
    expect(formatVotingDate(iso, "hr")).toBe("18. lip");
  });

  it("is timezone-stable at day boundaries (UTC)", () => {
    // 23:30 UTC must not roll into the next day on a CET/CEST server.
    expect(formatVotingDate("2026-05-04T23:30:00.000Z", "en")).toBe("May 4");
    expect(formatVotingDate("2026-05-04T23:30:00.000Z", "hr")).toBe("4. svi");
  });
});

describe("formatVotingDateTime", () => {
  // NAPOMENA: hidracijsku razliku koja je iznudila `hour: "2-digit"` ovaj test
  // NE može uhvatiti — nastaje između Node-a (`9:41`) i preglednika (`09:41`),
  // a Vitest vidi samo Node. Ovdje se pinaju format i UTC; sama razlika
  // provjerena je usporedbom oba motora (docs).
  it("pads the hour so both engines print the same string", () => {
    expect(formatVotingDateTime("2026-07-28T09:41:00.000Z", "hr")).toBe(
      "28. srp 2026. · 09:41",
    );
  });

  it("pads midnight too — the case that surfaced the mismatch", () => {
    expect(formatVotingDateTime("2026-07-20T00:00:00.000Z", "hr")).toBe(
      "20. srp 2026. · 00:00",
    );
  });

  it("is timezone-stable (UTC), not the server's local zone", () => {
    expect(formatVotingDateTime("2026-05-04T23:30:00.000Z", "hr")).toBe(
      "4. svi 2026. · 23:30",
    );
  });
});
describe("turnoutPct", () => {
  it("rounds to a whole percent", () => {
    expect(turnoutPct(282, 412)).toBe(68);
    expect(turnoutPct(1, 3)).toBe(33);
  });

  it("is 0 for an empty voter list instead of NaN", () => {
    expect(turnoutPct(0, 0)).toBe(0);
  });
});

describe("quorumRequiredVoters", () => {
  it("ceils a fractional requirement — 49.2 voters is not enough", () => {
    expect(quorumRequiredVoters(412, 50)).toBe(206);
    expect(quorumRequiredVoters(41, 60)).toBe(25); // 24.6 → 25
  });

  it("needs nobody at 0% and everybody at 100%", () => {
    expect(quorumRequiredVoters(412, 0)).toBe(0);
    expect(quorumRequiredVoters(412, 100)).toBe(412);
  });
});

describe("timeLeftParts", () => {
  const now = Date.parse("2026-07-05T12:00:00.000Z");

  it("splits a multi-day span into days + leftover hours", () => {
    expect(timeLeftParts("2026-07-09T18:00:00.000Z", now)).toEqual({
      days: 4,
      hours: 6,
      minutes: 0,
    });
  });

  it("drops to hours + minutes inside a day", () => {
    expect(timeLeftParts("2026-07-05T15:45:00.000Z", now)).toEqual({
      days: 0,
      hours: 3,
      minutes: 45,
    });
  });

  it("clamps a past target to zero instead of counting up", () => {
    expect(timeLeftParts("2026-07-01T00:00:00.000Z", now)).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
    });
  });
});

describe("voterCounts", () => {
  it("derives invited from PENDING and pending from ballots cast", () => {
    // 100 birača, 10 nikad pozvano, 40 glasalo
    expect(voterCounts({ total: 100, notInvited: 10, voted: 40 })).toEqual({
      total: 100,
      invited: 90,
      voted: 40,
      pending: 60,
    });
  });

  it("reconciles a fully published election", () => {
    const c = voterCounts({ total: 50, notInvited: 0, voted: 20 });
    expect(c.invited).toBe(50);
    expect(c.voted + c.pending).toBe(c.total);
  });

  it("exposes the gap on a partially published election", () => {
    // Neuspjeli komad slanja: 30 još PENDING, pa je "nije glasalo" veće od
    // razlike pozvanih i glasalih — brojka koja se ne skriva.
    const c = voterCounts({ total: 100, notInvited: 30, voted: 10 });
    expect(c.invited).toBe(70);
    expect(c.pending).toBe(90);
    expect(c.pending).toBeGreaterThan(c.invited - c.voted);
  });

  it("never goes negative when counts disagree", () => {
    expect(voterCounts({ total: 5, notInvited: 9, voted: 9 })).toEqual({
      total: 5,
      invited: 0,
      voted: 9,
      pending: 0,
    });
  });

  it("is zero-safe on an empty roster", () => {
    expect(voterCounts({ total: 0, notInvited: 0, voted: 0 })).toEqual({
      total: 0,
      invited: 0,
      voted: 0,
      pending: 0,
    });
  });
});

describe("resultsAccess", () => {
  it("shows a running election live only when configured LIVE", () => {
    expect(resultsAccess(election({ status: "ACTIVE", resultsMode: "LIVE" }))).toBe("live");
  });

  it("seals a running AFTER_CLOSE election from the admin too", () => {
    expect(
      resultsAccess(election({ status: "ACTIVE", resultsMode: "AFTER_CLOSE" })),
    ).toBe("sealed");
  });

  it("unseals once closed, whatever the mode was", () => {
    expect(resultsAccess(election({ status: "CLOSED", resultsMode: "AFTER_CLOSE" }))).toBe("closed");
    expect(resultsAccess(election({ status: "CLOSED", resultsMode: "LIVE" }))).toBe("closed");
  });

  it("excludes statuses that do not belong on /results", () => {
    // DRAFT/SCHEDULED have no ballots; ARCHIVED belongs to /archive.
    for (const status of ["DRAFT", "SCHEDULED", "ARCHIVED"] as const) {
      expect(resultsAccess(election({ status }))).toBeNull();
    }
  });
});

describe("resultsDetailAccess", () => {
  it("renders archived elections, unlike the list", () => {
    // The only divergence from resultsAccess: /archive links here, so the page
    // must show the tally even though the row does not belong on /results.
    expect(resultsDetailAccess(election({ status: "ARCHIVED" }))).toBe("closed");
    expect(resultsAccess(election({ status: "ARCHIVED" }))).toBeNull();
  });

  it("agrees with the list rule on every other status", () => {
    const cases = [
      election({ status: "ACTIVE", resultsMode: "LIVE" }),
      election({ status: "ACTIVE", resultsMode: "AFTER_CLOSE" }),
      election({ status: "CLOSED" }),
      election({ status: "DRAFT" }),
      election({ status: "SCHEDULED" }),
    ];

    for (const e of cases) {
      expect(resultsDetailAccess(e)).toBe(resultsAccess(e));
    }
  });

  it("returns null for statuses the page 404s on", () => {
    expect(resultsDetailAccess(election({ status: "DRAFT" }))).toBeNull();
    expect(resultsDetailAccess(election({ status: "SCHEDULED" }))).toBeNull();
  });
});

describe("resultsRows", () => {
  it("keeps only elections with results and tags each with its access", () => {
    const rows = resultsRows([
      election({ id: "draft", status: "DRAFT" }),
      election({ id: "archived", status: "ARCHIVED" }),
      election({ id: "closed", status: "CLOSED" }),
      election({ id: "scheduled", status: "SCHEDULED" }),
      election({ id: "sealed", status: "ACTIVE", resultsMode: "AFTER_CLOSE" }),
      election({ id: "live", status: "ACTIVE", resultsMode: "LIVE" }),
    ]);

    expect(rows.map((r) => [r.id, r.access])).toEqual([
      ["live", "live"],
      ["sealed", "sealed"],
      ["closed", "closed"],
    ]);
  });

  it("preserves query order within one access group", () => {
    const rows = resultsRows([
      election({ id: "closed-a", status: "CLOSED" }),
      election({ id: "closed-b", status: "CLOSED" }),
    ]);

    expect(rows.map((r) => r.id)).toEqual(["closed-a", "closed-b"]);
  });

  it("is empty when nothing has results yet", () => {
    expect(resultsRows([election({ status: "DRAFT" })])).toEqual([]);
  });
});

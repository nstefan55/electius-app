import { describe, expect, it } from "vitest";
import {
  formatVotingDate,
  matchesTurnout,
  matchesWindow,
  sortRecent,
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

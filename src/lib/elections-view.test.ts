import { describe, expect, it } from "vitest";
import {
  formatVotingDate,
  sortRecent,
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

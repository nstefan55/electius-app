import { describe, expect, it } from "vitest";
import { sortRecent, type DashboardElection } from "@/lib/elections-view";

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

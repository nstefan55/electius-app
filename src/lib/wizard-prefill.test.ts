import { describe, expect, it } from "vitest";
import { prefillSchedule, toWizardData } from "@/lib/wizard-prefill";
import type { ElectionForEdit } from "@/lib/db/elections";

// Obrat createElection-a: ono što je čarobnjak zapisao mora se vratiti u isti
// oblik, inače "Spremi promjene" bez ijedne izmjene tiho mijenja izbore.

const row = (over: Partial<ElectionForEdit> = {}): ElectionForEdit => ({
  title: "Studentski zbor",
  description: null,
  electionType: "STANDARD",
  votingType: "SINGLE_CHOICE",
  status: "DRAFT",
  startsAt: new Date("2026-09-01T10:00:00Z"),
  endsAt: new Date("2026-09-01T10:00:00Z"),
  resultsMode: "AFTER_CLOSE",
  resultsVisible: false,
  allowAbstain: false,
  quorumThreshold: null,
  adminTurnoutReminder: false,
  voterReminder24h: false,
  options: [],
  voters: [],
  ...over,
});

describe("prefillSchedule", () => {
  it("SCHEDULED: zakazano, oba datuma kao zidni sat u Zagrebu", () => {
    expect(
      prefillSchedule(
        row({
          status: "SCHEDULED",
          startsAt: new Date("2026-10-01T06:00:00Z"),
          endsAt: new Date("2026-10-01T18:00:00Z"),
        }),
      ),
    ).toEqual({
      startMode: "scheduled",
      startAt: "2026-10-01T08:00",
      closeAt: "2026-10-01T20:00",
    });
  });

  it("DRAFT: ručno i bez početka, čak i kad je početak u budućnosti", () => {
    const s = prefillSchedule(
      row({
        startsAt: new Date("2999-01-01T10:00:00Z"),
        endsAt: new Date("2999-01-02T10:00:00Z"),
      }),
    );
    expect(s.startMode).toBe("manual");
    expect(s.startAt).toBe("");
    expect(s.closeAt).toBe("2999-01-02T11:00");
  });

  it("rezervirani datum (endsAt = startsAt) znači: kraj nije postavljen", () => {
    expect(prefillSchedule(row()).closeAt).toBe("");
  });

  it("prošli kraj se puni, ne briše — spremanje ga odbije i vrati na korak 4", () => {
    const s = prefillSchedule(
      row({
        startsAt: new Date("2026-01-01T10:00:00Z"),
        endsAt: new Date("2026-01-05T10:00:00Z"),
      }),
    );
    expect(s.closeAt).toBe("2026-01-05T11:00");
  });
});

describe("toWizardData", () => {
  it("kandidati: opis → uloga, null → bez uloge, redoslijed zadržan", () => {
    const d = toWizardData(
      row({
        options: [
          { text: "Ana", description: null },
          { text: "Marko", description: "2. godina" },
        ],
      }),
    );
    expect(d.candidates).toEqual([
      { name: "Ana", role: undefined },
      { name: "Marko", role: "2. godina" },
    ]);
  });

  it("birači: ime i prezime spojeni; bezimeni dobiva adresu kao ime", () => {
    const d = toWizardData(
      row({
        voters: [
          { email: "a@unizg.hr", firstName: "Petra", lastName: "Novak" },
          { email: "b@unizg.hr", firstName: "Luka", lastName: null },
          { email: "c@unizg.hr", firstName: null, lastName: null },
        ],
      }),
    );
    expect(d.voters).toEqual([
      { name: "Petra Novak", email: "a@unizg.hr" },
      { name: "Luka", email: "b@unizg.hr" },
      { name: "c@unizg.hr", email: "c@unizg.hr" },
    ]);
  });

  it("postavke: LIVE, kvorum i prekidači vraćaju se kakvi su zapisani", () => {
    const d = toWizardData(
      row({
        description: "Opis",
        resultsMode: "LIVE",
        resultsVisible: true,
        quorumThreshold: 60,
        voterReminder24h: true,
      }),
    );
    expect(d).toMatchObject({
      description: "Opis",
      liveResults: true,
      publicResults: true,
      quorum: true,
      quorumPct: 60,
      voterReminder24h: true,
      adminTurnoutReminder: false,
    });
  });

  it("bez kvoruma: isključen, postotak na zadanih 50", () => {
    const d = toWizardData(row());
    expect(d).toMatchObject({ quorum: false, quorumPct: 50, description: "" });
  });
});

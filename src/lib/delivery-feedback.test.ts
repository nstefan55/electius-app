import { describe, expect, it } from "vitest";
import type { WebhookEventPayload } from "resend";
import {
  DELIVERY_FAILURE_EVENTS,
  isDeliveryFailure,
  parseEventTime,
  readDeliveryFailure,
  stampsVoters,
  type DeliveryFailureEvent,
} from "@/lib/delivery-feedback";

// Payload oblika kakav Resend stvarno šalje (provjereno u typings-ima
// resend@6.17.2: BaseEmailEventData nosi to[] i tags kao Record<string,string>).
function bounced(
  overrides: Partial<DeliveryFailureEvent["data"]> = {},
  type: DeliveryFailureEvent["type"] = "email.bounced",
): DeliveryFailureEvent {
  return {
    type,
    created_at: "2026-08-09T10:00:00.000Z",
    data: {
      created_at: "2026-08-09T09:59:00.000Z",
      email_id: "email_abc",
      from: "Electius <system@electius.com>",
      to: ["voter@example.com"],
      subject: "Glasajte",
      tags: { type: "invite", electionId: "el_1" },
      bounce: { message: "mailbox does not exist", subType: "General", type: "Permanent" },
      ...overrides,
    },
  } as DeliveryFailureEvent;
}

describe("isDeliveryFailure", () => {
  it("accepts exactly the four events the webhook subscribes to", () => {
    expect(DELIVERY_FAILURE_EVENTS).toEqual([
      "email.bounced",
      "email.complained",
      "email.failed",
      "email.suppressed",
    ]);

    for (const type of DELIVERY_FAILURE_EVENTS) {
      expect(isDeliveryFailure(bounced({}, type))).toBe(true);
    }
  });

  it("ignores delivery-progress and tracking events", () => {
    // email.opened / email.clicked posebno: praćenje je isključeno na domeni
    // jer poveznica u pozivnici JEST sirovi token (§3.1). Ako se ikad pretplate,
    // ovaj test pada prije nego što ih ruta počne obrađivati.
    for (const type of [
      "email.sent",
      "email.delivered",
      "email.delivery_delayed",
      "email.opened",
      "email.clicked",
      "contact.created",
      "domain.updated",
    ]) {
      expect(
        isDeliveryFailure({ type } as unknown as WebhookEventPayload),
      ).toBe(false);
    }
  });
});

describe("readDeliveryFailure", () => {
  it("projects the fields the route logs and writes", () => {
    expect(readDeliveryFailure(bounced())).toEqual({
      event: "email.bounced",
      emailId: "email_abc",
      type: "invite",
      electionId: "el_1",
      recipients: ["voter@example.com"],
      failedAt: new Date("2026-08-09T10:00:00.000Z"),
    });
  });

  it("takes the event's time, not the email's creation time", () => {
    // Webhook kasni i ponavlja se — zabilježiti trenutak obrade značilo bi
    // zapisati kad smo pročitali, a ne kad je dostava pala.
    const failure = readDeliveryFailure(bounced());
    expect(failure.failedAt.toISOString()).toBe("2026-08-09T10:00:00.000Z");
  });

  it("survives an event with no tags", () => {
    const failure = readDeliveryFailure(bounced({ tags: undefined }));
    expect(failure.electionId).toBeUndefined();
    expect(failure.type).toBeUndefined();
    expect(failure.recipients).toEqual(["voter@example.com"]);
  });
});

describe("parseEventTime", () => {
  it("parses a valid ISO timestamp", () => {
    expect(parseEventTime("2026-08-09T10:00:00.000Z").toISOString()).toBe(
      "2026-08-09T10:00:00.000Z",
    );
  });

  it("falls back to now on an unparsable timestamp instead of writing an Invalid Date", () => {
    // Prisma bi Invalid Date odbio i srušio obradu — činjenica o odbijanju
    // vrijedi i bez točnog vremena.
    const at = parseEventTime("not-a-date");
    expect(Number.isNaN(at.getTime())).toBe(false);
  });
});

describe("stampsVoters", () => {
  it("stamps a voter-facing failure that carries an election", () => {
    expect(stampsVoters(readDeliveryFailure(bounced()))).toBe(true);
  });

  it("refuses an admin email, which has no voter row to stamp", () => {
    // otp / reset / delete-account idu administratorima i ne nose electionId.
    // Bez ovog uvjeta upit bi krenuo bez izbora u WHERE klauzuli.
    const failure = readDeliveryFailure(
      bounced({ tags: { type: "reset" }, to: ["admin@example.com"] }),
    );
    expect(failure.electionId).toBeUndefined();
    expect(stampsVoters(failure)).toBe(false);
  });

  it("refuses an event with no recipients", () => {
    expect(stampsVoters(readDeliveryFailure(bounced({ to: [] })))).toBe(false);
  });
});

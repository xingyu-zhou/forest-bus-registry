import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { CommercePassengerReferenceEventSchema } from "../../src/application/record-commerce-reference.js";
import { RecoveryIdentitySchema } from "../../src/modules/access/model.js";
import { TEST_NOW, TEST_PASSENGER_ID } from "../helpers/registration.js";

describe("versioned integration contracts", () => {
  it("keeps the event JSON Schema envelope aligned with runtime validation", async () => {
    const schema = JSON.parse(
      await readFile(
        new URL(
          "../../contracts/events/commerce-passenger-reference-recorded.v1.schema.json",
          import.meta.url,
        ),
        "utf8",
      ),
    ) as {
      required: string[];
      properties: {
        eventId: { pattern: string };
        eventType: { const: string };
      };
    };
    const event = {
      eventId: "synthetic-commerce-event-1",
      eventType: schema.properties.eventType.const,
      schemaVersion: 1,
      occurredAt: TEST_NOW,
      correlationId: "synthetic-correlation-1",
      causationId: "synthetic-causation-1",
      producer: "forest-bus-legacy",
      data: {
        passengerId: TEST_PASSENGER_ID,
        referenceType: "ORDER_LINE",
        referenceId: "opaque-commerce-reference-1",
      },
    };

    expect(CommercePassengerReferenceEventSchema.parse(event)).toEqual(event);
    expect(schema.required.sort()).toEqual(
      [
        "eventId",
        "eventType",
        "schemaVersion",
        "occurredAt",
        "correlationId",
        "causationId",
        "producer",
        "data",
      ].sort(),
    );
    expect(
      new RegExp(schema.properties.eventId.pattern).test(event.eventId),
    ).toBe(true);
    expect(new RegExp(schema.properties.eventId.pattern).test(" event ")).toBe(
      false,
    );
    expect(() =>
      CommercePassengerReferenceEventSchema.parse({
        ...event,
        eventId: " event ",
      }),
    ).toThrow("identifier_must_not_have_boundary_whitespace");
  });

  it("keeps recovery secrets outside the persisted ownership model", () => {
    expect(() =>
      RecoveryIdentitySchema.parse({
        recoveryIdentityId: `rid_${"1".repeat(32)}`,
        status: "ACTIVE",
        credentialVersion: 1,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
        rawSecret: "must-never-be-stored",
      }),
    ).toThrow();
  });

  it("publishes only the approved initial HTTP surfaces", async () => {
    const openApi = await readFile(
      new URL("../../contracts/http/registry-v1.openapi.yaml", import.meta.url),
      "utf8",
    );
    expect(openApi).toContain("/v1/operator/passengers:");
    expect(openApi).toContain("/v1/migration/passengers:");
    expect(openApi).toContain("MigrationBearer:");
    expect(openApi).toContain(
      "/v1/internal/passengers/{passengerId}/reference:",
    );
    expect(openApi).toContain(
      "/v1/integrations/commerce/passenger-references:",
    );
    expect(openApi).toContain("/v1/public/profiles/{publicProfileId}:");
    expect(openApi).not.toContain("/orders:");
    expect(openApi).not.toContain("/payments:");
  });
});

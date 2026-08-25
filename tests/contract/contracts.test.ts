import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";
import { parseDocument } from "yaml";

import { CommercePassengerReferenceEventSchema } from "../../src/application/record-commerce-reference.js";
import { RecoveryIdentitySchema } from "../../src/modules/access/model.js";
import { MigrationAliasSchema } from "../../src/modules/passenger/model.js";
import { TEST_NOW, TEST_PASSENGER_ID } from "../helpers/registration.js";

type RegistryOpenApiDocument = Readonly<{
  paths: Record<
    string,
    Record<
      string,
      Readonly<{ security?: readonly Record<string, readonly unknown[]>[] }>
    >
  >;
  components: Readonly<{
    securitySchemes: Record<string, unknown>;
    schemas: Readonly<{
      MigrationAlias: Readonly<{
        type: string;
        properties: Readonly<{
          sourceRevisionKind: Readonly<{
            type: string;
            enum: readonly string[];
          }>;
          sourceRevision: Readonly<{
            type: string;
            pattern: string;
          }>;
        }>;
        required: readonly string[];
        allOf: readonly Readonly<{
          if: Readonly<{
            properties: Readonly<{
              sourceRevisionKind: Readonly<{ const: string }>;
            }>;
            required: readonly string[];
          }>;
          then: Readonly<{
            properties: Readonly<{
              sourceRevision: Readonly<{ pattern: string }>;
            }>;
          }>;
        }>[];
      }>;
    }>;
  }>;
}>;

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
    const source = await readFile(
      new URL("../../contracts/http/registry-v1.openapi.yaml", import.meta.url),
      "utf8",
    );
    const document = parseDocument(source);
    expect(document.errors).toEqual([]);
    const openApi = document.toJS() as RegistryOpenApiDocument;
    const approvedOperations = [
      { path: "/health", method: "get", security: undefined },
      {
        path: "/v1/operator/passengers",
        method: "post",
        security: "OperatorBearer",
      },
      {
        path: "/v1/migration/passengers",
        method: "post",
        security: "MigrationBearer",
      },
      {
        path: "/v1/internal/passengers/{passengerId}/reference",
        method: "get",
        security: "ServiceBearer",
      },
      {
        path: "/v1/integrations/commerce/passenger-references",
        method: "post",
        security: "ServiceBearer",
      },
      {
        path: "/v1/public/profiles/{publicProfileId}",
        method: "get",
        security: undefined,
      },
    ] as const;

    expect(Object.keys(openApi.paths).sort()).toEqual(
      approvedOperations.map(({ path }) => path).sort(),
    );
    for (const { path, method, security } of approvedOperations) {
      const pathItem = openApi.paths[path];
      expect(pathItem).toBeDefined();
      if (pathItem === undefined) {
        throw new Error(`Parsed OpenAPI document is missing ${path}`);
      }
      expect(Object.keys(pathItem)).toEqual([method]);
      expect(pathItem[method]?.security).toEqual(
        security === undefined ? undefined : [{ [security]: [] }],
      );
    }
    expect(Object.keys(openApi.components.securitySchemes).sort()).toEqual(
      ["MigrationBearer", "OperatorBearer", "ServiceBearer"].sort(),
    );
  });

  it("aligns the parsed migration revision contract with runtime validation", async () => {
    const source = await readFile(
      new URL("../../contracts/http/registry-v1.openapi.yaml", import.meta.url),
      "utf8",
    );
    const document = parseDocument(source);
    expect(document.errors).toEqual([]);
    const openApi = document.toJS() as RegistryOpenApiDocument;
    const migrationAlias = openApi.components.schemas.MigrationAlias;

    expect(migrationAlias.type).toBe("object");
    expect(migrationAlias.properties.sourceRevisionKind).toEqual({
      type: "string",
      enum: ["SOURCE_NATIVE", "CANONICAL_RECORD_SHA256"],
      description: expect.any(String),
    });
    expect([...migrationAlias.required].sort()).toEqual(
      [
        "sourceSystem",
        "kind",
        "value",
        "provenance",
        "migrationRunId",
        "transformVersion",
        "sourceRevisionKind",
        "sourceRevision",
      ].sort(),
    );
    expect(migrationAlias.allOf).toEqual([
      {
        if: {
          properties: {
            sourceRevisionKind: { const: "CANONICAL_RECORD_SHA256" },
          },
          required: ["sourceRevisionKind"],
        },
        then: {
          properties: {
            sourceRevision: { pattern: "^[0-9a-f]{64}$" },
          },
        },
      },
    ]);
    const canonicalRevisionRule = migrationAlias.allOf[0];
    expect(canonicalRevisionRule).toBeDefined();
    if (canonicalRevisionRule === undefined) {
      throw new Error(
        "Parsed OpenAPI document lacks the canonical revision rule",
      );
    }

    const baseAlias = {
      sourceSystem: "forest-bus-legacy",
      kind: "IMPORT_EXTERNAL_KEY",
      value: "synthetic-import-1",
      provenance: "EXACT_SOURCE",
      migrationRunId: "synthetic-migration-run-1",
      transformVersion: "synthetic-transform-v1",
    } as const;
    const sourceNativeAlias = {
      ...baseAlias,
      sourceRevisionKind: "SOURCE_NATIVE",
      sourceRevision: "legacy-revision-37",
    } as const;
    const canonicalAlias = {
      ...baseAlias,
      sourceRevisionKind: "CANONICAL_RECORD_SHA256",
      sourceRevision: "a".repeat(64),
    } as const;
    const canonicalRevisionPattern = new RegExp(
      canonicalRevisionRule.then.properties.sourceRevision.pattern,
    );

    expect(MigrationAliasSchema.parse(sourceNativeAlias)).toEqual(
      sourceNativeAlias,
    );
    expect(MigrationAliasSchema.parse(canonicalAlias)).toEqual(canonicalAlias);
    expect(canonicalRevisionPattern.test(canonicalAlias.sourceRevision)).toBe(
      true,
    );
    const invalidCanonicalAlias = {
      ...canonicalAlias,
      sourceRevision: "not-a-sha256",
    };
    expect(
      canonicalRevisionPattern.test(invalidCanonicalAlias.sourceRevision),
    ).toBe(false);
    expect(() => MigrationAliasSchema.parse(invalidCanonicalAlias)).toThrow(
      "canonical_record_revision_must_be_sha256",
    );
  });
});

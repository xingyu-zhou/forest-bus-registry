import { describe, expect, it } from "vitest";

import {
  PassengerAccessSchema,
  RecoveryIdentitySchema,
} from "../../src/modules/access/model.js";
import { PassengerPublicationSchema } from "../../src/modules/publication/model.js";
import {
  TEST_NOW,
  TEST_PASSENGER_ID,
  TEST_PUBLIC_PROFILE_ID,
} from "../helpers/registration.js";

const privateDecisions = {
  passengerKind: "PRIVATE" as const,
  birthDate: "PRIVATE" as const,
  personality: "PRIVATE" as const,
  favoriteThings: "PRIVATE" as const,
  selfIntroduction: "PRIVATE" as const,
  historicalProductName: "PRIVATE" as const,
};

describe("lifecycle timestamp invariants", () => {
  it("rejects contradictory Publication lifecycle timestamps", () => {
    const base = {
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      visibility: "PUBLIC" as const,
      lifecycle: "ACTIVE" as const,
      fieldDecisions: privateDecisions,
      revision: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    };

    expect(() => PassengerPublicationSchema.parse(base)).toThrow();
    expect(() =>
      PassengerPublicationSchema.parse({
        ...base,
        publishedAt: TEST_NOW,
        withdrawnAt: TEST_NOW,
      }),
    ).toThrow();
    expect(() =>
      PassengerPublicationSchema.parse({
        ...base,
        lifecycle: "DRAFT",
      }),
    ).toThrow("draft_publication_must_be_private");
    expect(() =>
      PassengerPublicationSchema.parse({
        ...base,
        publishedAt: "2026-08-25T00:00:00Z",
      }),
    ).toThrow("publication_timestamps_must_be_chronological");
  });

  it("rejects contradictory RecoveryIdentity status", () => {
    const base = {
      recoveryIdentityId: `rid_${"1".repeat(32)}`,
      credentialVersion: 1,
      status: "ACTIVE" as const,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    };
    expect(RecoveryIdentitySchema.parse(base).status).toBe("ACTIVE");
    expect(() =>
      RecoveryIdentitySchema.parse({ ...base, revokedAt: TEST_NOW }),
    ).toThrow();
    expect(() =>
      RecoveryIdentitySchema.parse({ ...base, status: "REVOKED" }),
    ).toThrow();
  });

  it("rejects contradictory PassengerAccess status", () => {
    const base = {
      passengerAccessId: `acc_${"1".repeat(32)}`,
      passengerId: TEST_PASSENGER_ID,
      recoveryIdentityId: `rid_${"1".repeat(32)}`,
      status: "ACTIVE" as const,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    };
    expect(PassengerAccessSchema.parse(base).status).toBe("ACTIVE");
    expect(() =>
      PassengerAccessSchema.parse({ ...base, revokedAt: TEST_NOW }),
    ).toThrow();
    expect(() =>
      PassengerAccessSchema.parse({ ...base, status: "REVOKED" }),
    ).toThrow();
  });
});

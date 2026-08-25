import { describe, expect, it } from "vitest";

import {
  createLegacyNfcBinding,
  NfcBindingSchema,
  transitionNfcBinding,
} from "../../src/modules/nfc/model.js";
import { PassengerSchema } from "../../src/modules/passenger/model.js";
import { PassengerPublicProfileSchema } from "../../src/modules/public-profile/model.js";
import {
  TEST_NOW,
  TEST_PASSENGER_ID,
  TEST_PUBLIC_PROFILE_ID,
} from "../helpers/registration.js";

const allocated = NfcBindingSchema.parse({
  nfcBindingId: `nfb_${"1".repeat(32)}`,
  resolverKind: "LEGACY_BINDING_PUBLIC_ID",
  bindingPublicId: "nfc_000000000001",
  passengerId: TEST_PASSENGER_ID,
  publicProfileId: TEST_PUBLIC_PROFILE_ID,
  publicUrl: "https://forest-bus.com/n/nfc_000000000001",
  resolverDisposition: "ACTIVE",
  status: "ALLOCATED",
  allocatedAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

describe("NFC identity binding", () => {
  it("preserves ordered write and read-back verification", () => {
    const written = transitionNfcBinding(
      allocated,
      "WRITTEN",
      "2026-08-24T00:01:00Z",
    );
    expect(written.ok).toBe(true);
    if (!written.ok) return;

    const mismatch = transitionNfcBinding(
      written.binding,
      "VERIFIED",
      "2026-08-24T00:02:00Z",
      "https://example.invalid/wrong",
    );
    expect(mismatch).toEqual({
      ok: false,
      reason: "OBSERVED_URL_MISMATCH",
    });

    const verified = transitionNfcBinding(
      written.binding,
      "VERIFIED",
      "2026-08-24T00:02:00Z",
      allocated.publicUrl,
    );
    expect(verified.ok && verified.binding.status).toBe("VERIFIED");
  });

  it("does not accept access or ownership data as NFC facts", () => {
    expect(() =>
      NfcBindingSchema.parse({
        ...allocated,
        passengerAccessId: `acc_${"1".repeat(32)}`,
      }),
    ).toThrow();
  });

  it.each([
    "javascript:alert(1)",
    "ftp://forest-bus.com/n/nfc_000000000001",
    "https://example.invalid/n/nfc_000000000001",
    "https://forest-bus.com/n/nfc_000000000002",
    "https://forest-bus.com/n/nfc_000000000001?redirect=evil",
    " https://forest-bus.com/n/nfc_000000000001\n",
  ])("rejects an unsafe or mismatched resolver URL: %s", (publicUrl) => {
    expect(() => NfcBindingSchema.parse({ ...allocated, publicUrl })).toThrow();
  });

  it("requires lifecycle timestamps to agree with status", () => {
    expect(() =>
      NfcBindingSchema.parse({ ...allocated, status: "LOCKED" }),
    ).toThrow();
    expect(() =>
      NfcBindingSchema.parse({
        ...allocated,
        status: "REPLACED",
        resolverDisposition: "REPLACED",
        verifiedAt: TEST_NOW,
        replacedAt: TEST_NOW,
      }),
    ).toThrow("verified_history_requires_written_history");
  });

  it("derives a binding only from a related Passenger and PublicProfile", () => {
    const passenger = PassengerSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      passengerNo: "P-000001",
      revision: 1,
      migrationAliases: [],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const unrelatedProfile = PassengerPublicProfileSchema.parse({
      passengerId: `psg_${"2".repeat(32)}`,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      revision: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(() =>
      createLegacyNfcBinding({
        nfcBindingId: `nfb_${"3".repeat(32)}`,
        bindingPublicId: "nfc_000000000001",
        passenger,
        publicProfile: unrelatedProfile,
        now: TEST_NOW,
      }),
    ).toThrow("nfc_profile_passenger_mismatch");
  });
});

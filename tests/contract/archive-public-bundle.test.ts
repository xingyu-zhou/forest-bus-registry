import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import {
  type ArchiveProfileV1,
  ArchivePublicBundleV1Schema,
  archivePublicBundleV1Checksum,
  canonicalArchivePublicBundleV1Json,
  normalizeArchivePublicBundleV1,
  projectArchiveNfcBindingV1,
  projectArchiveProfileV1,
} from "../../src/exports/archive/archive-public-bundle-v1.js";
import { NfcBindingSchema } from "../../src/modules/nfc/model.js";
import { PassengerSchema } from "../../src/modules/passenger/model.js";
import { PassengerPublicProfileSchema } from "../../src/modules/public-profile/model.js";
import { PassengerPublicationSchema } from "../../src/modules/publication/model.js";
import {
  TEST_NOW,
  TEST_PASSENGER_ID,
  TEST_PASSENGER_NO,
  TEST_PUBLIC_PROFILE_ID,
} from "../helpers/registration.js";

const fixtureUrl = new URL(
  "../../fixtures/archive/registry-public-bundle-v1.json",
  import.meta.url,
);

describe("ArchivePublicBundleV1 producer", () => {
  it("emits canonical deterministic JSON with honest Registry provenance", async () => {
    const fixtureText = await readFile(fixtureUrl, "utf8");
    const fixture = ArchivePublicBundleV1Schema.parse(JSON.parse(fixtureText));

    expect(canonicalArchivePublicBundleV1Json(fixture)).toBe(fixtureText);
    expect(fixture.source.system).toBe("forest-bus-registry");
    expect(archivePublicBundleV1Checksum(fixture)).toMatch(/^[0-9a-f]{64}$/);
  });

  it.each(["2026-08-24T00:00Z", "0000-01-01T00:00:00Z"])(
    "rejects a timestamp rejected by the Archive consumer: %s",
    async (archivedAt) => {
      const fixture = JSON.parse(await readFile(fixtureUrl, "utf8"));
      expect(() =>
        ArchivePublicBundleV1Schema.parse({ ...fixture, archivedAt }),
      ).toThrow();
    },
  );

  it("normalizes source arrays and public events", () => {
    const first: ArchiveProfileV1 = {
      publicProfileId: "pp_0000000001",
      passengerNo: "P-000001",
      displayName: "Synthetic One",
      passengerKind: null,
      profileImage: null,
      birthDate: null,
      personality: null,
      favoriteThings: null,
      selfIntroduction: null,
      productName: null,
      archivedJourneyStatus: null,
      publicEvents: [
        { occurredOn: "2026-08-02", message: "Second" },
        { occurredOn: "2026-08-01", message: "First" },
      ],
    };
    const second: ArchiveProfileV1 = {
      ...first,
      publicProfileId: "pp_0000000002",
      passengerNo: "P-000002",
      displayName: "Synthetic Two",
      publicEvents: [],
    };

    const bundle = normalizeArchivePublicBundleV1(
      ArchivePublicBundleV1Schema.parse({
        schemaVersion: 1,
        archivedAt: "2026-08-24T00:00:00Z",
        source: {
          system: "forest-bus-registry",
          sourceRevision: "synthetic-ordering-v1",
        },
        profiles: [second, first],
        profileTombstones: [],
        nfcBindings: [],
      }),
    );

    expect(
      bundle.profiles.map(({ publicProfileId }) => publicProfileId),
    ).toEqual(["pp_0000000001", "pp_0000000002"]);
    expect(
      bundle.profiles[0]?.publicEvents.map(({ message }) => message),
    ).toEqual(["First", "Second"]);
  });

  it("normalizes tombstone and NFC order", async () => {
    const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
      profileTombstones: Array<Record<string, unknown>>;
      nfcBindings: Array<Record<string, unknown>>;
    };
    fixture.profileTombstones.push({
      publicProfileId: "pp_0000000003",
      removedAt: "2026-08-22T00:00:00Z",
      reasonCode: "OTHER",
    });
    fixture.profileTombstones.reverse();
    fixture.nfcBindings.reverse();

    const normalized = normalizeArchivePublicBundleV1(
      ArchivePublicBundleV1Schema.parse(fixture),
    );
    expect(
      normalized.profileTombstones.map(
        ({ publicProfileId }) => publicProfileId,
      ),
    ).toEqual(["pp_0000000002", "pp_0000000003"]);
    expect(
      normalized.nfcBindings.map(({ bindingPublicId }) => bindingPublicId),
    ).toEqual(["nfc_000000000001", "nfc_000000000002", "nfc_000000000003"]);
  });

  it("rejects profile/tombstone collisions and dangling active NFC", async () => {
    const base = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
      profiles: Array<{ publicProfileId: string }>;
      profileTombstones: Array<Record<string, unknown>>;
      nfcBindings: Array<Record<string, unknown>>;
    };
    expect(() =>
      ArchivePublicBundleV1Schema.parse({
        ...base,
        profileTombstones: [
          {
            ...base.profileTombstones[0]!,
            publicProfileId: base.profiles[0]!.publicProfileId,
          },
        ],
      }),
    ).toThrow();
    expect(() =>
      ArchivePublicBundleV1Schema.parse({
        ...base,
        nfcBindings: [
          {
            bindingPublicId: "nfc_000000000003",
            disposition: "ACTIVE",
            publicProfileId: "pp_0000000004",
          },
        ],
      }),
    ).toThrow();
  });

  it.each([
    ["profiles", "passengerId", `psg_${"1".repeat(32)}`],
    ["profiles", "passengerAccessId", `acc_${"1".repeat(32)}`],
    ["profiles", "recoveryIdentityId", `rid_${"1".repeat(32)}`],
    ["profiles", "orderId", "synthetic-order"],
    ["nfcBindings", "tagUid", "synthetic-tag-uid"],
  ] as const)(
    "rejects forbidden %s.%s independently",
    async (collection, field, value) => {
      const fixture = JSON.parse(await readFile(fixtureUrl, "utf8")) as {
        profiles: Array<Record<string, unknown>>;
        nfcBindings: Array<Record<string, unknown>>;
      };
      fixture[collection][0] = {
        ...fixture[collection][0],
        [field]: value,
      };

      expect(() => ArchivePublicBundleV1Schema.parse(fixture)).toThrow();
    },
  );

  it("derives an Archive profile from publication-safe Registry facts", () => {
    const passenger = PassengerSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      passengerNo: TEST_PASSENGER_NO,
      revision: 1,
      migrationAliases: [],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const profile = PassengerPublicProfileSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      displayName: "Synthetic Passenger",
      passengerKind: "Visible kind",
      birthDate: "2024-02-29",
      personality: "Visible personality",
      favoriteThings: "Private favorite",
      selfIntroduction: "Private introduction",
      historicalProductName: "Legacy Product",
      revision: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const publication = PassengerPublicationSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      visibility: "PUBLIC",
      lifecycle: "ACTIVE",
      fieldDecisions: {
        passengerKind: "PUBLIC",
        birthDate: "PUBLIC",
        personality: "PUBLIC",
        favoriteThings: "PRIVATE",
        selfIntroduction: "PRIVATE",
        historicalProductName: "PUBLIC",
      },
      primaryImageId: `img_${"2".repeat(32)}`,
      revision: 2,
      publishedAt: TEST_NOW,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(
      projectArchiveProfileV1({
        passenger,
        profile,
        publication,
        publicImage: {
          imageId: `img_${"2".repeat(32)}`,
          passengerId: TEST_PASSENGER_ID,
          role: "PUBLIC_PROFILE",
          visibility: "PUBLIC",
          status: "READY",
          sha256: "3".repeat(64),
          url: "https://media.forest-bus.com/passengers/synthetic.webp",
          alt: "Synthetic Passenger",
          width: 800,
          height: 800,
        },
        preparedImage: {
          imageId: `img_${"2".repeat(32)}`,
          passengerId: TEST_PASSENGER_ID,
          path: "/archive/fixtures/passengers/synthetic.webp",
          alt: "Synthetic Passenger",
          sha256: "3".repeat(64),
          width: 800,
          height: 800,
        },
      }),
    ).toEqual({
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      passengerNo: TEST_PASSENGER_NO,
      displayName: "Synthetic Passenger",
      passengerKind: "Visible kind",
      profileImage: {
        path: "/archive/fixtures/passengers/synthetic.webp",
        alt: "Synthetic Passenger",
        sha256: "3".repeat(64),
        width: 800,
        height: 800,
      },
      birthDate: "02-29",
      personality: "Visible personality",
      favoriteThings: null,
      selfIntroduction: null,
      productName: "Legacy Product",
      archivedJourneyStatus: null,
      publicEvents: [],
    });
  });

  it("archives a published Legacy provisional display name", () => {
    const passenger = PassengerSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      passengerNo: TEST_PASSENGER_NO,
      revision: 1,
      migrationAliases: [],
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const profile = PassengerPublicProfileSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      provisionalDisplayName: "Published Legacy display name",
      revision: 1,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const publication = PassengerPublicationSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      visibility: "PUBLIC",
      lifecycle: "ACTIVE",
      fieldDecisions: {
        passengerKind: "PRIVATE",
        birthDate: "PRIVATE",
        personality: "PRIVATE",
        favoriteThings: "PRIVATE",
        selfIntroduction: "PRIVATE",
        historicalProductName: "PRIVATE",
      },
      revision: 2,
      publishedAt: TEST_NOW,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(
      projectArchiveProfileV1({ passenger, profile, publication }),
    ).toMatchObject({ displayName: "Published Legacy display name" });
  });

  it("maps issued Legacy NFC states to Archive route dispositions", () => {
    const verified = NfcBindingSchema.parse({
      nfcBindingId: `nfb_${"4".repeat(32)}`,
      resolverKind: "LEGACY_BINDING_PUBLIC_ID",
      bindingPublicId: "nfc_000000000001",
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      publicUrl: "https://forest-bus.com/n/nfc_000000000001",
      resolverDisposition: "ACTIVE",
      status: "VERIFIED",
      allocatedAt: TEST_NOW,
      writtenAt: TEST_NOW,
      verifiedAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(projectArchiveNfcBindingV1(verified)).toEqual({
      bindingPublicId: "nfc_000000000001",
      disposition: "ACTIVE",
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
    });
    expect(
      projectArchiveNfcBindingV1(
        NfcBindingSchema.parse({
          ...verified,
          status: "ALLOCATED",
          writtenAt: undefined,
          verifiedAt: undefined,
        }),
      ),
    ).toEqual({
      bindingPublicId: "nfc_000000000001",
      disposition: "ACTIVE",
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
    });
    expect(
      projectArchiveNfcBindingV1(
        NfcBindingSchema.parse({
          ...verified,
          status: "REPLACED",
          resolverDisposition: "REPLACED",
          replacedAt: TEST_NOW,
        }),
      ),
    ).toEqual({
      bindingPublicId: "nfc_000000000001",
      disposition: "REPLACED",
    });
  });
});

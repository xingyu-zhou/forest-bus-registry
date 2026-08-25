import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const registryRoot = resolve(new URL("..", import.meta.url).pathname);
const TEST_NOW = "2026-08-24T00:00:00Z";
const TEST_PASSENGER_ID = `psg_${"1".repeat(32)}`;
const TEST_PASSENGER_NO = "P-000001";
const TEST_PUBLIC_PROFILE_ID = "pp_0000000001";
const TEST_IMAGE_ID = `img_${"2".repeat(32)}`;

async function loadProducer() {
  return import(
    pathToFileURL(
      resolve(registryRoot, "dist/exports/archive/archive-public-bundle-v1.js"),
    ).href
  );
}

function requireProjection(value, label) {
  if (value === null) {
    throw new Error(`synthetic_archive_projection_missing:${label}`);
  }
  return value;
}

function syntheticNfcBinding(input) {
  return {
    nfcBindingId: `nfb_${input.suffix.repeat(32)}`,
    resolverKind: "LEGACY_BINDING_PUBLIC_ID",
    bindingPublicId: input.bindingPublicId,
    passengerId: TEST_PASSENGER_ID,
    publicProfileId: input.publicProfileId,
    publicUrl: `https://forest-bus.com/n/${input.bindingPublicId}`,
    resolverDisposition: input.status === "REPLACED" ? "REPLACED" : "ACTIVE",
    status: input.status,
    allocatedAt: TEST_NOW,
    ...(input.status === "REPLACED" ? { replacedAt: TEST_NOW } : {}),
    updatedAt: TEST_NOW,
  };
}

/**
 * Builds the committed compatibility fixture through the actual Registry
 * public-profile and NFC projection functions. Only Bundle-level tombstone and
 * source metadata are supplied directly because those producer models do not
 * exist yet.
 */
export async function buildSyntheticRegistryArchiveBundleV1() {
  const producer = await loadProducer();
  const profile = requireProjection(
    producer.projectArchiveProfileV1({
      passenger: {
        passengerId: TEST_PASSENGER_ID,
        passengerNo: TEST_PASSENGER_NO,
        revision: 1,
        migrationAliases: [],
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      },
      profile: {
        passengerId: TEST_PASSENGER_ID,
        publicProfileId: TEST_PUBLIC_PROFILE_ID,
        displayName: "Registry Synthetic Passenger",
        passengerKind: "Synthetic fixture",
        birthDate: "2024-02-29",
        personality: "Synthetic personality",
        favoriteThings: "Synthetic favorite",
        selfIntroduction: "Archive contract verification only.",
        historicalProductName: "Synthetic historical product snapshot",
        revision: 1,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      },
      publication: {
        passengerId: TEST_PASSENGER_ID,
        publicProfileId: TEST_PUBLIC_PROFILE_ID,
        visibility: "PUBLIC",
        lifecycle: "ACTIVE",
        fieldDecisions: {
          passengerKind: "PUBLIC",
          birthDate: "PUBLIC",
          personality: "PUBLIC",
          favoriteThings: "PUBLIC",
          selfIntroduction: "PUBLIC",
          historicalProductName: "PUBLIC",
        },
        primaryImageId: TEST_IMAGE_ID,
        revision: 2,
        publishedAt: TEST_NOW,
        createdAt: TEST_NOW,
        updatedAt: TEST_NOW,
      },
      publicImage: {
        imageId: TEST_IMAGE_ID,
        passengerId: TEST_PASSENGER_ID,
        role: "PUBLIC_PROFILE",
        visibility: "PUBLIC",
        status: "READY",
        sha256:
          "22515efda5bf9011a9c3fc9f48d7bafbdf8bfc5b64d6108b19e3c5820cbdc71b",
        url: "https://media.forest-bus.com/passengers/synthetic.png",
        alt: "Synthetic geometric Passenger portrait",
        width: 40,
        height: 80,
      },
      preparedImage: {
        imageId: TEST_IMAGE_ID,
        passengerId: TEST_PASSENGER_ID,
        path: "/archive/fixtures/passengers/pp_0000000001/profile.png",
        alt: "Synthetic geometric Passenger portrait",
        sha256:
          "22515efda5bf9011a9c3fc9f48d7bafbdf8bfc5b64d6108b19e3c5820cbdc71b",
        width: 40,
        height: 80,
      },
    }),
    "profile",
  );

  const nfcBindings = [
    syntheticNfcBinding({
      suffix: "4",
      bindingPublicId: "nfc_000000000001",
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      status: "ALLOCATED",
    }),
    syntheticNfcBinding({
      suffix: "5",
      bindingPublicId: "nfc_000000000002",
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      status: "REPLACED",
    }),
    syntheticNfcBinding({
      suffix: "6",
      bindingPublicId: "nfc_000000000003",
      publicProfileId: "pp_0000000002",
      status: "ALLOCATED",
    }),
  ].map((binding, index) =>
    requireProjection(
      producer.projectArchiveNfcBindingV1(binding),
      `nfc-${index}`,
    ),
  );

  return producer.ArchivePublicBundleV1Schema.parse({
    schemaVersion: 1,
    archivedAt: TEST_NOW,
    source: {
      system: "forest-bus-registry",
      sourceRevision: "synthetic-registry-projection-v1",
    },
    profiles: [profile],
    profileTombstones: [
      {
        publicProfileId: "pp_0000000002",
        removedAt: "2026-08-23T00:00:00Z",
        reasonCode: "INVALID_RECORD",
      },
    ],
    nfcBindings,
  });
}

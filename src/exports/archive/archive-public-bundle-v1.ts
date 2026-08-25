import { createHash } from "node:crypto";

import { z } from "zod";

import {
  PassengerIdSchema,
  PassengerNoSchema,
  PassengerSchema,
  PublicProfileIdSchema,
} from "../../modules/passenger/model.js";
import type { Passenger } from "../../modules/passenger/model.js";
import {
  NFC_BINDING_PUBLIC_ID_PATTERN,
  NfcBindingSchema,
  type NfcBinding,
} from "../../modules/nfc/model.js";
import type { PassengerPublicProfile } from "../../modules/public-profile/model.js";
import { PassengerPublicProfileSchema } from "../../modules/public-profile/model.js";
import {
  PassengerImageIdSchema,
  type PublicPassengerImage,
  PublicPassengerImageSchema,
} from "../../modules/media/model.js";
import {
  isPubliclyReadable,
  PassengerPublicationSchema,
  type PassengerPublication,
} from "../../modules/publication/model.js";

const RAW_HTML_PATTERN = /<(?:!--|!doctype\b|\?xml\b|\/?[A-Za-z][^>]*)>/i;

function plainTextSchema() {
  return z
    .string()
    .min(1)
    .refine((value) => value.trim().length > 0, "non_empty_text")
    .refine((value) => !RAW_HTML_PATTERN.test(value), "raw_html_not_allowed");
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leapYear ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (days[month - 1] ?? 0)
  );
}

function isValidMonthDay(value: string): boolean {
  return isValidCalendarDate(`2000-${value}`);
}

const RFC3339_TIMESTAMP_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/;

function isValidRfc3339Timestamp(value: string): boolean {
  const match =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-](\d{2}):(\d{2}))$/.exec(
      value,
    );
  if (match === null) return false;
  const date = `${match[1]}-${match[2]}-${match[3]}`;
  const hour = Number(match[4]);
  const minute = Number(match[5]);
  const second = Number(match[6]);
  const offsetHour = match[7] === undefined ? 0 : Number(match[7]);
  const offsetMinute = match[8] === undefined ? 0 : Number(match[8]);
  return (
    isValidCalendarDate(date) &&
    hour <= 23 &&
    minute <= 59 &&
    second <= 59 &&
    offsetHour <= 23 &&
    offsetMinute <= 59 &&
    Number.isFinite(Date.parse(value))
  );
}

const archiveRfc3339TimestampSchema = z
  .string()
  .regex(RFC3339_TIMESTAMP_PATTERN)
  .refine(isValidRfc3339Timestamp);

function isSafeArchiveImagePath(value: string): boolean {
  return (
    /^\/archive\/fixtures\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(value) &&
    !value.includes("//") &&
    !value.includes("\\") &&
    !value.includes("?") &&
    !value.includes("#") &&
    !value.includes("%") &&
    !value.endsWith("/") &&
    !value.split("/").some((segment) => segment === "." || segment === "..")
  );
}

const archiveImageV1Schema = z
  .object({
    path: z.string().refine(isSafeArchiveImagePath),
    alt: plainTextSchema(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export const PreparedArchiveImageV1Schema = archiveImageV1Schema
  .extend({
    imageId: PassengerImageIdSchema,
    passengerId: PassengerIdSchema,
  })
  .strict();

const archivePublicEventV1Schema = z
  .object({
    occurredOn: z.string().refine(isValidCalendarDate),
    message: plainTextSchema(),
  })
  .strict();

export const ArchiveProfileV1Schema = z
  .object({
    publicProfileId: PublicProfileIdSchema,
    passengerNo: PassengerNoSchema,
    displayName: plainTextSchema(),
    passengerKind: plainTextSchema().nullable(),
    profileImage: archiveImageV1Schema.nullable(),
    birthDate: z.string().refine(isValidMonthDay).nullable(),
    personality: plainTextSchema().nullable(),
    favoriteThings: plainTextSchema().nullable(),
    selfIntroduction: plainTextSchema().nullable(),
    productName: plainTextSchema().nullable(),
    archivedJourneyStatus: z
      .enum(["READY_TO_DEPART", "RESERVED", "ARRIVED"])
      .nullable(),
    publicEvents: z.array(archivePublicEventV1Schema),
  })
  .strict();

export const ArchiveProfileTombstoneV1Schema = z
  .object({
    publicProfileId: PublicProfileIdSchema,
    removedAt: archiveRfc3339TimestampSchema,
    reasonCode: z.enum([
      "PRIVACY_REQUEST",
      "INVALID_RECORD",
      "OWNER_REQUEST",
      "OTHER",
    ]),
  })
  .strict();

const activeNfcBindingV1Schema = z
  .object({
    bindingPublicId: z.string().regex(NFC_BINDING_PUBLIC_ID_PATTERN),
    disposition: z.literal("ACTIVE"),
    publicProfileId: PublicProfileIdSchema,
  })
  .strict();

const replacedNfcBindingV1Schema = z
  .object({
    bindingPublicId: z.string().regex(NFC_BINDING_PUBLIC_ID_PATTERN),
    disposition: z.literal("REPLACED"),
  })
  .strict();

export const ArchiveNfcBindingV1Schema = z.discriminatedUnion("disposition", [
  activeNfcBindingV1Schema,
  replacedNfcBindingV1Schema,
]);

const archivePublicBundleV1BaseSchema = z
  .object({
    schemaVersion: z.literal(1),
    archivedAt: archiveRfc3339TimestampSchema,
    source: z
      .object({
        system: z.literal("forest-bus-registry"),
        sourceRevision: plainTextSchema(),
      })
      .strict(),
    profiles: z.array(ArchiveProfileV1Schema),
    profileTombstones: z.array(ArchiveProfileTombstoneV1Schema),
    nfcBindings: z.array(ArchiveNfcBindingV1Schema),
  })
  .strict();

export const ArchivePublicBundleV1Schema =
  archivePublicBundleV1BaseSchema.superRefine((bundle, context) => {
    const profileIds = new Set<string>();
    const passengerNumbers = new Set<string>();
    const tombstoneIds = new Set<string>();
    const bindingIds = new Set<string>();

    bundle.profiles.forEach((profile, index) => {
      if (profileIds.has(profile.publicProfileId)) {
        context.addIssue({
          code: "custom",
          message: "unique_public_profile_id",
          path: ["profiles", index, "publicProfileId"],
        });
      }
      if (passengerNumbers.has(profile.passengerNo)) {
        context.addIssue({
          code: "custom",
          message: "unique_passenger_no",
          path: ["profiles", index, "passengerNo"],
        });
      }
      profileIds.add(profile.publicProfileId);
      passengerNumbers.add(profile.passengerNo);
    });

    bundle.profileTombstones.forEach((tombstone, index) => {
      if (
        tombstoneIds.has(tombstone.publicProfileId) ||
        profileIds.has(tombstone.publicProfileId)
      ) {
        context.addIssue({
          code: "custom",
          message: "unique_tombstone_public_profile_id",
          path: ["profileTombstones", index, "publicProfileId"],
        });
      }
      tombstoneIds.add(tombstone.publicProfileId);
    });

    bundle.nfcBindings.forEach((binding, index) => {
      if (bindingIds.has(binding.bindingPublicId)) {
        context.addIssue({
          code: "custom",
          message: "unique_nfc_binding_public_id",
          path: ["nfcBindings", index, "bindingPublicId"],
        });
      }
      bindingIds.add(binding.bindingPublicId);
      if (
        binding.disposition === "ACTIVE" &&
        !profileIds.has(binding.publicProfileId) &&
        !tombstoneIds.has(binding.publicProfileId)
      ) {
        context.addIssue({
          code: "custom",
          message: "active_nfc_target_exists",
          path: ["nfcBindings", index, "publicProfileId"],
        });
      }
    });
  });

export type ArchiveProfileV1 = Readonly<z.infer<typeof ArchiveProfileV1Schema>>;
export type ArchiveProfileTombstoneV1 = Readonly<
  z.infer<typeof ArchiveProfileTombstoneV1Schema>
>;
export type ArchiveNfcBindingV1 = Readonly<
  z.infer<typeof ArchiveNfcBindingV1Schema>
>;
export type ArchivePublicBundleV1 = Readonly<
  z.infer<typeof ArchivePublicBundleV1Schema>
>;
export type PreparedArchiveImageV1 = Readonly<
  z.infer<typeof PreparedArchiveImageV1Schema>
>;

function archiveProjectionError(message: string): never {
  throw new Error(`archive_projection_invariant:${message}`);
}

function archivePublicField(
  decision: "PUBLIC" | "PRIVATE",
  value: string | undefined,
): string | null {
  return decision === "PUBLIC" ? (value ?? null) : null;
}

/**
 * Privacy-safe Registry fact projection. Journey/event facts intentionally
 * remain empty until their ownership and retention contract is approved.
 */
export function projectArchiveProfileV1(input: {
  passenger: Passenger;
  profile: PassengerPublicProfile;
  publication: PassengerPublication;
  publicImage?: PublicPassengerImage;
  preparedImage?: PreparedArchiveImageV1;
}): ArchiveProfileV1 | null {
  const passenger = PassengerSchema.parse(input.passenger);
  const profile = PassengerPublicProfileSchema.parse(input.profile);
  const publication = PassengerPublicationSchema.parse(input.publication);
  if (
    profile.passengerId !== passenger.passengerId ||
    publication.passengerId !== passenger.passengerId ||
    publication.publicProfileId !== profile.publicProfileId
  ) {
    archiveProjectionError("passenger_profile_publication_mismatch");
  }
  if (!isPubliclyReadable(publication)) return null;

  const displayName = profile.displayName ?? profile.provisionalDisplayName;
  if (displayName === undefined) {
    archiveProjectionError("public_profile_requires_display_name");
  }

  let profileImage: z.infer<typeof archiveImageV1Schema> | null = null;
  if (publication.primaryImageId !== undefined) {
    if (input.publicImage === undefined || input.preparedImage === undefined) {
      archiveProjectionError("published_image_requires_prepared_archive_asset");
    }
    const publicImage = PublicPassengerImageSchema.parse(input.publicImage);
    const preparedImage = PreparedArchiveImageV1Schema.parse(
      input.preparedImage,
    );
    if (
      publicImage.imageId !== publication.primaryImageId ||
      publicImage.passengerId !== passenger.passengerId ||
      preparedImage.imageId !== publication.primaryImageId ||
      preparedImage.passengerId !== passenger.passengerId ||
      preparedImage.sha256 !== publicImage.sha256 ||
      preparedImage.alt !== publicImage.alt ||
      preparedImage.width !== publicImage.width ||
      preparedImage.height !== publicImage.height
    ) {
      archiveProjectionError("prepared_image_identity_mismatch");
    }
    profileImage = {
      path: preparedImage.path,
      alt: preparedImage.alt,
      sha256: preparedImage.sha256,
      width: preparedImage.width,
      height: preparedImage.height,
    };
  } else if (
    input.publicImage !== undefined ||
    input.preparedImage !== undefined
  ) {
    archiveProjectionError("unpublished_image_must_not_be_exported");
  }

  return ArchiveProfileV1Schema.parse({
    publicProfileId: profile.publicProfileId,
    passengerNo: passenger.passengerNo,
    displayName,
    passengerKind: archivePublicField(
      publication.fieldDecisions.passengerKind,
      profile.passengerKind,
    ),
    profileImage,
    birthDate: archivePublicField(
      publication.fieldDecisions.birthDate,
      profile.birthDate?.slice(5),
    ),
    personality: archivePublicField(
      publication.fieldDecisions.personality,
      profile.personality,
    ),
    favoriteThings: archivePublicField(
      publication.fieldDecisions.favoriteThings,
      profile.favoriteThings,
    ),
    selfIntroduction: archivePublicField(
      publication.fieldDecisions.selfIntroduction,
      profile.selfIntroduction,
    ),
    productName: archivePublicField(
      publication.fieldDecisions.historicalProductName,
      profile.historicalProductName,
    ),
    archivedJourneyStatus: null,
    publicEvents: [],
  });
}

/** Maps explicit Legacy resolver dispositions into Archive v1 route semantics. */
export function projectArchiveNfcBindingV1(
  bindingInput: NfcBinding,
): ArchiveNfcBindingV1 | null {
  const binding = NfcBindingSchema.parse(bindingInput);
  if (binding.resolverDisposition === "ACTIVE") {
    return ArchiveNfcBindingV1Schema.parse({
      bindingPublicId: binding.bindingPublicId,
      disposition: "ACTIVE",
      publicProfileId: binding.publicProfileId,
    });
  }
  if (binding.resolverDisposition === "REPLACED") {
    return ArchiveNfcBindingV1Schema.parse({
      bindingPublicId: binding.bindingPublicId,
      disposition: "REPLACED",
    });
  }
  if (binding.resolverDisposition === "REVOKED") {
    archiveProjectionError("archive_v1_has_no_revoked_nfc_disposition");
  }
  return null;
}

function compareCodeUnits(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

export function normalizeArchivePublicBundleV1(
  bundleInput: ArchivePublicBundleV1,
): ArchivePublicBundleV1 {
  const bundle = ArchivePublicBundleV1Schema.parse(bundleInput);
  return {
    schemaVersion: 1,
    archivedAt: bundle.archivedAt,
    source: {
      system: "forest-bus-registry",
      sourceRevision: bundle.source.sourceRevision,
    },
    profiles: bundle.profiles
      .map((profile) => ({
        publicProfileId: profile.publicProfileId,
        passengerNo: profile.passengerNo,
        displayName: profile.displayName,
        passengerKind: profile.passengerKind,
        profileImage:
          profile.profileImage === null
            ? null
            : {
                path: profile.profileImage.path,
                alt: profile.profileImage.alt,
                sha256: profile.profileImage.sha256,
                width: profile.profileImage.width,
                height: profile.profileImage.height,
              },
        birthDate: profile.birthDate,
        personality: profile.personality,
        favoriteThings: profile.favoriteThings,
        selfIntroduction: profile.selfIntroduction,
        productName: profile.productName,
        archivedJourneyStatus: profile.archivedJourneyStatus,
        publicEvents: profile.publicEvents
          .map((event) => ({
            occurredOn: event.occurredOn,
            message: event.message,
          }))
          .sort(
            (left, right) =>
              compareCodeUnits(left.occurredOn, right.occurredOn) ||
              compareCodeUnits(left.message, right.message),
          ),
      }))
      .sort((left, right) =>
        compareCodeUnits(left.publicProfileId, right.publicProfileId),
      ),
    profileTombstones: bundle.profileTombstones
      .map((tombstone) => ({
        publicProfileId: tombstone.publicProfileId,
        removedAt: tombstone.removedAt,
        reasonCode: tombstone.reasonCode,
      }))
      .sort((left, right) =>
        compareCodeUnits(left.publicProfileId, right.publicProfileId),
      ),
    nfcBindings: bundle.nfcBindings
      .map((binding) =>
        binding.disposition === "ACTIVE"
          ? {
              bindingPublicId: binding.bindingPublicId,
              disposition: "ACTIVE" as const,
              publicProfileId: binding.publicProfileId,
            }
          : {
              bindingPublicId: binding.bindingPublicId,
              disposition: "REPLACED" as const,
            },
      )
      .sort((left, right) =>
        compareCodeUnits(left.bindingPublicId, right.bindingPublicId),
      ),
  };
}

export function canonicalArchivePublicBundleV1Json(
  bundle: ArchivePublicBundleV1,
): string {
  return `${JSON.stringify(normalizeArchivePublicBundleV1(bundle), null, 2)}\n`;
}

export function archivePublicBundleV1Checksum(
  bundle: ArchivePublicBundleV1,
): string {
  return createHash("sha256")
    .update(canonicalArchivePublicBundleV1Json(bundle), "utf8")
    .digest("hex");
}

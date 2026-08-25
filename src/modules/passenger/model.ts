import { randomBytes, randomUUID } from "node:crypto";

import { z } from "zod";

const CROCKFORD_ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export const PASSENGER_ID_PATTERN = /^psg_[0-9a-f]{32}$/;
export const PASSENGER_NO_PATTERN = /^P-[0-9A-HJKMNP-TV-Z]{6}$/;
export const PUBLIC_PROFILE_ID_PATTERN = /^pp_[0-9A-HJKMNP-TV-Z]{10}$/;

export const PassengerIdSchema = z.string().regex(PASSENGER_ID_PATTERN);
export const PassengerNoSchema = z.string().regex(PASSENGER_NO_PATTERN);
export const PublicProfileIdSchema = z
  .string()
  .regex(PUBLIC_PROFILE_ID_PATTERN);

export type PassengerId = z.infer<typeof PassengerIdSchema>;
export type PassengerNo = z.infer<typeof PassengerNoSchema>;
export type PublicProfileId = z.infer<typeof PublicProfileIdSchema>;

function preservedIdentifierSchema(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value.trim() === value,
      "identifier_must_not_have_boundary_whitespace",
    );
}

export const MigrationAliasSchema = z
  .object({
    sourceSystem: z.enum(["forest-bus-legacy"]),
    kind: z.enum([
      "LEGACY_PASSENGER_KEY",
      "LEGACY_PASSENGER_NO",
      "LEGACY_PUBLIC_PROFILE_ID",
      "LEGACY_PUBLIC_URL",
      "IMPORT_EXTERNAL_KEY",
      "LEGACY_PRODUCT_REFERENCE",
    ]),
    value: preservedIdentifierSchema(256),
    provenance: z.enum(["EXACT_SOURCE", "DERIVED_BY_MAPPER"]),
    migrationRunId: preservedIdentifierSchema(128),
    transformVersion: preservedIdentifierSchema(64),
    sourceRevisionKind: z.enum(["SOURCE_NATIVE", "CANONICAL_RECORD_SHA256"]),
    sourceRevision: preservedIdentifierSchema(256),
    sourceCreatedAt: z.string().datetime({ offset: true }).optional(),
    sourceUpdatedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((alias, context) => {
    if (
      alias.sourceRevisionKind === "CANONICAL_RECORD_SHA256" &&
      !/^[0-9a-f]{64}$/.test(alias.sourceRevision)
    ) {
      context.addIssue({
        code: "custom",
        message: "canonical_record_revision_must_be_sha256",
        path: ["sourceRevision"],
      });
    }
    if (
      alias.sourceCreatedAt !== undefined &&
      alias.sourceUpdatedAt !== undefined &&
      Date.parse(alias.sourceUpdatedAt) < Date.parse(alias.sourceCreatedAt)
    ) {
      context.addIssue({
        code: "custom",
        message: "source_updated_at_must_not_precede_source_created_at",
        path: ["sourceUpdatedAt"],
      });
    }
  });

export type MigrationAlias = Readonly<z.infer<typeof MigrationAliasSchema>>;

export const PassengerSchema = z
  .object({
    passengerId: PassengerIdSchema,
    passengerNo: PassengerNoSchema,
    revision: z.number().int().positive(),
    migrationAliases: z.array(MigrationAliasSchema),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((passenger, context) => {
    if (Date.parse(passenger.updatedAt) < Date.parse(passenger.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "updated_at_must_not_precede_created_at",
        path: ["updatedAt"],
      });
    }
  });

export type Passenger = Readonly<z.infer<typeof PassengerSchema>>;

function randomCrockford(length: number): string {
  return Array.from(randomBytes(length), (value) =>
    CROCKFORD_ALPHABET.charAt(value & 31),
  ).join("");
}

/**
 * The representation is generated here but remains opaque to every client.
 * It is not a database key and callers must never parse its prefix or bytes.
 */
export function generatePassengerId(): PassengerId {
  return PassengerIdSchema.parse(`psg_${randomUUID().replaceAll("-", "")}`);
}

export function generatePassengerNo(): PassengerNo {
  return PassengerNoSchema.parse(`P-${randomCrockford(6)}`);
}

export function generatePublicProfileId(): PublicProfileId {
  return PublicProfileIdSchema.parse(`pp_${randomCrockford(10)}`);
}

import { z } from "zod";

import { PassengerIdSchema } from "../passenger/model.js";

/**
 * Provisional ownership models only. Credential ceremony and device-grant
 * commands require a separate security review before production use.
 */
export const RecoveryIdentitySchema = z
  .object({
    recoveryIdentityId: z.string().regex(/^rid_[0-9a-f]{32}$/),
    status: z.enum(["ACTIVE", "REVOKED"]),
    credentialVersion: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((identity, context) => {
    if (identity.status === "ACTIVE" && identity.revokedAt !== undefined) {
      context.addIssue({
        code: "custom",
        message: "active_must_not_have_revoked_at",
        path: ["revokedAt"],
      });
    }
    if (identity.status === "REVOKED" && identity.revokedAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "revoked_requires_revoked_at",
        path: ["revokedAt"],
      });
    }
    if (
      Date.parse(identity.updatedAt) < Date.parse(identity.createdAt) ||
      (identity.revokedAt !== undefined &&
        (Date.parse(identity.revokedAt) < Date.parse(identity.createdAt) ||
          Date.parse(identity.updatedAt) < Date.parse(identity.revokedAt)))
    ) {
      context.addIssue({
        code: "custom",
        message: "identity_timestamps_must_be_chronological",
        path: ["updatedAt"],
      });
    }
  });

export const PassengerAccessSchema = z
  .object({
    passengerAccessId: z.string().regex(/^acc_[0-9a-f]{32}$/),
    passengerId: PassengerIdSchema,
    recoveryIdentityId: z.string().regex(/^rid_[0-9a-f]{32}$/),
    status: z.enum(["ACTIVE", "REVOKED"]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
    revokedAt: z.string().datetime({ offset: true }).optional(),
  })
  .strict()
  .superRefine((access, context) => {
    if (access.status === "ACTIVE" && access.revokedAt !== undefined) {
      context.addIssue({
        code: "custom",
        message: "active_must_not_have_revoked_at",
        path: ["revokedAt"],
      });
    }
    if (access.status === "REVOKED" && access.revokedAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "revoked_requires_revoked_at",
        path: ["revokedAt"],
      });
    }
    if (
      Date.parse(access.updatedAt) < Date.parse(access.createdAt) ||
      (access.revokedAt !== undefined &&
        (Date.parse(access.revokedAt) < Date.parse(access.createdAt) ||
          Date.parse(access.updatedAt) < Date.parse(access.revokedAt)))
    ) {
      context.addIssue({
        code: "custom",
        message: "access_timestamps_must_be_chronological",
        path: ["updatedAt"],
      });
    }
  });

export type RecoveryIdentity = Readonly<z.infer<typeof RecoveryIdentitySchema>>;
export type PassengerAccess = Readonly<z.infer<typeof PassengerAccessSchema>>;

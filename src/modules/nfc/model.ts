import { z } from "zod";

import {
  PassengerIdSchema,
  PassengerSchema,
  PublicProfileIdSchema,
} from "../passenger/model.js";
import type { Passenger } from "../passenger/model.js";
import {
  type PassengerPublicProfile,
  PassengerPublicProfileSchema,
} from "../public-profile/model.js";

export const NFC_BINDING_PUBLIC_ID_PATTERN = /^nfc_[0-9A-HJKMNP-TV-Z]{12}$/;

export const NfcBindingStatusSchema = z.enum([
  "ALLOCATED",
  "WRITTEN",
  "VERIFIED",
  "LOCKED",
  "REPLACED",
  "REVOKED",
]);

export const NfcBindingSchema = z
  .object({
    nfcBindingId: z.string().regex(/^nfb_[0-9a-f]{32}$/),
    resolverKind: z.literal("LEGACY_BINDING_PUBLIC_ID"),
    bindingPublicId: z.string().regex(NFC_BINDING_PUBLIC_ID_PATTERN),
    passengerId: PassengerIdSchema,
    publicProfileId: PublicProfileIdSchema,
    publicUrl: z.string().max(2048),
    resolverDisposition: z.enum(["ACTIVE", "REPLACED", "REVOKED"]),
    status: NfcBindingStatusSchema,
    allocatedAt: z.string().datetime({ offset: true }),
    writtenAt: z.string().datetime({ offset: true }).optional(),
    verifiedAt: z.string().datetime({ offset: true }).optional(),
    lockedAt: z.string().datetime({ offset: true }).optional(),
    replacedAt: z.string().datetime({ offset: true }).optional(),
    revokedAt: z.string().datetime({ offset: true }).optional(),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((binding, context) => {
    let url: URL | undefined;
    try {
      url = new URL(binding.publicUrl);
    } catch {
      context.addIssue({
        code: "custom",
        message: "invalid_resolver_url",
        path: ["publicUrl"],
      });
    }
    const exactLegacyUrl = `https://forest-bus.com/n/${binding.bindingPublicId}`;
    if (
      url !== undefined &&
      (binding.publicUrl !== exactLegacyUrl ||
        url.origin !== "https://forest-bus.com" ||
        url.username !== "" ||
        url.password !== "" ||
        url.search !== "" ||
        url.hash !== "" ||
        url.pathname !== `/n/${binding.bindingPublicId}`)
    ) {
      context.addIssue({
        code: "custom",
        message: "legacy_resolver_url_must_match_binding_alias",
        path: ["publicUrl"],
      });
    }

    type NfcTimestampField =
      "writtenAt" | "verifiedAt" | "lockedAt" | "replacedAt" | "revokedAt";
    const requiredHistory: Partial<
      Record<
        z.infer<typeof NfcBindingStatusSchema>,
        readonly NfcTimestampField[]
      >
    > = {
      WRITTEN: ["writtenAt"],
      VERIFIED: ["writtenAt", "verifiedAt"],
      LOCKED: ["writtenAt", "verifiedAt", "lockedAt"],
      REPLACED: ["replacedAt"],
      REVOKED: ["revokedAt"],
    };
    for (const field of requiredHistory[binding.status] ?? []) {
      if (binding[field] === undefined) {
        context.addIssue({
          code: "custom",
          message: `${binding.status.toLowerCase()}_requires_${field}`,
          path: [field],
        });
      }
    }
    const forbiddenHistory: Partial<
      Record<
        z.infer<typeof NfcBindingStatusSchema>,
        readonly NfcTimestampField[]
      >
    > = {
      ALLOCATED: ["writtenAt", "verifiedAt", "lockedAt"],
      WRITTEN: ["verifiedAt", "lockedAt"],
      VERIFIED: ["lockedAt"],
    };
    for (const field of forbiddenHistory[binding.status] ?? []) {
      if (binding[field] !== undefined) {
        context.addIssue({
          code: "custom",
          message: `${binding.status.toLowerCase()}_must_not_have_${field}`,
          path: [field],
        });
      }
    }
    if (binding.verifiedAt !== undefined && binding.writtenAt === undefined) {
      context.addIssue({
        code: "custom",
        message: "verified_history_requires_written_history",
        path: ["verifiedAt"],
      });
    }
    if (
      binding.lockedAt !== undefined &&
      (binding.writtenAt === undefined || binding.verifiedAt === undefined)
    ) {
      context.addIssue({
        code: "custom",
        message: "locked_history_requires_written_and_verified_history",
        path: ["lockedAt"],
      });
    }
    if (binding.status !== "REPLACED" && binding.replacedAt !== undefined) {
      context.addIssue({
        code: "custom",
        message: "non_replaced_must_not_have_replaced_at",
        path: ["replacedAt"],
      });
    }
    if (binding.status !== "REVOKED" && binding.revokedAt !== undefined) {
      context.addIssue({
        code: "custom",
        message: "non_revoked_must_not_have_revoked_at",
        path: ["revokedAt"],
      });
    }
    const expectedDisposition =
      binding.status === "REPLACED"
        ? "REPLACED"
        : binding.status === "REVOKED"
          ? "REVOKED"
          : "ACTIVE";
    if (binding.resolverDisposition !== expectedDisposition) {
      context.addIssue({
        code: "custom",
        message: "resolver_disposition_must_match_terminal_status",
        path: ["resolverDisposition"],
      });
    }

    const history = [
      binding.allocatedAt,
      binding.writtenAt,
      binding.verifiedAt,
      binding.lockedAt,
      binding.replacedAt,
      binding.revokedAt,
      binding.updatedAt,
    ].filter((value): value is string => value !== undefined);
    for (let index = 1; index < history.length; index += 1) {
      if (Date.parse(history[index]!) < Date.parse(history[index - 1]!)) {
        context.addIssue({
          code: "custom",
          message: "nfc_history_must_be_chronological",
          path: ["updatedAt"],
        });
        break;
      }
    }
  });

export type NfcBinding = Readonly<z.infer<typeof NfcBindingSchema>>;

export type NfcTransitionResult =
  | Readonly<{ ok: true; binding: NfcBinding }>
  | Readonly<{
      ok: false;
      reason: "INVALID_TRANSITION" | "OBSERVED_URL_MISMATCH";
    }>;

const NEXT_STATUS: Readonly<
  Partial<Record<NfcBinding["status"], NfcBinding["status"]>>
> = {
  ALLOCATED: "WRITTEN",
  WRITTEN: "VERIFIED",
  VERIFIED: "LOCKED",
};

/**
 * Creates an imported Legacy resolver binding while deriving both identifiers
 * from an already-related Registry Passenger/Profile pair. New NFC issuance is
 * intentionally outside this compatibility constructor until its own contract
 * is approved.
 */
export function createLegacyNfcBinding(input: {
  nfcBindingId: string;
  bindingPublicId: string;
  passenger: Passenger;
  publicProfile: PassengerPublicProfile;
  now: string;
}): NfcBinding {
  const passenger = PassengerSchema.parse(input.passenger);
  const publicProfile = PassengerPublicProfileSchema.parse(input.publicProfile);
  if (publicProfile.passengerId !== passenger.passengerId) {
    throw new Error("nfc_profile_passenger_mismatch");
  }
  return NfcBindingSchema.parse({
    nfcBindingId: input.nfcBindingId,
    resolverKind: "LEGACY_BINDING_PUBLIC_ID",
    bindingPublicId: input.bindingPublicId,
    passengerId: passenger.passengerId,
    publicProfileId: publicProfile.publicProfileId,
    publicUrl: `https://forest-bus.com/n/${input.bindingPublicId}`,
    resolverDisposition: "ACTIVE",
    status: "ALLOCATED",
    allocatedAt: input.now,
    updatedAt: input.now,
  });
}

export function transitionNfcBinding(
  binding: NfcBinding,
  nextStatus: Extract<NfcBinding["status"], "WRITTEN" | "VERIFIED" | "LOCKED">,
  now: string,
  observedUrl?: string,
): NfcTransitionResult {
  if (NEXT_STATUS[binding.status] !== nextStatus) {
    return { ok: false, reason: "INVALID_TRANSITION" };
  }
  if (nextStatus === "VERIFIED" && observedUrl !== binding.publicUrl) {
    return { ok: false, reason: "OBSERVED_URL_MISMATCH" };
  }

  const timestampPatch =
    nextStatus === "WRITTEN"
      ? { writtenAt: now }
      : nextStatus === "VERIFIED"
        ? { verifiedAt: now }
        : { lockedAt: now };

  return {
    ok: true,
    binding: NfcBindingSchema.parse({
      ...binding,
      ...timestampPatch,
      status: nextStatus,
      updatedAt: now,
    }),
  };
}

export function retireNfcBinding(
  binding: NfcBinding,
  reason: "REPLACED" | "REVOKED",
  now: string,
): NfcTransitionResult {
  if (binding.status === "REPLACED" || binding.status === "REVOKED") {
    return { ok: false, reason: "INVALID_TRANSITION" };
  }
  return {
    ok: true,
    binding: NfcBindingSchema.parse({
      ...binding,
      status: reason,
      resolverDisposition: reason,
      ...(reason === "REPLACED" ? { replacedAt: now } : { revokedAt: now }),
      updatedAt: now,
    }),
  };
}

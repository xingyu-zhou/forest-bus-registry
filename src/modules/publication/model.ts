import { z } from "zod";

import { PassengerImageIdSchema } from "../media/model.js";
import {
  PassengerIdSchema,
  PublicProfileIdSchema,
} from "../passenger/model.js";

export const PublicationVisibilitySchema = z.enum(["PRIVATE", "PUBLIC"]);
export const PublicationLifecycleSchema = z.enum([
  "DRAFT",
  "ACTIVE",
  "WITHDRAWN",
]);

export const PublicFieldDecisionSchema = z.enum(["PUBLIC", "PRIVATE"]);

export const ProfileFieldDecisionsSchema = z
  .object({
    passengerKind: PublicFieldDecisionSchema,
    birthDate: PublicFieldDecisionSchema,
    personality: PublicFieldDecisionSchema,
    favoriteThings: PublicFieldDecisionSchema,
    selfIntroduction: PublicFieldDecisionSchema,
    historicalProductName: PublicFieldDecisionSchema,
  })
  .strict();

export const PassengerPublicationSchema = z
  .object({
    passengerId: PassengerIdSchema,
    publicProfileId: PublicProfileIdSchema,
    visibility: PublicationVisibilitySchema,
    lifecycle: PublicationLifecycleSchema,
    fieldDecisions: ProfileFieldDecisionsSchema,
    primaryImageId: PassengerImageIdSchema.optional(),
    revision: z.number().int().positive(),
    publishedAt: z.string().datetime({ offset: true }).optional(),
    withdrawnAt: z.string().datetime({ offset: true }).optional(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((publication, context) => {
    const issue = (
      field: "visibility" | "publishedAt" | "withdrawnAt" | "updatedAt",
      message: string,
    ) => context.addIssue({ code: "custom", message, path: [field] });

    const orderedTimes = [
      publication.createdAt,
      publication.publishedAt,
      publication.withdrawnAt,
      publication.updatedAt,
    ].filter((value): value is string => value !== undefined);
    for (let index = 1; index < orderedTimes.length; index += 1) {
      if (
        Date.parse(orderedTimes[index]!) < Date.parse(orderedTimes[index - 1]!)
      ) {
        issue("updatedAt", "publication_timestamps_must_be_chronological");
        break;
      }
    }

    if (publication.lifecycle === "DRAFT") {
      if (publication.visibility !== "PRIVATE") {
        issue("visibility", "draft_publication_must_be_private");
      }
      if (publication.publishedAt !== undefined) {
        issue("publishedAt", "draft_must_not_have_published_at");
      }
      if (publication.withdrawnAt !== undefined) {
        issue("withdrawnAt", "draft_must_not_have_withdrawn_at");
      }
      return;
    }

    if (publication.publishedAt === undefined) {
      issue("publishedAt", "published_lifecycle_requires_published_at");
    }
    if (publication.lifecycle === "ACTIVE") {
      if (publication.visibility !== "PUBLIC") {
        issue("visibility", "active_publication_must_be_public");
      }
      if (publication.withdrawnAt !== undefined) {
        issue("withdrawnAt", "active_must_not_have_withdrawn_at");
      }
      return;
    }

    if (publication.visibility !== "PRIVATE") {
      issue("visibility", "withdrawn_publication_must_be_private");
    }
    if (publication.withdrawnAt === undefined) {
      issue("withdrawnAt", "withdrawn_requires_withdrawn_at");
    }
  });

export type PassengerPublication = Readonly<
  z.infer<typeof PassengerPublicationSchema>
>;

export function isPubliclyReadable(publication: PassengerPublication): boolean {
  return (
    publication.visibility === "PUBLIC" && publication.lifecycle === "ACTIVE"
  );
}

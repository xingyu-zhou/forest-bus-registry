import { z } from "zod";

import {
  PassengerIdSchema,
  PublicProfileIdSchema,
} from "../passenger/model.js";

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function isValidCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const days = [
    31,
    isLeapYear(year) ? 29 : 28,
    31,
    30,
    31,
    30,
    31,
    31,
    30,
    31,
    30,
    31,
  ];
  return (
    year > 0 &&
    month >= 1 &&
    month <= 12 &&
    day >= 1 &&
    day <= (days[month - 1] ?? 0)
  );
}

export const PassengerBirthDateSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine(isValidCalendarDate);

export const PassengerPublicProfileSchema = z
  .object({
    passengerId: PassengerIdSchema,
    publicProfileId: PublicProfileIdSchema,
    displayName: z.string().trim().min(1).max(120).optional(),
    provisionalDisplayName: z.string().trim().min(1).max(120).optional(),
    passengerKind: z.string().trim().min(1).max(80).optional(),
    birthDate: PassengerBirthDateSchema.optional(),
    personality: z.string().trim().min(1).max(240).optional(),
    favoriteThings: z.string().trim().min(1).max(240).optional(),
    selfIntroduction: z.string().trim().min(1).max(800).optional(),
    historicalProductName: z.string().trim().min(1).max(240).optional(),
    revision: z.number().int().positive(),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((profile, context) => {
    if (Date.parse(profile.updatedAt) < Date.parse(profile.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "updated_at_must_not_precede_created_at",
        path: ["updatedAt"],
      });
    }
  });

export type PassengerPublicProfile = Readonly<
  z.infer<typeof PassengerPublicProfileSchema>
>;

export type PublicProfileProjection = Readonly<{
  publicProfileId: string;
  displayName: string;
  passengerKind: string | null;
  birthDate: string | null;
  personality: string | null;
  favoriteThings: string | null;
  selfIntroduction: string | null;
  image: Readonly<{
    url: string;
    alt: string;
    width: number;
    height: number;
  }> | null;
}>;

import { z } from "zod";

import { PassengerIdSchema } from "../passenger/model.js";

export const REGISTRY_PUBLIC_MEDIA_ORIGIN = "https://media.forest-bus.com";
export const PassengerImageIdSchema = z.string().regex(/^img_[0-9a-f]{32}$/);

const RegistryObjectKeySchema = z
  .string()
  .min(1)
  .max(1024)
  .refine((value) => value.trim() === value)
  .refine(
    (value) =>
      value.startsWith("passengers/") &&
      !value.includes("\\") &&
      !value.includes("//") &&
      !value.endsWith("/") &&
      !value.split("/").some((segment) => segment === "." || segment === ".."),
  );

export const PassengerImageSchema = z
  .object({
    imageId: PassengerImageIdSchema,
    passengerId: PassengerIdSchema,
    objectKey: RegistryObjectKeySchema,
    contentType: z.enum(["image/jpeg", "image/png", "image/webp"]),
    byteSize: z.number().int().positive(),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    alt: z.string().trim().min(1).max(300),
    role: z.enum(["ORIGINAL_PRIVATE", "PUBLIC_PROFILE"]),
    visibility: z.enum(["PRIVATE", "PUBLIC"]),
    status: z.enum(["REGISTERED", "READY", "RETIRED"]),
    createdAt: z.string().datetime({ offset: true }),
    updatedAt: z.string().datetime({ offset: true }),
  })
  .strict()
  .superRefine((image, context) => {
    if (image.role === "ORIGINAL_PRIVATE" && image.visibility !== "PRIVATE") {
      context.addIssue({
        code: "custom",
        message: "original_image_must_remain_private",
        path: ["visibility"],
      });
    }
    if (image.visibility === "PUBLIC" && image.role !== "PUBLIC_PROFILE") {
      context.addIssue({
        code: "custom",
        message: "public_image_requires_public_profile_role",
        path: ["role"],
      });
    }
    if (image.visibility === "PUBLIC" && image.status !== "READY") {
      context.addIssue({
        code: "custom",
        message: "public_image_must_be_ready",
        path: ["status"],
      });
    }
    if (image.status === "RETIRED" && image.visibility !== "PRIVATE") {
      context.addIssue({
        code: "custom",
        message: "retired_image_must_be_private",
        path: ["visibility"],
      });
    }
    if (Date.parse(image.updatedAt) < Date.parse(image.createdAt)) {
      context.addIssue({
        code: "custom",
        message: "updated_at_must_not_precede_created_at",
        path: ["updatedAt"],
      });
    }
  });

export type PassengerImage = Readonly<z.infer<typeof PassengerImageSchema>>;

function isSafePublicImageUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (
      value === url.href &&
      url.protocol === "https:" &&
      url.origin === REGISTRY_PUBLIC_MEDIA_ORIGIN &&
      url.username === "" &&
      url.password === "" &&
      url.search === "" &&
      url.hash === "" &&
      /^\/passengers\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(url.pathname) &&
      !url.pathname.includes("//") &&
      !url.pathname.includes("%") &&
      !url.pathname.endsWith("/") &&
      !url.pathname
        .split("/")
        .some((segment) => segment === "." || segment === "..")
    );
  } catch {
    return false;
  }
}

export const PublicPassengerImageSchema = z
  .object({
    imageId: PassengerImageIdSchema,
    passengerId: PassengerIdSchema,
    role: z.literal("PUBLIC_PROFILE"),
    visibility: z.literal("PUBLIC"),
    status: z.literal("READY"),
    sha256: z.string().regex(/^[0-9a-f]{64}$/),
    url: z.string().max(2048).refine(isSafePublicImageUrl),
    alt: z.string().trim().min(1).max(300),
    width: z.number().int().positive(),
    height: z.number().int().positive(),
  })
  .strict();

export type PublicPassengerImage = Readonly<
  z.infer<typeof PublicPassengerImageSchema>
>;

export function buildPublicPassengerImage(
  image: PassengerImage,
  url: string,
): PublicPassengerImage {
  const validatedImage = PassengerImageSchema.parse(image);
  return PublicPassengerImageSchema.parse({
    imageId: validatedImage.imageId,
    passengerId: validatedImage.passengerId,
    role: validatedImage.role,
    visibility: validatedImage.visibility,
    status: validatedImage.status,
    sha256: validatedImage.sha256,
    url,
    alt: validatedImage.alt,
    width: validatedImage.width,
    height: validatedImage.height,
  });
}

import { z } from "zod";

function opaqueIdentifierSchema(maxLength: number) {
  return z
    .string()
    .min(1)
    .max(maxLength)
    .refine(
      (value) => value.trim() === value,
      "identifier_must_not_have_boundary_whitespace",
    );
}

export const CommandContextSchema = z
  .object({
    commandId: opaqueIdentifierSchema(128),
    correlationId: opaqueIdentifierSchema(128),
    actor: z
      .object({
        type: z.enum(["OPERATOR", "MIGRATION", "SYSTEM"]),
        id: opaqueIdentifierSchema(128),
      })
      .strict(),
  })
  .strict();

export type CommandContext = Readonly<z.infer<typeof CommandContextSchema>>;

import { z } from "zod";

import { CommandContextSchema } from "./context.js";
import {
  commandFingerprint,
  type PassengerRegistrationDependencies,
  PassengerRegistrationProfileSchema,
  PassengerRegistrationWriter,
  type RegisterPassengerResult,
} from "./passenger-registration.js";
import type { RegistryRepository } from "./ports/registry-repository.js";
import {
  MigrationAliasSchema,
  PassengerNoSchema,
  PublicProfileIdSchema,
} from "../modules/passenger/model.js";

const ImportPassengerCommandSchema = z
  .object({
    context: CommandContextSchema,
    passengerNo: PassengerNoSchema,
    publicProfileId: PublicProfileIdSchema,
    historicalProductName: z.string().trim().min(1).max(240).optional(),
    migrationAliases: z.array(MigrationAliasSchema).min(1),
    ...PassengerRegistrationProfileSchema.shape,
  })
  .strict()
  .superRefine((input, context) => {
    if (input.context.actor.type !== "MIGRATION") {
      context.addIssue({
        code: "custom",
        message: "import_requires_migration_actor",
        path: ["context", "actor", "type"],
      });
    }
  });

export type ImportPassengerCommand = z.input<
  typeof ImportPassengerCommandSchema
>;

export class ImportPassenger {
  readonly #writer: PassengerRegistrationWriter;

  constructor(
    repository: RegistryRepository,
    dependencies: PassengerRegistrationDependencies = {},
  ) {
    this.#writer = new PassengerRegistrationWriter(repository, dependencies);
  }

  async execute(
    command: ImportPassengerCommand,
  ): Promise<RegisterPassengerResult> {
    const input = ImportPassengerCommandSchema.parse(command);
    const {
      context,
      passengerNo,
      publicProfileId,
      historicalProductName,
      migrationAliases,
      ...profile
    } = input;
    return this.#writer.execute({
      context,
      action: "IMPORT_PASSENGER",
      commandFingerprint: commandFingerprint("IMPORT_PASSENGER", input),
      passengerNo,
      publicProfileId,
      ...(historicalProductName === undefined ? {} : { historicalProductName }),
      migrationAliases,
      profile,
    });
  }
}

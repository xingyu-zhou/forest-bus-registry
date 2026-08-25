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

const RegisterPassengerCommandSchema = z
  .object({
    context: CommandContextSchema,
    ...PassengerRegistrationProfileSchema.shape,
    displayName: z.string().trim().min(1).max(120),
    provisionalDisplayName: z.never().optional(),
  })
  .strict();

export type RegisterPassengerCommand = z.input<
  typeof RegisterPassengerCommandSchema
>;
export type { RegisterPassengerResult } from "./passenger-registration.js";

export class RegisterPassenger {
  readonly #writer: PassengerRegistrationWriter;

  constructor(
    repository: RegistryRepository,
    dependencies: PassengerRegistrationDependencies = {},
  ) {
    this.#writer = new PassengerRegistrationWriter(repository, dependencies);
  }

  async execute(
    command: RegisterPassengerCommand,
  ): Promise<RegisterPassengerResult> {
    const input = RegisterPassengerCommandSchema.parse(command);
    const { context, ...profile } = input;
    return this.#writer.execute({
      context,
      action: "REGISTER_PASSENGER",
      commandFingerprint: commandFingerprint("REGISTER_PASSENGER", input),
      profile,
    });
  }
}

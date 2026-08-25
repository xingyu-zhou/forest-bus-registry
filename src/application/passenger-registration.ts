import { createHash, randomUUID } from "node:crypto";

import { z } from "zod";

import type { CommandContext } from "./context.js";
import type {
  Clock,
  RegisteredPassengerSet,
  RegistryIdGenerator,
  RegistryRepository,
} from "./ports/registry-repository.js";
import type { MigrationAlias } from "../modules/passenger/model.js";
import {
  generatePassengerId,
  generatePassengerNo,
  generatePublicProfileId,
  PassengerIdSchema,
  PassengerNoSchema,
  PassengerSchema,
  PublicProfileIdSchema,
} from "../modules/passenger/model.js";
import {
  PassengerBirthDateSchema,
  PassengerPublicProfileSchema,
} from "../modules/public-profile/model.js";
import { PassengerPublicationSchema } from "../modules/publication/model.js";
import { RegistryEventIdSchema } from "../modules/registry-event/model.js";

export const PassengerRegistrationProfileSchema = z
  .object({
    displayName: z.string().trim().min(1).max(120).optional(),
    provisionalDisplayName: z.string().trim().min(1).max(120).optional(),
    passengerKind: z.string().trim().min(1).max(80).optional(),
    birthDate: PassengerBirthDateSchema.optional(),
    personality: z.string().trim().min(1).max(240).optional(),
    favoriteThings: z.string().trim().min(1).max(240).optional(),
    selfIntroduction: z.string().trim().min(1).max(800).optional(),
  })
  .strict();

export type PassengerRegistrationProfile = z.infer<
  typeof PassengerRegistrationProfileSchema
>;

export type RegisterPassengerResult = Readonly<{
  disposition: "CREATED" | "REPLAYED";
  registration: RegisteredPassengerSet;
}>;

const systemClock: Clock = {
  now: () => new Date().toISOString(),
};

const systemIds: RegistryIdGenerator = {
  passengerId: generatePassengerId,
  passengerNo: generatePassengerNo,
  publicProfileId: generatePublicProfileId,
  eventId: () => `evt_${randomUUID().replaceAll("-", "")}`,
};

export type PassengerRegistrationDependencies = Readonly<{
  clock?: Clock;
  ids?: RegistryIdGenerator;
}>;

export function commandFingerprint(kind: string, value: unknown): string {
  return createHash("sha256")
    .update(JSON.stringify({ kind, value }))
    .digest("hex");
}

export class PassengerRegistrationWriter {
  readonly #repository: RegistryRepository;
  readonly #clock: Clock;
  readonly #ids: RegistryIdGenerator;

  constructor(
    repository: RegistryRepository,
    dependencies: PassengerRegistrationDependencies = {},
  ) {
    this.#repository = repository;
    this.#clock = dependencies.clock ?? systemClock;
    this.#ids = dependencies.ids ?? systemIds;
  }

  async execute(input: {
    context: CommandContext;
    action: "REGISTER_PASSENGER" | "IMPORT_PASSENGER";
    commandFingerprint: string;
    profile: PassengerRegistrationProfile;
    passengerNo?: string;
    publicProfileId?: string;
    historicalProductName?: string;
    migrationAliases?: readonly MigrationAlias[];
  }): Promise<RegisterPassengerResult> {
    const replay = await this.#repository.getPassengerRegistrationReplay({
      commandId: input.context.commandId,
      commandFingerprint: input.commandFingerprint,
    });
    if (replay !== null) {
      return { disposition: "REPLAYED", registration: replay };
    }

    const now = this.#clock.now();
    const passengerId = PassengerIdSchema.parse(this.#ids.passengerId());
    const passengerNo = PassengerNoSchema.parse(
      input.passengerNo ?? this.#ids.passengerNo(),
    );
    const publicProfileId = PublicProfileIdSchema.parse(
      input.publicProfileId ?? this.#ids.publicProfileId(),
    );
    const eventId = RegistryEventIdSchema.parse(this.#ids.eventId());

    const passenger = PassengerSchema.parse({
      passengerId,
      passengerNo,
      revision: 1,
      migrationAliases: input.migrationAliases ?? [],
      createdAt: now,
      updatedAt: now,
    });

    const publicProfile = PassengerPublicProfileSchema.parse({
      passengerId,
      publicProfileId,
      ...input.profile,
      ...(input.historicalProductName === undefined
        ? {}
        : { historicalProductName: input.historicalProductName }),
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    const publication = PassengerPublicationSchema.parse({
      passengerId,
      publicProfileId,
      visibility: "PRIVATE",
      lifecycle: "DRAFT",
      fieldDecisions: {
        passengerKind: "PRIVATE",
        birthDate: "PRIVATE",
        personality: "PRIVATE",
        favoriteThings: "PRIVATE",
        selfIntroduction: "PRIVATE",
        historicalProductName: "PRIVATE",
      },
      revision: 1,
      createdAt: now,
      updatedAt: now,
    });

    return this.#repository.createPassengerRegistration({
      commandId: input.context.commandId,
      commandFingerprint: input.commandFingerprint,
      registration: { passenger, publicProfile, publication },
      outboxEvent: {
        eventId,
        eventType: "forest-bus.registry.passenger-registered.v1",
        schemaVersion: 1,
        occurredAt: now,
        aggregateId: passengerId,
        aggregateVersion: 1,
        correlationId: input.context.correlationId,
        producer: "forest-bus-registry",
        data: { passengerId, passengerNo, publicProfileId },
      },
      auditRecord: {
        commandId: input.context.commandId,
        action: input.action,
        actor: input.context.actor,
        aggregateId: passengerId,
        aggregateVersion: 1,
        correlationId: input.context.correlationId,
        occurredAt: now,
      },
    });
  }
}

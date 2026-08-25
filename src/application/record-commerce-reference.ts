import { createHash } from "node:crypto";

import { z } from "zod";

import { PassengerIdSchema } from "../modules/passenger/model.js";
import type { Clock, RegistryRepository } from "./ports/registry-repository.js";

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

export const CommercePassengerReferenceEventSchema = z
  .object({
    eventId: opaqueIdentifierSchema(128),
    eventType: z.literal("forest-bus.commerce.passenger-reference-recorded.v1"),
    schemaVersion: z.literal(1),
    occurredAt: z.string().datetime({ offset: true }),
    correlationId: opaqueIdentifierSchema(128),
    causationId: opaqueIdentifierSchema(128),
    producer: z.literal("forest-bus-legacy"),
    data: z
      .object({
        passengerId: PassengerIdSchema,
        referenceType: z.enum(["ORDER_LINE", "OFFLINE_SALE"]),
        referenceId: opaqueIdentifierSchema(256),
      })
      .strict(),
  })
  .strict();

export type CommercePassengerReferenceEvent = z.infer<
  typeof CommercePassengerReferenceEventSchema
>;

function eventFingerprint(event: CommercePassengerReferenceEvent): string {
  return createHash("sha256").update(JSON.stringify(event)).digest("hex");
}

export class RecordCommerceReference {
  readonly #repository: RegistryRepository;
  readonly #clock: Clock;

  constructor(repository: RegistryRepository, clock?: Clock) {
    this.#repository = repository;
    this.#clock = clock ?? { now: () => new Date().toISOString() };
  }

  async execute(eventInput: unknown) {
    const event = CommercePassengerReferenceEventSchema.parse(eventInput);
    const fingerprint = eventFingerprint(event);
    const replay = await this.#repository.getCommerceReferenceReplay({
      eventId: event.eventId,
      eventFingerprint: fingerprint,
    });
    if (replay !== null) {
      return { disposition: "REPLAYED" as const, receipt: replay };
    }
    const receivedAt = z
      .string()
      .datetime({ offset: true })
      .parse(this.#clock.now());

    return this.#repository.recordCommerceReference({
      eventId: event.eventId,
      eventFingerprint: fingerprint,
      receipt: {
        eventId: event.eventId,
        passengerId: event.data.passengerId,
        referenceType: event.data.referenceType,
        referenceId: event.data.referenceId,
        occurredAt: event.occurredAt,
        receivedAt,
      },
    });
  }
}

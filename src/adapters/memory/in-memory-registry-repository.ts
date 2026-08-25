import { RegistryApplicationError } from "../../application/errors.js";
import type {
  CommerceReferenceReceipt,
  RegisteredPassengerSet,
  RegistryAuditRecord,
  RegistryOutboxEvent,
  RegistryRepository,
} from "../../application/ports/registry-repository.js";
import type { Passenger } from "../../modules/passenger/model.js";
import type { PassengerPublicProfile } from "../../modules/public-profile/model.js";
import type { PassengerPublication } from "../../modules/publication/model.js";

type RegistrationCommandRecord = Readonly<{
  fingerprint: string;
  registration: RegisteredPassengerSet;
}>;

type CommerceEventRecord = Readonly<{
  fingerprint: string;
  receipt: CommerceReferenceReceipt | null;
}>;

function clone<T>(value: T): T {
  return structuredClone(value);
}

export class InMemoryRegistryRepository implements RegistryRepository {
  readonly #passengers = new Map<string, Passenger>();
  readonly #passengerIdByNumber = new Map<string, string>();
  readonly #profilesByPassengerId = new Map<string, PassengerPublicProfile>();
  readonly #passengerIdByPublicProfileId = new Map<string, string>();
  readonly #publicationsByPassengerId = new Map<string, PassengerPublication>();
  readonly #passengerIdByMigrationAlias = new Map<string, string>();
  readonly #registrationCommands = new Map<string, RegistrationCommandRecord>();
  readonly #commerceEvents = new Map<string, CommerceEventRecord>();
  readonly #outboxEvents: RegistryOutboxEvent[] = [];
  readonly #outboxEventIds = new Set<string>();
  readonly #auditRecords: RegistryAuditRecord[] = [];

  async getPassengerRegistrationReplay(input: {
    commandId: string;
    commandFingerprint: string;
  }): Promise<RegisteredPassengerSet | null> {
    const previous = this.#registrationCommands.get(input.commandId);
    if (previous === undefined) return null;
    if (previous.fingerprint !== input.commandFingerprint) {
      throw new RegistryApplicationError(
        "IDEMPOTENCY_MISMATCH",
        "Command ID was already used with different input",
      );
    }
    return clone(previous.registration);
  }

  async createPassengerRegistration(input: {
    commandId: string;
    commandFingerprint: string;
    registration: RegisteredPassengerSet;
    outboxEvent: RegistryOutboxEvent;
    auditRecord: RegistryAuditRecord;
  }) {
    const previous = this.#registrationCommands.get(input.commandId);
    if (previous !== undefined) {
      if (previous.fingerprint !== input.commandFingerprint) {
        throw new RegistryApplicationError(
          "IDEMPOTENCY_MISMATCH",
          "Command ID was already used with different input",
        );
      }
      return {
        disposition: "REPLAYED" as const,
        registration: clone(previous.registration),
      };
    }

    const { passenger, publicProfile, publication } = input.registration;
    if (
      publicProfile.passengerId !== passenger.passengerId ||
      publication.passengerId !== passenger.passengerId ||
      publication.publicProfileId !== publicProfile.publicProfileId
    ) {
      throw new RegistryApplicationError(
        "PROJECTION_INVARIANT",
        "Registration identity set is inconsistent",
      );
    }
    if (
      this.#passengers.has(passenger.passengerId) ||
      this.#passengerIdByNumber.has(passenger.passengerNo) ||
      this.#passengerIdByPublicProfileId.has(publicProfile.publicProfileId)
    ) {
      throw new RegistryApplicationError(
        "CONFLICT",
        "Passenger or permanent public alias already exists",
      );
    }

    const aliasKeys = passenger.migrationAliases.map(
      (alias) => `${alias.sourceSystem}:${alias.kind}:${alias.value}`,
    );
    if (new Set(aliasKeys).size !== aliasKeys.length) {
      throw new RegistryApplicationError(
        "CONFLICT",
        "Migration aliases must be unique within a Passenger",
      );
    }
    if (aliasKeys.some((key) => this.#passengerIdByMigrationAlias.has(key))) {
      throw new RegistryApplicationError(
        "CONFLICT",
        "Migration alias already belongs to another Passenger",
      );
    }
    if (this.#outboxEventIds.has(input.outboxEvent.eventId)) {
      throw new RegistryApplicationError(
        "CONFLICT",
        "Outbox event ID already exists",
      );
    }

    // All invariants are checked before the in-memory commit below. A durable
    // adapter must perform the same writes and outbox append transactionally.
    this.#passengers.set(passenger.passengerId, clone(passenger));
    this.#passengerIdByNumber.set(passenger.passengerNo, passenger.passengerId);
    this.#profilesByPassengerId.set(
      passenger.passengerId,
      clone(publicProfile),
    );
    this.#passengerIdByPublicProfileId.set(
      publicProfile.publicProfileId,
      passenger.passengerId,
    );
    this.#publicationsByPassengerId.set(
      passenger.passengerId,
      clone(publication),
    );
    for (const key of aliasKeys) {
      this.#passengerIdByMigrationAlias.set(key, passenger.passengerId);
    }
    this.#outboxEvents.push(clone(input.outboxEvent));
    this.#outboxEventIds.add(input.outboxEvent.eventId);
    this.#auditRecords.push(clone(input.auditRecord));
    this.#registrationCommands.set(input.commandId, {
      fingerprint: input.commandFingerprint,
      registration: clone(input.registration),
    });

    return {
      disposition: "CREATED" as const,
      registration: clone(input.registration),
    };
  }

  async getPassengerById(passengerId: string): Promise<Passenger | null> {
    const passenger = this.#passengers.get(passengerId);
    return passenger === undefined ? null : clone(passenger);
  }

  async getPublicProfileByPassengerId(
    passengerId: string,
  ): Promise<PassengerPublicProfile | null> {
    const profile = this.#profilesByPassengerId.get(passengerId);
    return profile === undefined ? null : clone(profile);
  }

  async getPublicationByPassengerId(
    passengerId: string,
  ): Promise<PassengerPublication | null> {
    const publication = this.#publicationsByPassengerId.get(passengerId);
    return publication === undefined ? null : clone(publication);
  }

  async recordCommerceReference(input: {
    eventId: string;
    eventFingerprint: string;
    receipt: CommerceReferenceReceipt;
  }) {
    const previous = this.#commerceEvents.get(input.eventId);
    if (previous !== undefined) {
      if (previous.fingerprint !== input.eventFingerprint) {
        throw new RegistryApplicationError(
          "IDEMPOTENCY_MISMATCH",
          "Event ID was already used with different input",
        );
      }
      if (previous.receipt !== null) {
        return {
          disposition: "REPLAYED" as const,
          receipt: clone(previous.receipt),
        };
      }
    } else {
      // Claim the event ID/fingerprint even when later validation fails. This
      // prevents a producer from reusing the immutable event identity with a
      // different payload after a NOT_FOUND result.
      this.#commerceEvents.set(input.eventId, {
        fingerprint: input.eventFingerprint,
        receipt: null,
      });
    }
    if (!this.#passengers.has(input.receipt.passengerId)) {
      throw new RegistryApplicationError(
        "NOT_FOUND",
        "Commerce reference targets an unknown Passenger",
      );
    }
    this.#commerceEvents.set(input.eventId, {
      fingerprint: input.eventFingerprint,
      receipt: clone(input.receipt),
    });
    return {
      disposition: "RECORDED" as const,
      receipt: clone(input.receipt),
    };
  }

  async getCommerceReferenceReplay(input: {
    eventId: string;
    eventFingerprint: string;
  }): Promise<CommerceReferenceReceipt | null> {
    const previous = this.#commerceEvents.get(input.eventId);
    if (previous === undefined) return null;
    if (previous.fingerprint !== input.eventFingerprint) {
      throw new RegistryApplicationError(
        "IDEMPOTENCY_MISMATCH",
        "Event ID was already used with different input",
      );
    }
    return previous.receipt === null ? null : clone(previous.receipt);
  }

  listOutboxEvents(): readonly RegistryOutboxEvent[] {
    return clone(this.#outboxEvents);
  }

  listAuditRecords(): readonly RegistryAuditRecord[] {
    return clone(this.#auditRecords);
  }

  listCommerceReferenceReceipts(): readonly CommerceReferenceReceipt[] {
    return [...this.#commerceEvents.values()].flatMap(({ receipt }) =>
      receipt === null ? [] : [clone(receipt)],
    );
  }
}

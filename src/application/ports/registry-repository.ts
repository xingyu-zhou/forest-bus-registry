import type { Passenger } from "../../modules/passenger/model.js";
import type { PassengerPublicProfile } from "../../modules/public-profile/model.js";
import type { PassengerPublication } from "../../modules/publication/model.js";
import type { RegistryEventId } from "../../modules/registry-event/model.js";

export type RegisteredPassengerSet = Readonly<{
  passenger: Passenger;
  publicProfile: PassengerPublicProfile;
  publication: PassengerPublication;
}>;

type RegistryOutboxEventEnvelope = Readonly<{
  eventId: RegistryEventId;
  schemaVersion: 1;
  occurredAt: string;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  producer: "forest-bus-registry";
}>;

export type RegistryOutboxEvent =
  | (RegistryOutboxEventEnvelope &
      Readonly<{
        eventType: "forest-bus.registry.passenger-registered.v1";
        data: Readonly<{
          passengerId: string;
          passengerNo: string;
          publicProfileId: string;
        }>;
      }>)
  | (RegistryOutboxEventEnvelope &
      Readonly<{
        eventType: "forest-bus.registry.passenger-imported.v1";
        data: Readonly<{
          passengerId: string;
          passengerNo: string;
          publicProfileId: string;
          migrationRunIds: readonly string[];
          sourceRevisions: readonly Readonly<{
            kind: "SOURCE_NATIVE" | "CANONICAL_RECORD_SHA256";
            value: string;
          }>[];
        }>;
      }>);

export type RegistryAuditRecord = Readonly<{
  commandId: string;
  action: "REGISTER_PASSENGER" | "IMPORT_PASSENGER";
  actor: Readonly<{
    type: "OPERATOR" | "MIGRATION" | "SYSTEM";
    id: string;
  }>;
  aggregateId: string;
  aggregateVersion: number;
  correlationId: string;
  occurredAt: string;
}>;

export type CommerceReferenceReceipt = Readonly<{
  eventId: string;
  passengerId: string;
  referenceType: "ORDER_LINE" | "OFFLINE_SALE";
  referenceId: string;
  occurredAt: string;
  receivedAt: string;
}>;

export interface RegistryRepository {
  /**
   * Strongly consistent replay preflight. The create operation below must
   * still repeat the same command/fingerprint CAS inside its write transaction.
   */
  getPassengerRegistrationReplay(input: {
    commandId: string;
    commandFingerprint: string;
  }): Promise<RegisteredPassengerSet | null>;

  createPassengerRegistration(input: {
    commandId: string;
    commandFingerprint: string;
    registration: RegisteredPassengerSet;
    outboxEvent: RegistryOutboxEvent;
    auditRecord: RegistryAuditRecord;
  }): Promise<
    Readonly<{
      disposition: "CREATED" | "REPLAYED";
      registration: RegisteredPassengerSet;
    }>
  >;

  getPassengerById(passengerId: string): Promise<Passenger | null>;
  getPublicProfileByPassengerId(
    passengerId: string,
  ): Promise<PassengerPublicProfile | null>;
  getPublicationByPassengerId(
    passengerId: string,
  ): Promise<PassengerPublication | null>;

  getCommerceReferenceReplay(input: {
    eventId: string;
    eventFingerprint: string;
  }): Promise<CommerceReferenceReceipt | null>;

  recordCommerceReference(input: {
    eventId: string;
    eventFingerprint: string;
    receipt: CommerceReferenceReceipt;
  }): Promise<
    Readonly<{
      disposition: "RECORDED" | "REPLAYED";
      receipt: CommerceReferenceReceipt;
    }>
  >;
}

export interface Clock {
  now(): string;
}

export interface RegistryIdGenerator {
  passengerId(): string;
  passengerNo(): string;
  publicProfileId(): string;
  eventId(): RegistryEventId;
}

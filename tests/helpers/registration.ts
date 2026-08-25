import type {
  Clock,
  RegistryIdGenerator,
} from "../../src/application/ports/registry-repository.js";
import { ImportPassenger } from "../../src/application/import-passenger.js";
import { RegisterPassenger } from "../../src/application/register-passenger.js";
import { InMemoryRegistryRepository } from "../../src/adapters/memory/in-memory-registry-repository.js";

export const TEST_NOW = "2026-08-24T00:00:00Z";
export const TEST_PASSENGER_ID = `psg_${"1".repeat(32)}`;
export const TEST_PASSENGER_NO = "P-000001";
export const TEST_PUBLIC_PROFILE_ID = "pp_0000000001";

export const testClock: Clock = { now: () => TEST_NOW };

export const testIds: RegistryIdGenerator = {
  passengerId: () => TEST_PASSENGER_ID,
  passengerNo: () => TEST_PASSENGER_NO,
  publicProfileId: () => TEST_PUBLIC_PROFILE_ID,
  eventId: () => `evt_${"a".repeat(32)}`,
};

export function testRegisterPassenger(
  repository: InMemoryRegistryRepository,
  ids: RegistryIdGenerator = testIds,
): RegisterPassenger {
  return new RegisterPassenger(repository, { clock: testClock, ids });
}

export function testImportPassenger(
  repository: InMemoryRegistryRepository,
  ids: RegistryIdGenerator = testIds,
): ImportPassenger {
  return new ImportPassenger(repository, { clock: testClock, ids });
}

export const testRegistrationCommand = {
  context: {
    commandId: "command-register-synthetic-1",
    correlationId: "correlation-synthetic-1",
    actor: { type: "OPERATOR" as const, id: "synthetic-operator" },
  },
  displayName: "Synthetic Passenger",
  passengerKind: "Synthetic fixture",
};

export const testImportCommand = {
  context: {
    commandId: "command-import-synthetic-1",
    correlationId: "correlation-import-synthetic-1",
    actor: { type: "MIGRATION" as const, id: "synthetic-migration" },
  },
  passengerNo: TEST_PASSENGER_NO,
  publicProfileId: TEST_PUBLIC_PROFILE_ID,
  displayName: "Synthetic Passenger",
  passengerKind: "Synthetic fixture",
  migrationAliases: [
    {
      sourceSystem: "forest-bus-legacy" as const,
      kind: "IMPORT_EXTERNAL_KEY" as const,
      value: "synthetic-import-1",
      provenance: "EXACT_SOURCE" as const,
      migrationRunId: "synthetic-migration-run-1",
      transformVersion: "synthetic-transform-v1",
      sourceRevisionKind: "SOURCE_NATIVE" as const,
      sourceRevision: "synthetic-v1",
      sourceCreatedAt: "2026-06-05T00:00:00Z",
      sourceUpdatedAt: "2026-07-09T00:00:00Z",
    },
  ],
};

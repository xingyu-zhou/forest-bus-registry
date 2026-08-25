import { describe, expect, it } from "vitest";

import type { RegistryIdGenerator } from "../../src/application/ports/registry-repository.js";
import { RegisterPassenger } from "../../src/application/register-passenger.js";
import { InMemoryRegistryRepository } from "../../src/adapters/memory/in-memory-registry-repository.js";
import {
  TEST_PASSENGER_NO,
  testIds,
  testImportCommand,
  testImportPassenger,
  testRegisterPassenger,
  testRegistrationCommand,
} from "../helpers/registration.js";

describe("RegisterPassenger", () => {
  it("atomically creates a stable identity set and outbox event", async () => {
    const repository = new InMemoryRegistryRepository();
    const useCase = testRegisterPassenger(repository);

    const result = await useCase.execute(testRegistrationCommand);

    expect(result.disposition).toBe("CREATED");
    expect(result.registration.passenger).toMatchObject({
      passengerId: testIds.passengerId(),
      passengerNo: testIds.passengerNo(),
      revision: 1,
    });
    expect(result.registration.publicProfile.publicProfileId).toBe(
      testIds.publicProfileId(),
    );
    expect(result.registration.publication).toMatchObject({
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
    });
    expect(repository.listOutboxEvents()).toHaveLength(1);
    expect(repository.listAuditRecords()).toEqual([
      expect.objectContaining({
        commandId: testRegistrationCommand.context.commandId,
        action: "REGISTER_PASSENGER",
        actor: testRegistrationCommand.context.actor,
        aggregateId: testIds.passengerId(),
      }),
    ]);
    expect(repository.listOutboxEvents()[0]).toMatchObject({
      aggregateId: testIds.passengerId(),
      producer: "forest-bus-registry",
      data: {
        passengerId: testIds.passengerId(),
        passengerNo: testIds.passengerNo(),
        publicProfileId: testIds.publicProfileId(),
      },
    });
  });

  it("replays the same command without duplicate facts or events", async () => {
    const repository = new InMemoryRegistryRepository();
    const useCase = testRegisterPassenger(repository);

    const first = await useCase.execute(testRegistrationCommand);
    const replay = await useCase.execute(testRegistrationCommand);

    expect(first.disposition).toBe("CREATED");
    expect(replay.disposition).toBe("REPLAYED");
    expect(replay.registration).toEqual(first.registration);
    expect(repository.listOutboxEvents()).toHaveLength(1);
    expect(repository.listAuditRecords()).toHaveLength(1);
  });

  it("replays before consulting clocks or ID generators", async () => {
    const repository = new InMemoryRegistryRepository();
    const first = await testRegisterPassenger(repository).execute(
      testRegistrationCommand,
    );
    const fail = () => {
      throw new Error("generator_must_not_run_on_replay");
    };
    const replayUseCase = new RegisterPassenger(repository, {
      clock: { now: fail },
      ids: {
        passengerId: fail,
        passengerNo: fail,
        publicProfileId: fail,
        eventId: fail,
      },
    });

    await expect(
      replayUseCase.execute(testRegistrationCommand),
    ).resolves.toEqual({
      disposition: "REPLAYED",
      registration: first.registration,
    });
  });

  it("rejects reuse of a command ID with different content", async () => {
    const repository = new InMemoryRegistryRepository();
    const useCase = testRegisterPassenger(repository);
    await useCase.execute(testRegistrationCommand);

    await expect(
      useCase.execute({
        ...testRegistrationCommand,
        displayName: "Different Passenger",
      }),
    ).rejects.toMatchObject({
      code: "IDEMPOTENCY_MISMATCH",
    });
  });

  it("keeps migration aliases globally unique", async () => {
    const repository = new InMemoryRegistryRepository();
    await testImportPassenger(repository).execute(testImportCommand);
    const otherIds: RegistryIdGenerator = {
      passengerId: () => `psg_${"2".repeat(32)}`,
      passengerNo: () => "P-000002",
      publicProfileId: () => "pp_0000000002",
      eventId: () => `evt_${"b".repeat(32)}`,
    };

    await expect(
      testImportPassenger(repository, otherIds).execute({
        ...testImportCommand,
        context: {
          ...testImportCommand.context,
          commandId: "command-import-synthetic-2",
        },
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
  });

  it("rejects an import command without a trusted migration actor", async () => {
    const repository = new InMemoryRegistryRepository();

    await expect(
      testImportPassenger(repository).execute({
        ...testImportCommand,
        context: {
          ...testImportCommand.context,
          actor: { type: "OPERATOR", id: "synthetic-operator" },
        },
      }),
    ).rejects.toThrow("import_requires_migration_actor");
  });

  it("imports an incomplete Legacy profile without fabricating a name", async () => {
    const repository = new InMemoryRegistryRepository();
    const result = await testImportPassenger(repository).execute({
      ...testImportCommand,
      displayName: undefined,
      provisionalDisplayName: undefined,
    });

    expect(result.registration.publicProfile.displayName).toBeUndefined();
    expect(
      result.registration.publicProfile.provisionalDisplayName,
    ).toBeUndefined();
    expect(result.registration.publication.lifecycle).toBe("DRAFT");
  });

  it("preserves migration alias provenance and source timestamps exactly", async () => {
    const repository = new InMemoryRegistryRepository();
    const result =
      await testImportPassenger(repository).execute(testImportCommand);

    expect(result.registration.passenger.migrationAliases).toEqual(
      testImportCommand.migrationAliases,
    );
    await expect(
      testImportPassenger(new InMemoryRegistryRepository()).execute({
        ...testImportCommand,
        migrationAliases: [
          {
            ...testImportCommand.migrationAliases[0]!,
            value: " synthetic-import-1 ",
          },
        ],
      }),
    ).rejects.toThrow("identifier_must_not_have_boundary_whitespace");
    const { sourceRevision: _sourceRevision, ...withoutSourceRevision } =
      testImportCommand.migrationAliases[0]!;
    expect(_sourceRevision).toBeDefined();
    await expect(
      testImportPassenger(new InMemoryRegistryRepository()).execute({
        ...testImportCommand,
        migrationAliases: [withoutSourceRevision],
      } as typeof testImportCommand),
    ).rejects.toThrow();
  });

  it("does not expose migration-only IDs on the operator command", async () => {
    const repository = new InMemoryRegistryRepository();

    await expect(
      testRegisterPassenger(repository).execute({
        ...testRegistrationCommand,
        passengerNo: TEST_PASSENGER_NO,
      } as typeof testRegistrationCommand),
    ).rejects.toThrow();
  });

  it("rejects an outbox event ID collision without a partial commit", async () => {
    const repository = new InMemoryRegistryRepository();
    await testRegisterPassenger(repository).execute(testRegistrationCommand);
    const collidingIds: RegistryIdGenerator = {
      passengerId: () => `psg_${"2".repeat(32)}`,
      passengerNo: () => "P-000002",
      publicProfileId: () => "pp_0000000002",
      eventId: testIds.eventId,
    };

    await expect(
      testRegisterPassenger(repository, collidingIds).execute({
        ...testRegistrationCommand,
        context: {
          ...testRegistrationCommand.context,
          commandId: "command-register-synthetic-2",
        },
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect(
      await repository.getPassengerById(collidingIds.passengerId()),
    ).toBeNull();
    expect(repository.listOutboxEvents()).toHaveLength(1);
    expect(repository.listAuditRecords()).toHaveLength(1);
  });
});

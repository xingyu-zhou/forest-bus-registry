import { describe, expect, it } from "vitest";

import { GetPassengerReference } from "../../src/application/get-passenger-reference.js";
import { RecordCommerceReference } from "../../src/application/record-commerce-reference.js";
import { InMemoryRegistryRepository } from "../../src/adapters/memory/in-memory-registry-repository.js";
import {
  TEST_NOW,
  TEST_PASSENGER_ID,
  testClock,
  testRegisterPassenger,
  testRegistrationCommand,
} from "../helpers/registration.js";

describe("Legacy Commerce boundary", () => {
  it("returns only a stable identity reference", async () => {
    const repository = new InMemoryRegistryRepository();
    await testRegisterPassenger(repository).execute(testRegistrationCommand);

    const reference = await new GetPassengerReference(repository).execute(
      TEST_PASSENGER_ID,
    );

    expect(reference).toEqual({
      passengerId: TEST_PASSENGER_ID,
      passengerNo: "P-000001",
      publicProfileId: "pp_0000000001",
      revision: 1,
    });
    expect(reference).not.toHaveProperty("price");
    expect(reference).not.toHaveProperty("order");
    expect(reference).not.toHaveProperty("payment");
  });

  it("deduplicates a minimal Commerce receipt without mutating Passenger", async () => {
    const repository = new InMemoryRegistryRepository();
    await testRegisterPassenger(repository).execute(testRegistrationCommand);
    const before = await repository.getPassengerById(TEST_PASSENGER_ID);
    const recorder = new RecordCommerceReference(repository, testClock);
    const event = {
      eventId: "commerce-event-synthetic-1",
      eventType: "forest-bus.commerce.passenger-reference-recorded.v1",
      schemaVersion: 1,
      occurredAt: TEST_NOW,
      correlationId: "correlation-synthetic-commerce-1",
      causationId: "synthetic-commerce-command-1",
      producer: "forest-bus-legacy",
      data: {
        passengerId: TEST_PASSENGER_ID,
        referenceType: "ORDER_LINE",
        referenceId: "opaque-commerce-reference-1",
      },
    } as const;

    const first = await recorder.execute(event);
    const replay = await recorder.execute(event);
    const replayWithoutClock = await new RecordCommerceReference(repository, {
      now: () => {
        throw new Error("clock_must_not_run_on_replay");
      },
    }).execute(event);

    expect(first.disposition).toBe("RECORDED");
    expect(replay.disposition).toBe("REPLAYED");
    expect(replayWithoutClock.disposition).toBe("REPLAYED");
    expect(repository.listCommerceReferenceReceipts()).toHaveLength(1);
    expect(await repository.getPassengerById(TEST_PASSENGER_ID)).toEqual(
      before,
    );
  });

  it("rejects a reference to a Passenger that Registry does not know", async () => {
    const repository = new InMemoryRegistryRepository();
    const recorder = new RecordCommerceReference(repository, testClock);

    await expect(
      recorder.execute({
        eventId: "commerce-event-unknown-passenger",
        eventType: "forest-bus.commerce.passenger-reference-recorded.v1",
        schemaVersion: 1,
        occurredAt: TEST_NOW,
        correlationId: "correlation-unknown-passenger",
        causationId: "causation-unknown-passenger",
        producer: "forest-bus-legacy",
        data: {
          passengerId: TEST_PASSENGER_ID,
          referenceType: "OFFLINE_SALE",
          referenceId: "opaque-commerce-reference-unknown",
        },
      }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("checks idempotency before resolving a changed Passenger reference", async () => {
    const repository = new InMemoryRegistryRepository();
    await testRegisterPassenger(repository).execute(testRegistrationCommand);
    const recorder = new RecordCommerceReference(repository, testClock);
    const event = {
      eventId: "commerce-event-reused-1",
      eventType: "forest-bus.commerce.passenger-reference-recorded.v1",
      schemaVersion: 1,
      occurredAt: TEST_NOW,
      correlationId: "correlation-reused-1",
      causationId: "causation-reused-1",
      producer: "forest-bus-legacy",
      data: {
        passengerId: TEST_PASSENGER_ID,
        referenceType: "ORDER_LINE",
        referenceId: "opaque-commerce-reference-reused",
      },
    } as const;
    await recorder.execute(event);

    await expect(
      recorder.execute({
        ...event,
        data: {
          ...event.data,
          passengerId: `psg_${"2".repeat(32)}`,
        },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
  });

  it("claims an unknown event ID so its payload cannot later be changed", async () => {
    const repository = new InMemoryRegistryRepository();
    const recorder = new RecordCommerceReference(repository, testClock);
    const event = {
      eventId: "commerce-event-pending-1",
      eventType: "forest-bus.commerce.passenger-reference-recorded.v1",
      schemaVersion: 1,
      occurredAt: TEST_NOW,
      correlationId: "correlation-pending-1",
      causationId: "causation-pending-1",
      producer: "forest-bus-legacy",
      data: {
        passengerId: TEST_PASSENGER_ID,
        referenceType: "ORDER_LINE",
        referenceId: "opaque-reference-original",
      },
    } as const;
    await expect(recorder.execute(event)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await testRegisterPassenger(repository).execute(testRegistrationCommand);

    await expect(
      recorder.execute({
        ...event,
        data: { ...event.data, referenceId: "opaque-reference-changed" },
      }),
    ).rejects.toMatchObject({ code: "IDEMPOTENCY_MISMATCH" });
    await expect(recorder.execute(event)).resolves.toMatchObject({
      disposition: "RECORDED",
    });
  });
});

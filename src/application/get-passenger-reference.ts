import { PassengerIdSchema } from "../modules/passenger/model.js";
import { RegistryApplicationError } from "./errors.js";
import type { RegistryRepository } from "./ports/registry-repository.js";

export type PassengerReference = Readonly<{
  passengerId: string;
  passengerNo: string;
  publicProfileId: string;
  revision: number;
}>;

export class GetPassengerReference {
  readonly #repository: RegistryRepository;

  constructor(repository: RegistryRepository) {
    this.#repository = repository;
  }

  async execute(passengerIdInput: string): Promise<PassengerReference> {
    const passengerId = PassengerIdSchema.parse(passengerIdInput);
    const [passenger, profile] = await Promise.all([
      this.#repository.getPassengerById(passengerId),
      this.#repository.getPublicProfileByPassengerId(passengerId),
    ]);
    if (passenger === null || profile === null) {
      throw new RegistryApplicationError("NOT_FOUND", "Passenger not found");
    }
    if (profile.passengerId !== passenger.passengerId) {
      throw new RegistryApplicationError(
        "PROJECTION_INVARIANT",
        "Passenger reference projection is inconsistent",
      );
    }
    return {
      passengerId: passenger.passengerId,
      passengerNo: passenger.passengerNo,
      publicProfileId: profile.publicProfileId,
      revision: passenger.revision,
    };
  }
}

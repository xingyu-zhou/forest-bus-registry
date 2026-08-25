import { describe, expect, it } from "vitest";

import { buildPublicProfileProjection } from "../../src/application/get-public-profile.js";
import {
  buildPublicPassengerImage,
  PassengerImageSchema,
} from "../../src/modules/media/model.js";
import { PassengerPublicProfileSchema } from "../../src/modules/public-profile/model.js";
import { PassengerPublicationSchema } from "../../src/modules/publication/model.js";
import {
  TEST_NOW,
  TEST_PASSENGER_ID,
  TEST_PUBLIC_PROFILE_ID,
} from "../helpers/registration.js";

const profile = PassengerPublicProfileSchema.parse({
  passengerId: TEST_PASSENGER_ID,
  publicProfileId: TEST_PUBLIC_PROFILE_ID,
  displayName: "Synthetic Passenger",
  passengerKind: "Synthetic fixture",
  birthDate: "2024-02-29",
  personality: "Public personality",
  favoriteThings: "Private favorite",
  selfIntroduction: "Public introduction",
  revision: 2,
  createdAt: TEST_NOW,
  updatedAt: TEST_NOW,
});

describe("public profile projection", () => {
  it("rejects impossible public birth month/day values", () => {
    expect(() =>
      PassengerPublicProfileSchema.parse({
        ...profile,
        birthDate: "2026-02-29",
      }),
    ).toThrow();
  });

  it("does not disclose a private draft", () => {
    const publication = PassengerPublicationSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
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
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(buildPublicProfileProjection({ profile, publication })).toBeNull();
  });

  it("applies field-level decisions to an active public projection", () => {
    const publication = PassengerPublicationSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      visibility: "PUBLIC",
      lifecycle: "ACTIVE",
      fieldDecisions: {
        passengerKind: "PUBLIC",
        birthDate: "PUBLIC",
        personality: "PUBLIC",
        favoriteThings: "PRIVATE",
        selfIntroduction: "PUBLIC",
        historicalProductName: "PRIVATE",
      },
      revision: 2,
      publishedAt: TEST_NOW,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });

    expect(buildPublicProfileProjection({ profile, publication })).toEqual({
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      displayName: "Synthetic Passenger",
      passengerKind: "Synthetic fixture",
      birthDate: "02-29",
      personality: "Public personality",
      favoriteThings: null,
      selfIntroduction: "Public introduction",
      image: null,
    });
  });

  it("publishes only a ready public derivative owned by the same Passenger", () => {
    const imageId = `img_${"2".repeat(32)}`;
    const publication = PassengerPublicationSchema.parse({
      passengerId: TEST_PASSENGER_ID,
      publicProfileId: TEST_PUBLIC_PROFILE_ID,
      visibility: "PUBLIC",
      lifecycle: "ACTIVE",
      fieldDecisions: {
        passengerKind: "PUBLIC",
        birthDate: "PRIVATE",
        personality: "PRIVATE",
        favoriteThings: "PRIVATE",
        selfIntroduction: "PRIVATE",
        historicalProductName: "PRIVATE",
      },
      primaryImageId: imageId,
      revision: 2,
      publishedAt: TEST_NOW,
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    const image = PassengerImageSchema.parse({
      imageId,
      passengerId: TEST_PASSENGER_ID,
      objectKey: "passengers/synthetic/public-profile.webp",
      contentType: "image/webp",
      byteSize: 1024,
      sha256: "3".repeat(64),
      width: 800,
      height: 800,
      alt: "Synthetic Passenger",
      role: "PUBLIC_PROFILE",
      visibility: "PUBLIC",
      status: "READY",
      createdAt: TEST_NOW,
      updatedAt: TEST_NOW,
    });
    expect(() =>
      buildPublicProfileProjection({ profile, publication }),
    ).toThrow("Published primary image is missing");
    const publicImage = buildPublicPassengerImage(
      image,
      "https://media.forest-bus.com/passengers/synthetic.webp",
    );

    expect(
      buildPublicProfileProjection({ profile, publication, image: publicImage })
        ?.image,
    ).toEqual({
      url: "https://media.forest-bus.com/passengers/synthetic.webp",
      alt: "Synthetic Passenger",
      width: 800,
      height: 800,
    });
    expect(() =>
      buildPublicProfileProjection({
        profile,
        publication,
        image: {
          ...publicImage,
          passengerId: `psg_${"9".repeat(32)}`,
        },
      }),
    ).toThrow("Public image is not the profile primary image");
    expect(() =>
      buildPublicPassengerImage(
        { ...image, role: "ORIGINAL_PRIVATE", visibility: "PRIVATE" },
        "https://media.forest-bus.com/private/original.webp",
      ),
    ).toThrow();
    expect(() =>
      PassengerImageSchema.parse({
        ...image,
        role: "ORIGINAL_PRIVATE",
        visibility: "PUBLIC",
      }),
    ).toThrow("original_image_must_remain_private");
    expect(() =>
      buildPublicPassengerImage(
        image,
        " https://evil.invalid/pixel.webp?token=secret\n",
      ),
    ).toThrow();
  });
});

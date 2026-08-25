import {
  type PublicPassengerImage,
  PublicPassengerImageSchema,
} from "../modules/media/model.js";
import type {
  PassengerPublicProfile,
  PublicProfileProjection,
} from "../modules/public-profile/model.js";
import { PassengerPublicProfileSchema } from "../modules/public-profile/model.js";
import type { PassengerPublication } from "../modules/publication/model.js";
import {
  isPubliclyReadable,
  PassengerPublicationSchema,
} from "../modules/publication/model.js";
import { RegistryApplicationError } from "./errors.js";

function publicField(
  decision: "PUBLIC" | "PRIVATE",
  value: string | undefined,
): string | null {
  return decision === "PUBLIC" ? (value ?? null) : null;
}

export function buildPublicProfileProjection(input: {
  profile: PassengerPublicProfile;
  publication: PassengerPublication;
  image?: PublicPassengerImage;
}): PublicProfileProjection | null {
  const profile = PassengerPublicProfileSchema.parse(input.profile);
  const publication = PassengerPublicationSchema.parse(input.publication);
  const image =
    input.image === undefined
      ? undefined
      : PublicPassengerImageSchema.parse(input.image);
  if (
    profile.passengerId !== publication.passengerId ||
    profile.publicProfileId !== publication.publicProfileId
  ) {
    throw new RegistryApplicationError(
      "PROJECTION_INVARIANT",
      "Profile and publication do not identify the same Passenger",
    );
  }
  if (!isPubliclyReadable(publication)) return null;
  const displayName = profile.displayName ?? profile.provisionalDisplayName;
  if (displayName === undefined) {
    throw new RegistryApplicationError(
      "PROJECTION_INVARIANT",
      "A public Passenger must have a resolved display name",
    );
  }
  if (publication.primaryImageId !== undefined && image === undefined) {
    throw new RegistryApplicationError(
      "PROJECTION_INVARIANT",
      "Published primary image is missing from the projection input",
    );
  }
  if (
    image !== undefined &&
    (publication.primaryImageId !== image.imageId ||
      image.passengerId !== profile.passengerId)
  ) {
    throw new RegistryApplicationError(
      "PROJECTION_INVARIANT",
      "Public image is not the profile primary image",
    );
  }

  return {
    publicProfileId: profile.publicProfileId,
    displayName,
    passengerKind: publicField(
      publication.fieldDecisions.passengerKind,
      profile.passengerKind,
    ),
    birthDate: publicField(
      publication.fieldDecisions.birthDate,
      profile.birthDate?.slice(5),
    ),
    personality: publicField(
      publication.fieldDecisions.personality,
      profile.personality,
    ),
    favoriteThings: publicField(
      publication.fieldDecisions.favoriteThings,
      profile.favoriteThings,
    ),
    selfIntroduction: publicField(
      publication.fieldDecisions.selfIntroduction,
      profile.selfIntroduction,
    ),
    image:
      image === undefined
        ? null
        : {
            url: image.url,
            alt: image.alt,
            width: image.width,
            height: image.height,
          },
  };
}

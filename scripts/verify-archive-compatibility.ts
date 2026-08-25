import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

import { buildSyntheticRegistryArchiveBundleV1 } from "./synthetic-archive-fixture.mjs";

const execFileAsync = promisify(execFile);
const registryRoot = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = resolve(
  process.env.FOREST_BUS_ARCHIVE_DIR ??
    resolve(registryRoot, "../forest-bus-archive"),
);
const lock = JSON.parse(
  await readFile(
    resolve(registryRoot, "contracts/archive/consumer-lock.json"),
    "utf8",
  ),
) as { repository: string; revision: string };
if (lock.repository !== "xingyu-zhou/forest-bus-archive") {
  throw new Error("Archive consumer lock names an unexpected repository");
}

const archiveRevision = (
  await execFileAsync("git", ["-C", archiveRoot, "rev-parse", "HEAD"])
).stdout.trim();
const archiveDirty =
  (
    await execFileAsync("git", ["-C", archiveRoot, "status", "--porcelain"])
  ).stdout.trim().length > 0;
if (
  process.env.FOREST_BUS_ARCHIVE_REVISION !== undefined &&
  process.env.FOREST_BUS_ARCHIVE_REVISION !== lock.revision
) {
  throw new Error(
    "FOREST_BUS_ARCHIVE_REVISION cannot override the committed consumer lock",
  );
}
const expectedArchiveRevision = lock.revision;
if (expectedArchiveRevision !== archiveRevision) {
  throw new Error(
    `Archive revision mismatch: expected ${expectedArchiveRevision}, got ${archiveRevision}`,
  );
}
if (archiveDirty) {
  throw new Error(
    "Archive compatibility checks require a clean consumer worktree",
  );
}

const fixturePath = resolve(
  registryRoot,
  "fixtures/archive/registry-public-bundle-v1.json",
);
const archiveLoaderUrl = pathToFileURL(
  resolve(archiveRoot, "src/archive/load-bundle.ts"),
).href;
const archiveRouteManifestUrl = pathToFileURL(
  resolve(archiveRoot, "src/archive/route-manifest.ts"),
).href;
const archiveImageSanitizerUrl = pathToFileURL(
  resolve(archiveRoot, "src/archive/image-sanitizer.ts"),
).href;
const producerModule: {
  ArchivePublicBundleV1Schema: {
    parse(input: unknown): unknown;
  };
  canonicalArchivePublicBundleV1Json(bundle: unknown): string;
  archivePublicBundleV1Checksum(bundle: unknown): string;
} = await import(
  pathToFileURL(
    resolve(registryRoot, "dist/exports/archive/archive-public-bundle-v1.js"),
  ).href
);

const fixtureInput: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
const registryBundle =
  producerModule.ArchivePublicBundleV1Schema.parse(fixtureInput);
const projectedRegistryBundle = await buildSyntheticRegistryArchiveBundleV1();
const registryCanonical =
  producerModule.canonicalArchivePublicBundleV1Json(registryBundle);
const registryChecksum =
  producerModule.archivePublicBundleV1Checksum(registryBundle);
if (
  producerModule.canonicalArchivePublicBundleV1Json(projectedRegistryBundle) !==
  registryCanonical
) {
  throw new Error(
    "Committed fixture differs from the actual Registry projection output",
  );
}

type ArchiveBundle = Readonly<{
  profiles: readonly Readonly<{
    publicProfileId: string;
    profileImage: Readonly<{
      path: string;
      sha256: string;
      width: number;
      height: number;
    }> | null;
  }>[];
  profileTombstones: readonly Readonly<{ publicProfileId: string }>[];
  nfcBindings: readonly (
    | Readonly<{
        bindingPublicId: string;
        disposition: "ACTIVE";
        publicProfileId: string;
      }>
    | Readonly<{
        bindingPublicId: string;
        disposition: "REPLACED";
      }>
  )[];
}>;
type RoutePhase = "CLOSURE" | "FUTURE_COEXISTENCE";

const archiveModule: {
  loadArchiveBundleSnapshot(source: string): Promise<{
    bundle: ArchiveBundle;
    canonicalJson: string;
    checksum: string;
  }>;
} = await import(archiveLoaderUrl);
const archiveRouteModule: {
  createRouteManifest(bundle: ArchiveBundle): {
    routes: readonly Readonly<{
      path: string;
      kind: string;
      phases: readonly RoutePhase[];
      canonicalPath?: string;
      targetPath?: string;
    }>[];
  };
} = await import(archiveRouteManifestUrl);
const archiveImageModule: {
  verifySanitizedPng(bytes: Uint8Array): Promise<{
    sha256: string;
    width: number;
    height: number;
  }>;
} = await import(archiveImageSanitizerUrl);

const archiveSnapshot =
  await archiveModule.loadArchiveBundleSnapshot(fixturePath);
if (
  archiveSnapshot.canonicalJson !== registryCanonical ||
  archiveSnapshot.checksum !== registryChecksum
) {
  throw new Error("Registry and Archive canonical Bundle results differ");
}

const manifest = archiveRouteModule.createRouteManifest(archiveSnapshot.bundle);
function routeAt(path: string) {
  return manifest.routes.find((route) => route.path === path);
}
const expectedRoutePhases = [
  "CLOSURE",
  "FUTURE_COEXISTENCE",
] as const satisfies readonly RoutePhase[];
function hasExpectedRoutePhases(
  route: { phases: readonly RoutePhase[] } | undefined,
): boolean {
  return (
    route !== undefined &&
    route.phases.length === expectedRoutePhases.length &&
    expectedRoutePhases.every((phase) => route.phases.includes(phase))
  );
}
const passengerPrefixes = ["/p", "/en/p", "/zh-hans/p", "/zh-hant/p"];
for (const profile of archiveSnapshot.bundle.profiles) {
  for (const prefix of passengerPrefixes) {
    const canonicalPath = `${prefix}/${profile.publicProfileId}`;
    const canonical = routeAt(canonicalPath);
    const alias = routeAt(`${canonicalPath}/`);
    if (
      canonical?.kind !== "STATIC_PASSENGER" ||
      !hasExpectedRoutePhases(canonical)
    ) {
      throw new Error("Archive profile route matrix is incomplete");
    }
    if (
      alias?.kind !== "PASSENGER_ALIAS_STATIC" ||
      alias.canonicalPath !== canonicalPath ||
      !hasExpectedRoutePhases(alias)
    ) {
      throw new Error("Archive profile alias route matrix is incomplete");
    }
  }
}
for (const tombstone of archiveSnapshot.bundle.profileTombstones) {
  for (const prefix of passengerPrefixes) {
    const canonicalPath = `${prefix}/${tombstone.publicProfileId}`;
    const canonical = routeAt(canonicalPath);
    const alias = routeAt(`${canonicalPath}/`);
    if (
      canonical?.kind !== "GONE_GENERIC" ||
      !hasExpectedRoutePhases(canonical)
    ) {
      throw new Error("Archive tombstone route matrix is incomplete");
    }
    if (
      alias?.kind !== "PASSENGER_ALIAS_GONE" ||
      alias.canonicalPath !== canonicalPath ||
      !hasExpectedRoutePhases(alias)
    ) {
      throw new Error("Archive tombstone alias route matrix is incomplete");
    }
  }
}

const profileIds = new Set(
  archiveSnapshot.bundle.profiles.map(({ publicProfileId }) => publicProfileId),
);
const tombstoneIds = new Set(
  archiveSnapshot.bundle.profileTombstones.map(
    ({ publicProfileId }) => publicProfileId,
  ),
);
for (const binding of archiveSnapshot.bundle.nfcBindings) {
  const route = routeAt(`/n/${binding.bindingPublicId}`);
  if (binding.disposition === "REPLACED") {
    if (route?.kind !== "GONE_REPLACED_NFC" || !hasExpectedRoutePhases(route)) {
      throw new Error("Archive replaced NFC route is incomplete");
    }
  } else if (profileIds.has(binding.publicProfileId)) {
    if (
      route?.kind !== "NFC_ACTIVE" ||
      route.targetPath !== `/p/${binding.publicProfileId}` ||
      !hasExpectedRoutePhases(route)
    ) {
      throw new Error("Archive active NFC route is incomplete");
    }
  } else if (tombstoneIds.has(binding.publicProfileId)) {
    if (route?.kind !== "GONE_GENERIC" || !hasExpectedRoutePhases(route)) {
      throw new Error("Archive tombstoned NFC route is incomplete");
    }
  } else {
    throw new Error("Synthetic NFC fixture has a dangling target");
  }
}
if (
  routeAt("/p/pp_ZZZZZZZZZZ") !== undefined ||
  routeAt("/n/nfc_ZZZZZZZZZZZZ") !== undefined
) {
  throw new Error(
    "Unknown Archive aliases must remain absent for 404 handling",
  );
}

const publicRoot = resolve(archiveRoot, "public");
let verifiedImageCount = 0;
for (const profile of archiveSnapshot.bundle.profiles) {
  const image = profile.profileImage;
  if (image === null) continue;
  const imagePath = resolve(publicRoot, image.path.replace(/^\/+/, ""));
  if (
    imagePath !== publicRoot &&
    !imagePath.startsWith(`${publicRoot}${sep}`)
  ) {
    throw new Error("Archive image path escapes the public root");
  }
  const verified = await archiveImageModule.verifySanitizedPng(
    await readFile(imagePath),
  );
  if (
    verified.sha256 !== image.sha256 ||
    verified.width !== image.width ||
    verified.height !== image.height
  ) {
    throw new Error("Archive image bytes differ from Bundle metadata");
  }
  verifiedImageCount += 1;
}
if (verifiedImageCount === 0) {
  throw new Error("Archive compatibility fixture must verify an actual image");
}

console.log("archiveCompatibility=passed");
console.log("archiveProjection=passed");
console.log("archiveRouteMatrix=passed");
console.log(`archiveImages=passed count=${verifiedImageCount}`);
console.log(`archiveRevision=${archiveRevision}`);
console.log(`archiveDirty=${archiveDirty}`);
console.log(`checksum=${registryChecksum}`);

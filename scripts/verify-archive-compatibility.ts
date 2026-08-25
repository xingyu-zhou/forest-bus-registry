import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

const registryRoot = resolve(new URL("..", import.meta.url).pathname);
const archiveRoot = resolve(
  process.env.FOREST_BUS_ARCHIVE_DIR ??
    resolve(registryRoot, "../forest-bus-archive"),
);
const archiveRevision = (
  await execFileAsync("git", ["-C", archiveRoot, "rev-parse", "HEAD"])
).stdout.trim();
const archiveDirty =
  (
    await execFileAsync("git", ["-C", archiveRoot, "status", "--porcelain"])
  ).stdout.trim().length > 0;
const expectedArchiveRevision = process.env.FOREST_BUS_ARCHIVE_REVISION;
if (
  expectedArchiveRevision !== undefined &&
  expectedArchiveRevision !== archiveRevision
) {
  throw new Error(
    `Archive revision mismatch: expected ${expectedArchiveRevision}, got ${archiveRevision}`,
  );
}
if (expectedArchiveRevision !== undefined && archiveDirty) {
  throw new Error(
    "Pinned Archive compatibility checks require a clean consumer worktree",
  );
}
const fixturePath = resolve(
  registryRoot,
  "fixtures/archive/registry-public-bundle-v1.json",
);
const archiveLoaderUrl = pathToFileURL(
  resolve(archiveRoot, "src/archive/load-bundle.ts"),
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
const registryCanonical =
  producerModule.canonicalArchivePublicBundleV1Json(registryBundle);
const registryChecksum =
  producerModule.archivePublicBundleV1Checksum(registryBundle);

const archiveModule: {
  loadArchiveBundleSnapshot(
    source: string,
  ): Promise<{ canonicalJson: string; checksum: string }>;
} = await import(archiveLoaderUrl);
const archiveSnapshot =
  await archiveModule.loadArchiveBundleSnapshot(fixturePath);

if (
  archiveSnapshot.canonicalJson !== registryCanonical ||
  archiveSnapshot.checksum !== registryChecksum
) {
  throw new Error("Registry and Archive canonical Bundle results differ");
}

console.log("archiveCompatibility=passed");
console.log(`archiveRevision=${archiveRevision}`);
console.log(`archiveDirty=${archiveDirty}`);
console.log(`checksum=${registryChecksum}`);

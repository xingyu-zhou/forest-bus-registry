import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSyntheticRegistryArchiveBundleV1 } from "./synthetic-archive-fixture.mjs";

const registryRoot = resolve(new URL("..", import.meta.url).pathname);
const producerModule: {
  ArchivePublicBundleV1Schema: {
    parse(input: unknown): unknown;
  };
  canonicalArchivePublicBundleV1Json(bundle: unknown): string;
} = await import(
  pathToFileURL(
    resolve(registryRoot, "dist/exports/archive/archive-public-bundle-v1.js"),
  ).href
);
const fixturePath = resolve(
  registryRoot,
  "fixtures/archive/registry-public-bundle-v1.json",
);
const fixtureInput: unknown = JSON.parse(await readFile(fixturePath, "utf8"));
const committed =
  producerModule.ArchivePublicBundleV1Schema.parse(fixtureInput);
const projected = await buildSyntheticRegistryArchiveBundleV1();

if (
  producerModule.canonicalArchivePublicBundleV1Json(committed) !==
  producerModule.canonicalArchivePublicBundleV1Json(projected)
) {
  throw new Error(
    "Committed Archive fixture drifted from the Registry projection output",
  );
}

console.log("archiveProjectionFixture=passed");

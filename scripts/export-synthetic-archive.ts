import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

import { buildSyntheticRegistryArchiveBundleV1 } from "./synthetic-archive-fixture.mjs";

const registryRoot = resolve(new URL("..", import.meta.url).pathname);
const producerModule: {
  canonicalArchivePublicBundleV1Json(bundle: unknown): string;
} = await import(
  pathToFileURL(
    resolve(registryRoot, "dist/exports/archive/archive-public-bundle-v1.js"),
  ).href
);

const bundle = await buildSyntheticRegistryArchiveBundleV1();

process.stdout.write(producerModule.canonicalArchivePublicBundleV1Json(bundle));

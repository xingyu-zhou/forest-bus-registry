import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

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

const fixtureUrl = new URL(
  "../fixtures/archive/registry-public-bundle-v1.json",
  import.meta.url,
);
const input: unknown = JSON.parse(await readFile(fixtureUrl, "utf8"));
const bundle = producerModule.ArchivePublicBundleV1Schema.parse(input);

process.stdout.write(producerModule.canonicalArchivePublicBundleV1Json(bundle));

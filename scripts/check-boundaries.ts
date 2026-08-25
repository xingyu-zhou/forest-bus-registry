import { readdir, readFile } from "node:fs/promises";
import { extname, relative, resolve, sep } from "node:path";

import {
  extractImportSpecifiers,
  findForbiddenCommerceModule,
} from "./boundary-rules.mjs";

const repositoryRoot = resolve(new URL("..", import.meta.url).pathname);
const sourceRoot = resolve(repositoryRoot, "src");

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const path = resolve(directory, entry.name);
      return entry.isDirectory() ? listFiles(path) : [path];
    }),
  );
  return nested.flat();
}

const sourceFiles = (await listFiles(sourceRoot)).filter((path) =>
  [".ts", ".tsx", ".mts", ".cts"].includes(extname(path)),
);
const failures: string[] = [];

for (const path of sourceFiles) {
  const source = await readFile(path, "utf8");
  const localPath = relative(sourceRoot, path).split(sep).join("/");
  for (const specifier of extractImportSpecifiers(source)) {
    if (
      localPath.startsWith("modules/") &&
      (/application|adapters|interfaces|exports/.test(specifier) ||
        /forest-bus-(?:legacy|vnext|archive)/.test(specifier))
    ) {
      failures.push(`${localPath}: domain module imports ${specifier}`);
    }
    if (
      localPath.startsWith("application/") &&
      /adapters|interfaces/.test(specifier)
    ) {
      failures.push(`${localPath}: application imports ${specifier}`);
    }
    if (/forest-bus-(?:legacy|vnext|archive)/.test(specifier)) {
      failures.push(`${localPath}: imports a sibling runtime package`);
    }
  }
}

const packageJson = JSON.parse(
  await readFile(resolve(repositoryRoot, "package.json"), "utf8"),
) as { dependencies?: Record<string, string> };
const runtimeDependencies = Object.keys(packageJson.dependencies ?? {});
const forbiddenRuntimeDependencies = runtimeDependencies.filter((name) =>
  /(?:stripe|aws-sdk|sst|electrodb|forest-bus)/i.test(name),
);
for (const name of forbiddenRuntimeDependencies) {
  failures.push(`package.json: forbidden runtime boundary dependency ${name}`);
}

for (const path of sourceFiles) {
  const forbidden = findForbiddenCommerceModule(relative(sourceRoot, path));
  if (forbidden !== undefined) {
    failures.push(
      `${relative(repositoryRoot, path)}: forbidden module ${forbidden}`,
    );
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exitCode = 1;
} else {
  console.log(`architecture=passed files=${sourceFiles.length}`);
}

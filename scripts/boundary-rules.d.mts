export const forbiddenCommerceModuleNames: ReadonlySet<string>;
export function extractImportSpecifiers(source: string): readonly string[];
export function findForbiddenCommerceModule(
  sourceRelativePath: string,
): string | undefined;

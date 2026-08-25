export const forbiddenCommerceModuleNames = new Set([
  "cart",
  "checkout",
  "inventory",
  "order",
  "payment",
  "price",
  "pricing",
  "product",
  "shipping",
  "sku",
]);

export function extractImportSpecifiers(source) {
  const specifiers = [];
  const patterns = [
    /(?:from\s+|import\s*)["']([^"']+)["']/g,
    /import\s*\(\s*["']([^"']+)["']\s*\)/g,
    /require\s*\(\s*["']([^"']+)["']\s*\)/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      if (match[1] !== undefined) specifiers.push(match[1]);
    }
  }
  return specifiers;
}

export function findForbiddenCommerceModule(sourceRelativePath) {
  return sourceRelativePath.split(/[\\/]/).find((segment) => {
    const basename = segment.replace(/\.[^.]+$/, "").toLowerCase();
    return basename
      .split(/[^a-z0-9]+/)
      .some((part) => forbiddenCommerceModuleNames.has(part));
  });
}

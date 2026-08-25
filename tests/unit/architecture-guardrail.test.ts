import { describe, expect, it } from "vitest";

import {
  extractImportSpecifiers,
  findForbiddenCommerceModule,
} from "../../scripts/boundary-rules.mjs";

describe("architecture guardrail rules", () => {
  it.each([
    "modules/order.ts",
    "modules/product/index.ts",
    "adapters/payment.ts",
    "modules/inventory.ts",
    "modules/pricing.tsx",
    "modules/checkout.mts",
    "modules/sku.cts",
    "modules/order-service.ts",
    "modules/passenger-pricing.tsx",
  ])("detects forbidden Commerce modules including filenames: %s", (path) => {
    expect(findForbiddenCommerceModule(path)).toBeDefined();
  });

  it("checks both static and dynamic sibling imports", () => {
    expect(
      extractImportSpecifiers(`
        import type { Passenger } from "forest-bus-legacy";
        const consumer = await import("forest-bus-vnext/runtime");
        const archive = require("forest-bus-archive/runtime");
      `),
    ).toEqual([
      "forest-bus-legacy",
      "forest-bus-vnext/runtime",
      "forest-bus-archive/runtime",
    ]);
  });
});

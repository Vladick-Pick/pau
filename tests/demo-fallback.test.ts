import { describe, expect, it } from "vitest";

import { shouldUseDemoWorkspaceFallback } from "../src/lib/pau/demo-fallback";

describe("PAU demo fallback policy", () => {
  it("does not mask workspace loading errors in production", () => {
    expect(shouldUseDemoWorkspaceFallback("production")).toBe(false);
  });

  it("keeps demo fallback available for local development", () => {
    expect(shouldUseDemoWorkspaceFallback("development")).toBe(true);
    expect(shouldUseDemoWorkspaceFallback("test")).toBe(true);
  });
});

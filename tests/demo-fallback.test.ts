import { describe, expect, it } from "vitest";

import { shouldUseDemoWorkspaceFallback } from "../src/lib/pau/demo-fallback";

describe("PAU demo fallback policy", () => {
  it("does not mask workspace loading errors in production", () => {
    expect(shouldUseDemoWorkspaceFallback("production", false)).toBe(false);
    expect(shouldUseDemoWorkspaceFallback("production", true)).toBe(false);
  });

  it("keeps demo fallback available only when no real database is configured", () => {
    expect(shouldUseDemoWorkspaceFallback("development", false)).toBe(true);
    expect(shouldUseDemoWorkspaceFallback("test", false)).toBe(true);
    expect(shouldUseDemoWorkspaceFallback("development", true)).toBe(false);
    expect(shouldUseDemoWorkspaceFallback("test", true)).toBe(false);
  });
});

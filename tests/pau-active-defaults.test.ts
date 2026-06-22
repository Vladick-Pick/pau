import { describe, expect, it } from "vitest";

import { DEFAULT_ACTIVE_RULES } from "@/lib/pau/active-defaults";

describe("DEFAULT_ACTIVE_RULES", () => {
  it("contains exactly 5 rules", () => {
    expect(DEFAULT_ACTIVE_RULES).toHaveLength(5);
  });

  it("has the correct keys and types", () => {
    const byKey = Object.fromEntries(DEFAULT_ACTIVE_RULES.map((r) => [r.key, r]));

    expect(byKey["tenure"].type).toBe("MIN_YEAR");
    expect(byKey["retention"].type).toBe("MIN_PERCENT");
    expect(byKey["attendance"].type).toBe("MIN_PERCENT");
    expect(byKey["payment"].type).toBe("PHASE");
    expect(byKey["activity"].type).toBe("HAS_ROLE");
  });

  it("has correct configs", () => {
    const byKey = Object.fromEntries(DEFAULT_ACTIVE_RULES.map((r) => [r.key, r]));

    expect(byKey["tenure"].config).toEqual({ min: 2 });
    expect(byKey["retention"].config).toEqual({ min: 70 });
    expect(byKey["retention"].factKey).toBe("retention");
    expect(byKey["attendance"].config).toEqual({ min: 70 });
    expect(byKey["attendance"].factKey).toBe("attendance");
    expect(byKey["payment"].config).toEqual({ pass: ["mid"] });
    expect(byKey["activity"].config).toEqual({});
  });

  it("activity rule is disabled and optional", () => {
    const activity = DEFAULT_ACTIVE_RULES.find((r) => r.key === "activity");

    expect(activity?.enabled).toBe(false);
    expect(activity?.optional).toBe(true);
  });

  it("retention and attendance are disabled until the API materializes those facts", () => {
    const byKey = Object.fromEntries(DEFAULT_ACTIVE_RULES.map((r) => [r.key, r]));

    expect(byKey["retention"].enabled).toBe(false);
    expect(byKey["attendance"].enabled).toBe(false);
    // tenure + payment ARE computable from real data, so they stay on.
    expect(byKey["tenure"].enabled).toBe(true);
    expect(byKey["payment"].enabled).toBe(true);
  });

  it("has no rule with key 'business'", () => {
    const keys = DEFAULT_ACTIVE_RULES.map((r) => r.key);

    expect(keys).not.toContain("business");
  });
});

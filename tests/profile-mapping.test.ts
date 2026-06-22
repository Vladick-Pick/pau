import { describe, it, expect } from "vitest";
import { parseLooseDate } from "@/lib/profile/mapping";

describe("parseLooseDate", () => {
  it("parses non-ISO 'YYYY-MM-DD HH:MM:SS' as UTC", () => {
    expect(parseLooseDate("2026-06-22 09:45:09")?.getUTCFullYear()).toBe(2026);
  });
  it("parses ISO with offset", () => {
    expect(parseLooseDate("2026-12-17T03:00:00+03:00")?.getUTCFullYear()).toBe(2026);
  });
  it("returns null for empty/garbage/non-string", () => {
    expect(parseLooseDate(null)).toBeNull();
    expect(parseLooseDate("")).toBeNull();
    expect(parseLooseDate("not a date")).toBeNull();
    expect(parseLooseDate(123 as unknown)).toBeNull();
  });
});

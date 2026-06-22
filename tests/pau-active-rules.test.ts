import { describe, expect, it } from "vitest";

import {
  evaluateActive,
  type ActiveRuleInput,
} from "@/lib/pau/active-rules";
import type { ProfileFacts } from "@/lib/profile/types";

const BASE_FACTS: ProfileFacts = {
  tenureYear: 3,
  retention: 80,
  attendance: 75,
  paymentPhase: "mid",
  businessBand: 2,
};

const RULES_ALL_TYPES: ActiveRuleInput[] = [
  {
    key: "tenure",
    label: "Стаж",
    type: "MIN_YEAR",
    config: { min: 2 },
    enabled: true,
  },
  {
    key: "retention",
    label: "Retention",
    type: "MIN_PERCENT",
    factKey: "retention",
    config: { min: 70 },
    enabled: true,
  },
  {
    key: "attendance",
    label: "Доходимость",
    type: "MIN_PERCENT",
    factKey: "attendance",
    config: { min: 70 },
    enabled: true,
  },
  {
    key: "payment",
    label: "Платёжный год",
    type: "PHASE",
    config: { pass: ["mid"] },
    enabled: true,
  },
  {
    key: "activity",
    label: "Клубная активность",
    type: "HAS_ROLE",
    config: {},
    enabled: true,
  },
];

describe("evaluateActive", () => {
  it("passes all rules when all facts satisfy conditions", () => {
    const result = evaluateActive(RULES_ALL_TYPES, BASE_FACTS, {
      hasRole: true,
    });

    expect(result.passed).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.total).toBe(5);
  });

  it("puts MIN_PERCENT rule with null fact in missing, not failed, and passed=false", () => {
    const facts: ProfileFacts = { ...BASE_FACTS, retention: null };
    const rules: ActiveRuleInput[] = [
      {
        key: "retention",
        label: "Retention",
        type: "MIN_PERCENT",
        factKey: "retention",
        config: { min: 70 },
        enabled: true,
      },
    ];

    const result = evaluateActive(rules, facts, { hasRole: false });

    expect(result.missing).toHaveLength(1);
    expect(result.missing[0].key).toBe("retention");
    expect(result.failed).toHaveLength(0);
    expect(result.passed).toBe(false);
    expect(result.total).toBe(1);
  });

  it("puts MIN_YEAR rule below threshold in failed", () => {
    const facts: ProfileFacts = { ...BASE_FACTS, tenureYear: 1 };
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: { min: 2 },
        enabled: true,
      },
    ];

    const result = evaluateActive(rules, facts, { hasRole: false });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].key).toBe("tenure");
    expect(result.missing).toHaveLength(0);
    expect(result.passed).toBe(false);
    expect(result.total).toBe(1);
  });

  it("ignores disabled rules — they do not appear in total, failed, or missing", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: { min: 2 },
        enabled: false, // disabled
      },
      {
        key: "retention",
        label: "Retention",
        type: "MIN_PERCENT",
        factKey: "retention",
        config: { min: 70 },
        enabled: true,
      },
    ];
    const facts: ProfileFacts = { ...BASE_FACTS, tenureYear: 0, retention: 80 };

    const result = evaluateActive(rules, facts, { hasRole: false });

    expect(result.total).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("fails HAS_ROLE when ctx.hasRole is false", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "activity",
        label: "Активность",
        type: "HAS_ROLE",
        config: {},
        enabled: true,
      },
    ];

    const result = evaluateActive(rules, BASE_FACTS, { hasRole: false });

    expect(result.failed).toHaveLength(1);
    expect(result.failed[0].key).toBe("activity");
    expect(result.passed).toBe(false);
    expect(result.total).toBe(1);
  });

  it("passes PHASE rule when paymentPhase is in config.pass", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "payment",
        label: "Платёжный год",
        type: "PHASE",
        config: { pass: ["mid", "end"] },
        enabled: true,
      },
    ];
    const facts: ProfileFacts = { ...BASE_FACTS, paymentPhase: "mid" };

    const result = evaluateActive(rules, facts, { hasRole: false });

    expect(result.passed).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.total).toBe(1);
  });

  it("zero enabled rules ⇒ passed is false (no rules cannot mean 'active')", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: { min: 2 },
        enabled: false,
      },
    ];

    const result = evaluateActive(rules, BASE_FACTS, { hasRole: true });

    expect(result.total).toBe(0);
    expect(result.passed).toBe(false);
    expect(result.failed).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
  });

  it("an optional rule that fails does NOT block passed", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: { min: 2 },
        enabled: true,
      },
      {
        key: "activity",
        label: "Активность",
        type: "HAS_ROLE",
        config: {},
        enabled: true,
        optional: true,
      },
    ];
    // tenure passes (3 ≥ 2); optional HAS_ROLE fails (no role) but must not block.
    const result = evaluateActive(rules, BASE_FACTS, { hasRole: false });

    expect(result.passed).toBe(true);
    expect(result.failed.map((r) => r.key)).toContain("activity");
    expect(result.total).toBe(2);
  });

  it("an optional rule whose fact is missing does NOT block passed", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: { min: 2 },
        enabled: true,
      },
      {
        key: "retention",
        label: "Retention",
        type: "MIN_PERCENT",
        factKey: "retention",
        config: { min: 70 },
        enabled: true,
        optional: true,
      },
    ];
    const facts: ProfileFacts = { ...BASE_FACTS, retention: null };

    const result = evaluateActive(rules, facts, { hasRole: false });

    expect(result.passed).toBe(true);
    expect(result.missing.map((r) => r.key)).toContain("retention");
    expect(result.total).toBe(2);
  });

  it("MIN_YEAR with config:{} (NaN min) does NOT block — misconfig must not lock out", () => {
    const rules: ActiveRuleInput[] = [
      {
        key: "tenure",
        label: "Стаж",
        type: "MIN_YEAR",
        config: {}, // no min → Number(undefined) is NaN
        enabled: true,
      },
    ];
    // tenureYear is present (3); with a non-finite threshold the predicate is treated as ok.
    const result = evaluateActive(rules, BASE_FACTS, { hasRole: false });

    expect(result.passed).toBe(true);
    expect(result.failed).toHaveLength(0);
    expect(result.missing).toHaveLength(0);
    expect(result.total).toBe(1);
  });
});

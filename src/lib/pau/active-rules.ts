import type { ProfileFacts } from "@/lib/profile/types";

export interface ActiveRuleInput {
  key: string;
  label: string;
  type: "MIN_YEAR" | "MIN_PERCENT" | "PHASE" | "MIN_BAND" | "HAS_ROLE";
  factKey?: string | null; // for MIN_PERCENT: "retention" | "attendance"
  config: Record<string, unknown>; // {min:number} | {pass:string[]} | {}
  enabled: boolean;
  optional?: boolean;
}

export interface EvaluationContext {
  hasRole: boolean;
}

export interface ActiveEvaluation {
  passed: boolean;
  failed: ActiveRuleInput[]; // enabled rules whose fact is present but fails
  missing: ActiveRuleInput[]; // enabled rules whose fact is absent -> «нужны факты»
  total: number; // count of enabled rules
}

function evaluateRule(
  rule: ActiveRuleInput,
  facts: ProfileFacts,
  ctx: EvaluationContext
): { has: boolean; ok: boolean } {
  switch (rule.type) {
    case "MIN_YEAR": {
      const has = facts.tenureYear != null;
      const min = Number(rule.config.min);
      // A misconfigured threshold (NaN/Infinity) must not silently lock everyone out.
      const ok = has && (!Number.isFinite(min) || facts.tenureYear! >= min);
      return { has, ok };
    }
    case "MIN_PERCENT": {
      const value =
        facts[rule.factKey as "retention" | "attendance"] ?? null;
      const has = value != null;
      const min = Number(rule.config.min);
      const ok = has && (!Number.isFinite(min) || value! >= min);
      return { has, ok };
    }
    case "PHASE": {
      const has = facts.paymentPhase != null;
      const ok =
        has &&
        Array.isArray(rule.config.pass) &&
        (rule.config.pass as string[]).includes(facts.paymentPhase!);
      return { has, ok };
    }
    case "MIN_BAND": {
      const has = facts.businessBand != null;
      const min = Number(rule.config.min);
      const ok = has && (!Number.isFinite(min) || facts.businessBand! >= min);
      return { has, ok };
    }
    case "HAS_ROLE": {
      return { has: true, ok: ctx.hasRole };
    }
  }
}

export function evaluateActive(
  rules: ActiveRuleInput[],
  facts: ProfileFacts,
  ctx: EvaluationContext
): ActiveEvaluation {
  const enabledRules = rules.filter((r) => r.enabled);
  const failed: ActiveRuleInput[] = [];
  const missing: ActiveRuleInput[] = [];

  for (const rule of enabledRules) {
    const { has, ok } = evaluateRule(rule, facts, ctx);
    if (!has) {
      missing.push(rule);
    } else if (!ok) {
      failed.push(rule);
    }
  }

  const total = enabledRules.length;
  // Optional rules that fail or are missing do not block active status.
  const blocking = (arr: ActiveRuleInput[]) => arr.filter((r) => !r.optional);
  const passed =
    total > 0 &&
    blocking(failed).length === 0 &&
    blocking(missing).length === 0;

  return {
    passed,
    failed,
    missing,
    total,
  };
}

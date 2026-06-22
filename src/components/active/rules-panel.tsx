"use client";

import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type { ClubRule } from "./types";

type Props = {
  canManage: boolean;
  clubId: string | null;
  rules: ClubRule[];
  onToggle: (ruleId: string, enabled: boolean) => Promise<void>;
};

function ruleDescription(rule: ClubRule): string {
  if (rule.type === "MIN_YEAR") {
    const min = rule.config["min"];
    return `Стаж от ${String(min)}-го года`;
  }
  if (rule.type === "MIN_PERCENT") {
    const min = rule.config["min"];
    return `${rule.factKey === "retention" ? "Retention" : "Доходимость"} >= ${String(min)}%`;
  }
  if (rule.type === "PHASE") {
    const pass = rule.config["pass"];
    const phases = Array.isArray(pass) ? pass : [pass];
    const labels: Record<string, string> = {
      start: "начало",
      mid: "середина",
      end: "конец",
    };
    return `Платежный период: ${phases.map((p) => labels[String(p)] ?? String(p)).join(", ")}`;
  }
  if (rule.type === "MIN_BAND") {
    const min = rule.config["min"];
    return `Бизнес-бэнд >= ${String(min)}`;
  }
  if (rule.type === "HAS_ROLE") {
    return "Назначена хотя бы одна роль";
  }
  return rule.label;
}

export function RulesPanel({ canManage, clubId, rules, onToggle }: Props) {
  const [pending, setPending] = useState<string | null>(null);

  async function toggle(rule: ClubRule) {
    if (!canManage || !clubId || pending) return;
    setPending(rule.id);
    try {
      await onToggle(rule.id, !rule.enabled);
    } finally {
      setPending(null);
    }
  }

  if (!clubId) {
    return (
      <div className="rounded-xl border bg-muted/40 p-4">
        <p className="text-sm text-muted-foreground">Выберите клуб</p>
      </div>
    );
  }

  if (rules.length === 0) {
    return (
      <div className="rounded-xl border bg-muted/40 p-4">
        <div className="grid gap-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-16 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-muted/30 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Правила активного участника</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            Активный участник выводится из этих правил. Включи или выключи правило,
            и список пересчитается.
          </p>
        </div>
        <Badge variant="outline" className="shrink-0 text-[11px]">
          из профиля
        </Badge>
      </div>

      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        {rules.map((rule) => (
          <div
            key={rule.id}
            className={cn(
              "grid gap-2 rounded-lg border bg-card p-2.5 transition-opacity",
              !rule.enabled && "opacity-50"
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold">{rule.label}</span>
              {canManage ? (
                <button
                  aria-label={rule.enabled ? "Выключить правило" : "Включить правило"}
                  aria-checked={rule.enabled}
                  className={cn(
                    "relative inline-flex h-[19px] w-[34px] shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50",
                    rule.enabled ? "bg-primary" : "bg-foreground/20"
                  )}
                  disabled={pending === rule.id}
                  onClick={() => void toggle(rule)}
                  role="switch"
                  type="button"
                >
                  <span
                    className={cn(
                      "pointer-events-none inline-block size-[15px] rounded-full bg-card shadow-sm transition-transform",
                      rule.enabled ? "translate-x-[15px]" : "translate-x-0"
                    )}
                  />
                </button>
              ) : (
                <Badge variant={rule.enabled ? "secondary" : "outline"}>
                  {rule.enabled ? "вкл" : "выкл"}
                </Badge>
              )}
            </div>
            <p className="text-[11.5px] text-muted-foreground">
              {ruleDescription(rule)}
              {rule.optional ? (
                <span className="ml-1 opacity-70">(дополнительно)</span>
              ) : null}
            </p>
          </div>
        ))}
      </div>
    </div>
  );
}

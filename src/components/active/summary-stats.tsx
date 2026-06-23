"use client";

import { CheckIcon, HelpCircleIcon, SparklesIcon, UsersIcon } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { ActiveParticipantSummary } from "./types";

type Props = {
  participants: ActiveParticipantSummary[];
  loading: boolean;
};

type StatCardProps = {
  label: string;
  value: number | string;
  context?: string;
  icon: React.ReactNode;
  variant?: "default" | "good" | "accent" | "attention";
};

function StatCard({ label, value, context, icon, variant = "default" }: StatCardProps) {
  const iconBg = {
    default: "bg-muted text-muted-foreground",
    good: "bg-[color-mix(in_oklab,var(--chart-2)_16%,var(--card))] text-[color-mix(in_oklab,var(--chart-2)_66%,var(--foreground))]",
    accent: "bg-[color-mix(in_oklab,var(--primary)_14%,var(--card))] text-primary",
    attention:
      "bg-[color-mix(in_oklab,var(--chart-3)_20%,var(--card))] text-[color-mix(in_oklab,var(--chart-3)_58%,var(--foreground))]",
  }[variant];

  return (
    <div className="grid gap-1.5 rounded-xl border bg-card p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">{label}</span>
        <span className={`grid size-[27px] place-items-center rounded-md ${iconBg}`}>
          {icon}
        </span>
      </div>
      <div className="text-2xl font-semibold tabular-nums leading-none tracking-tight">
        {value}
      </div>
      {context && (
        <div className="text-[11.5px] text-muted-foreground">{context}</div>
      )}
    </div>
  );
}

export function SummaryStats({ participants, loading }: Props) {
  if (loading) {
    return (
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-24 rounded-xl" />
        ))}
      </div>
    );
  }

  const total = participants.length;
  const active = participants.filter((p) => p.evaluation.passed).length;
  const readyForGuest = participants.filter((p) =>
    p.readiness.some(
      (r) =>
        r.readiness === "READY" &&
        (r.formatId === "guest-meeting" ||
          r.formatName.toLowerCase().includes("гост"))
    )
  ).length;
  const gaps = participants.filter(
    (p) =>
      p.evaluation.missingKeys.length > 0 || p.evaluation.failedKeys.length > 0
  ).length;

  const activePercent =
    total > 0 ? `${Math.round((active / total) * 100)}% от выборки` : "";

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <StatCard
        label="Размечено"
        value={total}
        context={total === 0 ? "нет данных" : `участников`}
        icon={<UsersIcon className="size-3.5" />}
        variant="accent"
      />
      <StatCard
        label="Активны по правилам"
        value={active}
        context={activePercent}
        icon={<CheckIcon className="size-3.5" />}
        variant="good"
      />
      <StatCard
        label="Готовы к гостевой"
        value={readyForGuest}
        context="формат готов"
        icon={<SparklesIcon className="size-3.5" />}
      />
      <StatCard
        label="Нужны факты"
        value={gaps}
        context="профиль неполный"
        icon={<HelpCircleIcon className="size-3.5" />}
        variant="attention"
      />
    </div>
  );
}

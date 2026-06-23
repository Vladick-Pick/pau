"use client";

import { useMemo } from "react";
import {
  CheckCircle2Icon,
  SearchIcon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import type {
  ActiveParticipantSummary,
  ClubRole,
  SortBy,
  StatusFilter,
} from "./types";
import { getInitials, readinessLabel } from "./utils";

type Props = {
  participants: ActiveParticipantSummary[];
  roles: ClubRole[];
  selectedProfileId: string | null;
  statusFilter: StatusFilter;
  sortBy: SortBy;
  query: string;
  loading: boolean;
  error: string | null;
  onSelect: (profileId: string) => void;
  onStatusFilter: (filter: StatusFilter) => void;
  onSortChange: (sort: SortBy) => void;
  onQueryChange: (q: string) => void;
};

const AVATAR_COLORS = [
  "var(--chart-1)",
  "var(--chart-2)",
  "var(--chart-3)",
  "var(--chart-4)",
  "var(--chart-5)",
];

function avatarColor(profileId: string): string {
  let hash = 0;
  for (let i = 0; i < profileId.length; i++) {
    hash = (hash * 31 + profileId.charCodeAt(i)) >>> 0;
  }
  return AVATAR_COLORS[hash % AVATAR_COLORS.length];
}

function factLineParts(p: ActiveParticipantSummary): string {
  const parts: string[] = [];
  if (p.facts.tenureYear != null) {
    parts.push(`${p.facts.tenureYear}-й год`);
  }
  if (p.facts.retention != null) {
    parts.push(`retention ${p.facts.retention}%`);
  } else {
    parts.push("retention: нужны факты");
  }
  if (p.facts.attendance != null) {
    parts.push(`доходимость ${p.facts.attendance}%`);
  } else {
    parts.push("доходимость: нужны факты");
  }
  return parts.join(" · ");
}

type PipProps = {
  readiness: string;
  label: string;
};

function ReadinessPip({ readiness, label }: PipProps) {
  const dot =
    readiness === "READY"
      ? "bg-[var(--chart-2)]"
      : readiness === "NOT_READY"
        ? "bg-destructive"
        : "border border-[color-mix(in_oklab,var(--muted-foreground)_55%,transparent)] bg-transparent";

  return (
    <span
      aria-label={`${label}: ${readinessLabel(readiness)}`}
      className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground"
      title={`${label}: ${readinessLabel(readiness)}`}
    >
      <span className={cn("size-2 shrink-0 rounded-full", dot)} />
      {label}
    </span>
  );
}

function StatusPill({ passed }: { passed: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[12px] font-semibold",
        passed
          ? "border-[color-mix(in_oklab,var(--chart-2)_38%,var(--border))] bg-[color-mix(in_oklab,var(--chart-2)_16%,var(--card))] text-[color-mix(in_oklab,var(--chart-2)_60%,var(--foreground))]"
          : "border-[color-mix(in_oklab,var(--chart-3)_48%,var(--border))] bg-[color-mix(in_oklab,var(--chart-3)_18%,var(--card))] text-[color-mix(in_oklab,var(--chart-3)_54%,var(--foreground))]"
      )}
    >
      {passed ? (
        <CheckCircle2Icon className="size-3.5" />
      ) : (
        <XCircleIcon className="size-3.5" />
      )}
      {passed ? "Активный" : "Не активный"}
    </span>
  );
}

function ReasonChip({
  text,
  kind,
}: {
  text: string;
  kind: "fail" | "missing";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium",
        kind === "fail"
          ? "border-[color-mix(in_oklab,var(--destructive)_32%,var(--border))] bg-[color-mix(in_oklab,var(--destructive)_12%,var(--card))] text-[color-mix(in_oklab,var(--destructive)_66%,var(--foreground))]"
          : "border-[color-mix(in_oklab,var(--chart-3)_40%,var(--border))] bg-[color-mix(in_oklab,var(--chart-3)_10%,var(--card))] text-[color-mix(in_oklab,var(--chart-3)_58%,var(--foreground))]"
      )}
    >
      {kind === "missing" ? "нет: " : "не прошел: "}
      {text}
    </span>
  );
}

const STATUS_SEGMENTS: Array<{ value: StatusFilter; label: string }> = [
  { value: "all", label: "Все" },
  { value: "active", label: "Активные" },
  { value: "inactive", label: "Не активные" },
  { value: "gaps", label: "Нужны факты" },
];

export function ActiveParticipantList({
  participants,
  roles,
  selectedProfileId,
  statusFilter,
  sortBy,
  query,
  loading,
  error,
  onSelect,
  onStatusFilter,
  onSortChange,
  onQueryChange,
}: Props) {
  const roleMap = useMemo(
    () => new Map(roles.map((r) => [r.id, r])),
    [roles]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = participants.filter((p) => {
      const hasGaps = p.evaluation.missingKeys.length > 0;
      const statusOk =
        statusFilter === "all" ||
        (statusFilter === "active" && p.evaluation.passed) ||
        (statusFilter === "inactive" && !p.evaluation.passed) ||
        (statusFilter === "gaps" && hasGaps);

      if (!statusOk) return false;
      if (!q) return true;

      const roleNames = p.roleIds
        .map((id) => roleMap.get(id)?.name ?? "")
        .join(" ");
      const text = [p.displayName ?? "", roleNames].join(" ").toLowerCase();
      return text.includes(q);
    });

    list.sort((a, b) => {
      if (sortBy === "name") {
        return (a.displayName ?? "").localeCompare(b.displayName ?? "", "ru");
      }
      if (sortBy === "retention") {
        const ar = a.facts.retention ?? -1;
        const br = b.facts.retention ?? -1;
        return br - ar;
      }
      // Default: passed first, then by retention desc
      if (a.evaluation.passed !== b.evaluation.passed) {
        return a.evaluation.passed ? -1 : 1;
      }
      return (b.facts.retention ?? -1) - (a.facts.retention ?? -1);
    });

    return list;
  }, [participants, statusFilter, sortBy, query, roleMap]);

  return (
    <div className="flex flex-col gap-3">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div
            aria-label="Фильтр по статусу"
            className="inline-flex gap-0.5 rounded-lg border bg-muted/60 p-[3px]"
          >
            {STATUS_SEGMENTS.map((seg) => (
              <button
                key={seg.value}
                aria-pressed={statusFilter === seg.value}
                className={cn(
                  "rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-muted-foreground transition-colors hover:text-foreground",
                  statusFilter === seg.value &&
                    "bg-card text-foreground shadow-sm"
                )}
                type="button"
                onClick={() => onStatusFilter(seg.value)}
              >
                {seg.label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative flex min-w-44 items-center">
            <SearchIcon className="absolute left-2.5 size-3.5 text-muted-foreground" />
            <Input
              aria-label="Поиск"
              className="pl-8 text-sm"
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Имя, роль"
              type="search"
              value={query}
            />
          </div>
          <Select value={sortBy} onValueChange={(v) => onSortChange(v as SortBy)}>
            <SelectTrigger className="h-9 w-auto text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectGroup>
                <SelectItem value="status">Сначала активные</SelectItem>
                <SelectItem value="name">По имени</SelectItem>
                <SelectItem value="retention">По retention</SelectItem>
              </SelectGroup>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* List card */}
      <div className="overflow-hidden rounded-xl border bg-card shadow-sm">
        {/* Column headers */}
        <div className="hidden grid-cols-[minmax(230px,1.5fr)_minmax(220px,1.4fr)_minmax(140px,0.8fr)] gap-4 border-b bg-muted/40 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground md:grid">
          <span>Участник</span>
          <span>Активность по правилам</span>
          <span>Готовность форматов</span>
        </div>

        {loading ? (
          <div>
            {Array.from({ length: 5 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-[minmax(230px,1.5fr)_minmax(220px,1.4fr)_minmax(140px,0.8fr)] gap-4 border-b px-4 py-3.5 last:border-b-0"
              >
                <div className="flex items-center gap-3">
                  <Skeleton className="size-9 shrink-0 rounded-lg" />
                  <div className="grid gap-1.5">
                    <Skeleton className="h-3.5 w-32" />
                    <Skeleton className="h-3 w-24" />
                  </div>
                </div>
                <div className="grid gap-2">
                  <Skeleton className="h-6 w-28 rounded-full" />
                  <Skeleton className="h-3 w-40" />
                </div>
                <div className="grid gap-1.5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="h-3 w-20" />
                </div>
              </div>
            ))}
          </div>
        ) : error ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center text-muted-foreground">
            <XCircleIcon className="size-6 text-destructive/70" />
            <p className="text-sm">{error}</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-14 text-center text-muted-foreground">
            <UsersIcon className="size-7 opacity-50" />
            <p className="text-sm font-medium">Участники не найдены</p>
            <p className="text-xs">
              {participants.length === 0
                ? "В этом клубе пока нет размеченных участников"
                : "Попробуйте изменить фильтр или поисковый запрос"}
            </p>
          </div>
        ) : (
          <div>
            {filtered.map((p) => {
              const isSelected = selectedProfileId === p.profileId;
              const pRoles = p.roleIds
                .map((id) => roleMap.get(id))
                .filter((r): r is ClubRole => r !== undefined);
              const color = avatarColor(p.profileId);

              return (
                <button
                  key={p.profileId}
                  type="button"
                  className={cn(
                    "relative grid w-full grid-cols-1 gap-3 border-b px-4 py-3.5 text-left transition-colors last:border-b-0 hover:bg-foreground/[0.035] md:grid-cols-[minmax(230px,1.5fr)_minmax(220px,1.4fr)_minmax(140px,0.8fr)] md:gap-4",
                    isSelected &&
                      "bg-[color-mix(in_oklab,var(--primary)_7%,var(--card))]"
                  )}
                  onClick={() => onSelect(p.profileId)}
                  aria-pressed={isSelected}
                  aria-label={`${p.displayName ?? "Участник"} - ${p.evaluation.passed ? "Активный" : "Не активный"}`}
                >
                  {/* Selected indicator bar */}
                  {isSelected && (
                    <span
                      aria-hidden="true"
                      className="absolute inset-y-0 left-0 w-[3px] bg-primary"
                    />
                  )}

                  {/* Column 1: Identity */}
                  <div className="flex items-start gap-3">
                    <span
                      aria-hidden="true"
                      className="grid size-9 shrink-0 place-items-center rounded-lg text-[13px] font-bold"
                      style={{
                        background: `color-mix(in oklab, ${color} 18%, var(--card))`,
                        color: `color-mix(in oklab, ${color} 70%, var(--foreground))`,
                      }}
                    >
                      {getInitials(p.displayName)}
                    </span>
                    <div className="min-w-0">
                      <p className="text-[14px] font-semibold tracking-tight">
                        {p.displayName ?? "Без имени"}
                      </p>
                      {pRoles.length > 0 && (
                        <p className="truncate text-[12px] text-muted-foreground">
                          {pRoles.map((r) => r.name).join(", ")}
                        </p>
                      )}
                      <p className="mt-0.5 text-[12px] text-muted-foreground">
                        {factLineParts(p)}
                      </p>
                    </div>
                  </div>

                  {/* Column 2: Assessment */}
                  <div className="grid gap-1.5">
                    <StatusPill passed={p.evaluation.passed} />
                    {!p.evaluation.passed && (
                      <div className="flex flex-wrap gap-1">
                        {p.evaluation.failedKeys.map((key) => (
                          <ReasonChip key={key} text={key} kind="fail" />
                        ))}
                        {p.evaluation.missingKeys.map((key) => (
                          <ReasonChip key={key} text={key} kind="missing" />
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Column 3: Format readiness pips */}
                  <div className="grid gap-1 content-start">
                    {p.readiness.length === 0 ? (
                      <span className="text-[11.5px] text-muted-foreground">
                        Не размечены
                      </span>
                    ) : (
                      p.readiness.map((r) => (
                        <ReadinessPip
                          key={r.formatId}
                          readiness={r.readiness}
                          label={r.formatName || r.formatId}
                        />
                      ))
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

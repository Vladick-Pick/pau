"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CheckCircle2Icon,
  XIcon,
  XCircleIcon,
  AlertCircleIcon,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type {
  Club,
  ClubRole,
  InspectorTab,
  ParticipantDetail,
  ReadinessValue,
} from "./types";

type Props = {
  detail: ParticipantDetail | null;
  roles: ClubRole[];
  loading: boolean;
  canManage: boolean;
  selectedClub: Club | null;
  onClose: () => void;
  onReadinessChange: (
    profileId: string,
    formatId: string,
    readiness: string
  ) => Promise<void>;
  onNoteChange: (profileId: string, note: string) => Promise<void>;
  onAssignRole: (roleId: string, profileId: string) => Promise<void>;
  onUnassignRole: (roleId: string, profileId: string) => Promise<void>;
};

function getInitials(name: string | null): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return name.slice(0, 2).toUpperCase();
}

const FACT_LABELS: Record<string, string> = {
  tenureYear: "Стаж (год)",
  retention: "Retention",
  attendance: "Доходимость",
  paymentPhase: "Платежный период",
  businessBand: "Бизнес-бэнд",
};

const PHASE_LABELS: Record<string, string> = {
  start: "начало",
  mid: "середина",
  end: "конец",
};

function formatFactValue(key: string, value: unknown): string {
  if (value == null) return "нет данных";
  if (key === "tenureYear") return `${String(value)}-й год`;
  if (key === "retention" || key === "attendance") return `${String(value)}%`;
  if (key === "paymentPhase") return PHASE_LABELS[String(value)] ?? String(value);
  return String(value);
}

function FactRow({
  label,
  value,
  passed,
  hasFact,
}: {
  label: string;
  value: string;
  passed: boolean | null;
  hasFact: boolean;
}) {
  return (
    <div className="grid grid-cols-[132px_minmax(0,1fr)_20px] items-center gap-2.5 border-b border-dashed py-2 last:border-b-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] font-medium">{value}</span>
      <span
        className={cn(
          "grid size-5 place-items-center rounded-full",
          !hasFact
            ? "bg-muted text-muted-foreground"
            : passed
              ? "bg-[color-mix(in_oklab,var(--chart-2)_18%,var(--card))] text-[color-mix(in_oklab,var(--chart-2)_62%,var(--foreground))]"
              : "bg-[color-mix(in_oklab,var(--destructive)_14%,var(--card))] text-[color-mix(in_oklab,var(--destructive)_66%,var(--foreground))]"
        )}
      >
        {!hasFact ? (
          <AlertCircleIcon className="size-3" />
        ) : passed ? (
          <CheckCircle2Icon className="size-3" />
        ) : (
          <XCircleIcon className="size-3" />
        )}
      </span>
    </div>
  );
}

const READINESS_OPTIONS: Array<{ value: ReadinessValue; label: string }> = [
  { value: "READY", label: "Готов" },
  { value: "UNMARKED", label: "Не размечен" },
  { value: "NOT_READY", label: "Не готов" },
];

function ReadinessSegment({
  value,
  onChange,
  disabled,
}: {
  value: ReadinessValue;
  onChange: (v: ReadinessValue) => void;
  disabled: boolean;
}) {
  return (
    <div className="inline-flex gap-0.5 rounded-lg border bg-card p-[2px]">
      {READINESS_OPTIONS.map((opt) => {
        const isActive = value === opt.value;
        const activeClass =
          opt.value === "READY"
            ? "bg-[color-mix(in_oklab,var(--chart-2)_18%,var(--card))] text-[color-mix(in_oklab,var(--chart-2)_64%,var(--foreground))]"
            : opt.value === "NOT_READY"
              ? "bg-[color-mix(in_oklab,var(--destructive)_14%,var(--card))] text-[color-mix(in_oklab,var(--destructive)_66%,var(--foreground))]"
              : "bg-muted text-foreground";

        return (
          <button
            key={opt.value}
            aria-pressed={isActive}
            className={cn(
              "rounded-md px-2 py-1 text-[11.5px] font-medium text-muted-foreground transition-colors",
              isActive && activeClass,
              "disabled:cursor-not-allowed disabled:opacity-50"
            )}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            type="button"
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}

function DossierBlock({ detail }: { detail: ParticipantDetail }) {
  const d = detail.dossier;
  const rows = [
    { label: "Компания", value: d.company },
    { label: "Должность", value: d.position },
    { label: "Сфера", value: d.industry },
    { label: "Выручка", value: d.revenue },
    { label: "Город", value: d.city },
    { label: "Возраст", value: d.age != null ? String(d.age) : null },
    { label: "Интересы", value: d.interests },
    { label: "Чем может быть полезен", value: d.canBeUseful },
    { label: "Цели в клубе", value: d.clubGoals },
  ].filter((r) => r.value);

  if (rows.length === 0) return null;

  return (
    <div className="grid gap-2.5">
      {rows.map((r) => (
        <div key={r.label} className="grid gap-0.5 border-b border-dashed pb-2 last:border-b-0">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
            {r.label}
          </span>
          <span className="text-[13px] leading-snug">{r.value}</span>
        </div>
      ))}
    </div>
  );
}

function NoteEditor({
  profileId,
  initialNote,
  canManage,
  onSave,
}: {
  profileId: string;
  initialNote: string | null;
  canManage: boolean;
  onSave: (profileId: string, note: string) => Promise<void>;
}) {
  const [note, setNote] = useState(initialNote ?? "");
  const [saving, setSaving] = useState(false);
  const isDirty = note !== (initialNote ?? "");

  useEffect(() => {
    setNote(initialNote ?? "");
  }, [initialNote, profileId]);

  async function handleSave() {
    if (!isDirty || saving) return;
    setSaving(true);
    try {
      await onSave(profileId, note);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-2">
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        Заметка
      </label>
      <Textarea
        className="min-h-20 resize-y text-[13px]"
        disabled={!canManage}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Заметки по участнику..."
        value={note}
      />
      {canManage && isDirty && (
        <Button
          disabled={saving}
          onClick={() => void handleSave()}
          size="sm"
          type="button"
        >
          {saving ? "Сохранение..." : "Сохранить заметку"}
        </Button>
      )}
    </div>
  );
}

export function ParticipantInspector({
  detail,
  roles,
  loading,
  canManage,
  selectedClub,
  onClose,
  onReadinessChange,
  onNoteChange,
  onAssignRole,
  onUnassignRole,
}: Props) {
  const [activeTab, setActiveTab] = useState<InspectorTab>("profile");
  const [readinessPending, setReadinessPending] = useState<string | null>(null);

  useEffect(() => {
    setActiveTab("profile");
  }, [detail?.profileId]);

  const handleReadiness = useCallback(
    async (profileId: string, formatId: string, readiness: ReadinessValue) => {
      setReadinessPending(formatId);
      try {
        await onReadinessChange(profileId, formatId, readiness);
      } finally {
        setReadinessPending(null);
      }
    },
    [onReadinessChange]
  );

  const handleAssign = useCallback(
    async (roleId: string) => {
      if (!detail) return;
      await onAssignRole(roleId, detail.profileId);
    },
    [detail, onAssignRole]
  );

  const handleUnassign = useCallback(
    async (roleId: string) => {
      if (!detail) return;
      await onUnassignRole(roleId, detail.profileId);
    },
    [detail, onUnassignRole]
  );

  return (
    <aside
      aria-label="Карточка участника"
      className="sticky top-[60px] overflow-hidden rounded-xl border bg-card shadow-[0_18px_48px_-24px_color-mix(in_oklab,var(--primary)_30%,transparent)]"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3 p-4 pb-3">
        {loading || !detail ? (
          <div className="flex items-start gap-3">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="grid gap-1.5">
              <Skeleton className="h-4 w-36" />
              <Skeleton className="h-3 w-24" />
            </div>
          </div>
        ) : (
          <div className="flex min-w-0 items-start gap-3">
            <span
              aria-hidden="true"
              className="grid size-9 shrink-0 place-items-center rounded-lg bg-[color-mix(in_oklab,var(--primary)_18%,var(--card))] text-[13px] font-bold text-[color-mix(in_oklab,var(--primary)_70%,var(--foreground))]"
            >
              {getInitials(detail.displayName)}
            </span>
            <div className="min-w-0">
              <p className="text-base font-semibold leading-tight tracking-tight">
                {detail.displayName ?? "Без имени"}
              </p>
              {detail.dossier.company && (
                <p className="text-[12.5px] text-muted-foreground">
                  {detail.dossier.company}
                </p>
              )}
              {selectedClub && (
                <p className="text-[11.5px] text-muted-foreground">
                  {selectedClub.name}
                </p>
              )}
            </div>
          </div>
        )}
        <Button
          aria-label="Закрыть карточку"
          onClick={onClose}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <XIcon />
        </Button>
      </div>

      {/* Verdict */}
      {!loading && detail && (
        <div
          className={cn(
            "mx-4 mb-3 grid gap-1.5 rounded-lg border p-3",
            detail.evaluation.passed
              ? "border-[color-mix(in_oklab,var(--chart-2)_34%,var(--border))] bg-[color-mix(in_oklab,var(--chart-2)_12%,var(--card))]"
              : "border-[color-mix(in_oklab,var(--chart-3)_42%,var(--border))] bg-[color-mix(in_oklab,var(--chart-3)_14%,var(--card))]"
          )}
        >
          <div
            className={cn(
              "inline-flex items-center gap-1.5 text-[13.5px] font-semibold",
              detail.evaluation.passed
                ? "text-[color-mix(in_oklab,var(--chart-2)_58%,var(--foreground))]"
                : "text-[color-mix(in_oklab,var(--chart-3)_52%,var(--foreground))]"
            )}
          >
            {detail.evaluation.passed ? (
              <CheckCircle2Icon className="size-4" />
            ) : (
              <XCircleIcon className="size-4" />
            )}
            {detail.evaluation.passed ? "Активный участник" : "Не активный"}
          </div>
          <p className="text-[12px] text-muted-foreground">
            {detail.evaluation.passed
              ? `Прошел все ${detail.evaluation.total} правила`
              : `Не прошел: ${[...detail.evaluation.failedKeys, ...detail.evaluation.missingKeys].join(", ") || "нет данных"}`}
          </p>
        </div>
      )}

      {/* Tabs */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as InspectorTab)}
      >
        <TabsList variant="line" className="w-full rounded-none border-b px-2">
          <TabsTrigger value="profile">Профиль</TabsTrigger>
          <TabsTrigger value="formats">Форматы</TabsTrigger>
          <TabsTrigger value="history">История</TabsTrigger>
        </TabsList>

        <div className="max-h-[calc(100dvh-300px)] overflow-y-auto">
          {/* Profile tab */}
          <TabsContent value="profile" className="p-4">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : detail ? (
              <div className="grid gap-5">
                {/* Facts vs rules */}
                <div className="grid gap-1">
                  <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Факты и правила
                  </h3>
                  {detail.rules.map((rule) => {
                    const factKey = rule.factKey ?? ruleToFactKey(rule.type);
                    const factValue =
                      factKey && factKey in detail.facts
                        ? (detail.facts as Record<string, unknown>)[factKey]
                        : undefined;
                    const hasFact = factValue != null;
                    const isFailed = detail.evaluation.failedKeys.includes(rule.key);
                    const isMissing = detail.evaluation.missingKeys.includes(rule.key);
                    const passed = hasFact && !isFailed && !isMissing;

                    return (
                      <FactRow
                        key={rule.key}
                        label={rule.label}
                        value={
                          hasFact && factKey
                            ? formatFactValue(factKey, factValue)
                            : "нужны факты"
                        }
                        passed={hasFact ? passed : null}
                        hasFact={hasFact}
                      />
                    );
                  })}
                </div>

                {/* Roles */}
                <div>
                  <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Роли
                  </h3>
                  <div className="flex flex-wrap gap-1.5">
                    {detail.roleIds.length === 0 ? (
                      <span className="text-[12px] text-muted-foreground">
                        Роли не назначены
                      </span>
                    ) : (
                      detail.roleIds.map((roleId) => {
                        const role = roles.find((r) => r.id === roleId);
                        return (
                          <span
                            key={roleId}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[color-mix(in_oklab,var(--chart-2)_40%,var(--border))] bg-[color-mix(in_oklab,var(--chart-2)_12%,var(--card))] px-2.5 py-1 text-[12px] font-medium text-[color-mix(in_oklab,var(--chart-2)_62%,var(--foreground))]"
                          >
                            {role?.name ?? roleId}
                            {canManage && (
                              <button
                                aria-label={`Снять роль ${role?.name ?? roleId}`}
                                className="grid size-4 place-items-center rounded-full bg-[color-mix(in_oklab,var(--chart-2)_22%,transparent)] transition-colors hover:bg-[color-mix(in_oklab,var(--chart-2)_35%,transparent)]"
                                onClick={() => void handleUnassign(roleId)}
                                type="button"
                              >
                                <XIcon className="size-2.5" />
                              </button>
                            )}
                          </span>
                        );
                      })
                    )}
                  </div>
                  {canManage && roles.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {roles
                        .filter((r) => !detail.roleIds.includes(r.id))
                        .map((r) => (
                          <button
                            key={r.id}
                            className="rounded-full border bg-card px-2 py-0.5 text-[11.5px] font-medium text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground"
                            onClick={() => void handleAssign(r.id)}
                            type="button"
                          >
                            + {r.name}
                          </button>
                        ))}
                    </div>
                  )}
                </div>

                {/* Dossier */}
                <div>
                  <h3 className="mb-2 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    О человеке и бизнесе
                  </h3>
                  <DossierBlock detail={detail} />
                </div>

                {/* Note */}
                <NoteEditor
                  profileId={detail.profileId}
                  initialNote={detail.note}
                  canManage={canManage}
                  onSave={onNoteChange}
                />
              </div>
            ) : null}
          </TabsContent>

          {/* Formats tab */}
          <TabsContent value="formats" className="p-4">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-16 rounded-lg" />
                ))}
              </div>
            ) : detail ? (
              <div className="grid gap-2.5">
                <p className="text-[11.5px] text-muted-foreground">
                  Трехпозиционная разметка готовности к каждому формату.
                </p>
                {detail.readiness.length === 0 ? (
                  <div className="rounded-lg border border-dashed p-4 text-center text-sm text-muted-foreground">
                    Нет форматов для разметки
                  </div>
                ) : (
                  detail.readiness.map((r) => (
                    <div
                      key={r.formatId}
                      className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-lg border bg-muted/30 px-3 py-2.5"
                    >
                      <div>
                        <p className="text-[13px] font-medium">{r.formatId}</p>
                        <p className="text-[11px] text-muted-foreground">
                          {readinessLabel(r.readiness)}
                        </p>
                      </div>
                      <ReadinessSegment
                        value={r.readiness as ReadinessValue}
                        onChange={(v) =>
                          void handleReadiness(detail.profileId, r.formatId, v)
                        }
                        disabled={!canManage || readinessPending === r.formatId}
                      />
                    </div>
                  ))
                )}
              </div>
            ) : null}
          </TabsContent>

          {/* History tab */}
          <TabsContent value="history" className="p-4">
            {loading ? (
              <div className="grid gap-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 rounded-lg" />
                ))}
              </div>
            ) : detail ? (
              <div className="grid gap-5">
                <div>
                  <h3 className="mb-3 text-[11.5px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Участие в мероприятиях
                  </h3>
                  {detail.participation.length === 0 ? (
                    <p className="text-[12px] text-muted-foreground">
                      История участия пуста
                    </p>
                  ) : (
                    <div className="grid gap-3">
                      {detail.participation.map((ev, i) => (
                        <div
                          key={i}
                          className="relative grid gap-0.5 pl-4 before:absolute before:left-0 before:top-1.5 before:size-2 before:rounded-full before:border-2 before:border-primary before:bg-card after:absolute after:bottom-[-12px] after:left-[3px] after:top-4 after:w-px after:bg-border last:after:hidden"
                        >
                          <p className="text-[13px] font-semibold">{ev.title}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            {ev.date}
                          </p>
                          {ev.detail && (
                            <p className="text-[12px]">{ev.detail}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ) : null}
          </TabsContent>
        </div>
      </Tabs>
    </aside>
  );
}

function readinessLabel(r: string): string {
  if (r === "READY") return "Готов";
  if (r === "NOT_READY") return "Не готов";
  return "Не размечен";
}

function ruleToFactKey(type: string): string | null {
  const map: Record<string, string> = {
    MIN_YEAR: "tenureYear",
    PHASE: "paymentPhase",
    MIN_BAND: "businessBand",
    HAS_ROLE: "",
  };
  return map[type] ?? null;
}

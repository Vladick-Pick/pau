"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CheckCircle2Icon,
  CircleUserRoundIcon,
  DownloadIcon,
  FileTextIcon,
  HistoryIcon,
  KeyRoundIcon,
  Link2Icon,
  Loader2Icon,
  LogOutIcon,
  PencilIcon,
  RefreshCwIcon,
  Settings2Icon,
  SparklesIcon,
  Trash2Icon,
  UsersIcon,
  XCircleIcon,
} from "lucide-react";

import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from "@/components/ui/empty";
import {
  Field,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  SidebarTrigger,
} from "@/components/ui/sidebar";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { SessionRole } from "@/lib/auth/session";
import type {
  PauBusinessBlock,
  PauEvent,
  PauEventParticipant,
  PauFormat,
  PauUser,
  PauWorkspaceSnapshot,
} from "@/lib/pau/types";
import { summarizeFormatCard } from "@/lib/pau/format-cards";
import {
  MAX_REPORT_TRANSCRIPT_CHARS,
  computeEventAttendanceSummary,
  getLatestPastEvent,
} from "@/lib/pau/preparation";
import {
  selectEventInScope,
  selectParticipantById,
} from "@/lib/pau/participant-selection";
import { cn } from "@/lib/utils";

type PauConsoleProps = {
  initialData: PauWorkspaceSnapshot;
  role: SessionRole;
  userName: string;
  logoutAction: () => Promise<void>;
};

type SectionId = "preparation" | "formats" | "history" | "access";

type ActionNotice = {
  tone: "default" | "destructive";
  title: string;
  message: string;
} | null;

type FormatDraft = Omit<PauFormat, "bitrixEventTypeIds" | "matchingRules"> & {
  bitrixEventTypeIdsText: string;
  matchingRulesText: string;
};

const MAX_REPORT_TRANSCRIPT_FILE_BYTES = MAX_REPORT_TRANSCRIPT_CHARS * 4;

const mainNavigation: Array<{
  id: Exclude<SectionId, "access">;
  label: string;
  icon: LucideIcon;
}> = [
  { id: "preparation", label: "Подготовка", icon: CalendarDaysIcon },
  { id: "formats", label: "Форматы", icon: Settings2Icon },
  { id: "history", label: "История", icon: HistoryIcon },
];

export function PauConsole({
  initialData,
  role,
  userName,
  logoutAction,
}: PauConsoleProps) {
  const [data, setData] = useState(initialData);
  const [activeSection, setActiveSection] = useState<SectionId>("preparation");
  const [selectedEventId, setSelectedEventId] = useState(
    initialData.upcomingEvents[0]?.id ?? initialData.pastEvents[0]?.id ?? null
  );
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(null);
  const [formatDrafts, setFormatDrafts] = useState(() =>
    initialData.formats.map(toFormatDraft)
  );
  const [editingFormatSlug, setEditingFormatSlug] = useState<string | null>(null);
  const [expandedHistoryEventIds, setExpandedHistoryEventIds] = useState<Set<string>>(
    () => new Set(initialData.pastEvents[0]?.id ? [initialData.pastEvents[0].id] : [])
  );
  const [newUserRole, setNewUserRole] = useState<SessionRole>("VIEWER");
  const [notice, setNotice] = useState<ActionNotice>(null);
  const [isPending, startTransition] = useTransition();
  const canManage = role === "ADMIN" || role === "MANAGER";
  const canAdmin = role === "ADMIN";

  const allEvents = useMemo(
    () => [...data.upcomingEvents, ...data.pastEvents],
    [data.upcomingEvents, data.pastEvents]
  );
  const selectedEvent =
    allEvents.find((event) => event.id === selectedEventId) ??
    data.upcomingEvents[0] ??
    data.pastEvents[0] ??
    null;
  const selectedParticipant = selectedEvent
    ? selectParticipantById(selectedEvent.participants, selectedParticipantId)
    : null;
  const latestPastEvent = useMemo(
    () => getLatestPastEvent(data.pastEvents),
    [data.pastEvents]
  );
  const selectedHistoryEvent = useMemo(
    () => selectEventInScope(data.pastEvents, selectedEventId),
    [data.pastEvents, selectedEventId]
  );
  const selectedHistoryParticipant = selectedHistoryEvent
    ? selectParticipantById(selectedHistoryEvent.participants, selectedParticipantId)
    : null;

  const refreshWorkspace = useCallback(async (options = { syncFormatDrafts: true }) => {
    const response = await fetch("/api/dashboard", { cache: "no-store" });
    const body = await response.json();
    if (!response.ok) {
      if (response.status === 401) {
        window.location.href = "/login";
      }
      throw new Error(body.error ?? "Dashboard refresh failed");
    }

    const nextData = body as PauWorkspaceSnapshot;
    setData(nextData);
    if (options.syncFormatDrafts) {
      setFormatDrafts(nextData.formats.map(toFormatDraft));
    }
    return nextData;
  }, []);

  useEffect(() => {
    if (!data.autoSync.enabled) {
      return;
    }

    const interval = window.setInterval(
      () => {
        void refreshWorkspace({ syncFormatDrafts: false }).catch(() => undefined);
      },
      data.autoSync.running ? 5000 : 60_000
    );

    return () => window.clearInterval(interval);
  }, [data.autoSync.enabled, data.autoSync.running, refreshWorkspace]);

  function runAction(action: () => Promise<ActionNotice>) {
    setNotice(null);
    startTransition(async () => {
      try {
        const nextNotice = await action();
        await refreshWorkspace();
        setNotice(nextNotice);
      } catch (error) {
        setNotice({
          tone: "destructive",
          title: "Операция не выполнена",
          message: error instanceof Error ? error.message : "Неизвестная ошибка",
        });
      }
    });
  }

  function matchEvent(eventId: string) {
    runAction(async () => {
      const response = await fetch(`/api/events/${eventId}/match`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Matching failed");
      }

      return {
        tone: "default",
        title: "Matching обновлен",
        message: `Активных участников: ${body.match?.activeParticipants?.length ?? 0}.`,
      };
    });
  }

  function generateBriefs(eventId: string) {
    runAction(async () => {
      const response = await fetch(`/api/events/${eventId}/briefs`, {
        method: "POST",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Brief generation failed");
      }

      return {
        tone: "default",
        title: "Брифы подготовлены",
        message: `Создано брифов: ${body.created ?? 0}.`,
      };
    });
  }

  function generateReport(eventId: string, transcript: string) {
    runAction(async () => {
      const response = await fetch(`/api/events/${eventId}/report`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Report generation failed");
      }

      return {
        tone: "default",
        title: "Отчет сформирован",
        message: body.report?.summary ?? "Отчет сохранен в истории брифов.",
      };
    });
  }

  function markParticipantAttendance(
    eventId: string,
    participantId: string,
    attendanceMarked: boolean
  ) {
    runAction(async () => {
      const response = await fetch(
        `/api/events/${eventId}/participants/${participantId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attendanceMarked }),
        }
      );
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Participant update failed");
      }

      return {
        tone: "default",
        title: "Посещение обновлено",
        message: body.participant?.fullName ?? "Отметка сохранена.",
      };
    });
  }

  function saveFormats() {
    runAction(async () => {
      const response = await fetch("/api/formats", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ formats: formatDrafts.map(formatDraftToPatch) }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Format update failed");
      }
      setEditingFormatSlug(null);

      return {
        tone: "default",
        title: "Форматы сохранены",
        message: `Обновлено форматов: ${body.formats?.length ?? 0}.`,
      };
    });
  }

  function deleteFormatAction(slug: string) {
    if (!window.confirm(`Удалить формат ${slug}?`)) {
      return;
    }

    runAction(async () => {
      const response = await fetch(`/api/formats/${slug}`, {
        method: "DELETE",
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "Format deletion failed");
      }
      setEditingFormatSlug(null);

      return {
        tone: "default",
        title: "Формат удален",
        message: body.format?.name ?? slug,
      };
    });
  }

  function toggleHistoryEvent(eventId: string) {
    setExpandedHistoryEventIds((current) => {
      const next = new Set(current);
      if (next.has(eventId)) {
        next.delete(eventId);
      } else {
        next.add(eventId);
      }
      return next;
    });
  }

  function createAccessUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const form = event.currentTarget;

    runAction(async () => {
      const response = await fetch("/api/account/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          login: String(formData.get("login") ?? ""),
          displayName: String(formData.get("displayName") ?? ""),
          role: newUserRole,
          password: String(formData.get("password") ?? ""),
        }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body.error ?? "User creation failed");
      }
      form.reset();
      setNewUserRole("VIEWER");

      return {
        tone: "default",
        title: "Доступ создан",
        message: body.user?.displayName ?? "Пользователь добавлен.",
      };
    });
  }

  function updateFormatDraft(slug: string, patch: Partial<FormatDraft>) {
    setFormatDrafts((current) =>
      current.map((format) =>
        format.slug === slug ? { ...format, ...patch } : format
      )
    );
  }

  return (
    <SidebarProvider>
      <Sidebar collapsible="icon">
        <SidebarHeader>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton size="lg" tooltip="ПАУ">
                <div className="flex aspect-square size-8 items-center justify-center rounded-md bg-sidebar-primary text-sidebar-primary-foreground">
                  <UsersIcon />
                </div>
                <div className="grid flex-1 text-left text-sm leading-tight">
                  <span className="truncate font-semibold">ПАУ</span>
                  <span className="truncate text-xs">мероприятия Bitrix</span>
                </div>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarHeader>
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Меню</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {mainNavigation.map((item) => (
                  <SidebarMenuItem key={item.id}>
                    <SidebarMenuButton
                      isActive={activeSection === item.id}
                      tooltip={item.label}
                      onClick={() => {
                        setActiveSection(item.id);
                        setEditingFormatSlug(null);
                      }}
                    >
                      <item.icon />
                      <span>{item.label}</span>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                isActive={activeSection === "access"}
                tooltip="Доступы"
                onClick={() => {
                  setActiveSection("access");
                  setEditingFormatSlug(null);
                }}
              >
                <KeyRoundIcon />
                <span>Доступы</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <SidebarMenuButton tooltip={userName}>
                <CircleUserRoundIcon />
                <span>{userName}</span>
              </SidebarMenuButton>
            </SidebarMenuItem>
          </SidebarMenu>
          <form action={logoutAction}>
            <Button className="w-full justify-start" type="submit" variant="ghost">
              <LogOutIcon data-icon="inline-start" />
              Выйти
            </Button>
          </form>
        </SidebarFooter>
        <SidebarRail />
      </Sidebar>

      <SidebarInset>
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background px-4 lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="min-h-5" />
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <div className="min-w-0">
              <h1 className="truncate text-base font-semibold">
                {sectionTitle(activeSection)}
              </h1>
              <p className="truncate text-xs text-muted-foreground">
                {data.demoMode ? "Демо-данные" : "Рабочая база"}
              </p>
            </div>
            <Badge variant="outline">{role}</Badge>
          </div>
          <Button
            disabled={isPending}
            onClick={() => runAction(async () => null)}
            size="icon-sm"
            variant="outline"
          >
            {isPending ? <Loader2Icon data-icon="icon" className="animate-spin" /> : <RefreshCwIcon />}
          </Button>
        </header>

        <main className="flex flex-1 flex-col gap-5 p-4 lg:p-6">
          {data.demoMode ? (
            <Alert>
              <Link2Icon />
              <AlertTitle>Демо-режим</AlertTitle>
              <AlertDescription>
                DATABASE_URL или интеграции не подключены.
              </AlertDescription>
            </Alert>
          ) : null}

          {activeSection === "preparation" && !data.demoMode ? (
            <BitrixAutoSyncPanel
              autoSync={data.autoSync}
              formats={data.formats}
            />
          ) : null}

          {notice ? (
            <Alert variant={notice.tone}>
              {notice.tone === "destructive" ? <XCircleIcon /> : <CheckCircle2Icon />}
              <AlertTitle>{notice.title}</AlertTitle>
              <AlertDescription>{notice.message}</AlertDescription>
            </Alert>
          ) : null}

          {activeSection === "preparation" ? (
            <PreparationView
              canManage={canManage}
              data={data}
              isPending={isPending}
              latestPastEvent={latestPastEvent}
              onAttendanceMark={markParticipantAttendance}
              onBriefs={generateBriefs}
              onExport={(eventId) => {
                window.location.href = `/api/events/${eventId}/export`;
              }}
              onMatch={matchEvent}
              onParticipantSelect={setSelectedParticipantId}
              onReport={generateReport}
              onSelectEvent={(eventId) => {
                setSelectedEventId(eventId);
                setSelectedParticipantId(null);
              }}
              selectedEvent={selectedEvent}
              selectedEventId={selectedEventId}
              selectedParticipant={selectedParticipant}
            />
          ) : null}

          {activeSection === "formats" ? (
            <FormatsView
              canManage={canManage}
              drafts={formatDrafts}
              editingSlug={editingFormatSlug}
              isPending={isPending}
              onBack={() => setEditingFormatSlug(null)}
              onChange={updateFormatDraft}
              onDelete={deleteFormatAction}
              onEdit={setEditingFormatSlug}
              onSave={saveFormats}
            />
          ) : null}

          {activeSection === "history" ? (
            <HistoryView
              canManage={canManage}
              databaseEnabled={!data.demoMode}
              events={data.pastEvents}
              expandedEventIds={expandedHistoryEventIds}
              integrations={data.integrationStatus}
              isPending={isPending}
              onAttendanceMark={markParticipantAttendance}
              onExport={(eventId) => {
                window.location.href = `/api/events/${eventId}/export`;
              }}
              onParticipantSelect={setSelectedParticipantId}
              onReport={generateReport}
              onSelectEvent={(eventId) => {
                setSelectedEventId(eventId);
                setSelectedParticipantId(null);
              }}
              onToggleExpanded={toggleHistoryEvent}
              selectedEvent={selectedHistoryEvent}
              selectedEventId={selectedHistoryEvent?.id ?? null}
              selectedParticipant={selectedHistoryParticipant}
            />
          ) : null}

          {activeSection === "access" ? (
            <AccessView
              canAdmin={canAdmin}
              integrations={data.integrationStatus}
              isPending={isPending}
              newUserRole={newUserRole}
              onCreateUser={createAccessUser}
              onRoleChange={setNewUserRole}
              users={data.users}
            />
          ) : null}
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

function PreparationView({
  canManage,
  data,
  isPending,
  latestPastEvent,
  onAttendanceMark,
  onBriefs,
  onExport,
  onMatch,
  onParticipantSelect,
  onReport,
  onSelectEvent,
  selectedEvent,
  selectedEventId,
  selectedParticipant,
}: {
  canManage: boolean;
  data: PauWorkspaceSnapshot;
  isPending: boolean;
  latestPastEvent: PauEvent | null;
  onAttendanceMark: (
    eventId: string,
    participantId: string,
    attendanceMarked: boolean
  ) => void;
  onBriefs: (eventId: string) => void;
  onExport: (eventId: string) => void;
  onMatch: (eventId: string) => void;
  onParticipantSelect: (participantId: string) => void;
  onReport: (eventId: string, transcript: string) => void;
  onSelectEvent: (eventId: string) => void;
  selectedEvent: PauEvent | null;
  selectedEventId: string | null;
  selectedParticipant: PauEventParticipant | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Ближайшие мероприятия</h2>
            <p className="text-xs text-muted-foreground">
              Список ближайших мероприятий из рабочей базы
            </p>
          </div>
        </div>
        {data.upcomingEvents.length > 0 ? (
          <div className="flex flex-col gap-2">
            {data.upcomingEvents.map((event) => (
              <button
                className={cn(
                  "rounded-md border bg-card p-3 text-left text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                  selectedEventId === event.id && "border-ring bg-accent"
                )}
                key={event.id}
                onClick={() => onSelectEvent(event.id)}
                type="button"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{event.title}</p>
                    <p className="text-xs text-muted-foreground">
                      {formatDate(event.startsAt)} · {event.formatName}
                    </p>
                  </div>
                  <Badge variant="outline">{event.counts.confirmed}</Badge>
                </div>
                <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                  <Count label="Звали" value={event.counts.invited} />
                  <Count label="Да" value={event.counts.confirmed} />
                  <Count label="Нет" value={event.counts.refused} />
                  <Count label="АУ" value={event.counts.active} />
                </div>
              </button>
            ))}
          </div>
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>Нет ближайших мероприятий</EmptyTitle>
              <EmptyDescription>
                Синхронизация Bitrix пока не вернула ближайшие события.
              </EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
        {latestPastEvent ? (
          <div className="mt-3 flex flex-col gap-2">
            <div>
              <h2 className="text-sm font-medium">Последнее событие</h2>
              <p className="text-xs text-muted-foreground">
                Быстрый доступ к фактическому составу и отчету
              </p>
            </div>
            <button
              className={cn(
                "rounded-md border bg-card p-3 text-left text-card-foreground transition-colors hover:bg-accent hover:text-accent-foreground",
                selectedEventId === latestPastEvent.id && "border-ring bg-accent"
              )}
              onClick={() => onSelectEvent(latestPastEvent.id)}
              type="button"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">
                    {latestPastEvent.title}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(latestPastEvent.startsAt)} · {latestPastEvent.formatName}
                  </p>
                </div>
                <Badge variant="outline">{latestPastEvent.counts.attended}</Badge>
              </div>
              <EventConversionStrip event={latestPastEvent} />
            </button>
          </div>
        ) : null}
      </section>

      {selectedEvent ? (
        <EventWorkspace
          canManage={canManage}
          databaseEnabled={!data.demoMode}
          event={selectedEvent}
          integrations={data.integrationStatus}
          isPending={isPending}
          onAttendanceMark={onAttendanceMark}
          onBriefs={onBriefs}
          onExport={onExport}
          onMatch={onMatch}
          onParticipantSelect={onParticipantSelect}
          onReport={onReport}
          selectedParticipant={selectedParticipant}
        />
      ) : null}
    </div>
  );
}

function EventWorkspace({
  canManage,
  databaseEnabled,
  event,
  integrations,
  isPending,
  onAttendanceMark,
  onBriefs,
  onExport,
  onMatch,
  onParticipantSelect,
  onReport,
  selectedParticipant,
}: {
  canManage: boolean;
  databaseEnabled: boolean;
  event: PauEvent;
  integrations: PauWorkspaceSnapshot["integrationStatus"];
  isPending: boolean;
  onAttendanceMark: (
    eventId: string,
    participantId: string,
    attendanceMarked: boolean
  ) => void;
  onBriefs: (eventId: string) => void;
  onExport: (eventId: string) => void;
  onMatch: (eventId: string) => void;
  onParticipantSelect: (participantId: string) => void;
  onReport: (eventId: string, transcript: string) => void;
  selectedParticipant: PauEventParticipant | null;
}) {
  const canRunPreparationActions = canManage && event.status !== "PAST";
  const canMarkAttendance = canManage && event.status === "PAST";

  return (
    <section className="flex min-w-0 flex-col gap-5">
      <EventHeader
        canManage={canRunPreparationActions}
        databaseEnabled={databaseEnabled}
        event={event}
        integrations={integrations}
        isPending={isPending}
        onBriefs={onBriefs}
        onExport={onExport}
        onMatch={onMatch}
      />
      <AttendanceSummaryPanel event={event} />
      {event.status === "PAST" ? (
        <EventReportPanel
          canManage={canManage}
          databaseEnabled={databaseEnabled}
          event={event}
          integrations={integrations}
          isPending={isPending}
          key={event.id}
          onReport={onReport}
        />
      ) : null}
      <div
        className={cn(
          "grid gap-5",
          selectedParticipant && "2xl:grid-cols-[minmax(0,1fr)_360px]"
        )}
      >
        <ParticipantsTable
          canMarkAttendance={canMarkAttendance}
          databaseEnabled={databaseEnabled}
          eventId={event.id}
          isPending={isPending}
          onAttendanceMark={onAttendanceMark}
          onParticipantSelect={onParticipantSelect}
          participants={event.participants}
          selectedParticipantId={selectedParticipant?.id ?? null}
        />
        {selectedParticipant ? (
          <ParticipantDetails participant={selectedParticipant} />
        ) : null}
      </div>
    </section>
  );
}

function AttendanceSummaryPanel({ event }: { event: PauEvent }) {
  const summary = computeEventAttendanceSummary(event.participants);

  return (
    <div className="grid gap-2 md:grid-cols-2">
      <div className="rounded-md border bg-card p-3 text-card-foreground">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Потенциалы
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <Count label="Звали" value={summary.potential.invited} />
          <Count label="Дошли" value={summary.potential.attended} />
          <Count label="Конв." value={formatPercent(summary.potential.conversion)} />
        </div>
      </div>
      <div className="rounded-md border bg-card p-3 text-card-foreground">
        <p className="text-xs font-medium uppercase text-muted-foreground">
          Активные участники
        </p>
        <div className="mt-2 grid grid-cols-4 gap-2">
          <Count label="Звали" value={summary.active.invited} />
          <Count label="Дошли" value={summary.active.attended} />
          <Count label="Был факт" value={summary.active.marked} />
          <Count label="Факт" value={formatPercent(summary.active.markedConversion)} />
        </div>
      </div>
    </div>
  );
}

function EventReportPanel({
  canManage,
  databaseEnabled,
  event,
  integrations,
  isPending,
  onReport,
}: {
  canManage: boolean;
  databaseEnabled: boolean;
  event: PauEvent;
  integrations: PauWorkspaceSnapshot["integrationStatus"];
  isPending: boolean;
  onReport: (eventId: string, transcript: string) => void;
}) {
  const [transcript, setTranscript] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [transcriptError, setTranscriptError] = useState<string | null>(null);

  function updateTranscript(nextTranscript: string) {
    setTranscript(nextTranscript);
    setTranscriptError(
      nextTranscript.length > MAX_REPORT_TRANSCRIPT_CHARS
        ? `Transcript длиннее лимита ${formatInteger(MAX_REPORT_TRANSCRIPT_CHARS)} символов.`
        : null
    );
  }

  async function readTranscriptFile(file: File | undefined) {
    if (!file) {
      return;
    }

    setFileName(file.name);
    if (file.size > MAX_REPORT_TRANSCRIPT_FILE_BYTES) {
      setTranscript("");
      setTranscriptError(
        `Файл больше лимита ${formatInteger(MAX_REPORT_TRANSCRIPT_FILE_BYTES)} байт.`
      );
      return;
    }

    updateTranscript(await file.text());
  }

  const canGenerate =
    canManage &&
    databaseEnabled &&
    integrations.openrouter &&
    !isPending &&
    !transcriptError &&
    transcript.trim().length > 0;

  return (
    <div className="grid gap-3 rounded-md border bg-card p-4 text-card-foreground lg:grid-cols-[minmax(0,1fr)_280px]">
      <div className="flex min-w-0 flex-col gap-3">
        <div>
          <h3 className="text-sm font-medium">Отчет по transcript</h3>
          <p className="text-xs text-muted-foreground">
            Prompt берется из настроек формата.
          </p>
        </div>
        <Textarea
          disabled={!canManage || !databaseEnabled}
          onChange={(changeEvent) => updateTranscript(changeEvent.target.value)}
          placeholder="Вставьте текст записи встречи"
          value={transcript}
        />
        {transcriptError ? (
          <p className="text-xs text-destructive">{transcriptError}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Input
            accept=".txt,.md,text/plain"
            className="max-w-sm"
            disabled={!canManage || !databaseEnabled}
            onChange={(changeEvent) =>
              void readTranscriptFile(changeEvent.target.files?.[0])
            }
            type="file"
          />
          {fileName ? (
            <span className="text-xs text-muted-foreground">{fileName}</span>
          ) : null}
        </div>
      </div>
      <div className="flex min-w-0 flex-col justify-between gap-3 rounded-md border bg-background p-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase text-muted-foreground">
            Последний отчет
          </p>
          <p className="mt-2 text-sm">
            {event.latestReport?.summary ?? "Отчет еще не сформирован"}
          </p>
          {event.latestReport ? (
            <p className="mt-2 text-xs text-muted-foreground">
              {formatDate(event.latestReport.createdAt)}
            </p>
          ) : null}
        </div>
        <Button disabled={!canGenerate} onClick={() => onReport(event.id, transcript)}>
          <FileTextIcon data-icon="inline-start" />
          Сформировать
        </Button>
      </div>
    </div>
  );
}

function BitrixAutoSyncPanel({
  autoSync,
  formats,
}: {
  autoSync: PauWorkspaceSnapshot["autoSync"];
  formats: PauFormat[];
}) {
  const queries = Array.from(
    new Set(
      formats
        .map((format) => format.bitrixSyncTitleQuery.trim())
        .filter(Boolean)
    )
  );
  const lastLog = autoSync.lastLog;

  return (
    <div className="flex flex-col gap-3 rounded-md border bg-card p-3 text-card-foreground">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-medium">Автосинхронизация Bitrix</p>
            <Badge variant={autoSync.enabled ? "secondary" : "outline"}>
              {autoSync.enabled ? "каждый час" : "не настроена"}
            </Badge>
            {autoSync.running ? (
              <Badge variant="outline">идет синхронизация</Badge>
            ) : null}
          </div>
          <p className="text-xs text-muted-foreground">
            Поиск идет по строкам из форматов:{" "}
            {queries.length > 0 ? queries.join(", ") : "строки не заданы"}.
          </p>
          <div className="space-y-1 text-xs text-muted-foreground">
            <p>
              Последний запуск:{" "}
              {lastLog ? `${formatDate(lastLog.createdAt)} · ${lastLog.status}` : "нет"}
            </p>
            {lastLog?.message ? <p>{lastLog.message}</p> : null}
            <p>
              Следующий запуск:{" "}
              {autoSync.nextRunAt
                ? formatDate(autoSync.nextRunAt)
                : autoSync.running
                  ? "после завершения текущей"
                  : "после старта сервера"}
            </p>
            {autoSync.lastError ? (
              <p className="text-destructive">Ошибка: {autoSync.lastError}</p>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EventHeader({
  canManage,
  databaseEnabled,
  event,
  integrations,
  isPending,
  onBriefs,
  onExport,
  onMatch,
}: {
  canManage: boolean;
  databaseEnabled: boolean;
  event: PauEvent;
  integrations: PauWorkspaceSnapshot["integrationStatus"];
  isPending: boolean;
  onBriefs: (eventId: string) => void;
  onExport: (eventId: string) => void;
  onMatch: (eventId: string) => void;
}) {
  return (
    <div className="flex flex-col gap-4 rounded-md border bg-card p-4 text-card-foreground">
      <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="secondary">{event.formatName}</Badge>
            <StatusBadge status={event.status} />
            {event.latestMatch ? (
              <Badge variant="outline">matching {event.latestMatch.activeParticipantCount}</Badge>
            ) : null}
          </div>
          <h2 className="mt-2 text-xl font-semibold tracking-tight">{event.title}</h2>
          <p className="text-sm text-muted-foreground">
            {formatDate(event.startsAt)} · Bitrix {event.bitrixSmartItemId ?? event.bitrixEventId ?? "не связан"}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            disabled={
              isPending || !canManage || !databaseEnabled || !integrations.matching
            }
            onClick={() => onMatch(event.id)}
            size="sm"
            variant="outline"
          >
            <SparklesIcon data-icon="inline-start" />
            Matching
          </Button>
          <Button
            disabled={
              isPending || !canManage || !databaseEnabled || !integrations.openrouter
            }
            onClick={() => onBriefs(event.id)}
            size="sm"
            variant="outline"
          >
            <FileTextIcon data-icon="inline-start" />
            Брифы
          </Button>
          <Button
            disabled={isPending || !databaseEnabled}
            onClick={() => onExport(event.id)}
            size="sm"
            variant="outline"
          >
            <DownloadIcon data-icon="inline-start" />
            Word
          </Button>
        </div>
      </div>
      <div className="grid gap-2 md:grid-cols-6">
        <Count label="Приглашено" value={event.counts.invited} />
        <Count label="Подтвердили" value={event.counts.confirmed} />
        <Count label="Отказались" value={event.counts.refused} />
        <Count label="Дошли" value={event.counts.attended} />
        <Count label="Не пришли" value={event.counts.missed} />
        <Count label="Брифы" value={event.counts.briefs} />
      </div>
    </div>
  );
}

function ParticipantsTable({
  canMarkAttendance,
  databaseEnabled,
  eventId,
  isPending,
  onAttendanceMark,
  onParticipantSelect,
  participants,
  selectedParticipantId,
}: {
  canMarkAttendance: boolean;
  databaseEnabled: boolean;
  eventId: string;
  isPending: boolean;
  onAttendanceMark: (
    eventId: string,
    participantId: string,
    attendanceMarked: boolean
  ) => void;
  onParticipantSelect: (participantId: string) => void;
  participants: PauEventParticipant[];
  selectedParticipantId: string | null;
}) {
  return (
    <div className="min-w-0 overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Участник</TableHead>
            <TableHead>Бизнес</TableHead>
            <TableHead>Статус</TableHead>
            <TableHead>Факт</TableHead>
            <TableHead>Сделка</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {participants.map((participant) => (
            <TableRow
              className={cn(
                "cursor-pointer",
                selectedParticipantId === participant.id && "bg-muted"
              )}
              key={participant.id}
              onClick={() => onParticipantSelect(participant.id)}
            >
              <TableCell>
                <div className="flex min-w-48 flex-col gap-1">
                  <span className="font-medium">{participant.fullName}</span>
                  <span className="text-xs text-muted-foreground">
                    {[participant.company, participant.position].filter(Boolean).join(" · ") || "Без компании"}
                  </span>
                </div>
              </TableCell>
              <TableCell>
                <div className="max-w-72 truncate text-sm">
                  {participant.businessMain ?? "Не заполнено"}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  <KindBadge kind={participant.kind} />
                  <ParticipantStatusBadge status={participant.status} />
                </div>
              </TableCell>
              <TableCell>
                {participant.kind === "ACTIVE" ? (
                  <label
                    className="flex w-fit items-center gap-2 text-xs"
                    onClick={(clickEvent) => clickEvent.stopPropagation()}
                  >
                    <input
                      aria-label={`Отметить фактическое участие: ${participant.fullName}`}
                      checked={participant.attendanceMarked}
                      className="size-4 accent-primary"
                      disabled={!canMarkAttendance || !databaseEnabled || isPending}
                      onChange={(changeEvent) =>
                        onAttendanceMark(
                          eventId,
                          participant.id,
                          changeEvent.target.checked
                        )
                      }
                      type="checkbox"
                    />
                    Был
                  </label>
                ) : (
                  <span className="text-sm text-muted-foreground">-</span>
                )}
              </TableCell>
              <TableCell>
                <span className="text-sm text-muted-foreground">
                  {participant.bitrixDealId ?? "нет"}
                </span>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function ParticipantDetails({
  participant,
}: {
  participant: PauEventParticipant;
}) {
  return (
    <aside className="flex flex-col gap-4 rounded-md border bg-card p-4 text-card-foreground">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold">{participant.fullName}</p>
          <p className="text-xs text-muted-foreground">
            {participant.company ?? "Компания не заполнена"}
          </p>
        </div>
        <KindBadge kind={participant.kind} />
      </div>
      <Separator />
      <Detail label="Должность" value={participant.position} />
      <Detail label="Город" value={participant.city} />
      <Detail label="Филиал клуба" value={participant.clubBranch} />
      <Detail label="Заказчик куда поставляем" value={participant.clubCustomer} />
      <Detail label="Возраст / пол" value={[participant.age, participant.gender].filter(Boolean).join(" · ")} />
      <Separator />
      <BusinessBlockDetails
        block={participant.businessProfile?.main ?? null}
        fallbackSphere={participant.businessMain}
        title="Основной бизнес"
      />
      <BusinessBlockDetails
        block={participant.businessProfile?.extra1 ?? null}
        fallbackSphere={participant.businessExtra1}
        title="Доп бизнес 1"
      />
      <BusinessBlockDetails
        block={participant.businessProfile?.extra2 ?? null}
        fallbackSphere={participant.businessExtra2}
        title="Доп бизнес 2"
      />
      <BusinessBlockDetails
        block={participant.businessProfile?.extra3 ?? null}
        fallbackSphere={participant.businessExtra3}
        title="Доп бизнес 3"
      />
      <KeyValueDetails
        emptyText="Не заполнено"
        items={participant.enrichment}
        labels={enrichmentLabels}
        showEmptyRows
        title="Обогащение"
      />
      <Separator />
      <LongDetail label="Комментарий Bitrix" value={participant.bitrixComment} />
      <Detail label="Score" value={participant.matchedScore?.toFixed(2)} />
      <Detail label="Rationale" value={participant.matchRationale} />
      <Detail label="Бриф" value={participant.briefSummary} />
    </aside>
  );
}

function FormatsView({
  canManage,
  drafts,
  editingSlug,
  isPending,
  onBack,
  onChange,
  onDelete,
  onEdit,
  onSave,
}: {
  canManage: boolean;
  drafts: FormatDraft[];
  editingSlug: string | null;
  isPending: boolean;
  onBack: () => void;
  onChange: (slug: string, patch: Partial<FormatDraft>) => void;
  onDelete: (slug: string) => void;
  onEdit: (slug: string) => void;
  onSave: () => void;
}) {
  const editingFormat =
    drafts.find((format) => format.slug === editingSlug) ?? null;

  if (editingFormat) {
    return (
      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex min-w-0 items-start gap-3">
            <Button
              aria-label="Назад к форматам"
              onClick={onBack}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <ArrowLeftIcon />
            </Button>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="truncate text-lg font-semibold">
                  {editingFormat.name}
                </h2>
                <Badge variant="outline">{editingFormat.slug}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                Редактура линковки Bitrix, matching rules и prompts.
              </p>
            </div>
          </div>
          <Button disabled={isPending || !canManage} onClick={onSave} size="sm">
            <CheckCircle2Icon data-icon="inline-start" />
            Сохранить
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Настройки формата</CardTitle>
            <CardDescription>
              Изменения применяются после сохранения.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-name`}>
                  Название
                </FieldLabel>
                <Input
                  disabled={!canManage}
                  id={`${editingFormat.slug}-name`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, { name: event.target.value })
                  }
                  value={editingFormat.name}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-description`}>
                  Описание
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-description`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      description: event.target.value,
                    })
                  }
                  value={editingFormat.description}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-sync-query`}>
                  Поиск Bitrix по названию
                </FieldLabel>
                <Input
                  disabled={!canManage}
                  id={`${editingFormat.slug}-sync-query`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      bitrixSyncTitleQuery: event.target.value,
                    })
                  }
                  placeholder="Гостевая встреча"
                  value={editingFormat.bitrixSyncTitleQuery}
                />
                <FieldDescription>
                  Эта строка используется как запрос для поиска мероприятий перед
                  синхронизацией.
                </FieldDescription>
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-bitrix`}>
                  Bitrix типы / категории
                </FieldLabel>
                <Input
                  disabled={!canManage}
                  id={`${editingFormat.slug}-bitrix`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      bitrixEventTypeIdsText: event.target.value,
                    })
                  }
                  value={editingFormat.bitrixEventTypeIdsText}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-rules`}>
                  Matching rules
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-rules`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      matchingRulesText: event.target.value,
                    })
                  }
                  value={editingFormat.matchingRulesText}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-potential`}>
                  Prompt: потенциальные
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-potential`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      promptPotential: event.target.value,
                    })
                  }
                  value={editingFormat.promptPotential}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-active`}>
                  Prompt: активные
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-active`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      promptActive: event.target.value,
                    })
                  }
                  value={editingFormat.promptActive}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-moderator`}>
                  Prompt: модератор
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-moderator`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      promptModerator: event.target.value,
                    })
                  }
                  value={editingFormat.promptModerator}
                />
              </Field>
              <Field>
                <FieldLabel htmlFor={`${editingFormat.slug}-report`}>
                  Prompt: отчет по transcript
                </FieldLabel>
                <Textarea
                  disabled={!canManage}
                  id={`${editingFormat.slug}-report`}
                  onChange={(event) =>
                    onChange(editingFormat.slug, {
                      promptReport: event.target.value,
                    })
                  }
                  value={editingFormat.promptReport}
                />
              </Field>
            </FieldGroup>
          </CardContent>
        </Card>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-medium">Форматы ПАУ</h2>
          <p className="text-xs text-muted-foreground">
            Сохранённые форматы и их Bitrix-линковки
          </p>
        </div>
      </div>

      <div className="grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
        {drafts.map((format) => (
          <FormatSummaryCard
            canManage={canManage}
            format={format}
            isPending={isPending}
            key={format.slug}
            onDelete={onDelete}
            onEdit={onEdit}
          />
        ))}
      </div>
    </section>
  );
}

function FormatSummaryCard({
  canManage,
  format,
  isPending,
  onDelete,
  onEdit,
}: {
  canManage: boolean;
  format: FormatDraft;
  isPending: boolean;
  onDelete: (slug: string) => void;
  onEdit: (slug: string) => void;
}) {
  const summary = summarizeFormatCard(format);
  const visibleLinks = summary.bitrixLinks.slice(0, 3);
  const hiddenLinksCount = summary.bitrixLinks.length - visibleLinks.length;

  return (
    <Card className="min-h-52" size="sm">
      <CardHeader>
        <CardTitle>{format.name}</CardTitle>
        <CardDescription>{format.slug}</CardDescription>
        <CardAction>
          <div className="flex gap-2">
            <Button
              disabled={isPending || !canManage}
              onClick={() => onEdit(format.slug)}
              size="sm"
              type="button"
              variant="outline"
            >
              <PencilIcon data-icon="inline-start" />
              Редактировать
            </Button>
            <Button
              aria-label={`Удалить формат ${format.name}`}
              disabled={isPending || !canManage}
              onClick={() => onDelete(format.slug)}
              size="icon-sm"
              type="button"
              variant="outline"
            >
              <Trash2Icon />
            </Button>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-1 flex-col gap-4">
        <p className="line-clamp-2 min-h-10 text-sm text-muted-foreground">
          {format.description || "Описание не заполнено"}
        </p>
        <div className="text-xs text-muted-foreground">
          Поиск: {format.bitrixSyncTitleQuery || "не задан"}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {visibleLinks.length > 0 ? (
            visibleLinks.map((link) => (
              <Badge key={link} variant="secondary">
                {link}
              </Badge>
            ))
          ) : (
            <Badge variant="outline">Bitrix не связан</Badge>
          )}
          {hiddenLinksCount > 0 ? (
            <Badge variant="outline">+{hiddenLinksCount}</Badge>
          ) : null}
        </div>
      </CardContent>
      <CardFooter className="justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          <Badge variant={summary.hasMatchingRules ? "secondary" : "outline"}>
            Matching {summary.hasMatchingRules ? "есть" : "нет"}
          </Badge>
          <Badge
            variant={
              summary.completedPrompts === summary.totalPrompts
                ? "secondary"
                : "outline"
            }
          >
            Prompts {summary.completedPrompts}/{summary.totalPrompts}
          </Badge>
        </div>
      </CardFooter>
    </Card>
  );
}

function EventConversionStrip({ event }: { event: PauEvent }) {
  const summary = computeEventAttendanceSummary(event.participants);

  return (
    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
      <div className="rounded-md border bg-background p-2">
        <p className="text-[11px] text-muted-foreground">Потенциалы</p>
        <p className="font-medium">
          {summary.potential.invited}
          {" -> "}
          {summary.potential.attended} ·{" "}
          {formatPercent(summary.potential.conversion)}
        </p>
      </div>
      <div className="rounded-md border bg-background p-2">
        <p className="text-[11px] text-muted-foreground">Активные</p>
        <p className="font-medium">
          {summary.active.invited}
          {" -> "}
          {summary.active.attended}
          {" -> "}
          {summary.active.marked} · {formatPercent(summary.active.markedConversion)}
        </p>
      </div>
    </div>
  );
}

function CompactParticipantsStatus({
  participants,
}: {
  participants: PauEventParticipant[];
}) {
  const visibleParticipants = participants.slice(0, 8);
  const hiddenCount = participants.length - visibleParticipants.length;

  return (
    <div className="mt-3 flex flex-col gap-2">
      {visibleParticipants.map((participant) => (
        <div
          className="flex items-center justify-between gap-3 text-xs"
          key={participant.id}
        >
          <span className="min-w-0 truncate">{participant.fullName}</span>
          <div className="flex shrink-0 items-center gap-1">
            <KindBadge kind={participant.kind} />
            <ParticipantStatusBadge status={participant.status} />
            {participant.kind === "ACTIVE" && participant.attendanceMarked ? (
              <Badge variant="secondary">был факт</Badge>
            ) : null}
          </div>
        </div>
      ))}
      {hiddenCount > 0 ? (
        <p className="text-xs text-muted-foreground">Еще {hiddenCount}</p>
      ) : null}
    </div>
  );
}

function HistoryView({
  canManage,
  databaseEnabled,
  events,
  expandedEventIds,
  integrations,
  isPending,
  onAttendanceMark,
  onExport,
  onParticipantSelect,
  onReport,
  onSelectEvent,
  onToggleExpanded,
  selectedEvent,
  selectedEventId,
  selectedParticipant,
}: {
  canManage: boolean;
  databaseEnabled: boolean;
  events: PauEvent[];
  expandedEventIds: Set<string>;
  integrations: PauWorkspaceSnapshot["integrationStatus"];
  isPending: boolean;
  onAttendanceMark: (
    eventId: string,
    participantId: string,
    attendanceMarked: boolean
  ) => void;
  onExport: (eventId: string) => void;
  onParticipantSelect: (participantId: string) => void;
  onReport: (eventId: string, transcript: string) => void;
  onSelectEvent: (eventId: string) => void;
  onToggleExpanded: (eventId: string) => void;
  selectedEvent: PauEvent | null;
  selectedEventId: string | null;
  selectedParticipant: PauEventParticipant | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-2">
        {events.length > 0 ? (
          events.map((event) => (
            <article
              className={cn(
                "rounded-md border bg-card p-3 text-card-foreground transition-colors",
                selectedEventId === event.id && "border-ring bg-accent"
              )}
              key={event.id}
            >
              <div className="flex items-start gap-2">
                <button
                  className="min-w-0 flex-1 text-left"
                  onClick={() => onSelectEvent(event.id)}
                  type="button"
                >
                  <p className="truncate text-sm font-medium">{event.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {formatDate(event.startsAt)} · дошли {event.counts.attended}
                  </p>
                </button>
                <Button
                  aria-label={
                    expandedEventIds.has(event.id)
                      ? "Свернуть событие"
                      : "Развернуть событие"
                  }
                  onClick={() => onToggleExpanded(event.id)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  {expandedEventIds.has(event.id) ? (
                    <ChevronDownIcon />
                  ) : (
                    <ChevronRightIcon />
                  )}
                </Button>
              </div>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <Count label="Звали" value={event.counts.invited} />
                <Count label="Да" value={event.counts.confirmed} />
                <Count label="Нет" value={event.counts.refused} />
                <Count label="No-show" value={event.counts.missed} />
              </div>
              {expandedEventIds.has(event.id) ? (
                <div className="mt-3 border-t pt-3">
                  <EventConversionStrip event={event} />
                  <CompactParticipantsStatus participants={event.participants} />
                </div>
              ) : null}
            </article>
          ))
        ) : (
          <Empty>
            <EmptyHeader>
              <EmptyTitle>История пуста</EmptyTitle>
              <EmptyDescription>Прошедшие мероприятия появятся после sync.</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}
      </section>
      {selectedEvent ? (
        <EventWorkspace
          canManage={canManage}
          databaseEnabled={databaseEnabled}
          event={selectedEvent}
          integrations={integrations}
          isPending={isPending}
          onAttendanceMark={onAttendanceMark}
          onBriefs={() => undefined}
          onExport={onExport}
          onMatch={() => undefined}
          onParticipantSelect={onParticipantSelect}
          onReport={onReport}
          selectedParticipant={selectedParticipant}
        />
      ) : null}
    </div>
  );
}

function AccessView({
  canAdmin,
  integrations,
  isPending,
  newUserRole,
  onCreateUser,
  onRoleChange,
  users,
}: {
  canAdmin: boolean;
  integrations: PauWorkspaceSnapshot["integrationStatus"];
  isPending: boolean;
  newUserRole: SessionRole;
  onCreateUser: (event: FormEvent<HTMLFormElement>) => void;
  onRoleChange: (role: SessionRole) => void;
  users: PauUser[];
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="flex flex-col gap-4">
        <div className="grid gap-2 md:grid-cols-4">
          <IntegrationBadge label="PostgreSQL" ready={integrations.database} />
          <IntegrationBadge label="Bitrix24" ready={integrations.bitrix} />
          <IntegrationBadge label="Matching API" ready={integrations.matching} />
          <IntegrationBadge label="OpenRouter" ready={integrations.openrouter} />
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Пользователь</TableHead>
                <TableHead>Логин</TableHead>
                <TableHead>Роль</TableHead>
                <TableHead>Статус</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {users.map((user) => (
                <TableRow key={user.id}>
                  <TableCell className="font-medium">{user.displayName}</TableCell>
                  <TableCell>{user.login}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{user.role}</Badge>
                  </TableCell>
                  <TableCell>{user.active ? "Активен" : "Отключен"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Новый доступ</CardTitle>
          <CardDescription>ADMIN, MANAGER или VIEWER</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-col gap-4" onSubmit={onCreateUser}>
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor="access-login">Логин</FieldLabel>
                <Input disabled={!canAdmin} id="access-login" name="login" required />
              </Field>
              <Field>
                <FieldLabel htmlFor="access-name">Имя</FieldLabel>
                <Input
                  disabled={!canAdmin}
                  id="access-name"
                  name="displayName"
                  required
                />
              </Field>
              <Field>
                <FieldLabel>Роль</FieldLabel>
                <Select
                  disabled={!canAdmin}
                  onValueChange={(value) => onRoleChange(value as SessionRole)}
                  value={newUserRole}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      <SelectItem value="VIEWER">VIEWER</SelectItem>
                      <SelectItem value="MANAGER">MANAGER</SelectItem>
                      <SelectItem value="ADMIN">ADMIN</SelectItem>
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </Field>
              <Field>
                <FieldLabel htmlFor="access-password">Пароль</FieldLabel>
                <Input
                  disabled={!canAdmin}
                  id="access-password"
                  minLength={6}
                  name="password"
                  required
                  type="password"
                />
              </Field>
            </FieldGroup>
            <Button disabled={!canAdmin || isPending} type="submit">
              <KeyRoundIcon data-icon="inline-start" />
              Создать
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded-md border bg-background p-2">
      <p className="text-[11px] text-muted-foreground">{label}</p>
      <p className="text-lg font-semibold tabular-nums">{value}</p>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <span className="text-sm">{value || "Не заполнено"}</span>
    </div>
  );
}

function LongDetail({ label, value }: { label: string; value?: string | null }) {
  if (!value) {
    return null;
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] font-medium uppercase text-muted-foreground">
        {label}
      </span>
      <p className="max-h-72 overflow-auto whitespace-pre-wrap rounded-md border bg-background p-2 text-sm leading-6">
        {value}
      </p>
    </div>
  );
}

const businessBlockLabels: Record<keyof PauBusinessBlock, string> = {
  sphere: "Сфера деятельности",
  specifics: "Специфика компании",
  role: "Роль / должность",
  experience: "Опыт в должности",
  okved: "ОКВЭД",
  sharePercent: "Доля в компании",
  revenue: "Оборот бизнеса",
  rusprofileUrl: "Rusprofile",
  siteUrl: "Сайт компании",
};

const enrichmentLabels: Record<string, string> = {
  keyProjects: "Ключевые проекты",
  clubConnections: "Связи внутри клуба",
  wasInCommunity: "Состоял ли в сообществе",
  previousCommunities: "Предыдущие сообщества",
  clubGoals: "Цели/задачи по клубу",
  hobbies: "Увлечения/хобби",
  personalIncome: "Личный доход",
  mentionsLinks: "Упоминания в сети",
  additionalInfo: "Дополнительная информация",
  familyKids: "Семья/дети",
  newProjects: "Новые проекты",
  usefulForClub: "Чем полезен клубу",
};

function BusinessBlockDetails({
  block,
  fallbackSphere,
  title,
}: {
  block: PauBusinessBlock | null;
  fallbackSphere?: string | null;
  title: string;
}) {
  const resolvedBlock = block ?? (fallbackSphere ? { sphere: fallbackSphere } : null);
  return (
    <KeyValueDetails
      emptyText="Не заполнено"
      items={resolvedBlock}
      labels={businessBlockLabels}
      showEmptyRows={Boolean(resolvedBlock)}
      title={title}
    />
  );
}

function KeyValueDetails({
  emptyText,
  items,
  labels,
  showEmptyRows = false,
  title,
}: {
  emptyText: string;
  items?: Record<string, unknown> | null;
  labels: Record<string, string>;
  showEmptyRows?: boolean;
  title: string;
}) {
  const rows = Object.entries(labels).flatMap(([key, label]) => {
    const value = formatDetailValue(items?.[key]);
    if (value) {
      return [{ key, label, value, isEmpty: false }];
    }

    return showEmptyRows ? [{ key, label, value: emptyText, isEmpty: true }] : [];
  });

  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[11px] font-medium uppercase text-muted-foreground">
        {title}
      </span>
      {rows.length > 0 ? (
        <dl className="grid gap-1.5 text-sm">
          {rows.map((row) => (
            <div className="grid gap-0.5" key={row.key}>
              <dt className="text-[11px] text-muted-foreground">{row.label}</dt>
              <dd
                className={cn(
                  "break-words",
                  row.isEmpty && "text-muted-foreground"
                )}
              >
                {row.value}
              </dd>
            </div>
          ))}
        </dl>
      ) : (
        <span className="text-sm">{emptyText}</span>
      )}
    </div>
  );
}

function formatDetailValue(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (Array.isArray(value)) {
    const text = value
      .map((item) => formatDetailValue(item))
      .filter(Boolean)
      .join(", ");
    return text || null;
  }

  if (typeof value === "object") {
    return null;
  }

  const text = String(value).trim();
  return text || null;
}

function IntegrationBadge({ label, ready }: { label: string; ready: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border bg-card p-3 text-sm">
      <span>{label}</span>
      <Badge variant={ready ? "secondary" : "outline"}>
        {ready ? "ready" : "off"}
      </Badge>
    </div>
  );
}

function StatusBadge({ status }: { status: PauEvent["status"] }) {
  if (status === "UPCOMING") {
    return (
      <Badge variant="secondary">
        <CalendarDaysIcon data-icon="inline-start" />
        upcoming
      </Badge>
    );
  }

  if (status === "PAST") {
    return (
      <Badge variant="outline">
        <ClockIcon />
        past
      </Badge>
    );
  }

  return <Badge variant="outline">{status.toLowerCase()}</Badge>;
}

function ParticipantStatusBadge({
  status,
}: {
  status: PauEventParticipant["status"];
}) {
  const variant = status === "REFUSED" || status === "MISSED" ? "outline" : "secondary";
  return <Badge variant={variant}>{participantStatusLabel(status)}</Badge>;
}

function KindBadge({ kind }: { kind: PauEventParticipant["kind"] }) {
  return <Badge variant={kind === "ACTIVE" ? "secondary" : "outline"}>{kind}</Badge>;
}

function sectionTitle(section: SectionId) {
  if (section === "preparation") {
    return "Подготовка";
  }

  if (section === "formats") {
    return "Форматы";
  }

  if (section === "history") {
    return "История";
  }

  return "Аккаунт и доступы";
}

function participantStatusLabel(status: PauEventParticipant["status"]) {
  const labels: Record<PauEventParticipant["status"], string> = {
    INVITED: "приглашен",
    CONFIRMED: "подтвердил",
    REFUSED: "отказ",
    ATTENDED: "дошел",
    MISSED: "не пришел",
    UNKNOWN: "неизвестно",
  };
  return labels[status] ?? status.toLowerCase();
}

function toFormatDraft(format: PauFormat): FormatDraft {
  return {
    ...format,
    bitrixEventTypeIdsText: format.bitrixEventTypeIds.join(", "),
    matchingRulesText:
      typeof format.matchingRules === "string"
        ? format.matchingRules
        : JSON.stringify(format.matchingRules ?? {}, null, 2),
  };
}

function formatDraftToPatch(format: FormatDraft) {
  return {
    slug: format.slug,
    name: format.name,
    description: format.description,
    audience: format.audience,
    moderatorNotes: format.moderatorNotes,
    bitrixSyncTitleQuery: format.bitrixSyncTitleQuery.trim(),
    bitrixEventTypeIds: format.bitrixEventTypeIdsText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean),
    matchingRules: parseJsonOrString(format.matchingRulesText),
    promptPotential: format.promptPotential,
    promptActive: format.promptActive,
    promptModerator: format.promptModerator,
    promptReport: format.promptReport,
  };
}

function parseJsonOrString(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return {};
  }

  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return trimmed;
  }
}

function formatDate(value: string | null) {
  if (!value) {
    return "дата не задана";
  }

  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatInteger(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}

function ClockIcon() {
  return <HistoryIcon data-icon="inline-start" />;
}

"use client";

import type { FormEvent } from "react";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import type { LucideIcon } from "lucide-react";
import {
  ArrowLeftIcon,
  CalendarDaysIcon,
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
  PauEvent,
  PauEventParticipant,
  PauFormat,
  PauUser,
  PauWorkspaceSnapshot,
} from "@/lib/pau/types";
import { summarizeFormatCard } from "@/lib/pau/format-cards";
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
  const [selectedParticipantId, setSelectedParticipantId] = useState<string | null>(
    initialData.upcomingEvents[0]?.participants[0]?.id ?? null
  );
  const [formatDrafts, setFormatDrafts] = useState(() =>
    initialData.formats.map(toFormatDraft)
  );
  const [editingFormatSlug, setEditingFormatSlug] = useState<string | null>(null);
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
  const selectedParticipant =
    selectedEvent?.participants.find(
      (participant) => participant.id === selectedParticipantId
    ) ??
    selectedEvent?.participants[0] ??
    null;

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
              onBriefs={generateBriefs}
              onExport={(eventId) => {
                window.location.href = `/api/events/${eventId}/export`;
              }}
              onMatch={matchEvent}
              onParticipantSelect={setSelectedParticipantId}
              onSelectEvent={(eventId) => {
                setSelectedEventId(eventId);
                const event = [...data.upcomingEvents, ...data.pastEvents].find(
                  (candidate) => candidate.id === eventId
                );
                setSelectedParticipantId(event?.participants[0]?.id ?? null);
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
              onEdit={setEditingFormatSlug}
              onSave={saveFormats}
            />
          ) : null}

          {activeSection === "history" ? (
            <HistoryView
              events={data.pastEvents}
              onParticipantSelect={setSelectedParticipantId}
              onSelectEvent={setSelectedEventId}
              selectedEvent={selectedEvent}
              selectedEventId={selectedEventId}
              selectedParticipant={selectedParticipant}
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
  onBriefs,
  onExport,
  onMatch,
  onParticipantSelect,
  onSelectEvent,
  selectedEvent,
  selectedEventId,
  selectedParticipant,
}: {
  canManage: boolean;
  data: PauWorkspaceSnapshot;
  isPending: boolean;
  onBriefs: (eventId: string) => void;
  onExport: (eventId: string) => void;
  onMatch: (eventId: string) => void;
  onParticipantSelect: (participantId: string) => void;
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
      </section>

      {selectedEvent ? (
        <section className="flex min-w-0 flex-col gap-5">
          <EventHeader
            canManage={canManage}
            databaseEnabled={!data.demoMode}
            event={selectedEvent}
            integrations={data.integrationStatus}
            isPending={isPending}
            onBriefs={onBriefs}
            onExport={onExport}
            onMatch={onMatch}
          />
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <ParticipantsTable
              onParticipantSelect={onParticipantSelect}
              participants={selectedEvent.participants}
              selectedParticipantId={selectedParticipant?.id ?? null}
            />
            <ParticipantDetails participant={selectedParticipant} />
          </div>
        </section>
      ) : null}
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
  onParticipantSelect,
  participants,
  selectedParticipantId,
}: {
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
  participant: PauEventParticipant | null;
}) {
  if (!participant) {
    return (
      <Empty className="rounded-md border">
        <EmptyHeader>
          <EmptyTitle>Сделка не выбрана</EmptyTitle>
          <EmptyDescription>Выберите участника из списка.</EmptyDescription>
        </EmptyHeader>
      </Empty>
    );
  }

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
      <Detail label="Контакт" value={[participant.phone, participant.email, participant.telegram].filter(Boolean).join(" · ")} />
      <Detail label="Должность" value={participant.position} />
      <Detail label="Город" value={participant.city} />
      <Detail label="Возраст / пол" value={[participant.age, participant.gender].filter(Boolean).join(" · ")} />
      <Separator />
      <Detail label="Основной бизнес" value={participant.businessMain} />
      <Detail label="Доп бизнес 1" value={participant.businessExtra1} />
      <Detail label="Доп бизнес 2" value={participant.businessExtra2} />
      <Detail label="Доп бизнес 3" value={participant.businessExtra3} />
      <Detail label="Обогащение" value={formatUnknown(participant.enrichment)} />
      <Separator />
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
  onEdit,
  onSave,
}: {
  canManage: boolean;
  drafts: FormatDraft[];
  editingSlug: string | null;
  isPending: boolean;
  onBack: () => void;
  onChange: (slug: string, patch: Partial<FormatDraft>) => void;
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
  onEdit,
}: {
  canManage: boolean;
  format: FormatDraft;
  isPending: boolean;
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

function HistoryView({
  events,
  onParticipantSelect,
  onSelectEvent,
  selectedEvent,
  selectedEventId,
  selectedParticipant,
}: {
  events: PauEvent[];
  onParticipantSelect: (participantId: string) => void;
  onSelectEvent: (eventId: string) => void;
  selectedEvent: PauEvent | null;
  selectedEventId: string | null;
  selectedParticipant: PauEventParticipant | null;
}) {
  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(280px,0.42fr)_minmax(0,1fr)]">
      <section className="flex flex-col gap-2">
        {events.length > 0 ? (
          events.map((event) => (
            <button
              className={cn(
                "rounded-md border bg-card p-3 text-left transition-colors hover:bg-accent hover:text-accent-foreground",
                selectedEventId === event.id && "border-ring bg-accent"
              )}
              key={event.id}
              onClick={() => onSelectEvent(event.id)}
              type="button"
            >
              <p className="truncate text-sm font-medium">{event.title}</p>
              <p className="text-xs text-muted-foreground">
                {formatDate(event.startsAt)} · дошли {event.counts.attended}
              </p>
              <div className="mt-3 grid grid-cols-4 gap-2 text-xs">
                <Count label="Звали" value={event.counts.invited} />
                <Count label="Да" value={event.counts.confirmed} />
                <Count label="Нет" value={event.counts.refused} />
                <Count label="No-show" value={event.counts.missed} />
              </div>
            </button>
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
        <section className="flex min-w-0 flex-col gap-5">
          <EventHeader
            canManage={false}
            databaseEnabled={false}
            event={selectedEvent}
            integrations={{
              database: false,
              bitrix: false,
              matching: false,
              openrouter: false,
            }}
            isPending={false}
            onBriefs={() => undefined}
            onExport={() => undefined}
            onMatch={() => undefined}
          />
          <div className="grid gap-5 2xl:grid-cols-[minmax(0,1fr)_360px]">
            <ParticipantsTable
              onParticipantSelect={onParticipantSelect}
              participants={selectedEvent.participants}
              selectedParticipantId={selectedParticipant?.id ?? null}
            />
            <ParticipantDetails participant={selectedParticipant} />
          </div>
        </section>
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

function Count({ label, value }: { label: string; value: number }) {
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

function formatUnknown(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }

  return typeof value === "string" ? value : JSON.stringify(value);
}

function ClockIcon() {
  return <HistoryIcon data-icon="inline-start" />;
}

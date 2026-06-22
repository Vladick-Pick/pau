"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useReducer,
  useState,
  useTransition,
} from "react";
import {
  CalendarDaysIcon,
  CircleUserRoundIcon,
  HistoryIcon,
  KeyRoundIcon,
  LogOutIcon,
  RefreshCwIcon,
  Settings2Icon,
  Loader2Icon,
  UsersIcon,
} from "lucide-react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
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
import type { SessionRole } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

import { ClubSwitcher } from "./club-switcher";
import { SummaryStats } from "./summary-stats";
import { RulesPanel } from "./rules-panel";
import { RolesPanel } from "./roles-panel";
import { ActiveParticipantList } from "./active-participant-list";
import { ParticipantInspector } from "./participant-inspector";
import type {
  ActiveParticipantSummary,
  Club,
  ClubRole,
  ClubRule,
  ParticipantDetail,
  StatusFilter,
  SortBy,
} from "./types";

type Props = {
  role: SessionRole;
  userName: string;
  logoutAction: () => Promise<void>;
};

type LoadState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ok" };

type Action =
  | { type: "SET_CLUBS"; clubs: Club[] }
  | { type: "SET_PARTICIPANTS"; participants: ActiveParticipantSummary[] }
  | { type: "SET_ROLES"; roles: ClubRole[] }
  | { type: "SET_RULES"; rules: ClubRule[] }
  | { type: "SET_DETAIL"; detail: ParticipantDetail | null }
  | { type: "SET_CLUB_ID"; clubId: string }
  | { type: "SET_STATUS_FILTER"; filter: StatusFilter }
  | { type: "SET_SORT"; sort: SortBy }
  | { type: "SET_QUERY"; query: string }
  | { type: "SET_SELECTED"; profileId: string | null }
  | { type: "OPTIMISTIC_READINESS"; profileId: string; formatId: string; readiness: string }
  | { type: "SET_PARTICIPANTS_LOAD"; state: LoadState }
  | { type: "SET_DETAIL_LOAD"; state: LoadState };

type State = {
  clubs: Club[];
  participants: ActiveParticipantSummary[];
  roles: ClubRole[];
  rules: ClubRule[];
  detail: ParticipantDetail | null;
  selectedClubId: string | null;
  statusFilter: StatusFilter;
  sortBy: SortBy;
  query: string;
  selectedProfileId: string | null;
  participantsLoad: LoadState;
  detailLoad: LoadState;
};

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SET_CLUBS":
      return { ...state, clubs: action.clubs };
    case "SET_PARTICIPANTS":
      return { ...state, participants: action.participants };
    case "SET_ROLES":
      return { ...state, roles: action.roles };
    case "SET_RULES":
      return { ...state, rules: action.rules };
    case "SET_DETAIL":
      return { ...state, detail: action.detail };
    case "SET_CLUB_ID":
      return {
        ...state,
        selectedClubId: action.clubId,
        selectedProfileId: null,
        detail: null,
        participants: [],
        roles: [],
        rules: [],
      };
    case "SET_STATUS_FILTER":
      return { ...state, statusFilter: action.filter };
    case "SET_SORT":
      return { ...state, sortBy: action.sort };
    case "SET_QUERY":
      return { ...state, query: action.query };
    case "SET_SELECTED":
      return { ...state, selectedProfileId: action.profileId };
    case "OPTIMISTIC_READINESS":
      return {
        ...state,
        participants: state.participants.map((p) =>
          p.profileId === action.profileId
            ? {
                ...p,
                readiness: p.readiness.some((r) => r.formatId === action.formatId)
                  ? p.readiness.map((r) =>
                      r.formatId === action.formatId
                        ? { ...r, readiness: action.readiness }
                        : r
                    )
                  : [...p.readiness, { formatId: action.formatId, readiness: action.readiness }],
              }
            : p
        ),
        detail:
          state.detail?.profileId === action.profileId
            ? {
                ...state.detail,
                readiness: state.detail.readiness.some(
                  (r) => r.formatId === action.formatId
                )
                  ? state.detail.readiness.map((r) =>
                      r.formatId === action.formatId
                        ? { ...r, readiness: action.readiness }
                        : r
                    )
                  : [
                      ...state.detail.readiness,
                      { formatId: action.formatId, readiness: action.readiness },
                    ],
              }
            : state.detail,
      };
    case "SET_PARTICIPANTS_LOAD":
      return { ...state, participantsLoad: action.state };
    case "SET_DETAIL_LOAD":
      return { ...state, detailLoad: action.state };
    default:
      return state;
  }
}

const initialState: State = {
  clubs: [],
  participants: [],
  roles: [],
  rules: [],
  detail: null,
  selectedClubId: null,
  statusFilter: "all",
  sortBy: "status",
  query: "",
  selectedProfileId: null,
  participantsLoad: { status: "idle" },
  detailLoad: { status: "idle" },
};

const canManage = (role: SessionRole) =>
  role === "ADMIN" || role === "MANAGER";

export function ActiveParticipantsConsole({
  role,
  userName,
  logoutAction,
}: Props) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const [configOpen, setConfigOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  // Load clubs on mount
  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch("/api/clubs");
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const body = (await res.json()) as { data: Club[] };
        const clubs = body.data ?? [];
        dispatch({ type: "SET_CLUBS", clubs });
        if (clubs.length > 0 && !state.selectedClubId) {
          dispatch({ type: "SET_CLUB_ID", clubId: clubs[0].id });
        }
      } catch {
        // ignore - will show empty state
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load participants + roles + rules when club changes
  const loadClubData = useCallback(
    async (clubId: string) => {
      dispatch({ type: "SET_PARTICIPANTS_LOAD", state: { status: "loading" } });
      try {
        const [pRes, rolesRes, rulesRes] = await Promise.all([
          fetch(`/api/clubs/${clubId}/active-participants`),
          fetch(`/api/clubs/${clubId}/roles`),
          fetch(`/api/clubs/${clubId}/rules`),
        ]);

        if (pRes.status === 401 || rolesRes.status === 401 || rulesRes.status === 401) {
          window.location.href = "/login";
          return;
        }

        const [pBody, rolesBody, rulesBody] = await Promise.all([
          pRes.json() as Promise<{ data: ActiveParticipantSummary[] }>,
          rolesRes.json() as Promise<{ data: ClubRole[] }>,
          rulesRes.json() as Promise<{ data: ClubRule[] }>,
        ]);

        dispatch({ type: "SET_PARTICIPANTS", participants: pBody.data ?? [] });
        dispatch({ type: "SET_ROLES", roles: rolesBody.data ?? [] });
        dispatch({ type: "SET_RULES", rules: rulesBody.data ?? [] });
        dispatch({ type: "SET_PARTICIPANTS_LOAD", state: { status: "ok" } });
      } catch (err) {
        dispatch({
          type: "SET_PARTICIPANTS_LOAD",
          state: {
            status: "error",
            message: err instanceof Error ? err.message : "Ошибка загрузки",
          },
        });
      }
    },
    []
  );

  useEffect(() => {
    if (state.selectedClubId) {
      void loadClubData(state.selectedClubId);
    }
  }, [state.selectedClubId, loadClubData]);

  // Load participant detail when selection changes
  useEffect(() => {
    if (!state.selectedClubId || !state.selectedProfileId) {
      dispatch({ type: "SET_DETAIL", detail: null });
      return;
    }

    dispatch({ type: "SET_DETAIL_LOAD", state: { status: "loading" } });
    void (async () => {
      try {
        const res = await fetch(
          `/api/clubs/${state.selectedClubId}/participants/${state.selectedProfileId}`
        );
        if (res.status === 401) {
          window.location.href = "/login";
          return;
        }
        const body = (await res.json()) as { data: ParticipantDetail; error?: string };
        if (!res.ok) {
          throw new Error(body.error ?? "Participant not found");
        }
        dispatch({ type: "SET_DETAIL", detail: body.data });
        dispatch({ type: "SET_DETAIL_LOAD", state: { status: "ok" } });
      } catch (err) {
        dispatch({
          type: "SET_DETAIL_LOAD",
          state: {
            status: "error",
            message: err instanceof Error ? err.message : "Ошибка загрузки",
          },
        });
      }
    })();
  }, [state.selectedClubId, state.selectedProfileId]);

  const handleClubChange = useCallback((clubId: string) => {
    dispatch({ type: "SET_CLUB_ID", clubId });
  }, []);

  const handleRefresh = useCallback(() => {
    if (state.selectedClubId) {
      startTransition(() => {
        void loadClubData(state.selectedClubId!);
      });
    }
  }, [state.selectedClubId, loadClubData]);

  const handleRuleToggle = useCallback(
    async (ruleId: string, enabled: boolean) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(`/api/clubs/${state.selectedClubId}/rules/${ruleId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ enabled }),
        });
        await loadClubData(state.selectedClubId);
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleCreateRole = useCallback(
    async (name: string, description?: string) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(`/api/clubs/${state.selectedClubId}/roles`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, description }),
        });
        await loadClubData(state.selectedClubId);
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleDeleteRole = useCallback(
    async (roleId: string) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(`/api/clubs/${state.selectedClubId}/roles/${roleId}`, {
          method: "DELETE",
        });
        await loadClubData(state.selectedClubId);
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleAssignRole = useCallback(
    async (roleId: string, profileId: string) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(
          `/api/clubs/${state.selectedClubId}/roles/${roleId}/assignments`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileId }),
          }
        );
        await loadClubData(state.selectedClubId);
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleUnassignRole = useCallback(
    async (roleId: string, profileId: string) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(
          `/api/clubs/${state.selectedClubId}/roles/${roleId}/assignments`,
          {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ profileId }),
          }
        );
        await loadClubData(state.selectedClubId);
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleReadinessChange = useCallback(
    async (profileId: string, formatId: string, readiness: string) => {
      if (!state.selectedClubId) return;
      // Optimistic update
      dispatch({ type: "OPTIMISTIC_READINESS", profileId, formatId, readiness });
      try {
        await fetch(
          `/api/clubs/${state.selectedClubId}/participants/${profileId}/readiness`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ formatId, readiness }),
          }
        );
      } catch {
        // Reconcile by reloading
        await loadClubData(state.selectedClubId!);
      }
    },
    [state.selectedClubId, loadClubData]
  );

  const handleNoteChange = useCallback(
    async (profileId: string, note: string) => {
      if (!state.selectedClubId) return;
      try {
        await fetch(
          `/api/clubs/${state.selectedClubId}/participants/${profileId}/note`,
          {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ note }),
          }
        );
        // Refresh detail
        if (state.selectedProfileId === profileId) {
          const res = await fetch(
            `/api/clubs/${state.selectedClubId}/participants/${profileId}`
          );
          const body = (await res.json()) as { data: ParticipantDetail };
          dispatch({ type: "SET_DETAIL", detail: body.data });
        }
      } catch {
        // ignore
      }
    },
    [state.selectedClubId, state.selectedProfileId, loadClubData]
  );

  const selectedClub = useMemo(
    () => state.clubs.find((c) => c.id === state.selectedClubId) ?? null,
    [state.clubs, state.selectedClubId]
  );

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
                  <span className="truncate text-xs">активные участники</span>
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
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Подготовка"
                    render={<Link href="/" />}
                  >
                    <CalendarDaysIcon />
                    <span>Подготовка</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive
                    tooltip="Участники"
                    render={<Link href="/active-participants" />}
                  >
                    <UsersIcon />
                    <span>Участники</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="Форматы"
                    render={<Link href="/" />}
                  >
                    <Settings2Icon />
                    <span>Форматы</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    tooltip="История"
                    render={<Link href="/" />}
                  >
                    <HistoryIcon />
                    <span>История</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>

        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton
                tooltip="Доступы"
                render={<Link href="/" />}
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
        <header className="sticky top-0 z-10 flex min-h-14 items-center gap-3 border-b bg-background/80 px-4 backdrop-blur-sm lg:px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="min-h-5" />
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-base font-semibold">Активные участники</h1>
            <p className="truncate text-xs text-muted-foreground">
              Кто активен по правилам, в каких ролях и к каким форматам готов
            </p>
          </div>
          <div className="flex items-center gap-2">
            <ClubSwitcher
              clubs={state.clubs}
              selectedClubId={state.selectedClubId}
              onSelect={handleClubChange}
            />
            <Button
              disabled={isPending || !state.selectedClubId}
              onClick={handleRefresh}
              size="icon-sm"
              variant="outline"
            >
              {isPending ? (
                <Loader2Icon data-icon="icon" className="animate-spin" />
              ) : (
                <RefreshCwIcon />
              )}
            </Button>
          </div>
        </header>

        <main className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
          {/* Summary KPIs */}
          <SummaryStats
            participants={state.participants}
            loading={state.participantsLoad.status === "loading"}
          />

          {/* Rules + Roles config (collapsible) */}
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Кто считается активным участником
            </h2>
            <button
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border bg-card px-3 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
              )}
              type="button"
              onClick={() => setConfigOpen((v) => !v)}
              aria-expanded={configOpen}
            >
              {configOpen ? "Скрыть" : "Правила и роли"}
              <svg
                aria-hidden="true"
                className={cn(
                  "size-3.5 transition-transform duration-200",
                  configOpen && "rotate-180"
                )}
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                viewBox="0 0 24 24"
              >
                <path d="m6 9 6 6 6-6" />
              </svg>
            </button>
          </div>

          {configOpen && (
            <div className="grid gap-3 xl:grid-cols-[minmax(0,1.55fr)_minmax(280px,1fr)]">
              <RulesPanel
                canManage={canManage(role)}
                clubId={state.selectedClubId}
                rules={state.rules}
                onToggle={handleRuleToggle}
              />
              <RolesPanel
                canManage={canManage(role)}
                roles={state.roles}
                participants={state.participants}
                onCreate={handleCreateRole}
                onDelete={handleDeleteRole}
              />
            </div>
          )}

          {/* Main workspace */}
          <section
            className={cn(
              "grid gap-4 items-start",
              state.selectedProfileId &&
                "xl:grid-cols-[minmax(0,1fr)_396px]"
            )}
            id="workspace"
          >
            <ActiveParticipantList
              participants={state.participants}
              roles={state.roles}
              selectedProfileId={state.selectedProfileId}
              statusFilter={state.statusFilter}
              sortBy={state.sortBy}
              query={state.query}
              loading={state.participantsLoad.status === "loading"}
              error={
                state.participantsLoad.status === "error"
                  ? state.participantsLoad.message
                  : null
              }
              onSelect={(profileId) =>
                dispatch({ type: "SET_SELECTED", profileId })
              }
              onStatusFilter={(filter) =>
                dispatch({ type: "SET_STATUS_FILTER", filter })
              }
              onSortChange={(sort) =>
                dispatch({ type: "SET_SORT", sort })
              }
              onQueryChange={(query) =>
                dispatch({ type: "SET_QUERY", query })
              }
            />

            {state.selectedProfileId && (
              <ParticipantInspector
                detail={state.detail}
                roles={state.roles}
                loading={state.detailLoad.status === "loading"}
                canManage={canManage(role)}
                selectedClub={selectedClub}
                onClose={() =>
                  dispatch({ type: "SET_SELECTED", profileId: null })
                }
                onReadinessChange={handleReadinessChange}
                onNoteChange={handleNoteChange}
                onAssignRole={handleAssignRole}
                onUnassignRole={handleUnassignRole}
              />
            )}
          </section>
        </main>
      </SidebarInset>
    </SidebarProvider>
  );
}

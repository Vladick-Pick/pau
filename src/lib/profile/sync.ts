import type {
  BusinessEvent,
  ProfileEnvelopeData,
  ProfileSearchItem,
  Workspace,
} from "./types";
import type { ListEventsParams, SearchProfilesParams } from "./client";
import { createProfileClientFromEnv } from "./client";
import { deriveDossier, deriveFacts, deriveParticipation } from "./facts";
import { parseLooseDate } from "./mapping";
import { getOrSeedClub, upsertMemberProfile } from "@/lib/pau/active-store";

// ── Injectable source interface ───────────────────────────────────────────────

export interface ProfileSource {
  listWorkspaces(): Promise<Workspace[]>;
  collectProfiles(params: SearchProfilesParams): Promise<ProfileSearchItem[]>;
  getProfile(id: string): Promise<ProfileEnvelopeData>;
  collectBusinessEvents(id: string, params?: ListEventsParams): Promise<BusinessEvent[]>;
}

// ── Result shape ──────────────────────────────────────────────────────────────

export interface SyncResult {
  clubId: string;
  synced: number;
  failed: number;
}

// ── Concurrency helper ────────────────────────────────────────────────────────

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let index = 0;

  async function worker(): Promise<void> {
    while (index < items.length) {
      const i = index++;
      results[i] = await fn(items[i]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, worker);
  await Promise.all(workers);
  return results;
}

// ── syncClub ──────────────────────────────────────────────────────────────────

export async function syncClub(
  clubId: string,
  source?: ProfileSource,
  clubName?: string
): Promise<SyncResult> {
  const client = source ?? createProfileClientFromEnv();

  await getOrSeedClub(clubId, clubName ?? clubId);

  const members = await client.collectProfiles({
    workspaceId: clubId,
    state: ["active"],
  });

  let synced = 0;
  let failed = 0;

  await mapWithConcurrency(members, 4, async (member) => {
    try {
      const [envelope, events] = await Promise.all([
        client.getProfile(member.id),
        client.collectBusinessEvents(member.id),
      ]);

      await upsertMemberProfile({
        clubId,
        profileId: member.id,
        displayName: envelope.display_name ?? member.display_name ?? null,
        stateCode: member.states?.[0]?.code ?? "active",
        facts: deriveFacts(envelope.profile, events),
        dossier: deriveDossier(envelope.profile),
        participation: deriveParticipation(events),
        profileUpdatedAt: parseLooseDate(envelope.profile_updated_at),
      });

      synced++;
    } catch (err) {
      failed++;
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[profile-sync] Failed to sync member ${member.id}: ${message}`);
    }
  });

  return { clubId, synced, failed };
}

// ── syncAllClubs ──────────────────────────────────────────────────────────────

export async function syncAllClubs(source?: ProfileSource): Promise<SyncResult[]> {
  const client = source ?? createProfileClientFromEnv();

  const workspaces = await client.listWorkspaces();
  const results: SyncResult[] = [];

  for (const ws of workspaces) {
    try {
      const result = await syncClub(ws.id, client, ws.name ?? undefined);
      results.push(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.warn(`[profile-sync] Failed to sync club ${ws.id}: ${message}`);
      results.push({ clubId: ws.id, synced: 0, failed: -1 });
    }
  }

  return results;
}

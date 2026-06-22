import { getOptionalEnv, getRequiredEnv } from "../env";
import type {
  ApiItemEnvelope,
  ApiListEnvelope,
  BusinessEvent,
  ProfileEnvelopeData,
  ProfileSearchItem,
  Workspace,
} from "./types";

export interface ProfileClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  version?: string;
  maxRetries?: number;
  retryDelayMs?: number;
}

export interface SearchProfilesParams {
  workspaceId?: string;
  q?: string;
  bitrixId?: string;
  category?: string[];
  state?: string[];
  limit?: number;
  cursor?: string;
}

export interface ListEventsParams {
  eventType?: string[];
  category?: string[];
  dateFrom?: string;
  dateTo?: string;
  limit?: number;
  cursor?: string;
}

export class ProfileApiError extends Error {
  code: string;
  status: number;

  constructor(code: string, status: number, message: string) {
    super(message);
    this.name = "ProfileApiError";
    this.code = code;
    this.status = status;
  }
}

export class ProfileApiClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly version: string;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(opts: ProfileClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetchImpl ?? globalThis.fetch;
    this.version = opts.version ?? "v1";
    this.maxRetries = opts.maxRetries ?? 3;
    this.retryDelayMs = opts.retryDelayMs ?? 300;
  }

  async listWorkspaces(): Promise<Workspace[]> {
    const envelope = await this.request<ApiItemEnvelope<Workspace[]>>(
      "/workspaces"
    );
    return envelope.data;
  }

  async searchProfiles(
    params: SearchProfilesParams
  ): Promise<ApiListEnvelope<ProfileSearchItem>> {
    return this.request<ApiListEnvelope<ProfileSearchItem>>(
      "/profiles",
      buildProfilesQuery(params)
    );
  }

  async collectProfiles(params: SearchProfilesParams): Promise<ProfileSearchItem[]> {
    const all: ProfileSearchItem[] = [];
    let cursor: string | null | undefined = params.cursor;

    while (true) {
      const page = await this.searchProfiles({ ...params, cursor: cursor ?? undefined });
      all.push(...page.data);

      cursor = page.pagination.next_cursor;
      if (!cursor) {
        break;
      }
    }

    return all;
  }

  async getProfile(id: string): Promise<ProfileEnvelopeData> {
    const envelope = await this.request<ApiItemEnvelope<ProfileEnvelopeData>>(
      `/profiles/${encodeURIComponent(id)}`
    );
    return envelope.data;
  }

  async listBusinessEvents(
    id: string,
    params?: ListEventsParams
  ): Promise<ApiListEnvelope<BusinessEvent>> {
    return this.request<ApiListEnvelope<BusinessEvent>>(
      `/profiles/${encodeURIComponent(id)}/business-events`,
      buildEventsQuery(params ?? {})
    );
  }

  async collectBusinessEvents(
    id: string,
    params?: ListEventsParams
  ): Promise<BusinessEvent[]> {
    const all: BusinessEvent[] = [];
    let cursor: string | null | undefined = params?.cursor;

    while (true) {
      const page = await this.listBusinessEvents(id, {
        ...params,
        cursor: cursor ?? undefined,
      });
      all.push(...page.data);

      cursor = page.pagination.next_cursor;
      if (!cursor) {
        break;
      }
    }

    return all;
  }

  private async request<T>(path: string, query?: URLSearchParams): Promise<T> {
    const url = buildUrl(this.baseUrl, this.version, path, query);
    let lastError: unknown;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        const response = await this.fetchImpl(url, {
          headers: {
            Authorization: `Bearer ${this.token}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          let code = "http_error";
          let message = response.statusText;

          try {
            const errorBody = (await response.json()) as {
              error?: { code?: string; message?: string };
            };
            if (errorBody.error?.code) {
              code = errorBody.error.code;
            }
            if (errorBody.error?.message) {
              message = errorBody.error.message;
            }
          } catch {
            // ignore JSON parse failures — use fallback code/message
          }

          const apiError = new ProfileApiError(code, response.status, message);

          // Do not retry 4xx
          if (response.status >= 400 && response.status < 500) {
            throw apiError;
          }

          // 5xx — retry unless exhausted
          lastError = apiError;
          if (attempt < this.maxRetries) {
            await delay(this.retryDelayMs * attempt);
            continue;
          }
          throw apiError;
        }

        return (await response.json()) as T;
      } catch (err) {
        // Re-throw 4xx immediately (already thrown above)
        if (err instanceof ProfileApiError && err.status >= 400 && err.status < 500) {
          throw err;
        }

        lastError = err;

        // Only retry on network errors (non-ProfileApiError throws)
        if (!(err instanceof ProfileApiError)) {
          if (attempt < this.maxRetries) {
            await delay(this.retryDelayMs * attempt);
            continue;
          }
          throw err;
        }

        // 5xx ProfileApiError — already handled above; propagate if exhausted
        throw err;
      }
    }

    // unreachable: loop always returns or throws; satisfies TS control-flow
    throw lastError;
  }
}

export function createProfileClientFromEnv(): ProfileApiClient {
  const baseUrl =
    getOptionalEnv("PROFILE_API_BASE_URL") ?? "https://profile.communitytech.group";
  const token = getRequiredEnv("PROFILE_API_TOKEN");

  return new ProfileApiClient({ baseUrl, token });
}

// ─── helpers ────────────────────────────────────────────────────────────────

function buildUrl(
  baseUrl: string,
  version: string,
  path: string,
  query?: URLSearchParams
): string {
  const base = `${baseUrl}/api/${version}${path}`;
  if (!query || [...query.keys()].length === 0) {
    return base;
  }
  return `${base}?${query.toString()}`;
}

function buildProfilesQuery(params: SearchProfilesParams): URLSearchParams {
  const q = new URLSearchParams();

  if (params.workspaceId) q.set("workspace_id", params.workspaceId);
  if (params.q) q.set("q", params.q);
  if (params.bitrixId) q.set("bitrix_id", params.bitrixId);
  for (const cat of params.category ?? []) q.append("category", cat);
  for (const st of params.state ?? []) q.append("state", st);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);

  return q;
}

function buildEventsQuery(params: ListEventsParams): URLSearchParams {
  const q = new URLSearchParams();

  for (const et of params.eventType ?? []) q.append("event_type", et);
  for (const cat of params.category ?? []) q.append("category", cat);
  if (params.dateFrom) q.set("date_from", params.dateFrom);
  if (params.dateTo) q.set("date_to", params.dateTo);
  if (params.limit !== undefined) q.set("limit", String(params.limit));
  if (params.cursor) q.set("cursor", params.cursor);

  return q;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

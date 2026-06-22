import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  ProfileApiClient,
  ProfileApiError,
} from "@/lib/profile/client";
import type { ProfileClientOptions } from "@/lib/profile/client";
import type {
  ApiListEnvelope,
  BusinessEvent,
  ProfileEnvelopeData,
  ProfileSearchItem,
  Workspace,
} from "@/lib/profile/types";

function res(body: unknown, ok = true, status = 200): Response {
  return {
    ok,
    status,
    json: async () => body,
    statusText: String(status),
  } as Response;
}

function makeClient(
  fetchImpl: ProfileClientOptions["fetchImpl"],
  overrides?: Partial<ProfileClientOptions>
): ProfileApiClient {
  return new ProfileApiClient({
    baseUrl: "https://profile.example.test",
    token: "test-token-secret",
    fetchImpl,
    retryDelayMs: 0,
    ...overrides,
  });
}

describe("ProfileApiClient", () => {
  describe("listWorkspaces", () => {
    it("sends Authorization and Accept headers and returns data array", async () => {
      const calls: Array<{ url: string; headers: Record<string, string> }> = [];

      const workspaces: Workspace[] = [
        { id: "ws_1", name: "Workspace One", status: "active" },
        { id: "ws_2", name: "Workspace Two", status: null },
      ];

      const client = makeClient(async (url, init) => {
        calls.push({
          url: String(url),
          headers: (init?.headers ?? {}) as Record<string, string>,
        });
        return res({ api_version: "v1", data: workspaces });
      });

      const result = await client.listWorkspaces();

      expect(calls).toHaveLength(1);
      expect(calls[0].url).toBe(
        "https://profile.example.test/api/v1/workspaces"
      );
      expect(calls[0].headers["Authorization"]).toBe(
        "Bearer test-token-secret"
      );
      expect(calls[0].headers["Accept"]).toBe("application/json");
      expect(result).toEqual(workspaces);
    });
  });

  describe("error mapping", () => {
    it("maps a 401 error body to ProfileApiError with correct code and status", async () => {
      const client = makeClient(async () =>
        res(
          {
            api_version: "v1",
            error: { code: "unauthorized", message: "Authentication required" },
          },
          false,
          401
        )
      );

      await expect(client.listWorkspaces()).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof ProfileApiError &&
          err.code === "unauthorized" &&
          err.status === 401 &&
          err.message === "Authentication required"
      );
    });

    it("maps a 404 not_found to ProfileApiError", async () => {
      const client = makeClient(async () =>
        res(
          {
            api_version: "v1",
            error: { code: "not_found", message: "Profile not found" },
          },
          false,
          404
        )
      );

      await expect(client.getProfile("missing-id")).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof ProfileApiError &&
          err.code === "not_found" &&
          err.status === 404
      );
    });

    it("falls back to http_error code when error body is missing", async () => {
      const client = makeClient(async () =>
        res("Internal Server Error", false, 500)
      );

      await expect(client.listWorkspaces()).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof ProfileApiError && err.code === "http_error"
      );
    });
  });

  describe("collectProfiles", () => {
    it("auto-paginates following next_cursor and returns all items", async () => {
      const item1: ProfileSearchItem = {
        id: "p1",
        workspace_id: "ws_cf1",
        categories: [],
        states: [],
      };
      const item2: ProfileSearchItem = {
        id: "p2",
        workspace_id: "ws_cf1",
        categories: [],
        states: [],
      };

      const calls: string[] = [];

      const client = makeClient(async (url) => {
        const urlStr = String(url);
        calls.push(urlStr);

        if (!urlStr.includes("cursor=")) {
          const envelope: ApiListEnvelope<ProfileSearchItem> = {
            api_version: "v1",
            data: [item1],
            pagination: { next_cursor: "c2", limit: 50 },
          };
          return res(envelope);
        }

        const envelope: ApiListEnvelope<ProfileSearchItem> = {
          api_version: "v1",
          data: [item2],
          pagination: { next_cursor: null, limit: 50 },
        };
        return res(envelope);
      });

      const result = await client.collectProfiles({ workspaceId: "ws_cf1" });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("p1");
      expect(result[1].id).toBe("p2");
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain("cursor=c2");
      expect(calls[1]).toContain("workspace_id=ws_cf1");
    });
  });

  describe("searchProfiles query params", () => {
    it("encodes repeated array params and workspace_id correctly", async () => {
      const calls: string[] = [];

      const client = makeClient(async (url) => {
        calls.push(String(url));
        const envelope: ApiListEnvelope<ProfileSearchItem> = {
          api_version: "v1",
          data: [],
          pagination: { next_cursor: null, limit: 50 },
        };
        return res(envelope);
      });

      await client.searchProfiles({
        workspaceId: "ws_cf1",
        category: ["member", "alumni"],
        state: ["active"],
      });

      expect(calls).toHaveLength(1);
      const url = calls[0];
      expect(url).toContain("workspace_id=ws_cf1");
      expect(url).toContain("category=member");
      expect(url).toContain("category=alumni");
      expect(url).toContain("state=active");
    });

    it("omits undefined params from the URL", async () => {
      const calls: string[] = [];

      const client = makeClient(async (url) => {
        calls.push(String(url));
        const envelope: ApiListEnvelope<ProfileSearchItem> = {
          api_version: "v1",
          data: [],
          pagination: { next_cursor: null, limit: 50 },
        };
        return res(envelope);
      });

      await client.searchProfiles({});

      expect(calls).toHaveLength(1);
      // Should not have dangling ? or empty params
      expect(calls[0]).not.toMatch(/[?&]workspace_id=/);
      expect(calls[0]).not.toMatch(/[?&]q=/);
    });
  });

  describe("retry behaviour", () => {
    it("retries on network error and succeeds on second attempt", async () => {
      let attempt = 0;
      const workspaces: Workspace[] = [{ id: "ws_1", name: "Test", status: "active" }];

      const client = makeClient(async () => {
        attempt += 1;
        if (attempt === 1) {
          throw new TypeError("fetch failed");
        }
        return res({ api_version: "v1", data: workspaces });
      });

      const result = await client.listWorkspaces();

      expect(attempt).toBe(2);
      expect(result).toEqual(workspaces);
    });

    it("does NOT retry on 4xx — rejects immediately with fetch called once", async () => {
      let callCount = 0;

      const client = makeClient(async () => {
        callCount += 1;
        return res(
          {
            api_version: "v1",
            error: {
              code: "validation_error",
              message: "Invalid query parameter",
            },
          },
          false,
          400
        );
      });

      await expect(client.searchProfiles({ q: "bad" })).rejects.toSatisfy(
        (err: unknown) =>
          err instanceof ProfileApiError && err.code === "validation_error"
      );
      expect(callCount).toBe(1);
    });

    it("retries on 5xx up to maxRetries", async () => {
      let callCount = 0;

      const client = makeClient(
        async () => {
          callCount += 1;
          if (callCount < 3) {
            return res(
              { api_version: "v1", error: { code: "server_error", message: "crash" } },
              false,
              500
            );
          }
          return res({ api_version: "v1", data: [] });
        },
        { maxRetries: 3, retryDelayMs: 0 }
      );

      const result = await client.listWorkspaces();
      expect(result).toEqual([]);
      expect(callCount).toBe(3);
    });

    it("exhausts maxRetries and throws the last error", async () => {
      let callCount = 0;

      const client = makeClient(
        async () => {
          callCount += 1;
          throw new TypeError("fetch failed");
        },
        { maxRetries: 2, retryDelayMs: 0 }
      );

      await expect(client.listWorkspaces()).rejects.toThrow("fetch failed");
      expect(callCount).toBe(2);
    });
  });

  describe("getProfile", () => {
    it("fetches a profile by id and returns the envelope data", async () => {
      const profileData: ProfileEnvelopeData = {
        id: "p_abc",
        workspace_id: "ws_1",
        display_name: "John Doe",
        profile_updated_at: "2026-01-01T00:00:00Z",
        profile: { bio: "test" },
      };

      const calls: string[] = [];
      const client = makeClient(async (url) => {
        calls.push(String(url));
        return res({ api_version: "v1", data: profileData });
      });

      const result = await client.getProfile("p_abc");

      expect(calls[0]).toContain("/api/v1/profiles/p_abc");
      expect(result).toEqual(profileData);
    });
  });

  describe("collectBusinessEvents", () => {
    it("paginates business events and returns all items", async () => {
      const event1: BusinessEvent = {
        id: "e1",
        event_type: "meeting",
        observed_at: "2026-01-01T00:00:00Z",
        current_value: {},
        attributes: {},
      };
      const event2: BusinessEvent = {
        id: "e2",
        event_type: "meeting",
        observed_at: "2026-01-02T00:00:00Z",
        current_value: {},
        attributes: {},
      };

      const calls: string[] = [];

      const client = makeClient(async (url) => {
        const urlStr = String(url);
        calls.push(urlStr);

        if (!urlStr.includes("cursor=")) {
          const envelope: ApiListEnvelope<BusinessEvent> = {
            api_version: "v1",
            data: [event1],
            pagination: { next_cursor: "evCursor2", limit: 50 },
          };
          return res(envelope);
        }

        const envelope: ApiListEnvelope<BusinessEvent> = {
          api_version: "v1",
          data: [event2],
          pagination: { next_cursor: null, limit: 50 },
        };
        return res(envelope);
      });

      const result = await client.collectBusinessEvents("p_abc", { eventType: ["meeting"] });

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe("e1");
      expect(result[1].id).toBe("e2");
      expect(calls).toHaveLength(2);
      expect(calls[1]).toContain("cursor=evCursor2");
      expect(calls[1]).toContain("event_type=meeting");
      expect(calls[0]).toContain("/api/v1/profiles/p_abc/business-events");
    });
  });

  describe("listBusinessEvents query params", () => {
    it("serialises eventType array to repeated event_type keys", async () => {
      const calls: string[] = [];

      const client = makeClient(async (url) => {
        calls.push(String(url));
        const envelope: ApiListEnvelope<BusinessEvent> = {
          api_version: "v1",
          data: [],
          pagination: { next_cursor: null, limit: 50 },
        };
        return res(envelope);
      });

      await client.listBusinessEvents("p_abc", {
        eventType: ["meeting", "workshop"],
      });

      expect(calls).toHaveLength(1);
      expect(calls[0]).toContain("event_type=meeting");
      expect(calls[0]).toContain("event_type=workshop");
    });
  });

  describe("createProfileClientFromEnv", () => {
    let savedEnv: NodeJS.ProcessEnv;

    beforeEach(() => {
      savedEnv = { ...process.env };
    });

    afterEach(() => {
      // Restore only the keys we touched
      for (const key of ["PROFILE_API_TOKEN", "PROFILE_API_BASE_URL"]) {
        if (key in savedEnv) {
          process.env[key] = savedEnv[key];
        } else {
          delete process.env[key];
        }
      }
    });

    it("constructs a ProfileApiClient when PROFILE_API_TOKEN is set", async () => {
      process.env["PROFILE_API_TOKEN"] = "env-test-token";
      delete process.env["PROFILE_API_BASE_URL"];

      const { createProfileClientFromEnv } = await import("@/lib/profile/client");
      const client = createProfileClientFromEnv();

      expect(client).toBeInstanceOf(ProfileApiClient);
    });

    it("throws when PROFILE_API_TOKEN is missing", async () => {
      delete process.env["PROFILE_API_TOKEN"];

      const { createProfileClientFromEnv } = await import("@/lib/profile/client");

      expect(() => createProfileClientFromEnv()).toThrow("PROFILE_API_TOKEN");
    });
  });
});

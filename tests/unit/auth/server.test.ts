import { describe, it, expect, vi, beforeEach } from "vitest";
import { createClient, createAdminClient } from "@/shared/auth/server";
import { env } from "@/shared/config/env";

describe("Auth Server Client", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("createClient with Request", () => {
    it("creates client from request with cookies", async () => {
      const request = new Request("https://crowasia.test/api/me", {
        headers: {
          cookie: "sb-access-token=token123; sb-refresh-token=refresh456",
        },
      });

      const client = await createClient(request);
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
    });

    it("creates client from request without cookies", async () => {
      const request = new Request("https://crowasia.test/api/me");

      const client = await createClient(request);
      expect(client).toBeDefined();
      expect(client.auth).toBeDefined();
    });
  });

  describe("createAdminClient", () => {
    it("throws error if SUPABASE_SERVICE_ROLE_KEY is not defined", () => {
      const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        (env as any).SUPABASE_SERVICE_ROLE_KEY = undefined;
        expect(() => createAdminClient()).toThrow(
          "SUPABASE_SERVICE_ROLE_KEY is required to create an admin client"
        );
      } finally {
        (env as any).SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
    });

    it("returns admin client if SUPABASE_SERVICE_ROLE_KEY is defined", () => {
      const originalKey = env.SUPABASE_SERVICE_ROLE_KEY;
      try {
        (env as any).SUPABASE_SERVICE_ROLE_KEY = "mock-service-role-key";
        const client = createAdminClient();
        expect(client).toBeDefined();
        expect(client.auth).toBeDefined();
      } finally {
        (env as any).SUPABASE_SERVICE_ROLE_KEY = originalKey;
      }
    });
  });
});

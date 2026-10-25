import { describe, it, expect, vi, beforeEach } from "vitest";
import { profiles, userRoles } from "@/shared/db/schema/identity";
import { getActor, requireActor, requireRole } from "@/modules/identity/get-actor";
import { UnauthorizedError, ForbiddenError, type Actor, type Role } from "@/modules/identity/types";
import { createClient } from "@/shared/auth/server";
import { db } from "@/shared/db/client";

vi.mock("@/shared/auth/server", () => ({
  createClient: vi.fn(),
}));

vi.mock("@/shared/db/client", () => ({
  db: {
    select: vi.fn(),
  },
}));

describe("Identity Module", () => {
  let mockProfileRows: any[] = [];
  let mockRoleRows: any[] = [];
  let mockAuthUser: any = null;
  let mockAuthError: any = null;

  beforeEach(() => {
    vi.clearAllMocks();

    mockProfileRows = [];
    mockRoleRows = [];
    mockAuthUser = null;
    mockAuthError = null;

    vi.mocked(createClient).mockResolvedValue({
      auth: {
        getUser: vi.fn().mockImplementation(async () => ({
          data: { user: mockAuthUser },
          error: mockAuthError,
        })),
      },
    } as any);

    vi.mocked(db.select).mockImplementation((_fields?: any): any => ({
      from: vi.fn().mockImplementation((table: any) => ({
        where: vi.fn().mockImplementation((_condition: any) => {
          const isProfiles =
            table === profiles ||
            table?.[Symbol.for("drizzle:Name")] === "profiles";
          const rows = isProfiles ? mockProfileRows : mockRoleRows;
          const promise = Promise.resolve(rows);
          (promise as any).limit = vi.fn().mockResolvedValue(rows);
          return promise;
        }),
      })),
    }));
  });

  describe("getActor", () => {
    it("returns null for unauthenticated request", async () => {
      mockAuthUser = null;
      mockAuthError = new Error("Auth session missing");

      const actor = await getActor();

      expect(actor).toBeNull();
    });

    it("returns Actor with roles for valid session", async () => {
      mockAuthUser = {
        id: "11111111-1111-1111-1111-111111111111",
        email: "editor@crowasia.test",
        last_sign_in_at: "2026-10-25T10:00:00.000Z",
      };
      mockProfileRows = [
        {
          id: mockAuthUser.id,
          displayName: "Editor User",
          preferencesJson: {},
        },
      ];
      mockRoleRows = [{ role: "editor" }, { role: "reader" }];

      const actor = await getActor();

      expect(actor).not.toBeNull();
      expect(actor).toEqual({
        userId: "11111111-1111-1111-1111-111111111111",
        verifiedEmail: "editor@crowasia.test",
        roles: ["editor", "reader"],
        authTime: new Date("2026-10-25T10:00:00.000Z"),
      });
    });

    it("verifiedEmail comes from auth user, not profile", async () => {
      mockAuthUser = {
        id: "22222222-2222-2222-2222-222222222222",
        email: "verified-auth@crowasia.test",
        created_at: "2026-10-25T08:00:00.000Z",
      };
      // Even if a profile mock contains a spoofed email, getActor MUST ignore it
      mockProfileRows = [
        {
          id: mockAuthUser.id,
          displayName: "Attacker Spoofing Email",
          email: "spoofed@attacker.test",
        },
      ];
      mockRoleRows = [{ role: "reader" }];

      const actor = await getActor();

      expect(actor).not.toBeNull();
      expect(actor?.verifiedEmail).toBe("verified-auth@crowasia.test");
      expect(actor?.verifiedEmail).not.toBe("spoofed@attacker.test");
    });

    it("returns Actor with empty roles when user has no roles in DB", async () => {
      mockAuthUser = {
        id: "33333333-3333-3333-3333-333333333333",
        email: "noroles@crowasia.test",
        created_at: "2026-10-25T09:00:00.000Z",
      };
      mockProfileRows = [];
      mockRoleRows = [];

      const actor = await getActor();

      expect(actor).not.toBeNull();
      expect(actor?.roles).toEqual([]);
    });

    it("passes request argument to createClient", async () => {
      const mockRequest = new Request("https://crowasia.test/api/protected", {
        headers: { cookie: "sb-token=xyz" },
      });

      await getActor(mockRequest);

      expect(createClient).toHaveBeenCalledWith(mockRequest);
    });
  });

  describe("requireActor", () => {
    it("throws 401 for null actor", async () => {
      mockAuthUser = null;

      await expect(requireActor()).rejects.toThrow(UnauthorizedError);
      try {
        await requireActor();
      } catch (err) {
        expect(err).toBeInstanceOf(UnauthorizedError);
        expect((err as UnauthorizedError).statusCode).toBe(401);
        expect((err as UnauthorizedError).code).toBe(401);
      }
    });

    it("returns Actor when authenticated", async () => {
      mockAuthUser = {
        id: "44444444-4444-4444-4444-444444444444",
        email: "valid@crowasia.test",
        last_sign_in_at: "2026-10-25T12:00:00.000Z",
      };
      mockRoleRows = [{ role: "admin" }];

      const actor = await requireActor();

      expect(actor.userId).toBe("44444444-4444-4444-4444-444444444444");
      expect(actor.roles).toEqual(["admin"]);
    });
  });

  describe("requireRole", () => {
    const actor: Actor = {
      userId: "user-123",
      verifiedEmail: "editor@crowasia.test",
      roles: ["editor"],
      authTime: new Date("2026-10-25T00:00:00.000Z"),
    };

    it("throws 403 when actor lacks required role", () => {
      expect(() => requireRole(actor, "admin")).toThrow(ForbiddenError);

      try {
        requireRole(actor, "admin");
      } catch (err) {
        expect(err).toBeInstanceOf(ForbiddenError);
        expect((err as ForbiddenError).statusCode).toBe(403);
        expect((err as ForbiddenError).code).toBe(403);
      }
    });

    it("throws 403 when actor lacks any of multiple allowed roles", () => {
      expect(() => requireRole(actor, ["admin", "publisher"])).toThrow(
        ForbiddenError
      );
    });

    it("passes when actor has required role", () => {
      expect(() => requireRole(actor, "editor")).not.toThrow();
    });

    it("passes when actor has at least one of multiple allowed roles", () => {
      expect(() => requireRole(actor, ["reader", "editor"])).not.toThrow();
    });
  });
});

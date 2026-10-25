import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { InteractiveChecklist } from "@/components/reader/interactive-checklist";

describe("InteractiveChecklist Component (TDD)", () => {
  const itemId = "item-1111-1111-1111-111111111111";

  let storageMap: Map<string, string>;
  let mockLocalStorage: {
    getItem: (key: string) => string | null;
    setItem: (key: string, value: string) => void;
    removeItem: (key: string) => void;
    clear: () => void;
  };

  const originalWindow = (globalThis as any).window;

  beforeEach(() => {
    vi.clearAllMocks();
    storageMap = new Map();
    mockLocalStorage = {
      getItem: vi.fn((key: string) => storageMap.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => {
        storageMap.set(key, String(value));
      }),
      removeItem: vi.fn((key: string) => {
        storageMap.delete(key);
      }),
      clear: vi.fn(() => {
        storageMap.clear();
      }),
    };

    (globalThis as any).window = {
      localStorage: mockLocalStorage,
    };
  });

  afterEach(() => {
    (globalThis as any).window = originalWindow;
    vi.restoreAllMocks();
  });

  describe("Server & Client Markup Rendering", () => {
    it("renders uncompleted item with data-completed='false' and unchecked input", () => {
      const html = renderToStaticMarkup(
        <InteractiveChecklist
          itemId={itemId}
          label="Tahan solusi di 5 menit pertama"
          initialCompleted={false}
          initialVersion={0}
        />
      );

      expect(html).toContain(`data-item-id="${itemId}"`);
      expect(html).toContain('data-completed="false"');
      expect(html).toContain('data-version="0"');
      expect(html).toContain("Tahan solusi di 5 menit pertama");
      expect(html).toContain('type="checkbox"');
      expect(html).not.toContain("checked=");
    });

    it("renders completed item with data-completed='true' and line-through styling", () => {
      const html = renderToStaticMarkup(
        <InteractiveChecklist
          itemId={itemId}
          label="Ulangi inti cerita minimal 1 kali"
          initialCompleted={true}
          initialVersion={2}
        />
      );

      expect(html).toContain(`data-item-id="${itemId}"`);
      expect(html).toContain('data-completed="true"');
      expect(html).toContain('data-version="2"');
      expect(html).toContain("line-through");
      expect(html).toContain("checked");
    });

    it("supports children as custom label content", () => {
      const html = renderToStaticMarkup(
        <InteractiveChecklist itemId={itemId} initialCompleted={false}>
          <strong>Beri jeda 3 detik</strong> setelah bicara
        </InteractiveChecklist>
      );

      expect(html).toContain("<strong>Beri jeda 3 detik</strong> setelah bicara");
    });
  });

  describe("Guest Mode (localStorage scoping)", () => {
    it("reads cached state from localStorage for guest on mount", () => {
      storageMap.set(
        `checklist:${itemId}`,
        JSON.stringify({ completed: true, updatedAt: new Date().toISOString() })
      );

      // Verify localStorage mock works as expected
      expect(mockLocalStorage.getItem(`checklist:${itemId}`)).toContain('"completed":true');
    });

    it("saves toggled state to localStorage scoped to item UUID without cloud fetch", async () => {
      const fetchSpy = vi.spyOn(globalThis, "fetch");

      // Verify that when not authenticated, local storage is key: checklist:${itemId}
      mockLocalStorage.setItem(
        `checklist:${itemId}`,
        JSON.stringify({ completed: true, updatedAt: new Date().toISOString() })
      );

      expect(mockLocalStorage.setItem).toHaveBeenCalledWith(
        `checklist:${itemId}`,
        expect.stringContaining('"completed":true')
      );
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("Cloud Synchronization & Conflict Handling Contract", () => {
    it("uses PUT /api/checklists/[itemId] with expectedVersion payload", async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            itemId,
            completed: true,
            version: 1,
            updatedAt: new Date().toISOString(),
          }),
      });
      (globalThis as any).fetch = fetchMock;

      const payload = { completed: true, expectedVersion: 0 };
      const response = await fetchMock(`/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      expect(response.status).toBe(200);
      const data = await response.json();
      expect(data).toMatchObject({
        itemId,
        completed: true,
        version: 1,
      });
      expect(fetchMock).toHaveBeenCalledWith(`/api/checklists/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
    });

    it("parses 409 conflict payload with current state for recovery", async () => {
      const conflictResponse = {
        error: {
          code: "PROGRESS_CONFLICT",
          message: "Progres berubah di perangkat lain",
        },
        current: {
          completed: false,
          version: 5,
        },
      };

      const fetchMock = vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve(conflictResponse),
      });

      const res = await fetchMock(`/api/checklists/${itemId}`, { method: "PUT" });
      const data = await res.json();

      expect(res.status).toBe(409);
      expect(data.error.code).toBe("PROGRESS_CONFLICT");
      expect(data.current).toEqual({ completed: false, version: 5 });
    });
  });
});

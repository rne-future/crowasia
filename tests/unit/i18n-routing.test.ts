import { describe, it, expect } from "vitest";
import { routing } from "@/shared/i18n/routing";

describe("i18n routing", () => {
  it("has id and en locales", () => {
    expect(routing.locales).toEqual(["id", "en"]);
  });

  it("defaults to id", () => {
    expect(routing.defaultLocale).toBe("id");
  });
});

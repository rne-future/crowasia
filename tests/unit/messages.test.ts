import { describe, it, expect } from "vitest";
import id from "../../messages/id.json";
import en from "../../messages/en.json";

describe("message files", () => {
  it("id and en have the same keys", () => {
    expect(Object.keys(id)).toEqual(Object.keys(en));
  });

  it("both have common.siteName", () => {
    expect(id.common.siteName).toBe("Crow.asia");
    expect(en.common.siteName).toBe("Crow.asia");
  });
});

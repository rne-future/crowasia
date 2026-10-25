import { describe, it, expect, vi } from "vitest";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { SearchDialog } from "@/components/search/search-dialog";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

describe("SearchDialog Component", () => {
  it("renders trigger button with Cmd+K hint", () => {
    const html = renderToStaticMarkup(<SearchDialog locale="id" triggerButton={true} />);
    expect(html).toContain("Cari Topik...");
    expect(html).toContain("⌘K");
    expect(html).toContain("Cari topik atau SOS panduan");
  });

  it("does not render trigger button when triggerButton is false", () => {
    const html = renderToStaticMarkup(<SearchDialog locale="id" triggerButton={false} />);
    expect(html).not.toContain("Cari Topik...");
  });
});

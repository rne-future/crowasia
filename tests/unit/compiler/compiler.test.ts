import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { compileChapter, defaultConfig } from "@/content/compiler";

describe("compileChapter", () => {
  it("transforms NOTE alert to aside with correct class", () => {
    const src = "> [!NOTE] Title\n> Body text";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain('<aside class="alert-note alert" role="region" aria-label="Title"');
    expect(result.html).toContain('<p class="alert-title"><strong>Title</strong></p>');
    expect(result.html).toContain("Body text");
  });

  it("transforms all 5 alert types: NOTE, TIP, IMPORTANT, WARNING, CAUTION", () => {
    const types = ["NOTE", "TIP", "IMPORTANT", "WARNING", "CAUTION"] as const;
    for (const type of types) {
      const src = `> [!${type}]\n> Content for ${type}`;
      const res = compileChapter(src, defaultConfig);
      expect(res.html).toContain(`<aside class="alert-${type.toLowerCase()}`);
      expect(res.html).toContain(`Content for ${type}`);
    }
  });

  it("normalizes </br> to <br> with warning", () => {
    const src = "text</br>more";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toMatch(/<br\s*\/?>/);
    expect(result.html).toContain("text");
    expect(result.html).toContain("more");
    expect(result.warnings.some((w: string) => w.includes("</br>"))).toBe(true);
  });

  it("preserves <mark>, <kbd>, <abbr title=\"...\">, <ins>, <del> tags", () => {
    const src =
      'Here is <mark>highlight</mark>, <kbd>Ctrl+C</kbd>, <abbr title="Hypertext">HTML</abbr>, <ins>added</ins>, and <del>removed</del>.';
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain("<mark>highlight</mark>");
    expect(result.html).toContain("<kbd>Ctrl+C</kbd>");
    expect(result.html).toContain('<abbr title="Hypertext">HTML</abbr>');
    expect(result.html).toContain("<ins>added</ins>");
    expect(result.html).toContain("<del>removed</del>");
  });

  it("preserves <details><summary> blocks", () => {
    const src =
      "<details><summary>Details title</summary><p>Hidden body</p></details>";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain("<details>");
    expect(result.html).toContain("<summary>Details title</summary>");
    expect(result.html).toContain("Hidden body");
  });

  it("builds TOC from h2 and h3 headings", () => {
    const src =
      "# Main Title\n\n## Section 1\n\nContent\n\n### Subsection 1.1\n\nContent\n\n## Section 2\n\nContent";
    const result = compileChapter(src, defaultConfig);
    expect(result.toc).toEqual([
      { id: "section-1", title: "Section 1", level: 2 },
      { id: "subsection-1-1", title: "Subsection 1.1", level: 3 },
      { id: "section-2", title: "Section 2", level: 2 },
    ]);
  });

  it("generates stable sourceHash for same input", () => {
    const src = "## Determinism Test\nSome content";
    const a = compileChapter(src, defaultConfig);
    const b = compileChapter(src, defaultConfig);
    expect(a.sourceHash).toBe(b.sourceHash);
    expect(a.sourceHash).toMatch(/^[a-f0-9]{64}$/);

    const modified = compileChapter(src + " extra", defaultConfig);
    expect(modified.sourceHash).not.toBe(a.sourceHash);
  });

  it("generates searchText without HTML tags", () => {
    const src =
      "# Judul Bab\n\nParagraf dengan **tebal** dan <mark>highlight</mark>.\n\n> [!NOTE]\n> Catatan penting";
    const result = compileChapter(src, defaultConfig);
    expect(result.searchText).not.toContain("<");
    expect(result.searchText).not.toContain(">");
    expect(result.searchText).toContain("Judul Bab");
    expect(result.searchText).toContain("Paragraf dengan tebal dan highlight");
    expect(result.searchText).toContain("Catatan penting");
  });

  it("generates previewText limited to approved preview length", () => {
    const src = "Kalimat pertama panjang sekali. ".repeat(30);
    const result = compileChapter(src, {
      ...defaultConfig,
      previewLengthLimit: 80,
    });
    expect(result.previewText.length).toBeLessThanOrEqual(80);
    expect(result.previewText).not.toContain("<");
  });

  it("transforms checklist items into structured list with data-ordinal", () => {
    const src = "- [ ] First task\n- [x] Second task\n- [ ] Third task";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain('class="checklist"');
    expect(result.html).toContain('class="checklist-item"');
    expect(result.html).toContain('data-ordinal="1"');
    expect(result.html).toContain('data-ordinal="2"');
    expect(result.html).toContain('data-ordinal="3"');
    expect(result.html).not.toContain("<input");
    expect(result.metadata.tasksCount).toBe(3);
  });

  it("wraps mermaid diagram code block in fallback markup", () => {
    const src = "```mermaid\ngraph TD;\n  A-->B;\n```";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain('class="mermaid-fallback"');
    expect(result.html).toContain("graph TD;");
    expect(result.metadata.diagramsCount).toBe(1);
  });

  it("renders server-side sanitized SVG when mermaidRenderer is provided", () => {
    const src = "```mermaid\ngraph TD;\n  A-->B;\n```";
    const result = compileChapter(src, {
      ...defaultConfig,
      mermaidRenderer: () =>
        '<svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="40"/></svg>',
    });
    expect(result.html).toContain("<svg");
    expect(result.html).toContain('viewBox="0 0 100 100"');
    expect(result.html).toContain('<circle cx="50" cy="50" r="40"');
    expect(result.html).not.toContain("mermaid-fallback");
    expect(result.metadata.diagramsCount).toBe(1);
  });

  it("extracts chapter title from multi-line h1", () => {
    const src = "<h1>Line One\nLine Two</h1>\n\nContent";
    const result = compileChapter(src, defaultConfig);
    expect(result.metadata.title).toBe("Line One\nLine Two");
  });

  it("preserves placeholders like [Nama] safely", () => {
    const src = "Halo [Nama], selamat datang di [Proyek].";
    const result = compileChapter(src, defaultConfig);
    expect(result.html).toContain("[Nama]");
    expect(result.html).toContain("[Proyek]");
  });

  it("handles footnotes properly and counts them", () => {
    const src =
      "Pernyataan penting[^1].\n\n[^1]: Penjelasan rinci untuk catatan kaki.";
    const result = compileChapter(src, defaultConfig);
    expect(result.metadata.footnotesCount).toBe(1);
    expect(result.html).toContain("footnote");
  });

  it("sanitizes malicious input from malicious.md fixture", () => {
    const fixturePath = resolve(
      process.cwd(),
      "tests/fixtures/compiler/malicious.md"
    );
    const src = readFileSync(fixturePath, "utf-8");
    const result = compileChapter(src, defaultConfig);

    expect(result.html).not.toContain("<script>");
    expect(result.html).not.toContain("alert(");
    expect(result.html).not.toContain("onerror");
    expect(result.html).not.toContain("onclick");
    expect(result.html).not.toContain("onload");
    expect(result.html).not.toContain("<iframe");
    expect(result.html).not.toContain("javascript:");
    expect(result.html).not.toContain("<foreignObject");
    expect(result.html).not.toContain("<style>");
    expect(result.html).toContain('<aside class="alert-note');
    expect(result.html).toContain("This should survive");
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReaderShell } from "@/components/reader/reader-shell";
import { PaywallCard } from "@/components/reader/paywall-card";
import { CopyScriptButton } from "@/components/reader/copy-script-button";
import {
  NameCustomizer,
  replaceNameInText,
  wrapPlaceholders,
  updatePlaceholders,
} from "@/components/reader/name-customizer";
import { FootnotesPopover } from "@/components/reader/footnotes-popover";
import { ReaderContentEnhancer } from "@/components/reader/reader-content-enhancer";
import ReaderPage from "@/app/[locale]/read/[book]/[chapter]/page";
import type { ChapterReadPayload } from "@/modules/reading/types";

// Lightweight DOM mock for node environment testing
class MockNode {
  nodeType: number;
  nodeValue: string | null;
  parentNode: MockNode | null = null;
  parentElement: MockElement | null = null;
  childNodes: MockNode[] = [];

  constructor(nodeType: number, nodeValue: string | null = null) {
    this.nodeType = nodeType;
    this.nodeValue = nodeValue;
  }
}

class MockTextNode extends MockNode {
  constructor(text: string) {
    super(3, text);
  }
}

class MockElement extends MockNode {
  tagName: string;
  attributes: Record<string, string> = {};

  constructor(tagName: string) {
    super(1, null);
    this.tagName = tagName.toUpperCase();
  }

  setAttribute(name: string, value: string) {
    this.attributes[name] = value;
  }

  hasAttribute(name: string) {
    return name in this.attributes;
  }

  getAttribute(name: string) {
    return this.attributes[name] ?? null;
  }

  appendChild(child: MockNode) {
    child.parentNode = this;
    child.parentElement = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChild(newChild: MockNode, oldChild: MockNode) {
    const idx = this.childNodes.indexOf(oldChild);
    if (idx === -1) return;
    if (newChild instanceof MockDocumentFragment) {
      const added = [...newChild.childNodes];
      added.forEach((c) => {
        c.parentNode = this;
        c.parentElement = this;
      });
      this.childNodes.splice(idx, 1, ...added);
      newChild.childNodes = [];
    } else {
      newChild.parentNode = this;
      newChild.parentElement = this;
      this.childNodes.splice(idx, 1, newChild);
    }
  }

  closest(selector: string): MockElement | null {
    if (selector.includes("data-name-placeholder") && this.hasAttribute("data-name-placeholder")) {
      return this;
    }
    return this.parentElement?.closest(selector) ?? null;
  }

  querySelectorAll(selector: string): MockElement[] {
    const results: MockElement[] = [];
    const walk = (node: MockNode) => {
      if (node.nodeType === 1) {
        const el = node as MockElement;
        if (selector.includes("data-name-placeholder") && el.hasAttribute("data-name-placeholder")) {
          results.push(el);
        }
        el.childNodes.forEach(walk);
      }
    };
    this.childNodes.forEach(walk);
    return results;
  }

  get textContent(): string {
    return this.childNodes.map((c) => (c.nodeType === 3 ? c.nodeValue || "" : (c as MockElement).textContent)).join("");
  }

  set textContent(val: string) {
    const textNode = new MockTextNode(val);
    textNode.parentNode = this;
    textNode.parentElement = this;
    this.childNodes = [textNode];
  }
}

class MockDocumentFragment extends MockNode {
  constructor() {
    super(11, null);
  }
  appendChild(child: MockNode) {
    this.childNodes.push(child);
    return child;
  }
}

// Mock next-intl hooks
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      greeting: "Selamat datang",
    };
    return messages[key] ?? key;
  },
}));

// Mock reading module for page component tests
vi.mock("@/modules/reading/access-guard", () => ({
  getChapterForReading: vi.fn().mockImplementation((bookSlug: string, chapterSlug: string) => {
    if (bookSlug !== "mahir-memimpin-tim") return Promise.resolve(null);

    const basePayload: ChapterReadPayload = {
      bookId: "b1",
      bookSlug: "mahir-memimpin-tim",
      bookTitle: "Mahir Memimpin Tim",
      chapterSlug,
      chapterIndex: chapterSlug === "ch-0" ? 0 : chapterSlug === "ch-1" ? 1 : 2,
      chapterTitle: chapterSlug === "ch-0" ? "Pendahuluan" : chapterSlug === "ch-1" ? "Bab 1: Menjadi Pemimpin" : "Bab 2: Manajemen Waktu",
      locale: "id",
      register: "standard",
      isFreeSample: chapterSlug === "ch-0" || chapterSlug === "ch-1",
      isAllowed: chapterSlug === "ch-0" || chapterSlug === "ch-1",
      toc: [
        { id: "intro", title: "Pengantar", level: 2 },
        { id: "sub-1", title: "Sub Bab", level: 3 },
      ],
      navigation: {
        prev: chapterSlug === "ch-1" ? { slug: "ch-0", title: "Pendahuluan" } : undefined,
        next: chapterSlug === "ch-0" ? { slug: "ch-1", title: "Bab 1" } : { slug: "ch-3", title: "Bab 3" },
      },
    };

    if (chapterSlug === "ch-0" || chapterSlug === "ch-1") {
      return Promise.resolve({
        ...basePayload,
        html: `<article><h1>${basePayload.chapterTitle}</h1><p>Konten sampel gratis bab ${basePayload.chapterIndex}</p></article>`,
      });
    }

    // Locked chapter (ch-2)
    return Promise.resolve({
      ...basePayload,
      isAllowed: false,
      previewText: "Ini cuplikan teaser bab 2 yang terkunci.",
      html: undefined, // Strictly omitted!
    });
  }),
}));

vi.mock("@/modules/identity/get-actor", () => ({
  getActor: vi.fn().mockResolvedValue(null),
}));

describe("Reader Components & Shell (TDD)", () => {
  const sampleAllowedPayload: ChapterReadPayload = {
    bookId: "b1",
    bookSlug: "mahir-memimpin-tim",
    bookTitle: "Mahir Memimpin Tim",
    chapterSlug: "ch-0",
    chapterIndex: 0,
    chapterTitle: "Pendahuluan: Saat Pertama Kali Memimpin",
    locale: "id",
    register: "standard",
    isFreeSample: true,
    isAllowed: true,
    html: "<article><h2>Pendahuluan</h2><p>Teks konten pembuka</p></article>",
    toc: [
      { id: "intro", title: "Pengantar Awal", level: 2 },
      { id: "step-1", title: "Langkah Pertama", level: 3 },
    ],
    navigation: {
      next: { slug: "ch-1", title: "Bab 1: Menjadi Pemimpin" },
    },
  };

  const sampleLockedPayload: ChapterReadPayload = {
    bookId: "b1",
    bookSlug: "mahir-memimpin-tim",
    bookTitle: "Mahir Memimpin Tim",
    chapterSlug: "ch-2",
    chapterIndex: 2,
    chapterTitle: "Bab 2: Manajemen Waktu dan Prioritas",
    locale: "id",
    register: "standard",
    isFreeSample: false,
    isAllowed: false,
    previewText: "Prioritas lead sering terpecah antara tugas individu dan koordinasi tim.",
    toc: [
      { id: "prioritas", title: "Matriks Prioritas", level: 2 },
    ],
    navigation: {
      prev: { slug: "ch-1", title: "Bab 1" },
      next: { slug: "ch-3", title: "Bab 3" },
    },
  };

  describe("ReaderShell", () => {
    it("renders reader layout with TOC navigation, Zen mode, and font size adjuster", () => {
      const html = renderToStaticMarkup(
        <ReaderShell payload={sampleAllowedPayload} currentLocale="id" currentRegister="standard">
          <div data-testid="reading-content">Konten Bacaan</div>
        </ReaderShell>
      );

      // TOC headings present
      expect(html).toContain("Pengantar Awal");
      expect(html).toContain("Langkah Pertama");
      // Shell accessibility & actions
      expect(html).toContain("Daftar Isi");
      expect(html).toContain("Mode Fokus"); // Zen mode toggle
      expect(html).toContain("A-"); // Font size sm
      expect(html).toContain("A+"); // Font size lg
      expect(html).toContain("Salin Skrip"); // Toolbar script copy action
      expect(html).toContain("Konten Bacaan");
    });
  });

  describe("PaywallCard", () => {
    it("renders locked indicator, book title, preview text, and purchase CTAs", () => {
      const html = renderToStaticMarkup(
        <PaywallCard payload={sampleLockedPayload} />
      );

      expect(html).toContain("Bab Terkunci");
      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Bab 2: Manajemen Waktu dan Prioritas");
      expect(html).toContain("Prioritas lead sering terpecah antara tugas individu dan koordinasi tim.");
      // CTA to buy
      expect(html).toContain("Buka Akses Buku Ini");
      expect(html).toContain("/books/mahir-memimpin-tim");
      // Crucial: Must NEVER contain paid secret HTML body
      expect(html).not.toContain("paid-secret-html");
    });
  });

  describe("CopyScriptButton", () => {
    it("renders accessible button with clipboard label and aria-live status container", () => {
      const scriptText = "Halo Budi, terima kasih atas kerja keras minggu ini.";
      const html = renderToStaticMarkup(
        <CopyScriptButton text={scriptText} />
      );

      expect(html).toContain("Salin Skrip");
      expect(html).toContain('aria-live="polite"');
    });
  });

  describe("NameCustomizer (Script Personalization & XSS Prevention)", () => {
    const originalDocument = globalThis.document;

    beforeEach(() => {
      (globalThis as any).document = {
        createDocumentFragment: () => new MockDocumentFragment(),
        createElement: (tag: string) => new MockElement(tag),
        createTextNode: (text: string) => new MockTextNode(text),
        querySelector: vi.fn(),
        querySelectorAll: vi.fn().mockReturnValue([]),
      };
    });

    afterEach(() => {
      (globalThis as any).document = originalDocument;
    });

    it("renders accessible input for name customization", () => {
      const html = renderToStaticMarkup(<NameCustomizer />);

      expect(html).toContain("Ganti [Nama]:");
      expect(html).toContain('placeholder="Nama anggota tim..."');
    });

    it("safely replaces [Nama] as text and strictly prevents XSS injection", () => {
      const template = "Halo [Nama], mari kita diskusikan target kuartal ini.";
      
      // Clean name
      const cleanResult = replaceNameInText(template, "Budi");
      expect(cleanResult).toBe("Halo Budi, mari kita diskusikan target kuartal ini.");

      // Malicious XSS attack payload
      const xssPayload = `<script>alert('xss')</script>`;
      const sanitizedResult = replaceNameInText(template, xssPayload);

      // It must be escaped or treated strictly as text node, not executable html tags
      expect(sanitizedResult).not.toContain("<script>");
      expect(sanitizedResult).toContain("&lt;script&gt;alert(&#39;xss&#39;)&lt;/script&gt;");
    });

    it("updates placeholder spans without mutating surrounding regular chapter text like 'Bab 1' or 'Buku'", () => {
      const container = new MockElement("div");
      const h1 = new MockElement("h1");
      h1.appendChild(new MockTextNode("Bab 1: Buku Panduan"));
      container.appendChild(h1);

      const p = new MockElement("p");
      p.appendChild(new MockTextNode("Halo [Nama], selamat datang di Bab 1 Buku ini. [Nama] akan memimpin tim."));
      container.appendChild(p);

      // Wrap placeholders on mount
      wrapPlaceholders(container as unknown as HTMLElement);

      const placeholders = container.querySelectorAll('[data-name-placeholder="true"]');
      expect(placeholders.length).toBe(2);
      expect(h1.textContent).toBe("Bab 1: Buku Panduan");

      // 1. Type partial letter "B"
      updatePlaceholders(container as unknown as HTMLElement, "B");
      expect(placeholders[0].textContent).toBe("B");
      expect(placeholders[1].textContent).toBe("B");
      // CRUCIAL: Regular chapter text containing "B" ("Bab 1", "Buku") MUST NOT be mutated!
      expect(h1.textContent).toBe("Bab 1: Buku Panduan");
      expect(p.textContent).toBe("Halo B, selamat datang di Bab 1 Buku ini. B akan memimpin tim.");

      // 2. Type partial letters "Bu"
      updatePlaceholders(container as unknown as HTMLElement, "Bu");
      expect(placeholders[0].textContent).toBe("Bu");
      expect(placeholders[1].textContent).toBe("Bu");
      expect(h1.textContent).toBe("Bab 1: Buku Panduan");
      expect(p.textContent).toBe("Halo Bu, selamat datang di Bab 1 Buku ini. Bu akan memimpin tim.");

      // 3. Type full name "Budi"
      updatePlaceholders(container as unknown as HTMLElement, "Budi");
      expect(placeholders[0].textContent).toBe("Budi");
      expect(placeholders[1].textContent).toBe("Budi");
      expect(h1.textContent).toBe("Bab 1: Buku Panduan");
      expect(p.textContent).toBe("Halo Budi, selamat datang di Bab 1 Buku ini. Budi akan memimpin tim.");

      // 4. Clear input back to empty -> safely reverts to [Nama]
      updatePlaceholders(container as unknown as HTMLElement, "");
      expect(placeholders[0].textContent).toBe("[Nama]");
      expect(placeholders[1].textContent).toBe("[Nama]");
      expect(h1.textContent).toBe("Bab 1: Buku Panduan");
      expect(p.textContent).toBe("Halo [Nama], selamat datang di Bab 1 Buku ini. [Nama] akan memimpin tim.");
    });
  });

  describe("ReaderContentEnhancer", () => {
    it("renders client enhancer container alongside chapter content", () => {
      const html = renderToStaticMarkup(<ReaderContentEnhancer />);
      expect(html).toContain("reader-content-enhancer");
    });
  });

  describe("FootnotesPopover", () => {
    it("renders accessible footnote jump and backlink trigger", () => {
      const html = renderToStaticMarkup(
        <FootnotesPopover
          footnoteId="fn-1"
          referenceNumber={1}
          content="Lihat riset Gallup State of the Global Workplace (2024)."
        />
      );

      expect(html).toContain("fn-1");
      expect(html).toContain("Lihat riset Gallup");
      expect(html).toContain("aria-label");
    });
  });

  describe("ReaderPage Server Component", () => {
    it("renders free chapter with full HTML for reader", async () => {
      const PageComponent = await ReaderPage({
        params: Promise.resolve({
          locale: "id",
          book: "mahir-memimpin-tim",
          chapter: "ch-0",
        }),
        searchParams: Promise.resolve({ reg: "standard" }),
      });

      const html = renderToStaticMarkup(PageComponent);
      expect(html).toContain("Pendahuluan");
      expect(html).toContain("Konten sampel gratis bab 0");
    });

    it("renders paywall card for locked chapter and excludes paid body", async () => {
      const PageComponent = await ReaderPage({
        params: Promise.resolve({
          locale: "id",
          book: "mahir-memimpin-tim",
          chapter: "ch-2",
        }),
        searchParams: Promise.resolve({ reg: "standard" }),
      });

      const html = renderToStaticMarkup(PageComponent);
      expect(html).toContain("Bab Terkunci");
      expect(html).toContain("Ini cuplikan teaser bab 2 yang terkunci.");
      expect(html).not.toContain("Konten sampel gratis");
    });
  });
});

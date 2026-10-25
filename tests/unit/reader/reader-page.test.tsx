import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ReaderShell } from "@/components/reader/reader-shell";
import { PaywallCard } from "@/components/reader/paywall-card";
import { CopyScriptButton } from "@/components/reader/copy-script-button";
import { NameCustomizer, replaceNameInText } from "@/components/reader/name-customizer";
import { FootnotesPopover } from "@/components/reader/footnotes-popover";
import ReaderPage from "@/app/[locale]/read/[book]/[chapter]/page";
import type { ChapterReadPayload } from "@/modules/reading/types";

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

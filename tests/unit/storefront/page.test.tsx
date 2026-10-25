import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { BookCard } from "@/components/storefront/book-card";
import { BookFinder } from "@/components/storefront/book-finder";
import { PricingTable } from "@/components/storefront/pricing-table";
import HomePage from "@/app/[locale]/page";
import BookDetailPage from "@/app/[locale]/books/[slug]/page";
import type { BookSummary, BookDetail } from "@/modules/catalog/types";

// Mock next-intl hooks
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string) => {
    const messages: Record<string, string> = {
      greeting: "Selamat datang di Crow.asia",
      siteName: "Crow.asia",
    };
    return messages[key] ?? key;
  },
  NextIntlClientProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock catalog service for server component page tests
vi.mock("@/modules/catalog/service", () => ({
  listPublishedBooks: vi.fn().mockResolvedValue([
    {
      id: "b1",
      slug: "book-1",
      title: "Mahir Memimpin Tim",
      description: "Strategi Menciptakan Tim yang Mandiri",
      activePriceIdr: 59000n,
      availableLocales: ["id"],
      chaptersCount: 15,
    },
    {
      id: "b2",
      slug: "book-2",
      title: "Napas Panjang Memimpin Tim",
      description: "Strategi Mengatasi Kejenuhan",
      activePriceIdr: 79000n,
      availableLocales: ["id"],
      chaptersCount: 15,
    },
    {
      id: "b3",
      slug: "book-3",
      title: "Memimpin Para Leader",
      description: "Menggerakkan Divisi Lintas Fungsi",
      activePriceIdr: 99000n,
      availableLocales: ["id"],
      chaptersCount: 15,
    },
  ]),
  getBundleOffer: vi.fn().mockResolvedValue({
    tierId: "t-bundle",
    code: "tier-bundle",
    amountIdr: 149000n,
    bookIds: ["b1", "b2", "b3"],
  }),
  getBookDetail: vi.fn().mockImplementation((slug: string) => {
    if (slug === "book-1" || slug === "mahir-memimpin-tim") {
      const chapters = Array.from({ length: 15 }, (_, i) => ({
        slug: `ch-${i}`,
        index: i,
        title: i === 0 ? "Pendahuluan" : i === 1 ? "Bab 1: Menjadi Pemimpin" : `Bab ${i}: Topik ${i}`,
        isFreeSample: i === 0 || i === 1,
      }));
      return Promise.resolve({
        id: "b1",
        slug: "book-1",
        title: "Mahir Memimpin Tim",
        description: "Strategi Menciptakan Tim yang Mandiri",
        activePriceIdr: 59000n,
        availableLocales: ["id"],
        chaptersCount: 15,
        chapters,
        tiers: [{ id: "t1", code: "tier-book-1", amountIdr: 59000n }],
      } satisfies BookDetail);
    }
    return Promise.resolve(null);
  }),
}));

describe("Storefront Components (TDD)", () => {
  const sampleBook: BookSummary = {
    id: "b1",
    slug: "mahir-memimpin-tim",
    title: "Mahir Memimpin Tim",
    description: "Buku panduan praktis untuk lead baru",
    activePriceIdr: 59000n,
    availableLocales: ["id"],
    chaptersCount: 15,
  };

  describe("BookCard", () => {
    it("renders title, description, formatted price badge, and sample CTA", () => {
      const html = renderToStaticMarkup(<BookCard book={sampleBook} />);

      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Buku panduan praktis untuk lead baru");
      expect(html).toContain("59.000"); // Formatted IDR price
      expect(html).toContain("Sampel Gratis");
      expect(html).toContain("/read/mahir-memimpin-tim/ch-0");
      expect(html).toContain("/books/mahir-memimpin-tim");
    });
  });

  describe("BookFinder", () => {
    it("renders role/situation selector without clinical diagnostic claims", () => {
      const html = renderToStaticMarkup(<BookFinder />);

      // Must render the 3 situations
      expect(html).toContain("Baru pertama kali memimpin tim");
      expect(html).toContain("Kewalahan memadamkan masalah");
      expect(html).toContain("Bawahan langsung adalah para manajer");

      // Must recommend the 3 books
      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Napas Panjang Memimpin Tim");
      expect(html).toContain("Memimpin Para Leader");

      // Strictly reflective guidance disclaimer
      expect(html).toContain("bukan diagnosis psikologis");
    });
  });

  describe("PricingTable", () => {
    it("renders single books and bundle tier with discount badge", () => {
      const bundle = {
        tierId: "t-bundle",
        amountIdr: 149000n,
        code: "tier-bundle",
      };
      const html = renderToStaticMarkup(<PricingTable bundle={bundle} />);

      expect(html).toContain("59.000");
      expect(html).toContain("79.000");
      expect(html).toContain("99.000");
      expect(html).toContain("149.000");
      expect(html).toContain("Hemat Rp88.000");
      expect(html).toContain("transparan");
    });
  });

  describe("HomePage", () => {
    it("renders landing page hero, book catalog, book finder, pricing, and FAQ", async () => {
      const PageComponent = await HomePage();
      const html = renderToStaticMarkup(PageComponent);

      expect(html).toContain("Panduan Kepemimpinan Praktis untuk Kantor Nyata");
      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Napas Panjang Memimpin Tim");
      expect(html).toContain("Memimpin Para Leader");
      expect(html).toContain("Butuh bantuan memilih?");
      expect(html).toContain("Hemat Rp88.000");
      expect(html).toContain("Pertanyaan yang Sering Diajukan");
    });
  });

  describe("BookDetailPage", () => {
    it("renders book detail with table of contents, free sample badges, and lock indicators", async () => {
      const PageComponent = await BookDetailPage({
        params: Promise.resolve({ locale: "id", slug: "book-1" }),
      });
      const html = renderToStaticMarkup(PageComponent);

      expect(html).toContain("Mahir Memimpin Tim");
      expect(html).toContain("Daftar Isi");
      expect(html).toContain("Sampel Gratis");
      expect(html).toContain("Baca Sampel Gratis");
      expect(html).toContain("Beli Buku Ini");
      expect(html).toContain("/read/book-1/ch-0");
      // Chapters 2..14 should have locked indicators
      expect(html).toContain("Terkunci");
    });
  });
});

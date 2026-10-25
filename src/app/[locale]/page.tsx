import Link from "next/link";
import { listPublishedBooks, getBundleOffer } from "@/modules/catalog/service";
import { BookCard } from "@/components/storefront/book-card";
import { BookFinder } from "@/components/storefront/book-finder";
import { PricingTable } from "@/components/storefront/pricing-table";
import type { BookSummary } from "@/modules/catalog/types";

interface PageProps {
  params?: Promise<{ locale?: string }>;
}

const FALLBACK_BOOKS: BookSummary[] = [
  {
    id: "canonical-b1",
    slug: "book-1",
    title: "Mahir Memimpin Tim",
    description: "Strategi Menciptakan Tim yang Mandiri tanpa harus mendikte setiap langkah.",
    activePriceIdr: 59000n,
    availableLocales: ["id"],
    chaptersCount: 15,
  },
  {
    id: "canonical-b2",
    slug: "book-2",
    title: "Napas Panjang Memimpin Tim",
    description: "Strategi Mengatasi Kejenuhan dan Membangun Sistem Kerja Mandiri.",
    activePriceIdr: 79000n,
    availableLocales: ["id"],
    chaptersCount: 15,
  },
  {
    id: "canonical-b3",
    slug: "book-3",
    title: "Memimpin Para Leader",
    description: "Strategi Naik Kelas dari Mengarahkan Tim ke Menggerakkan Divisi Lintas Fungsi.",
    activePriceIdr: 99000n,
    availableLocales: ["id"],
    chaptersCount: 15,
  },
];

export default async function HomePage(props?: PageProps) {
  const resolvedParams = props?.params ? await props.params : undefined;
  const locale = resolvedParams?.locale ?? "id";

  let books: BookSummary[] = [];
  let bundle = null;

  try {
    books = await listPublishedBooks(locale);
    bundle = await getBundleOffer();
  } catch {
    // Graceful fallback for build-time or unseeded environments
    books = [];
  }

  const displayBooks = books.length >= 3 ? books : FALLBACK_BOOKS;
  const basePath = locale && locale !== "id" ? `/${locale}` : "";

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#FAF8F5",
        color: "#111113",
      }}
    >
      {/* Top Banner Navigation */}
      <header className="border-b" style={{ borderColor: "#E5E0D5", backgroundColor: "#FFFFFF" }}>
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <Link href={`${basePath}/`} className="font-black text-xl tracking-tight" style={{ color: "#111113" }}>
            Crow<span style={{ color: "#1D4ED8" }}>.asia</span>
          </Link>
          <nav className="flex items-center gap-4 text-xs font-semibold">
            <a href="#katalog" className="text-gray-600 hover:text-black">Katalog</a>
            <a href="#book-finder" className="text-gray-600 hover:text-black">Panduan Pilih</a>
            <a href="#pricing" className="text-gray-600 hover:text-black">Harga</a>
            <a href="#faq" className="text-gray-600 hover:text-black">FAQ</a>
            <Link
              href={`${basePath}/checkout?tier=tier-bundle`}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: "#111113" }}
            >
              Beli Paket (Rp149k)
            </Link>
          </nav>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12 md:py-20">
        {/* Hero Section */}
        <section className="text-center max-w-3xl mx-auto mb-16 md:mb-24">
          <span
            className="inline-block rounded-full px-3 py-1 text-xs font-bold uppercase tracking-widest mb-4"
            style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
          >
            Seri Buku Kerja Praktis untuk Manager & Team Lead
          </span>
          <h1
            className="text-3xl sm:text-4xl md:text-5xl font-black tracking-tight leading-tight"
            style={{ color: "#111113" }}
          >
            Panduan Kepemimpinan Praktis untuk Kantor Nyata
          </h1>
          <p className="mt-4 text-base sm:text-lg text-gray-700 leading-relaxed">
            Bukan teori abstrak dari ruang kuliah. Buku pegangan ringkas berbasis situasi nyata di kantor: obrolan 1-on-1, evaluasi tanpa kejutan, negosiasi kapasitas, hingga memimpin para manager.
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <a
              href="#pricing"
              className="inline-flex items-center justify-center rounded-lg px-6 py-3 text-sm font-bold text-white shadow transition-all hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              style={{ backgroundColor: "#111113" }}
            >
              Lihat Pilihan Akses & Harga
            </a>
            <a
              href="#book-finder"
              className="inline-flex items-center justify-center rounded-lg border px-6 py-3 text-sm font-semibold transition-colors hover:bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              style={{ borderColor: "#111113", color: "#111113" }}
            >
              Bantu Saya Memilih Buku
            </a>
          </div>

          <div className="mt-6 flex items-center justify-center gap-6 text-xs text-gray-600">
            <span>✓ 2 Bab Sampel Gratis di Tiap Buku</span>
            <span>✓ Checklist Interaktif Langsung di Browser</span>
            <span>✓ Akses Seumur Hidup</span>
          </div>
        </section>

        {/* 3 Books Grid */}
        <section id="katalog" aria-labelledby="katalog-heading" className="my-16">
          <div className="mb-8">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1D4ED8" }}>
              Tiga Tingkatan Panduan
            </span>
            <h2 id="katalog-heading" className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1" style={{ color: "#111113" }}>
              Katalog Tiga Seri Buku
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              Setiap buku terdiri dari 15 bab terstruktur dengan 2 bab sampel gratis yang bisa Anda baca langsung.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {displayBooks.map((b, idx) => (
              <BookCard key={b.slug} book={b} locale={locale} featured={idx === 0} />
            ))}
          </div>
        </section>

        {/* Book Finder Component */}
        <BookFinder locale={locale} />

        {/* Pricing Table Component */}
        <PricingTable books={displayBooks} bundle={bundle} locale={locale} />

        {/* FAQ Section */}
        <section id="faq" aria-labelledby="faq-heading" className="my-20 max-w-3xl mx-auto">
          <div className="text-center mb-10">
            <span className="text-xs font-bold uppercase tracking-widest" style={{ color: "#1D4ED8" }}>
              Informasi Pembaca
            </span>
            <h2 id="faq-heading" className="text-2xl md:text-3xl font-extrabold tracking-tight mt-1" style={{ color: "#111113" }}>
              Pertanyaan yang Sering Diajukan
            </h2>
          </div>

          <div className="space-y-4">
            <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "#E5E0D5" }}>
              <h3 className="text-base font-bold" style={{ color: "#111113" }}>
                Apakah saya bisa membaca sebelum membeli?
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Tentu saja! Bab 0 (Pendahuluan) dan Bab 1 di setiap buku berstatus <strong>Sampel Gratis</strong>. Anda dapat langsung membuka dan membacanya di peramban web tanpa perlu mendaftar atau memasukkan data pembayaran.
              </p>
            </div>

            <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "#E5E0D5" }}>
              <h3 className="text-base font-bold" style={{ color: "#111113" }}>
                Apakah akses buku ini berupa langganan atau sekali bayar?
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Pembayaran dilakukan <strong>satu kali untuk akses seumur hidup</strong>. Tidak ada biaya langganan bulanan maupun pemotongan otomatis berulang.
              </p>
            </div>

            <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "#E5E0D5" }}>
              <h3 className="text-base font-bold" style={{ color: "#111113" }}>
                Bagaimana format buku dan cara membacanya?
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Buku dihadirkan dalam format web reader responsif dengan tipografi yang nyaman di mata, dilengkapi checklist interaktif yang menyimpan kemajuan Anda secara lokal. Tidak perlu memasang aplikasi tambahan.
              </p>
            </div>

            <div className="rounded-xl border p-5 bg-white" style={{ borderColor: "#E5E0D5" }}>
              <h3 className="text-base font-bold" style={{ color: "#111113" }}>
                Metode pembayaran apa saja yang didukung?
              </h3>
              <p className="mt-2 text-sm text-gray-600 leading-relaxed">
                Kami mendukung QRIS (GoPay, OVO, Dana, BCA, Mandiri, dll.), Virtual Account Bank nasional, dan transfer melalui gateway pembayaran resmi berlisensi Bank Indonesia.
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-xs text-gray-500" style={{ borderColor: "#E5E0D5", backgroundColor: "#FFFFFF" }}>
        <p>© 2026 Crow.asia — Panduan Kepemimpinan Praktis untuk Kantor Nyata.</p>
        <p className="mt-1">Hak cipta dilindungi undang-undang.</p>
      </footer>
    </div>
  );
}

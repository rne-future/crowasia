import Link from "next/link";
import { notFound } from "next/navigation";
import { getBookDetail } from "@/modules/catalog/service";
import { formatIdr } from "@/components/storefront/book-card";

interface BookDetailPageProps {
  params: Promise<{ locale: string; slug: string }>;
}

export default async function BookDetailPage({ params }: BookDetailPageProps) {
  const { locale, slug } = await params;
  const book = await getBookDetail(slug, locale);

  if (!book) {
    notFound();
  }

  const basePath = locale && locale !== "id" ? `/${locale}` : "";
  const singleTier = book.tiers.find((t) => !t.code.toLowerCase().includes("bundle")) ?? book.tiers[0];
  const checkoutTierCode = singleTier?.code ?? `tier-${book.slug}`;
  const formattedPrice = formatIdr(book.activePriceIdr);

  return (
    <div
      className="min-h-screen"
      style={{
        backgroundColor: "#FAF8F5",
        color: "#111113",
      }}
    >
      {/* Top Header */}
      <header className="border-b bg-white" style={{ borderColor: "#E5E0D5" }}>
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link
            href={`${basePath}/`}
            className="inline-flex items-center text-xs font-semibold text-gray-600 hover:text-black gap-1"
          >
            ← Kembali ke Katalog
          </Link>
          <span className="text-xs font-bold uppercase tracking-wider text-gray-400">
            Detail Buku
          </span>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-10 md:py-16">
        {/* Book Header Card */}
        <section
          className="rounded-2xl border p-6 md:p-10 bg-white shadow-sm"
          style={{ borderColor: "#E5E0D5" }}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
            <span
              className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
            >
              2 Bab Sampel Gratis
            </span>
            <span className="text-xs text-gray-500 font-medium">
              Total {book.chaptersCount} Bab Terstruktur
            </span>
          </div>

          <h1
            className="text-2xl sm:text-3xl md:text-4xl font-extrabold tracking-tight"
            style={{ color: "#111113" }}
          >
            {book.title}
          </h1>

          {book.description && (
            <p className="mt-4 text-base md:text-lg text-gray-700 leading-relaxed">
              {book.description}
            </p>
          )}

          <div
            className="mt-8 pt-6 border-t flex flex-wrap items-center justify-between gap-4"
            style={{ borderColor: "#E5E0D5" }}
          >
            <div>
              <span className="text-xs uppercase tracking-wider text-gray-500 block">
                Investasi Akses Digital
              </span>
              <span className="text-2xl md:text-3xl font-black" style={{ color: "#111113" }}>
                {formattedPrice}
              </span>
              <span className="text-xs text-gray-500 block mt-0.5">
                Sekali bayar untuk akses seumur hidup
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Link
                href={`${basePath}/read/${book.slug}/ch-0`}
                className="inline-flex items-center justify-center rounded-lg border px-5 py-2.5 text-xs font-bold transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                style={{ borderColor: "#111113", color: "#111113" }}
              >
                Baca Sampel Gratis
              </Link>
              <Link
                href={`${basePath}/checkout?tier=${checkoutTierCode}`}
                className="inline-flex items-center justify-center rounded-lg px-5 py-2.5 text-xs font-bold text-white shadow transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                style={{ backgroundColor: "#111113" }}
              >
                Beli Buku Ini
              </Link>
            </div>
          </div>
        </section>

        {/* Table of Contents Section */}
        <section
          aria-labelledby="toc-heading"
          className="mt-12 rounded-2xl border p-6 md:p-10 bg-white"
          style={{ borderColor: "#E5E0D5" }}
        >
          <div className="flex items-center justify-between mb-6 border-b pb-4" style={{ borderColor: "#E5E0D5" }}>
            <div>
              <h2 id="toc-heading" className="text-xl md:text-2xl font-bold" style={{ color: "#111113" }}>
                Daftar Isi
              </h2>
              <p className="text-xs text-gray-500 mt-1">
                Bab 0 &amp; 1 terbuka bebas. Bab 2 sampai 14 terbuka penuh setelah pembelian.
              </p>
            </div>
          </div>

          <ol className="space-y-3">
            {book.chapters.map((ch) => {
              if (ch.isFreeSample) {
                return (
                  <li
                    key={ch.slug}
                    className="flex items-center justify-between p-3.5 rounded-lg border transition-all hover:border-[#059669] hover:bg-emerald-50/30"
                    style={{ borderColor: "#A7F3D0", backgroundColor: "#F0FDF4" }}
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-bold"
                        style={{ backgroundColor: "#D1FAE5", color: "#065F46" }}
                      >
                        {ch.index}
                      </span>
                      <span className="text-sm font-semibold" style={{ color: "#111113" }}>
                        {ch.title}
                      </span>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className="rounded-md px-2 py-0.5 text-xs font-semibold"
                        style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
                      >
                        Sampel Gratis
                      </span>
                      <Link
                        href={`${basePath}/read/${book.slug}/${ch.slug}`}
                        className="inline-flex items-center rounded-md border px-3 py-1 text-xs font-semibold transition-colors hover:bg-white"
                        style={{ borderColor: "#059669", color: "#065F46" }}
                      >
                        Baca →
                      </Link>
                    </div>
                  </li>
                );
              }

              return (
                <li
                  key={ch.slug}
                  className="flex items-center justify-between p-3.5 rounded-lg border bg-gray-50/50"
                  style={{ borderColor: "#E5E0D5" }}
                >
                  <div className="flex items-center gap-3">
                    <span className="flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium text-gray-500 bg-gray-200">
                      {ch.index}
                    </span>
                    <span className="text-sm font-medium text-gray-700">
                      {ch.title}
                    </span>
                  </div>

                  <span className="inline-flex items-center gap-1 text-xs font-medium text-gray-400">
                    <span aria-hidden="true">🔒</span> Terkunci
                  </span>
                </li>
              );
            })}
          </ol>
        </section>

        {/* Bundle Banner Upsell */}
        <section
          className="mt-12 rounded-xl border p-6 flex flex-wrap items-center justify-between gap-4"
          style={{ backgroundColor: "#FAF8F5", borderColor: "#111113" }}
        >
          <div>
            <span
              className="inline-block rounded px-2 py-0.5 text-xs font-bold uppercase tracking-wider mb-1"
              style={{ backgroundColor: "#FFE66D", color: "#111113" }}
            >
              Penawaran Terbaik
            </span>
            <h3 className="text-base font-bold" style={{ color: "#111113" }}>
              Dapatkan Paket 3 Buku Lengkap Seharga Rp149.000
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              Hemat Rp88.000 dibanding membeli satuan. Akses seumur hidup untuk seluruh seri kepemimpinan.
            </p>
          </div>

          <Link
            href={`${basePath}/checkout?tier=tier-bundle`}
            className="inline-flex items-center justify-center rounded-lg px-4 py-2 text-xs font-bold text-white transition-opacity hover:opacity-90 shadow"
            style={{ backgroundColor: "#111113" }}
          >
            Beli Paket Lengkap (Rp149k)
          </Link>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 text-center text-xs text-gray-500 mt-16 bg-white" style={{ borderColor: "#E5E0D5" }}>
        <p>© 2026 Crow.asia — Panduan Kepemimpinan Praktis untuk Kantor Nyata.</p>
      </footer>
    </div>
  );
}

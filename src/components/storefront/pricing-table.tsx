import Link from "next/link";
import type { BookSummary } from "@/modules/catalog/types";
import { formatIdr } from "./book-card";

export interface PricingTableProps {
  books?: BookSummary[];
  bundle?: {
    tierId: string;
    amountIdr: bigint;
    code?: string;
  } | null;
  locale?: string;
}

export function PricingTable({
  books = [],
  bundle,
  locale = "id",
}: PricingTableProps) {
  const basePath = locale && locale !== "id" ? `/${locale}` : "";

  // Single books fallback data if books not passed or empty
  const singleBookOffers = [
    {
      slug: "book-1",
      tierCode: "tier-book-1",
      title: "Buku 1: Mahir Memimpin Tim",
      target: "Untuk Lead & Manager Baru",
      amountIdr: 59000n,
      features: [
        "15 Bab lengkap & studi kasus nyata",
        "2 Bab sampel gratis tanpa syarat",
        "Kerangka kerja obrolan 4x4",
        "Checklist interaktif di browser",
        "Akses digital seumur hidup",
      ],
    },
    {
      slug: "book-2",
      tierCode: "tier-book-2",
      title: "Buku 2: Napas Panjang Memimpin Tim",
      target: "Untuk Ketahanan & Sistem Kerja",
      amountIdr: 79000n,
      features: [
        "15 Bab lengkap & simulasi",
        "2 Bab sampel gratis tanpa syarat",
        "Protokol anti-rescue & kapasitas tim",
        "Checklist interaktif di browser",
        "Akses digital seumur hidup",
      ],
    },
    {
      slug: "book-3",
      tierCode: "tier-book-3",
      title: "Buku 3: Memimpin Para Leader",
      target: "Untuk Head, GM & Eksekutif",
      amountIdr: 99000n,
      features: [
        "15 Bab lengkap skala divisi",
        "2 Bab sampel gratis tanpa syarat",
        "Penyelarasan tim lintas fungsi",
        "Checklist interaktif di browser",
        "Akses digital seumur hidup",
      ],
    },
  ];

  const bundlePrice = bundle?.amountIdr ?? 149000n;
  const bundleCode = bundle?.code ?? "tier-bundle";

  return (
    <section
      id="pricing"
      aria-labelledby="pricing-heading"
      className="my-16"
    >
      <div className="text-center max-w-2xl mx-auto mb-12">
        <span
          className="text-xs font-bold uppercase tracking-widest"
          style={{ color: "#1D4ED8" }}
        >
          Investasi Terjangkau & Transparan
        </span>
        <h2
          id="pricing-heading"
          className="mt-2 text-3xl font-extrabold tracking-tight"
          style={{ color: "#111113" }}
        >
          Pilihan Akses Seri Lengkap
        </h2>
        <p className="mt-3 text-sm md:text-base text-gray-600">
          Harga jujur dan transparan tanpa biaya langganan bulanan. Dapatkan akses langsung seumur hidup ke materi digital dan checklist interaktif.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 items-stretch">
        {/* Single Books */}
        {singleBookOffers.map((item) => {
          const matchedBook = books.find((b) => b.slug === item.slug);
          const finalAmount = matchedBook?.activePriceIdr ?? item.amountIdr;

          return (
            <div
              key={item.slug}
              className="flex flex-col justify-between rounded-xl border p-6 bg-white transition-all hover:border-gray-400"
              style={{ borderColor: "#E5E0D5" }}
            >
              <div>
                <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider block">
                  {item.target}
                </span>
                <h3 className="mt-1 text-lg font-bold" style={{ color: "#111113" }}>
                  {item.title}
                </h3>

                <div className="mt-4 mb-6">
                  <span className="text-2xl font-black" style={{ color: "#111113" }}>
                    {formatIdr(finalAmount)}
                  </span>
                  <span className="text-xs text-gray-500 block">pembayaran 1 kali</span>
                </div>

              <ul className="space-y-2 text-xs text-gray-600 mb-6 border-t pt-4" style={{ borderColor: "#E5E0D5" }}>
                {item.features.map((feat, idx) => (
                  <li key={idx} className="flex items-start gap-2">
                    <span style={{ color: "#059669" }}>✓</span>
                    <span>{feat}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="pt-2">
              <Link
                href={`${basePath}/checkout?tier=${item.tierCode}`}
                className="w-full inline-flex items-center justify-center rounded-lg border py-2.5 px-4 text-xs font-semibold transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
                style={{ borderColor: "#111113", color: "#111113" }}
              >
                Pilih Buku Ini
              </Link>
            </div>
          </div>
        );
      })}

        {/* Bundle Tier Highlighted Card */}
        <div
          className="flex flex-col justify-between rounded-xl border-2 p-6 shadow-lg relative md:-translate-y-2"
          style={{
            borderColor: "#111113",
            backgroundColor: "#FAF8F5",
          }}
        >
          <div className="absolute -top-3 left-1/2 -translate-x-1/2">
            <span
              className="inline-block rounded-full px-3 py-1 text-xs font-bold tracking-wide uppercase shadow-sm"
              style={{ backgroundColor: "#FFE66D", color: "#111113" }}
            >
              Hemat Rp88.000
            </span>
          </div>

          <div>
            <span
              className="text-xs font-bold uppercase tracking-wider block mt-1"
              style={{ color: "#059669" }}
            >
              Penawaran Terbaik (Bundle)
            </span>
            <h3 className="mt-1 text-xl font-black" style={{ color: "#111113" }}>
              Paket Seri 3 Buku Lengkap
            </h3>
            <p className="text-xs text-gray-600 mt-1">
              Seluruh seri Buku 1, 2, dan 3 (Total 45 Bab)
            </p>

            <div className="mt-4 mb-6">
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-black" style={{ color: "#111113" }}>
                  {formatIdr(bundlePrice)}
                </span>
                <span className="text-xs line-through text-gray-400">
                  Rp 237.000
                </span>
              </div>
              <span className="text-xs font-medium text-emerald-700 block">
                Hemat Rp88.000 dibanding membeli satuan
              </span>
            </div>

            <ul className="space-y-2 text-xs text-gray-700 mb-6 border-t pt-4" style={{ borderColor: "#E5E0D5" }}>
              <li className="flex items-start gap-2 font-medium">
                <span style={{ color: "#059669" }}>✓</span>
                <span>Semua 3 buku (45 bab lengkap)</span>
              </li>
              <li className="flex items-start gap-2 font-medium">
                <span style={{ color: "#059669" }}>✓</span>
                <span>6 bab sampel gratis langsung terbuka</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: "#059669" }}>✓</span>
                <span>Seluruh checklist praktik & template</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: "#059669" }}>✓</span>
                <span>Akses seumur hidup + pembaruan konten</span>
              </li>
              <li className="flex items-start gap-2">
                <span style={{ color: "#059669" }}>✓</span>
                <span>Akses instan via browser di ponsel & desktop</span>
              </li>
            </ul>
          </div>

          <div className="pt-2">
            <Link
              href={`${basePath}/checkout?tier=${bundleCode}`}
              className="w-full inline-flex items-center justify-center rounded-lg py-3 px-4 text-xs font-bold text-white shadow transition-all hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
              style={{ backgroundColor: "#111113" }}
            >
              Beli Paket 3 Buku (Rp149.000)
            </Link>
          </div>
        </div>
      </div>

      {/* Transparent Terms Guarantee */}
      <div
        className="mt-8 rounded-xl border p-4 text-xs text-gray-600 flex flex-wrap items-center justify-around gap-4"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E0D5" }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: "#059669" }}>🔒</span>
          <span><strong>Ketentuan Transparan:</strong> Pembayaran 1 kali, bukan langganan otomatis</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "#1D4ED8" }}>⚡</span>
          <span>Akses digital aktif instan setelah pembayaran berhasil</span>
        </div>
        <div className="flex items-center gap-2">
          <span style={{ color: "#059669" }}>📖</span>
          <span>Baca di browser mana saja tanpa perlu install aplikasi pihak ketiga</span>
        </div>
      </div>
    </section>
  );
}

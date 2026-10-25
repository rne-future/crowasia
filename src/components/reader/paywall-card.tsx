import Link from "next/link";
import type { ChapterReadPayload } from "@/modules/reading/types";

export interface PaywallCardProps {
  payload: ChapterReadPayload;
  className?: string;
}

export function PaywallCard({ payload, className = "" }: PaywallCardProps) {
  const basePath = payload.locale && payload.locale !== "id" ? `/${payload.locale}` : "";
  const bookUrl = `${basePath}/books/${payload.bookSlug}`;

  return (
    <div
      className={`rounded-2xl border p-6 sm:p-10 bg-white shadow-sm max-w-2xl mx-auto my-8 ${className}`}
      style={{ borderColor: "#E5E0D5" }}
    >
      {/* Locked Status Badge */}
      <div className="flex items-center gap-2 mb-4">
        <span
          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold"
          style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
        >
          <svg
            className="w-3.5 h-3.5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
            />
          </svg>
          Bab Terkunci
        </span>
        <span className="text-xs text-gray-500 font-medium">
          {payload.bookTitle}
        </span>
      </div>

      {/* Chapter Title */}
      <h2
        className="text-2xl sm:text-3xl font-extrabold tracking-tight mb-4"
        style={{ color: "#111113" }}
      >
        {payload.chapterTitle}
      </h2>

      {/* Approved Preview Teaser */}
      {payload.previewText && (
        <div
          className="p-5 rounded-xl border bg-[#FAF8F5] mb-6 text-sm text-gray-700 leading-relaxed italic"
          style={{ borderColor: "#E5E0D5" }}
        >
          &ldquo;{payload.previewText}&rdquo;
        </div>
      )}

      {/* Value Highlights */}
      <div className="space-y-2.5 mb-8 text-xs text-gray-600">
        <div className="flex items-center gap-2">
          <span className="text-[#059669] font-bold">✓</span>
          <span>Akses seumur hidup ke 15 bab lengkap termasuk pembaruan</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#059669] font-bold">✓</span>
          <span>Skrip dialog percakapan 1-on-1 yang dapat disalin langsung</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[#059669] font-bold">✓</span>
          <span>Tersedia dalam register Standar dan Santai (Bahasa Indonesia)</span>
        </div>
      </div>

      {/* CTA Buttons */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        <Link
          href={bookUrl}
          className="inline-flex items-center justify-center rounded-xl px-6 py-3 text-xs font-bold transition-all shadow-sm focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          style={{
            backgroundColor: "#FFE66D",
            color: "#111113",
            border: "1px solid #E5E0D5",
          }}
        >
          Buka Akses Buku Ini
        </Link>

        <Link
          href={`${basePath}/#pricing`}
          className="inline-flex items-center justify-center rounded-xl px-5 py-3 text-xs font-bold border transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
          style={{
            borderColor: "#111113",
            color: "#111113",
          }}
        >
          Lihat Paket Lengkap (3 Buku)
        </Link>
      </div>

      {/* Navigation to free sample if applicable */}
      <div className="mt-6 pt-4 border-t text-center text-xs text-gray-500" style={{ borderColor: "#E5E0D5" }}>
        Belum yakin?{" "}
        <Link
          href={`${basePath}/read/${payload.bookSlug}/ch-0`}
          className="font-bold underline hover:text-[#111113]"
        >
          Baca Bab Pendahuluan (Sampel Gratis)
        </Link>
      </div>
    </div>
  );
}

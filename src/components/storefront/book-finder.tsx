"use client";

import { useState } from "react";
import Link from "next/link";

export interface FinderSituation {
  id: string;
  situation: string;
  shortLabel: string;
  recommendedBook: {
    slug: string;
    title: string;
    subtitle: string;
    price: string;
    badge: string;
    reason: string;
  };
}

export const FINDER_SITUATIONS: FinderSituation[] = [
  {
    id: "situation-1",
    shortLabel: "Pemimpin Baru",
    situation: "Baru pertama kali memimpin tim / mantan rekan kerja jadi bawahan",
    recommendedBook: {
      slug: "book-1",
      title: "Mahir Memimpin Tim",
      subtitle: "Strategi Menciptakan Tim yang Mandiri",
      price: "Rp 59.000",
      badge: "Sangat Disarankan untuk Lead Baru",
      reason:
        "Buku ini memandu transisi dari kerja sendiri ke mengarahkan tim, kerangka kerja obrolan 4x4, menyepakati target di awal, dan memberikan koreksi tanpa merusak relasi kerja.",
    },
  },
  {
    id: "situation-2",
    shortLabel: "Arsitek Sistem",
    situation: "Kewalahan memadamkan masalah / energi terkuras / ingin tim lebih mandiri",
    recommendedBook: {
      slug: "book-2",
      title: "Napas Panjang Memimpin Tim",
      subtitle: "Strategi Mengatasi Kejenuhan dan Membangun Sistem Kerja Mandiri",
      price: "Rp 79.000",
      badge: "Fokus Ketahanan Sistem Kerja",
      reason:
        "Buku ini memandu peralihan dari pemadam kebakaran menjadi arsitek sistem, menghentikan kebiasaan anti-rescue, memisahkan masalah tim dari beban mental, dan negosiasi kapasitas berbasis data.",
    },
  },
  {
    id: "situation-3",
    shortLabel: "Pemimpin Divisi",
    situation: "Bawahan langsung adalah para manajer / menggerakkan divisi lintas fungsi",
    recommendedBook: {
      slug: "book-3",
      title: "Memimpin Para Leader",
      subtitle: "Strategi Naik Kelas dari Mengarahkan Tim ke Menggerakkan Divisi",
      price: "Rp 99.000",
      badge: "Tingkat Lanjut untuk Skip-Level / Head",
      reason:
        "Buku ini memandu strategi memimpin para manajer, menyelaraskan tujuan lintas departemen, dan memonitor dampak bisnis tanpa terjebak dalam perangkap mikromanajemen.",
    },
  },
];

export interface BookFinderProps {
  locale?: string;
}

export function BookFinder({ locale = "id" }: BookFinderProps) {
  const [selectedId, setSelectedId] = useState<string>("situation-1");
  const selectedSituation =
    FINDER_SITUATIONS.find((s) => s.id === selectedId) ?? FINDER_SITUATIONS[0];
  const basePath = locale && locale !== "id" ? `/${locale}` : "";

  return (
    <section
      id="book-finder"
      aria-labelledby="book-finder-heading"
      className="my-16 rounded-2xl border p-6 md:p-10 shadow-sm"
      style={{
        backgroundColor: "#FAF8F5",
        borderColor: "#E5E0D5",
        color: "#111113",
      }}
    >
      <div className="max-w-2xl">
        <span
          className="inline-block text-xs font-bold uppercase tracking-widest"
          style={{ color: "#1D4ED8" }}
        >
          Alat Bantu Navigasi Seri
        </span>
        <h2
          id="book-finder-heading"
          className="mt-2 text-2xl md:text-3xl font-extrabold tracking-tight"
          style={{ color: "#111113" }}
        >
          Butuh bantuan memilih?
        </h2>
        <p className="mt-2 text-sm md:text-base leading-relaxed text-gray-700">
          Pilih situasi atau tantangan kepemimpinan nyata yang sedang Anda hadapi saat ini di meja kerja:
        </p>
      </div>

      {/* Situations selector */}
      <div
        role="radiogroup"
        aria-label="Pilihan situasi peran kerja"
        className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-3"
      >
        {FINDER_SITUATIONS.map((sit) => {
          const isSelected = sit.id === selectedSituation.id;
          return (
            <button
              key={sit.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              onClick={() => setSelectedId(sit.id)}
              className={`flex flex-col text-left p-4 rounded-xl border transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
                isSelected
                  ? "border-[#111113] bg-[#FFFFFF] shadow-md ring-1 ring-[#111113]"
                  : "border-[#E5E0D5] bg-[#FAF8F5] hover:bg-[#FFFFFF]"
              }`}
              style={{
                borderColor: isSelected ? "#111113" : "#E5E0D5",
                backgroundColor: isSelected ? "#FFFFFF" : "#FAF8F5",
              }}
            >
              <span
                className="text-xs font-semibold uppercase tracking-wider mb-1"
                style={{ color: isSelected ? "#1D4ED8" : "#6B7280" }}
              >
                {sit.shortLabel}
              </span>
              <span className="text-sm font-medium leading-snug" style={{ color: "#111113" }}>
                {sit.situation}
              </span>
              <span
                className="mt-3 text-xs font-semibold inline-block"
                style={{ color: isSelected ? "#059669" : "#4B5563" }}
              >
                Rekomendasi: {sit.recommendedBook.title}
              </span>
            </button>
          );
        })}
      </div>

      {/* Recommended Book Output */}
      <div
        className="mt-8 rounded-xl border p-6 md:p-8"
        style={{ backgroundColor: "#FFFFFF", borderColor: "#E5E0D5" }}
      >
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-4" style={{ borderColor: "#E5E0D5" }}>
          <div>
            <span
              className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold"
              style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
            >
              {selectedSituation.recommendedBook.badge}
            </span>
            <h3 className="mt-2 text-xl font-bold" style={{ color: "#111113" }}>
              {selectedSituation.recommendedBook.title}
            </h3>
            <p className="text-xs text-gray-500">{selectedSituation.recommendedBook.subtitle}</p>
          </div>
          <div className="text-right">
            <span className="text-xs text-gray-500 block">Investasi Akses</span>
            <span className="text-xl font-extrabold" style={{ color: "#111113" }}>
              {selectedSituation.recommendedBook.price}
            </span>
          </div>
        </div>

        <p className="mt-4 text-sm leading-relaxed text-gray-700">
          {selectedSituation.recommendedBook.reason}
        </p>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <Link
            href={`${basePath}/read/${selectedSituation.recommendedBook.slug}/ch-0`}
            className="inline-flex items-center rounded-lg border px-4 py-2 text-xs font-semibold transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            style={{ borderColor: "#111113", color: "#111113" }}
          >
            Baca Sampel Gratis
          </Link>
          <Link
            href={`${basePath}/books/${selectedSituation.recommendedBook.slug}`}
            className="inline-flex items-center rounded-lg px-4 py-2 text-xs font-semibold text-white transition-opacity hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            style={{ backgroundColor: "#111113" }}
          >
            Lihat Detail Buku
          </Link>
        </div>
      </div>

      {/* Strictly Reflective Guidance Disclaimer */}
      <div
        className="mt-4 rounded-lg p-3 text-xs leading-relaxed text-gray-600"
        style={{ backgroundColor: "#F3F4F6", borderLeft: "4px solid #9CA3AF" }}
      >
        <p>
          <strong>Catatan Refleksi:</strong> Panduan pemilihan di atas dirancang murni sebagai alat refleksi peran profesional di tempat kerja dan <strong>bukan diagnosis psikologis</strong>, medis, maupun penilaian klinis kelelahan kerja (burnout).
        </p>
      </div>
    </section>
  );
}

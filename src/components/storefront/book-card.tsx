import Link from "next/link";
import type { BookSummary } from "@/modules/catalog/types";

export interface BookCardProps {
  book: BookSummary;
  locale?: string;
  featured?: boolean;
}

export function formatIdr(amount: bigint): string {
  return new Intl.NumberFormat("id-ID", {
    style: "currency",
    currency: "IDR",
    maximumFractionDigits: 0,
  }).format(Number(amount));
}

export function BookCard({ book, locale = "id", featured = false }: BookCardProps) {
  const formattedPrice = formatIdr(book.activePriceIdr);
  const cardId = `book-card-${book.slug}`;
  const basePath = locale && locale !== "id" ? `/${locale}` : "";

  return (
    <article
      aria-labelledby={`${cardId}-title`}
      className={`group relative flex flex-col justify-between rounded-xl border p-6 transition-all duration-200 hover:shadow-md ${
        featured ? "border-[#111113] bg-[#FAF8F5]" : "border-[#E5E0D5] bg-[#FFFFFF]"
      }`}
      style={{
        borderColor: featured ? "#111113" : "#E5E0D5",
        backgroundColor: featured ? "#FAF8F5" : "#FFFFFF",
        color: "#111113",
      }}
    >
      <div>
        <div className="mb-4 flex items-center justify-between gap-2">
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-semibold"
            style={{ backgroundColor: "#ECFDF5", color: "#059669" }}
          >
            2 Bab Sampel Gratis
          </span>
          <span
            className="inline-flex items-center rounded-md px-2.5 py-0.5 text-xs font-medium"
            style={{ backgroundColor: "#F3F4F6", color: "#374151" }}
          >
            {book.chaptersCount} Bab Lengkap
          </span>
        </div>

        <h3
          id={`${cardId}-title`}
          className="mb-2 text-xl font-bold leading-snug tracking-tight"
          style={{ color: "#111113" }}
        >
          {book.title}
        </h3>

        {book.description && (
          <p
            className="mb-6 text-sm leading-relaxed"
            style={{ color: "#4B5563" }}
          >
            {book.description}
          </p>
        )}
      </div>

      <div className="mt-4 border-t pt-4" style={{ borderColor: "#E5E0D5" }}>
        <div className="mb-4 flex items-baseline justify-between">
          <span className="text-xs uppercase tracking-wider text-gray-500">Harga Akses Penuh</span>
          <span className="text-lg font-bold" style={{ color: "#111113" }}>
            {formattedPrice}
          </span>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`${basePath}/read/${book.slug}/ch-0`}
            className="inline-flex items-center justify-center rounded-lg border px-3 py-2 text-xs font-medium transition-colors hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            style={{ borderColor: "#E5E0D5", color: "#111113" }}
          >
            Sampel Gratis
          </Link>
          <Link
            href={`${basePath}/books/${book.slug}`}
            className="inline-flex items-center justify-center rounded-lg px-3 py-2 text-xs font-semibold text-white transition-colors hover:opacity-95 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            style={{ backgroundColor: "#111113" }}
          >
            Lihat Detail
          </Link>
        </div>
      </div>
    </article>
  );
}

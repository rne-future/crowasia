"use client";

import React, { useState } from "react";
import Link from "next/link";
import type { UserDashboardData } from "@/modules/search/types";
import { SearchDialog } from "@/components/search/search-dialog";

interface DashboardViewProps {
  data: UserDashboardData;
  locale?: string;
}

export function DashboardView({ data, locale = "id" }: DashboardViewProps) {
  const [claimLoading, setClaimLoading] = useState<string | null>(null);
  const [claimMessage, setClaimMessage] = useState<string | null>(null);

  const formatIdr = (val: bigint | number) => {
    return new Intl.NumberFormat("id-ID", {
      style: "currency",
      currency: "IDR",
      maximumFractionDigits: 0,
    }).format(Number(val));
  };

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat("id-ID", {
      dateStyle: "medium",
    }).format(new Date(date));
  };

  const handleClaimRequest = async (orderId: string) => {
    setClaimLoading(orderId);
    setClaimMessage(null);
    try {
      const res = await fetch(`/api/purchases/${orderId}/claim-request`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: data.user.email }),
      });
      if (res.ok) {
        setClaimMessage(
          "Tautan klaim telah dikirimkan ke email Anda. Silakan periksa kotak masuk untuk menyelesaikan klaim."
        );
      } else {
        const err = await res.json().catch(() => ({}));
        setClaimMessage(err.message || "Gagal mengajukan permintaan klaim.");
      }
    } catch (e) {
      setClaimMessage("Terjadi kesalahan jaringan saat mengajukan klaim.");
    } finally {
      setClaimLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950 text-neutral-900 dark:text-neutral-100">
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-30 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md border-b border-neutral-200 dark:border-neutral-800">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link
              href={`/${locale}`}
              className="text-lg font-bold tracking-tight text-neutral-900 dark:text-white"
            >
              Crow Asia Reader
            </Link>
            <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-950/80 text-indigo-700 dark:text-indigo-300 font-medium">
              Dasbor Pembaca
            </span>
          </div>

          <div className="flex items-center gap-3">
            <SearchDialog locale={locale} triggerButton={true} />
            <div className="hidden sm:block text-xs text-neutral-500 font-mono">
              {data.user.email}
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-8 space-y-8">
        {/* Unclaimed Guest Purchases Banner */}
        {data.unclaimedOrders.length > 0 && (
          <div className="p-5 rounded-2xl bg-gradient-to-r from-amber-50 to-orange-50 dark:from-amber-950/30 dark:to-orange-950/20 border border-amber-200 dark:border-amber-800/60 shadow-sm space-y-3">
            <div className="flex items-center gap-2 text-amber-800 dark:text-amber-400 font-semibold text-sm">
              <svg
                className="w-5 h-5 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <span>Pesanan Tamu Belum Diklaim Ditemukan</span>
            </div>

            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
              Kami menemukan pesanan buku dengan email Anda (<strong>{data.user.email}</strong>) yang dibeli sebelum akun Anda terhubung. Klaim sekarang untuk membuka akses penuh ke buku Anda:
            </p>

            <div className="space-y-2 pt-1">
              {data.unclaimedOrders.map((order) => (
                <div
                  key={order.orderId}
                  className="p-3 bg-white/70 dark:bg-neutral-900/60 rounded-xl border border-amber-200/60 dark:border-amber-900/40 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                      {order.books.join(", ")}
                    </div>
                    <div className="text-[11px] text-neutral-500 mt-0.5">
                      Nilai: {formatIdr(order.amount)} • Dipesan: {formatDate(order.createdAt)}
                    </div>
                  </div>

                  <button
                    type="button"
                    disabled={claimLoading === order.orderId}
                    onClick={() => handleClaimRequest(order.orderId)}
                    className="inline-flex items-center justify-center px-3.5 py-1.5 rounded-lg text-xs font-semibold text-white bg-amber-600 hover:bg-amber-700 disabled:opacity-50 transition-colors shadow-sm self-start sm:self-auto"
                  >
                    {claimLoading === order.orderId ? "Memproses..." : "Klaim Pembelian"}
                  </button>
                </div>
              ))}
            </div>

            {claimMessage && (
              <p className="text-xs font-medium text-amber-900 dark:text-amber-300 bg-amber-100/60 dark:bg-amber-900/30 p-2.5 rounded-lg">
                {claimMessage}
              </p>
            )}
          </div>
        )}

        {/* Owned Books Section */}
        <section className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold tracking-tight text-neutral-900 dark:text-white">
              Buku yang Anda Miliki
            </h2>
            <span className="text-xs text-neutral-500">
              Total {data.ownedBooks.length} buku
            </span>
          </div>

          {data.ownedBooks.length === 0 ? (
            <div className="p-8 text-center bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 space-y-3">
              <div className="w-12 h-12 mx-auto rounded-full bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center text-neutral-400">
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
                  />
                </svg>
              </div>
              <h3 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100">
                Belum ada buku yang dimiliki
              </h3>
              <p className="text-xs text-neutral-500 max-w-sm mx-auto">
                Jelajahi katalog buku kepemimpinan tim praktis kami dan dapatkan akses membaca seumur hidup.
              </p>
              <div className="pt-2">
                <Link
                  href={`/${locale}`}
                  className="inline-flex items-center px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                >
                  Buka Katalog Buku
                </Link>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
              {data.ownedBooks.map((book) => {
                const continueChapter = book.latestProgress?.chapterSlug ?? "chapter-0";
                const continueHref = `/${locale}/read/${book.slug}/${continueChapter}`;

                return (
                  <div
                    key={book.bookId}
                    className="flex flex-col justify-between p-5 bg-white dark:bg-neutral-900 rounded-2xl border border-neutral-200 dark:border-neutral-800 shadow-sm hover:shadow-md transition-shadow group"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between text-[11px] text-neutral-400">
                        <span>Akses Resmi</span>
                        <span>{formatDate(book.grantedAt)}</span>
                      </div>

                      <h3 className="text-base font-bold text-neutral-900 dark:text-neutral-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                        {book.title}
                      </h3>

                      {book.latestProgress ? (
                        <div className="p-3 bg-neutral-50 dark:bg-neutral-800/50 rounded-xl space-y-1 border border-neutral-100 dark:border-neutral-800">
                          <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider block">
                            Posisi Terakhir:
                          </span>
                          <p className="text-xs font-medium text-neutral-800 dark:text-neutral-200">
                            {book.latestProgress.chapterTitle}
                          </p>
                          <span className="text-[10px] text-neutral-400 block">
                            Dibaca {formatDate(book.latestProgress.lastSeenAt)}
                          </span>
                        </div>
                      ) : (
                        <p className="text-xs text-neutral-500 italic">
                          Belum ada catatan membaca. Mulai dari bab pendahuluan!
                        </p>
                      )}
                    </div>

                    <div className="pt-5">
                      <Link
                        href={continueHref}
                        className="w-full inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 transition-colors shadow-sm"
                      >
                        <span>{book.latestProgress ? "Lanjutkan Membaca" : "Mulai Membaca"}</span>
                        <svg
                          className="w-3.5 h-3.5"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            strokeWidth={2}
                            d="M9 5l7 7-7 7"
                          />
                        </svg>
                      </Link>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

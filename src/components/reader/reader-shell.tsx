"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import type { ChapterReadPayload } from "@/modules/reading/types";
import { CopyScriptButton } from "./copy-script-button";
import { FootnotesPopover } from "./footnotes-popover";
import { ReaderContentEnhancer } from "./reader-content-enhancer";

export interface ReaderShellProps {
  payload: ChapterReadPayload;
  children: React.ReactNode;
  currentLocale: string;
  currentRegister?: string;
}

export function ReaderShell({
  payload,
  children,
  currentLocale,
  currentRegister = "standard",
}: ReaderShellProps) {
  const [fontSize, setFontSize] = useState<"sm" | "md" | "lg">("md");
  const [zenMode, setZenMode] = useState(false);
  const [isTocOpen, setIsTocOpen] = useState(false);

  const basePath = currentLocale && currentLocale !== "id" ? `/${currentLocale}` : "";
  const bookUrl = `${basePath}/books/${payload.bookSlug}`;

  const toggleZenMode = useCallback(() => {
    setZenMode((prev) => !prev);
  }, []);

  const toggleToc = useCallback(() => {
    setIsTocOpen((prev) => !prev);
  }, []);

  const fontSizeClass =
    fontSize === "sm"
      ? "text-sm leading-relaxed"
      : fontSize === "lg"
        ? "text-lg md:text-xl leading-loose"
        : "text-base md:text-lg leading-relaxed";

  return (
    <div
      className="min-h-screen font-serif flex flex-col"
      style={{
        backgroundColor: "#FAF8F5",
        color: "#111113",
      }}
    >
      {/* Top Navbar */}
      <header
        className={`sticky top-0 z-40 border-b bg-white transition-opacity ${
          zenMode ? "opacity-30 hover:opacity-100" : "opacity-100"
        }`}
        style={{ borderColor: "#E5E0D5" }}
      >
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4 font-sans text-xs">
          {/* Left: Navigation and Title */}
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href={bookUrl}
              className="font-semibold text-gray-600 hover:text-black shrink-0 transition-colors"
            >
              ← Kembali ke Buku
            </Link>
            <span className="text-gray-300 hidden sm:inline">|</span>
            <span className="truncate font-medium text-gray-500 hidden sm:inline">
              {payload.bookTitle}
            </span>
          </div>

          {/* Right: Controls (Font size, Register, Zen Mode, TOC trigger) */}
          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Register Switcher (Bahasa Indonesia only) */}
            {currentLocale === "id" && (
              <div
                className="flex items-center rounded-lg border p-0.5 bg-gray-50"
                style={{ borderColor: "#E5E0D5" }}
              >
                <Link
                  href={`${basePath}/read/${payload.bookSlug}/${payload.chapterSlug}?reg=standard`}
                  className={`px-2 py-1 rounded font-semibold transition-colors ${
                    currentRegister === "standard"
                      ? "bg-white text-[#111113] shadow-xs"
                      : "text-gray-500 hover:text-black"
                  }`}
                >
                  Standar
                </Link>
                <Link
                  href={`${basePath}/read/${payload.bookSlug}/${payload.chapterSlug}?reg=casual`}
                  className={`px-2 py-1 rounded font-semibold transition-colors ${
                    currentRegister === "casual"
                      ? "bg-white text-[#111113] shadow-xs"
                      : "text-gray-500 hover:text-black"
                  }`}
                >
                  Santai
                </Link>
              </div>
            )}

            {/* Font Size Adjusters */}
            <div
              className="flex items-center rounded-lg border p-0.5 bg-gray-50"
              style={{ borderColor: "#E5E0D5" }}
              role="group"
              aria-label="Ukuran teks"
            >
              <button
                type="button"
                onClick={() => setFontSize("sm")}
                aria-pressed={fontSize === "sm"}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  fontSize === "sm"
                    ? "bg-white text-[#111113] shadow-xs"
                    : "text-gray-500 hover:text-black"
                }`}
                aria-label="Ukuran font kecil"
              >
                A-
              </button>
              <button
                type="button"
                onClick={() => setFontSize("md")}
                aria-pressed={fontSize === "md"}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  fontSize === "md"
                    ? "bg-white text-[#111113] shadow-xs"
                    : "text-gray-500 hover:text-black"
                }`}
                aria-label="Ukuran font normal"
              >
                A
              </button>
              <button
                type="button"
                onClick={() => setFontSize("lg")}
                aria-pressed={fontSize === "lg"}
                className={`px-2 py-1 rounded font-bold transition-colors ${
                  fontSize === "lg"
                    ? "bg-white text-[#111113] shadow-xs"
                    : "text-gray-500 hover:text-black"
                }`}
                aria-label="Ukuran font besar"
              >
                A+
              </button>
            </div>

            {/* Salin Skrip Quick Action */}
            <CopyScriptButton
              text=""
              getText={() => {
                if (typeof document === "undefined") return "";
                const scriptEls = document.querySelectorAll(
                  "#reader-content details, #reader-content blockquote.script-box, #reader-content .script-box, #reader-content .script-block, #reader-content [data-script-id]"
                );
                if (scriptEls.length === 0) {
                  return document.querySelector("#reader-content")?.textContent?.trim() || "";
                }
                return Array.from(scriptEls)
                  .map((el) => {
                    const clone = el.cloneNode(true) as HTMLElement;
                    clone.querySelector(".script-copy-slot")?.remove();
                    return clone.textContent?.trim() || "";
                  })
                  .filter(Boolean)
                  .join("\n\n---\n\n");
              }}
              label="Salin Skrip"
              className="hidden sm:inline-flex"
            />

            {/* Zen Mode Button */}
            <button
              type="button"
              onClick={toggleZenMode}
              aria-pressed={zenMode}
              className={`px-2.5 py-1.5 rounded-lg border font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
                zenMode
                  ? "bg-[#FFE66D] text-[#111113] border-[#E5E0D5]"
                  : "bg-white text-gray-700 border-[#E5E0D5] hover:bg-gray-50"
              }`}
            >
              {zenMode ? "Keluar Fokus" : "Mode Fokus"}
            </button>

            {/* TOC Mobile Toggle */}
            <button
              type="button"
              onClick={toggleToc}
              aria-expanded={isTocOpen}
              aria-controls="toc-drawer"
              aria-label="Daftar Isi"
              className="lg:hidden px-2.5 py-1.5 rounded-lg border bg-white border-[#E5E0D5] font-semibold text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
            >
              Daftar Isi
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout Body */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-8 flex items-start gap-8">
        {/* Desktop TOC Sidebar (hidden when Zen mode active or on mobile) */}
        {!zenMode && payload.toc && payload.toc.length > 0 && (
          <aside
            className="hidden lg:block w-64 shrink-0 sticky top-20 rounded-2xl border p-5 bg-white shadow-xs max-h-[calc(100vh-6rem)] overflow-y-auto font-sans text-xs"
            style={{ borderColor: "#E5E0D5" }}
          >
            <h3 className="font-extrabold uppercase tracking-wider text-gray-400 mb-3 text-[11px]">
              Daftar Isi
            </h3>
            <nav aria-label="Daftar isi bab">
              <ul className="space-y-1.5">
                {payload.toc.map((item) => (
                  <li
                    key={item.id}
                    className={item.level === 3 ? "pl-3 text-gray-600" : "font-semibold text-gray-800"}
                  >
                    <a
                      href={`#${item.id}`}
                      className="hover:text-[#1D4ED8] hover:underline block py-0.5 leading-snug transition-colors"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          </aside>
        )}

        {/* Mobile TOC Drawer Modal */}
        {isTocOpen && (
          <div
            id="toc-drawer"
            className="fixed inset-0 z-50 flex lg:hidden bg-black/40 backdrop-blur-xs"
            onClick={toggleToc}
            role="dialog"
            aria-modal="true"
            aria-label="Daftar isi bab"
          >
            <div
              className="w-4/5 max-w-xs h-full bg-white p-6 shadow-xl overflow-y-auto font-sans text-xs"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between pb-3 mb-4 border-b" style={{ borderColor: "#E5E0D5" }}>
                <span className="font-bold uppercase tracking-wider text-gray-500">
                  Daftar Isi
                </span>
                <button
                  type="button"
                  onClick={toggleToc}
                  className="text-gray-400 hover:text-black text-sm p-1"
                  aria-label="Tutup daftar isi"
                >
                  ✕
                </button>
              </div>
              <ul className="space-y-2">
                {payload.toc.map((item) => (
                  <li
                    key={item.id}
                    className={item.level === 3 ? "pl-3 text-gray-600" : "font-semibold text-gray-800"}
                  >
                    <a
                      href={`#${item.id}`}
                      onClick={toggleToc}
                      className="hover:text-[#1D4ED8] hover:underline block py-1 transition-colors"
                    >
                      {item.title}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}

        {/* Reading Article Column (Optimal 60-75 character measure) */}
        <main className={`flex-1 mx-auto w-full transition-all ${zenMode ? "max-w-3xl" : "max-w-2xl"}`}>
          {/* Reader Content Enhancer: attaches script copy buttons & connects footnotes */}
          <ReaderContentEnhancer containerSelector="#reader-content" />

          {/* Reading Column with chosen font size */}
          <div className={fontSizeClass}>{children}</div>

          {/* Chapter Navigation Footer */}
          <nav
            aria-label="Navigasi bab"
            className="mt-12 pt-8 border-t flex items-center justify-between gap-4 font-sans text-xs"
            style={{ borderColor: "#E5E0D5" }}
          >
            {payload.navigation.prev ? (
              <Link
                href={`${basePath}/read/${payload.bookSlug}/${payload.navigation.prev.slug}${
                  currentRegister !== "standard" ? `?reg=${currentRegister}` : ""
                }`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border bg-white font-bold hover:bg-gray-50 transition-colors"
                style={{ borderColor: "#E5E0D5", color: "#111113" }}
              >
                ← {payload.navigation.prev.title}
              </Link>
            ) : (
              <div />
            )}

            {payload.navigation.next ? (
              <Link
                href={`${basePath}/read/${payload.bookSlug}/${payload.navigation.next.slug}${
                  currentRegister !== "standard" ? `?reg=${currentRegister}` : ""
                }`}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border bg-white font-bold hover:bg-gray-50 transition-colors ml-auto"
                style={{ borderColor: "#E5E0D5", color: "#111113" }}
              >
                {payload.navigation.next.title} →
              </Link>
            ) : (
              <div />
            )}
          </nav>
        </main>
      </div>
    </div>
  );
}

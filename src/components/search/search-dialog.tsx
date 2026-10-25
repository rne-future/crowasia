"use client";

import React, { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import type { SearchResultDto, SearchResultItem } from "@/modules/search/types";

interface SearchDialogProps {
  locale?: string;
  triggerButton?: boolean;
}

const SOS_CHIPS = [
  "Rumus 3K",
  "Rumus 3P",
  "Rumus 3S",
  "One-on-One",
  "Burnout",
  "Delegasi",
];

export function SearchDialog({ locale = "id", triggerButton = true }: SearchDialogProps) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResultItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSearched, setHasSearched] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  const handleClose = useCallback(() => {
    setIsOpen(false);
    setQuery("");
    setResults([]);
    setHasSearched(false);
  }, []);

  // Keyboard shortcut: Cmd+K or Ctrl+K to open, Escape to close
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsOpen((prev) => {
          if (prev) {
            setQuery("");
            setResults([]);
            setHasSearched(false);
            return false;
          }
          return true;
        });
      } else if (e.key === "Escape" && isOpen) {
        e.preventDefault();
        handleClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, handleClose]);

  // Focus input when modal opens
  useEffect(() => {
    if (isOpen) {
      const timer = setTimeout(() => inputRef.current?.focus(), 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen]);

  // Fetch search results
  const performSearch = useCallback(
    async (searchTerm: string) => {
      const trimmed = searchTerm.trim();
      if (trimmed.length < 2) {
        setResults([]);
        setIsLoading(false);
        setHasSearched(false);
        return;
      }

      setIsLoading(true);
      setHasSearched(true);
      try {
        const res = await fetch(
          `/api/search?q=${encodeURIComponent(trimmed)}&locale=${encodeURIComponent(locale)}`,
          {
            headers: {
              "Cache-Control": "private, no-store",
            },
          }
        );
        if (res.ok) {
          const data: SearchResultDto = await res.json();
          setResults(data.results || []);
        } else {
          setResults([]);
        }
      } catch (err) {
        console.error("Search error:", err);
        setResults([]);
      } finally {
        setIsLoading(false);
      }
    },
    [locale]
  );

  // Debounce input changes
  useEffect(() => {
    if (!isOpen) return;
    const timer = setTimeout(() => {
      performSearch(query);
    }, 250);
    return () => clearTimeout(timer);
  }, [query, isOpen, performSearch]);

  const handleChipClick = (chip: string) => {
    setQuery(chip);
    performSearch(chip);
    inputRef.current?.focus();
  };

  const handleSelectResult = (item: SearchResultItem) => {
    handleClose();
    router.push(item.href);
  };

  return (
    <>
      {triggerButton && (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-neutral-600 dark:text-neutral-400 bg-neutral-100 dark:bg-neutral-800 hover:bg-neutral-200 dark:hover:bg-neutral-700 rounded-lg transition-colors border border-neutral-300 dark:border-neutral-700"
          aria-label="Cari topik atau SOS panduan"
        >
          <svg
            className="w-4 h-4 opacity-70"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <span>Cari Topik...</span>
          <kbd className="hidden sm:inline-block px-1.5 py-0.5 text-[10px] font-mono text-neutral-500 bg-neutral-200 dark:bg-neutral-900 border border-neutral-300 dark:border-neutral-700 rounded">
            ⌘K
          </kbd>
        </button>
      )}

      {isOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50 flex items-start justify-center pt-16 sm:pt-24 px-4 bg-black/60 backdrop-blur-sm transition-opacity animate-in fade-in duration-200"
          onClick={(e) => {
            if (e.target === e.currentTarget) handleClose();
          }}
        >
          <div className="w-full max-w-2xl bg-white dark:bg-neutral-900 rounded-2xl shadow-2xl border border-neutral-200 dark:border-neutral-800 overflow-hidden flex flex-col max-h-[80vh]">
            {/* Header & Input */}
            <div className="p-4 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-3">
              <svg
                className="w-5 h-5 text-neutral-400 flex-shrink-0"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Cari topik SOS (3K, 3P, 3S, one-on-one, burnout, delegasi)..."
                className="w-full bg-transparent text-sm sm:text-base text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 focus:outline-none"
              />
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin flex-shrink-0" />
              ) : query ? (
                <button
                  type="button"
                  onClick={() => {
                    setQuery("");
                    setResults([]);
                    inputRef.current?.focus();
                  }}
                  className="text-xs text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200"
                >
                  ✕
                </button>
              ) : (
                <span className="text-[11px] text-neutral-400 font-mono hidden sm:inline-block">
                  ESC
                </span>
              )}
            </div>

            {/* Quick SOS Chips */}
            <div className="px-4 py-2.5 bg-neutral-50 dark:bg-neutral-800/40 border-b border-neutral-200 dark:border-neutral-800 flex items-center gap-1.5 overflow-x-auto text-xs scrollbar-none">
              <span className="text-neutral-400 font-medium whitespace-nowrap mr-1">
                SOS:
              </span>
              {SOS_CHIPS.map((chip) => (
                <button
                  key={chip}
                  type="button"
                  onClick={() => handleChipClick(chip)}
                  className={`px-2.5 py-1 rounded-full text-xs font-medium transition-all whitespace-nowrap ${
                    query.toLowerCase() === chip.toLowerCase()
                      ? "bg-indigo-600 text-white"
                      : "bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300 hover:bg-neutral-300 dark:hover:bg-neutral-700"
                  }`}
                >
                  {chip}
                </button>
              ))}
            </div>

            {/* Results List */}
            <div className="overflow-y-auto p-3 space-y-2 flex-1">
              {results.length > 0 ? (
                results.map((item) => (
                  <div
                    key={`${item.bookSlug}-${item.chapterSlug}`}
                    onClick={() => handleSelectResult(item)}
                    className="group p-3 rounded-xl hover:bg-neutral-100 dark:hover:bg-neutral-800/70 border border-transparent hover:border-neutral-200 dark:hover:border-neutral-700 cursor-pointer transition-all"
                  >
                    <div className="flex items-start justify-between gap-2 mb-1">
                      <div>
                        <span className="text-[11px] font-semibold tracking-wider text-indigo-600 dark:text-indigo-400 uppercase">
                          {item.bookTitle}
                        </span>
                        <h4 className="text-sm font-semibold text-neutral-900 dark:text-neutral-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                          {item.chapterTitle}
                        </h4>
                      </div>

                      {/* Access Badges */}
                      {item.isFreeSample ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                          Sampel Gratis
                        </span>
                      ) : item.isOwned ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[10px] font-medium bg-blue-100 dark:bg-blue-950/80 text-blue-800 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                          Buku Dimiliki
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium bg-neutral-200 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-400 border border-neutral-300 dark:border-neutral-700">
                          <svg
                            className="w-3 h-3"
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              strokeWidth={2}
                              d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
                            />
                          </svg>
                          Terkunci
                        </span>
                      )}
                    </div>

                    {/* Highlighted Snippet or Preview Text */}
                    {item.snippetText ? (
                      <div
                        className="text-xs text-neutral-600 dark:text-neutral-300 leading-relaxed [&>mark]:bg-amber-200 dark:[&>mark]:bg-amber-800 dark:[&>mark]:text-white [&>mark]:px-0.5 [&>mark]:rounded"
                        dangerouslySetInnerHTML={{ __html: item.snippetText }}
                      />
                    ) : (
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 leading-relaxed italic">
                        {item.previewText}
                      </p>
                    )}
                  </div>
                ))
              ) : hasSearched && !isLoading ? (
                <div className="py-8 text-center">
                  <p className="text-sm text-neutral-500">
                    Tidak ditemukan hasil untuk &ldquo;{query}&rdquo;.
                  </p>
                  <p className="text-xs text-neutral-400 mt-1">
                    Coba kata kunci lain atau pilih topik SOS di atas.
                  </p>
                </div>
              ) : (
                <div className="py-8 text-center text-xs text-neutral-400">
                  Ketik kata kunci atau pilih topik cepat di atas untuk mencari.
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-3 bg-neutral-50 dark:bg-neutral-900 border-t border-neutral-200 dark:border-neutral-800 flex items-center justify-between text-[11px] text-neutral-500">
              <span>Gunakan tombol panah atau klik untuk membuka bab</span>
              <span>ESC untuk menutup</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

"use client";

import { useState, useCallback, useRef, useEffect } from "react";

/**
 * Strictly escapes special HTML characters to prevent XSS vulnerabilities.
 */
export function escapeHtml(unsafe: string): string {
  return unsafe
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * Safely replaces '[Nama]' placeholder across text templates.
 * Escapes user input so no HTML tags or script executions can occur.
 */
export function replaceNameInText(content: string, name: string): string {
  if (!name || !name.trim()) {
    return content;
  }
  const safeName = escapeHtml(name.trim());
  return content.replace(/\[Nama\]/g, safeName);
}

export interface NameCustomizerProps {
  targetContainerSelector?: string;
  defaultName?: string;
  className?: string;
}

export function NameCustomizer({
  targetContainerSelector = "#reader-content",
  defaultName = "",
  className = "",
}: NameCustomizerProps) {
  const [name, setName] = useState(defaultName);
  const previousNameRef = useRef(defaultName);

  // Real-time DOM text replacement strictly using text nodes (prevents HTML/script injection)
  useEffect(() => {
    if (typeof document === "undefined") return;

    const container = document.querySelector(targetContainerSelector);
    if (!container) return;

    const currentReplacement = name.trim() || "[Nama]";
    const previousReplacement = previousNameRef.current.trim() || "[Nama]";

    if (currentReplacement === previousReplacement) return;

    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT);
    let currentNode: Node | null = walker.nextNode();

    while (currentNode) {
      if (currentNode.nodeValue && currentNode.nodeValue.includes(previousReplacement)) {
        // Strictly operating on text node textContent / nodeValue ensures zero script execution
        currentNode.nodeValue = currentNode.nodeValue.replaceAll(
          previousReplacement,
          currentReplacement
        );
      }
      currentNode = walker.nextNode();
    }

    previousNameRef.current = name.trim();
  }, [name, targetContainerSelector]);

  const handleChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setName(e.target.value);
  }, []);

  return (
    <div
      className={`flex flex-wrap items-center gap-3 p-3 rounded-xl border bg-[#FAF8F5] text-xs font-medium text-[#111113] ${className}`}
      style={{ borderColor: "#E5E0D5" }}
    >
      <label htmlFor="reader-name-input" className="font-semibold whitespace-nowrap">
        Ganti [Nama]:
      </label>
      <div className="relative flex-1 min-w-[180px] max-w-xs">
        <input
          id="reader-name-input"
          type="text"
          value={name}
          onChange={handleChange}
          placeholder="Nama anggota tim..."
          aria-describedby="name-customizer-hint"
          className="w-full px-3 py-1.5 rounded-lg border bg-white text-xs text-[#111113] placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] transition-colors"
          style={{ borderColor: "#E5E0D5" }}
        />
      </div>
      <span id="name-customizer-hint" className="text-gray-500 text-[11px]">
        Otomatis menyesuaikan dialog simulasi di bab ini
      </span>
      <span className="sr-only" aria-live="polite">
        {name.trim() ? `Nama disesuaikan menjadi ${name}` : "Nama dikembalikan ke default"}
      </span>
    </div>
  );
}

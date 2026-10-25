"use client";

import { useState, useCallback, useEffect } from "react";

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

/**
 * Scans container for [Nama] placeholders and wraps each into an isolated element:
 * <span data-name-placeholder="true" class="bg-amber-100 text-amber-900 rounded px-0.5 font-medium">[Nama]</span>
 * Strictly ignores text nodes already inside a placeholder span.
 */
export function wrapPlaceholders(container: Element | HTMLElement): void {
  if (typeof document === "undefined" || !container) return;

  function processNode(node: Node) {
    if (node.nodeType === 3) {
      // TEXT_NODE
      const text = node.nodeValue || "";
      const parent = node.parentElement as HTMLElement | null;
      if (
        text.includes("[Nama]") &&
        !(
          parent?.hasAttribute?.("data-name-placeholder") ||
          parent?.closest?.("[data-name-placeholder='true']")
        )
      ) {
        const parts = text.split("[Nama]");
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < parts.length; i++) {
          if (parts[i]) {
            fragment.appendChild(document.createTextNode(parts[i]));
          }
          if (i < parts.length - 1) {
            const span = document.createElement("span");
            span.setAttribute("data-name-placeholder", "true");
            span.className = "bg-amber-100 text-amber-900 rounded px-0.5 font-medium";
            span.textContent = "[Nama]";
            fragment.appendChild(span);
          }
        }
        node.parentNode?.replaceChild(fragment, node);
      }
    } else if (node.nodeType === 1) {
      // ELEMENT_NODE
      const el = node as HTMLElement;
      if (!el.hasAttribute?.("data-name-placeholder")) {
        const children = Array.from(node.childNodes);
        for (const child of children) {
          processNode(child);
        }
      }
    }
  }

  const rootChildren = Array.from(container.childNodes);
  for (const child of rootChildren) {
    processNode(child);
  }
}

/**
 * Updates all isolated [data-name-placeholder="true"] spans within container.
 * textContent assignment is completely XSS-safe and guarantees surrounding chapter text is never mutated.
 */
export function updatePlaceholders(container: Element | HTMLElement, name: string): void {
  if (!container) return;
  const placeholders = container.querySelectorAll<HTMLElement>('[data-name-placeholder="true"]');
  const replacement = name.trim() || "[Nama]";
  placeholders.forEach((el) => {
    el.textContent = replacement;
  });
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

  // Scoped DOM text replacement strictly on [data-name-placeholder="true"] elements
  useEffect(() => {
    if (typeof document === "undefined") return;

    const container = document.querySelector(targetContainerSelector);
    if (!container) return;

    // Wrap initial [Nama] placeholders into isolated spans
    wrapPlaceholders(container);

    // Update only the isolated placeholder spans
    updatePlaceholders(container, name);
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

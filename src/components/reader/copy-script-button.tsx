"use client";

import { useState, useCallback } from "react";

export interface CopyScriptButtonProps {
  text: string;
  label?: string;
  className?: string;
}

export function CopyScriptButton({
  text,
  label = "Salin Skrip",
  className = "",
}: CopyScriptButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(async () => {
    try {
      if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for non-secure contexts
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Graceful fallback
    }
  }, [text]);

  return (
    <div className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={handleCopy}
        aria-label={copied ? "Skrip berhasil disalin" : label}
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border transition-colors focus:outline-none focus:ring-2 focus:ring-[#1D4ED8] ${
          copied
            ? "bg-[#ECFDF5] text-[#059669] border-[#A7F3D0]"
            : "bg-white text-[#111113] border-[#E5E0D5] hover:bg-gray-50"
        } ${className}`}
      >
        {copied ? (
          <>
            <svg
              className="w-3.5 h-3.5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>Tersalin!</span>
          </>
        ) : (
          <>
            <svg
              className="w-3.5 h-3.5 text-gray-500"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3"
              />
            </svg>
            <span>{label}</span>
          </>
        )}
      </button>

      {/* Screen reader live announcement */}
      <span className="sr-only" aria-live="polite">
        {copied ? "Skrip berhasil disalin ke clipboard" : ""}
      </span>
    </div>
  );
}

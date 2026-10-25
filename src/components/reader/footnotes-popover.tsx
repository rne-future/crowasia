"use client";

import { useState } from "react";

export interface FootnotesPopoverProps {
  footnoteId: string;
  referenceNumber: number;
  content: string;
  className?: string;
}

export function FootnotesPopover({
  footnoteId,
  referenceNumber,
  content,
  className = "",
}: FootnotesPopoverProps) {
  const [isOpen, setIsOpen] = useState(false);
  const refId = `fnref-${referenceNumber}`;

  return (
    <span className={`relative inline-block ${className}`}>
      <sup className="ml-0.5">
        <a
          id={refId}
          href={`#${footnoteId}`}
          onClick={(e) => {
            // Toggle inline preview on click
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }}
          aria-label={`Lihat catatan kaki ${referenceNumber}`}
          aria-describedby={`tooltip-${footnoteId}`}
          className="text-xs font-bold text-[#1D4ED8] hover:text-[#1E40AF] px-1 py-0.5 rounded focus:outline-none focus:ring-2 focus:ring-[#1D4ED8]"
        >
          [{referenceNumber}]
        </a>
      </sup>

      {/* Screen reader accessible description */}
      <span id={`tooltip-${footnoteId}`} className="sr-only">
        {content}
      </span>

      {isOpen && (
        <div
          id={`popover-${footnoteId}`}
          role="tooltip"
          className="absolute bottom-full left-0 mb-2 w-72 p-3 bg-white border rounded-xl shadow-lg text-xs text-[#111113] z-30"
          style={{ borderColor: "#E5E0D5" }}
        >
          <div className="flex items-start justify-between gap-2 mb-1">
            <span className="font-bold text-gray-500 uppercase tracking-wider text-[10px]">
              Catatan Kaki {referenceNumber}
            </span>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              aria-label="Tutup pratinjau catatan kaki"
              className="text-gray-400 hover:text-gray-700 text-xs leading-none"
            >
              ✕
            </button>
          </div>
          <p className="leading-relaxed text-gray-800">{content}</p>
          <div className="mt-2 pt-2 border-t flex justify-end" style={{ borderColor: "#E5E0D5" }}>
            <a
              href={`#${footnoteId}`}
              className="text-[11px] font-semibold text-[#1D4ED8] hover:underline"
            >
              Lompat ke rujukan lengkap ↓
            </a>
          </div>
        </div>
      )}
    </span>
  );
}

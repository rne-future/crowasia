"use client";

import { useEffect, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CopyScriptButton } from "./copy-script-button";
import { FootnotesPopover } from "./footnotes-popover";

export interface ReaderContentEnhancerProps {
  containerSelector?: string;
  className?: string;
}

/**
 * Interactive Client Enhancer for Reader Article View:
 * 1. Scans dialogue script blocks (<details>, blockquote.script-box, .script-box, .script-block, [data-script-id])
 *    and attaches a floating/header CopyScriptButton so readers can easily copy script dialogs.
 * 2. Connects footnote links (a[href*="#fn"]) to interactive FootnotesPopover previews and smooth scrolling.
 */
export function ReaderContentEnhancer({
  containerSelector = "#reader-content",
  className = "",
}: ReaderContentEnhancerProps) {
  const rootsRef = useRef<Root[]>([]);

  useEffect(() => {
    if (typeof document === "undefined") return;

    const contentEl = document.querySelector<HTMLElement>(containerSelector);
    if (!contentEl) return;

    const activeRoots: Root[] = [];

    // 1. Attach CopyScriptButton to dialogue script blocks
    const scriptElements = contentEl.querySelectorAll<HTMLElement>(
      "details, blockquote.script-box, .script-box, .script-block, [data-script-id]"
    );

    scriptElements.forEach((el) => {
      let slot = el.querySelector<HTMLElement>(":scope > .script-copy-slot");
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "script-copy-slot flex justify-end mb-2 not-prose";
        const summary = el.querySelector("summary");
        if (summary && summary.nextSibling) {
          el.insertBefore(slot, summary.nextSibling);
        } else if (el.firstChild) {
          el.insertBefore(slot, el.firstChild);
        } else {
          el.appendChild(slot);
        }

        const clone = el.cloneNode(true) as HTMLElement;
        clone.querySelector(".script-copy-slot")?.remove();
        clone.querySelector("summary")?.remove();
        const scriptText = clone.textContent?.trim() || "";

        const root = createRoot(slot);
        root.render(<CopyScriptButton text={scriptText} className="shadow-xs" />);
        activeRoots.push(root);
      }
    });

    // 2. Connect footnote links (a[href*="#fn"]) to FootnotesPopover preview & smooth scroll
    const footnoteLinks = contentEl.querySelectorAll<HTMLAnchorElement>(
      'a[href*="#fn"]:not([href*="#fnref"])'
    );

    footnoteLinks.forEach((link, index) => {
      if (link.closest(".footnote-popover-slot")) return;

      const href = link.getAttribute("href") || "";
      const targetId = href.replace(/^#/, "");
      if (!targetId) return;

      const footnoteDefEl = document.getElementById(targetId);
      let footnoteText = "";
      if (footnoteDefEl) {
        const clone = footnoteDefEl.cloneNode(true) as HTMLElement;
        clone.querySelectorAll('a[href*="#fnref"], [data-footnote-backref]').forEach((a) => a.remove());
        footnoteText = clone.textContent?.trim() || "";
      }

      const matchNum = link.textContent?.match(/\d+/);
      const referenceNumber = matchNum ? parseInt(matchNum[0], 10) : index + 1;

      let slot = link.parentElement?.querySelector<HTMLElement>(
        `:scope > .footnote-popover-slot[data-fn="${targetId}"]`
      );
      if (!slot) {
        slot = document.createElement("span");
        slot.className = "footnote-popover-slot inline-block not-prose";
        slot.setAttribute("data-fn", targetId);
        link.parentNode?.replaceChild(slot, link);

        const root = createRoot(slot);
        root.render(
          <FootnotesPopover
            footnoteId={targetId}
            referenceNumber={referenceNumber}
            content={footnoteText || "Lihat rujukan lengkap di bagian akhir bab."}
          />
        );
        activeRoots.push(root);
      }
    });

    rootsRef.current = activeRoots;

    // 3. Smooth scroll handler for all footnote navigation
    const handleFootnoteClick = (e: Event) => {
      const target = (e.target as HTMLElement | null)?.closest("a");
      if (!target) return;
      const href = target.getAttribute("href");
      if (href && href.startsWith("#fn")) {
        const dest = document.querySelector(href);
        if (dest) {
          e.preventDefault();
          dest.scrollIntoView({ behavior: "smooth" });
        }
      }
    };

    contentEl.addEventListener("click", handleFootnoteClick);

    return () => {
      contentEl.removeEventListener("click", handleFootnoteClick);
      activeRoots.forEach((root) => {
        try {
          root.unmount();
        } catch {
          // ignore already unmounted
        }
      });
    };
  }, [containerSelector]);

  return <div className={`reader-content-enhancer ${className}`} aria-hidden="true" />;
}

"use client";

import { useState, useEffect, useCallback, useId } from "react";

export interface InteractiveChecklistProps {
  itemId: string;
  label?: React.ReactNode;
  children?: React.ReactNode;
  initialCompleted?: boolean;
  initialVersion?: number;
  isAuthenticated?: boolean;
  onToggle?: (completed: boolean) => void;
  className?: string;
}

type SyncStatus = "idle" | "saving" | "saved" | "conflict" | "error";

export function InteractiveChecklist({
  itemId,
  label,
  children,
  initialCompleted = false,
  initialVersion = 0,
  isAuthenticated = false,
  onToggle,
  className = "",
}: InteractiveChecklistProps) {
  const [completed, setCompleted] = useState<boolean>(initialCompleted);
  const [version, setVersion] = useState<number>(initialVersion);
  const [status, setStatus] = useState<SyncStatus>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [conflictServerState, setConflictServerState] = useState<{
    completed: boolean;
    version: number;
  } | null>(null);

  const inputId = useId();
  const storageKey = `checklist:${itemId}`;

  // Guest mode: Read cached state from localStorage on mount
  useEffect(() => {
    if (!isAuthenticated && typeof window !== "undefined" && window.localStorage) {
      const timer = setTimeout(() => {
        try {
          const stored = window.localStorage.getItem(storageKey);
          if (stored) {
            const parsed = JSON.parse(stored);
            if (typeof parsed.completed === "boolean") {
              setCompleted(parsed.completed);
            }
          }
        } catch {
          // Ignore localStorage parsing errors
        }
      }, 0);
      return () => clearTimeout(timer);
    }
  }, [isAuthenticated, storageKey]);

  // Handle toggle action
  const handleToggle = useCallback(async () => {
    const nextCompleted = !completed;
    const currentVersion = version;

    // 1. Optimistic UI update
    setCompleted(nextCompleted);
    setErrorMessage(null);

    // 2. Guest user: Save state exclusively to localStorage
    if (!isAuthenticated) {
      if (typeof window !== "undefined" && window.localStorage) {
        try {
          window.localStorage.setItem(
            storageKey,
            JSON.stringify({
              completed: nextCompleted,
              updatedAt: new Date().toISOString(),
            })
          );
        } catch {
          // Ignore localStorage errors
        }
      }
      setStatus("saved");
      onToggle?.(nextCompleted);
      setTimeout(() => setStatus("idle"), 1500);
      return;
    }

    // 3. Authenticated user: Synchronize to Cloud with CAS versioning
    setStatus("saving");

    try {
      const response = await fetch(`/api/checklists/${itemId}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          completed: nextCompleted,
          expectedVersion: currentVersion,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        setCompleted(data.completed);
        setVersion(data.version);
        setStatus("saved");
        onToggle?.(data.completed);
        setTimeout(() => setStatus("idle"), 1500);
      } else if (response.status === 409) {
        const data = await response.json();
        setStatus("conflict");
        setErrorMessage(
          data.error?.message || "Progres berubah di perangkat lain"
        );
        if (data.current) {
          setConflictServerState(data.current);
        }
      } else if (response.status === 410) {
        const data = await response.json();
        setStatus("error");
        setErrorMessage(data.error?.message || "Item ini sudah tidak berlaku");
      } else {
        const data = await response.json().catch(() => ({}));
        setStatus("error");
        setErrorMessage(data.error || "Gagal menyimpan progres");
      }
    } catch {
      setStatus("error");
      setErrorMessage("Koneksi gagal, silakan coba lagi");
    }
  }, [completed, version, itemId, isAuthenticated, storageKey, onToggle]);

  // Recover from conflict using latest server state
  const handleReload = useCallback(() => {
    if (conflictServerState) {
      setCompleted(conflictServerState.completed);
      setVersion(conflictServerState.version);
    }
    setStatus("idle");
    setErrorMessage(null);
    setConflictServerState(null);
  }, [conflictServerState]);

  const displayContent = label ?? children;

  return (
    <div
      className={`interactive-checklist-wrapper my-2 p-2.5 rounded-xl border transition-colors ${
        status === "conflict"
          ? "bg-amber-50/70 border-amber-200"
          : status === "error"
            ? "bg-rose-50/70 border-rose-200"
            : completed
              ? "bg-[#FAF8F5]/80 border-emerald-100"
              : "bg-white/60 border-stone-200"
      } ${className}`}
      data-item-id={itemId}
      data-completed={completed ? "true" : "false"}
      data-version={version}
    >
      <div className="flex items-start gap-3">
        <div className="flex items-center h-6 shrink-0">
          <input
            id={inputId}
            type="checkbox"
            checked={completed}
            onChange={handleToggle}
            aria-busy={status === "saving"}
            disabled={status === "saving"}
            className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500 border-gray-300 cursor-pointer transition-transform active:scale-95"
          />
        </div>

        <div className="flex-1 min-w-0">
          <label
            htmlFor={inputId}
            className={`text-sm cursor-pointer select-none leading-relaxed transition-opacity ${
              completed ? "text-stone-500 line-through opacity-80" : "text-stone-900"
            }`}
          >
            {displayContent}
          </label>

          {/* Status indicators */}
          {status === "saving" && (
            <p className="text-[11px] font-medium text-amber-700 mt-1 flex items-center gap-1.5 animate-pulse">
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-amber-500" />
              Menyimpan...
            </p>
          )}

          {status === "conflict" && (
            <div className="mt-2 text-xs text-amber-900 flex flex-wrap items-center gap-2">
              <span>{errorMessage || "Progres berubah di perangkat lain"}</span>
              <button
                type="button"
                onClick={handleReload}
                className="px-2 py-0.5 text-xs font-semibold rounded bg-amber-200 hover:bg-amber-300 text-amber-900 transition-colors"
              >
                Muat Ulang
              </button>
            </div>
          )}

          {status === "error" && (
            <div className="mt-1 text-xs text-rose-700 flex items-center gap-1.5">
              <span>⚠️ {errorMessage || "Terjadi kesalahan"}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

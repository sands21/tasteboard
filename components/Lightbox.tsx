"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { Inspiration } from "@/lib/db";
import { exactDate, relativeDate } from "@/lib/dates";
import { isEditableTarget } from "@/lib/dom";

// Create the URL inside the effect (not useMemo): StrictMode replays
// mount/cleanup, and a memoized URL would be revoked while still displayed.
function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return url;
}

type Zoom = "none" | "fit" | "full";

interface LightboxProps {
  item: Inspiration;
  hasPrev: boolean;
  hasNext: boolean;
  origin: { x: number; y: number } | null; // clicked card's center, viewport coords
  onNavigate: (dir: 1 | -1) => void;
  onClose: () => void;
  onUpdateNote: (id: string, note: string) => void;
  onDelete: (id: string) => void;
}

export function Lightbox({
  item,
  hasPrev,
  hasNext,
  origin,
  onNavigate,
  onClose,
  onUpdateNote,
  onDelete,
}: LightboxProps) {
  const thumbUrl = useObjectUrl(item.thumb);
  const fullUrl = useObjectUrl(item.image);

  // Thumb shows instantly; the full-res blob swaps in once decoded — a local
  // disk read, so the swap is imperceptible.
  const [fullReady, setFullReady] = useState(false);
  const [zoom, setZoom] = useState<Zoom>("none");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [editingNote, setEditingNote] = useState(false);
  const [draft, setDraft] = useState(item.note);

  useEffect(() => {
    setFullReady(false);
    setZoom("none");
    setOffset({ x: 0, y: 0 });
    setEditingNote(false);
  }, [item.id]);

  useEffect(() => {
    if (!fullUrl) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) setFullReady(true);
    };
    img.src = fullUrl;
    return () => {
      cancelled = true;
    };
  }, [fullUrl]);

  const displaySrc = fullReady && fullUrl ? fullUrl : thumbUrl;

  const hostname = useMemo(() => {
    if (!item.url) return null;
    try {
      return new URL(item.url).hostname;
    } catch {
      return item.url;
    }
  }, [item.url]);

  // Esc closes (zoom first, then the lightbox); ←/→ flip between items.
  // Ignored while typing in the note textarea — it handles its own keys.
  // No deps array: re-binds with fresh state each render.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (isEditableTarget(e.target)) return;
      if (e.key === "Escape") {
        e.preventDefault();
        if (zoom !== "none") setZoom("none");
        else onClose();
      } else if (e.key === "ArrowRight" && hasNext) {
        e.preventDefault();
        onNavigate(1);
      } else if (e.key === "ArrowLeft" && hasPrev) {
        e.preventDefault();
        onNavigate(-1);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  function commitNote() {
    const trimmed = draft.trim();
    if (trimmed && trimmed !== item.note) onUpdateNote(item.id, trimmed);
    setEditingNote(false);
  }

  // Drag-to-pan at 100%: a real drag suppresses the click that would
  // otherwise toggle zoom levels.
  const pan = useRef<{
    startX: number;
    startY: number;
    baseX: number;
    baseY: number;
    moved: boolean;
  } | null>(null);
  const suppressClick = useRef(false);

  function onZoomPointerDown(e: React.PointerEvent<HTMLImageElement>) {
    if (zoom !== "full") return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      // capture is best-effort; pan still works while the pointer stays over the image
    }
    pan.current = {
      startX: e.clientX,
      startY: e.clientY,
      baseX: offset.x,
      baseY: offset.y,
      moved: false,
    };
  }
  function onZoomPointerMove(e: React.PointerEvent<HTMLImageElement>) {
    const p = pan.current;
    if (!p) return;
    const dx = e.clientX - p.startX;
    const dy = e.clientY - p.startY;
    if (Math.abs(dx) + Math.abs(dy) > 4) p.moved = true;
    setOffset({ x: p.baseX + dx, y: p.baseY + dy });
  }
  function onZoomPointerUp() {
    if (pan.current?.moved) suppressClick.current = true;
    pan.current = null;
  }
  function onZoomImageClick() {
    if (suppressClick.current) {
      suppressClick.current = false;
      return;
    }
    if (zoom === "fit") {
      setOffset({ x: 0, y: 0 });
      setZoom("full");
    } else {
      setZoom("fit");
    }
  }

  return (
    <>
      {/* dim backdrop — click closes */}
      <motion.div
        className="fixed inset-0 z-50 bg-ink/40"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
        onMouseDown={onClose}
      />

      {/* panel scales in from the clicked card's position (sanctioned animation #3).
          Separate layer from the zoom overlay so the transform never traps
          the overlay's fixed positioning. */}
      <motion.div
        className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-6 md:p-10"
        style={{
          transformOrigin: origin ? `${origin.x}px ${origin.y}px` : "50% 50%",
        }}
        initial={{ opacity: 0, scale: 0.94 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.94 }}
        transition={{ duration: 0.2, ease: "easeOut" }}
      >
        <div
          role="dialog"
          aria-modal="true"
          aria-label="inspiration detail"
          className="pointer-events-auto flex h-[85vh] w-full max-w-6xl overflow-hidden rounded-card bg-surface shadow-[0_24px_64px_rgba(28,27,24,0.18)]"
        >
          {/* image, ~70% */}
          <div className="flex min-w-0 flex-[7] items-center justify-center bg-paper p-6">
            {displaySrc && (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL; next/image can't optimize these
              <img
                src={displaySrc}
                alt={item.title ?? ""}
                draggable={false}
                onClick={() => setZoom("fit")}
                className="max-h-full max-w-full cursor-zoom-in rounded-card object-contain"
              />
            )}
          </div>

          {/* metadata column: note, url, date — then delete at the bottom */}
          <div className="flex w-[30%] min-w-[260px] flex-col overflow-y-auto p-6">
            {editingNote ? (
              <textarea
                autoFocus
                rows={6}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onBlur={commitNote}
                onKeyDown={(e) => {
                  if (e.key === "Escape") {
                    setDraft(item.note);
                    setEditingNote(false);
                  }
                }}
                className="w-full resize-none rounded-control border border-hairline bg-surface p-2 font-serif text-[19px] italic leading-relaxed text-ink focus:outline-none focus:ring-1 focus:ring-rose-ink"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setDraft(item.note);
                  setEditingNote(true);
                }}
                className="rounded-control text-left font-serif text-[19px] italic leading-relaxed text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
                title="click to edit"
              >
                {item.note}
              </button>
            )}

            {item.url && (
              <a
                href={item.url}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-5 truncate text-[13px] text-rose-ink hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
                title={item.url}
              >
                {hostname}
              </a>
            )}

            <p
              className="mt-2 text-[13px] text-muted"
              title={exactDate(item.createdAt)}
            >
              saved {relativeDate(item.createdAt)}
            </p>

            <div className="mt-auto pt-6">
              <button
                type="button"
                onClick={() => onDelete(item.id)}
                className="text-[13px] text-muted transition-colors hover:text-rose-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
              >
                delete
              </button>
            </div>
          </div>
        </div>
      </motion.div>

      {/* zoom overlay: fit-to-screen, click for 100%, drag to pan */}
      {zoom !== "none" && (
        <div
          className="fixed inset-0 z-[60] overflow-hidden bg-paper"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setZoom("none");
          }}
        >
          {displaySrc &&
            (zoom === "fit" ? (
              <div className="flex h-full w-full items-center justify-center p-4">
                {/* eslint-disable-next-line @next/next/no-img-element -- blob URL */}
                <img
                  src={displaySrc}
                  alt={item.title ?? ""}
                  draggable={false}
                  onClick={onZoomImageClick}
                  className="max-h-full max-w-full cursor-zoom-in object-contain"
                />
              </div>
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- blob URL
              <img
                src={displaySrc}
                alt={item.title ?? ""}
                draggable={false}
                onClick={onZoomImageClick}
                onPointerDown={onZoomPointerDown}
                onPointerMove={onZoomPointerMove}
                onPointerUp={onZoomPointerUp}
                style={{
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
                className={`absolute left-1/2 top-1/2 max-w-none ${
                  pan.current ? "cursor-grabbing" : "cursor-grab"
                }`}
              />
            ))}
        </div>
      )}
    </>
  );
}

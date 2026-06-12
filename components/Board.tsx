"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import {
  type Inspiration,
  deleteInspiration,
  getAll,
  restoreInspiration,
  updateNote,
} from "@/lib/db";
import { isEditableTarget } from "@/lib/dom";
import { CaptureSheet } from "@/components/CaptureSheet";
import { MasonryGrid } from "@/components/MasonryGrid";
import { Lightbox } from "@/components/Lightbox";

function imageFromDataTransfer(dt: DataTransfer | null): File | null {
  if (!dt) return null;
  const item = Array.from(dt.items).find(
    (i) => i.kind === "file" && i.type.startsWith("image/"),
  );
  return (
    item?.getAsFile() ??
    Array.from(dt.files).find((f) => f.type.startsWith("image/")) ??
    null
  );
}

function urlFromText(text: string): string | null {
  const trimmed = text.trim();
  if (!/^https?:\/\//i.test(trimmed) || /\s/.test(trimmed)) return null;
  try {
    return new URL(trimmed).toString();
  } catch {
    return null;
  }
}

const UNDO_TOAST_MS = 6000;

export function Board() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [pendingUrl, setPendingUrl] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inspirations = useLiveQuery(getAll);

  // Lightbox tracks the open item by id (indexes shift as items come and go).
  const [lightbox, setLightbox] = useState<{
    id: string;
    origin: { x: number; y: number };
  } | null>(null);
  const lightboxIndex =
    lightbox && inspirations
      ? inspirations.findIndex((i) => i.id === lightbox.id)
      : -1;
  const lightboxItem = lightboxIndex >= 0 ? inspirations![lightboxIndex] : null;

  const [undoRecord, setUndoRecord] = useState<Inspiration | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    };
  }, []);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setPendingImage(null);
    setPendingUrl(null);
  }, []);

  // Paste anywhere: a clipboard image opens the sheet pre-filled, or replaces
  // the preview if the sheet is already open. URL text opens the sheet with
  // the url field pre-filled (metadata fetched in the background) — but never
  // when typing in a field or while the sheet is already up, so pasting a url
  // into the sheet's own input stays a normal paste. The lightbox is a
  // focused mode — paste is ignored there.
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      if (lightbox) return;
      const file = imageFromDataTransfer(e.clipboardData);
      if (file) {
        e.preventDefault();
        setPendingImage(file);
        setSheetOpen(true);
        return;
      }
      if (sheetOpen || isEditableTarget(e.target)) return;
      const url = urlFromText(e.clipboardData?.getData("text/plain") ?? "");
      if (!url) return;
      e.preventDefault();
      setPendingUrl(url);
      setSheetOpen(true);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, [sheetOpen, lightbox]);

  // N opens an empty capture sheet — unless typing or another overlay is up.
  useEffect(() => {
    if (sheetOpen || lightbox) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (isEditableTarget(e.target)) return;
      e.preventDefault();
      setSheetOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen, lightbox]);

  function onDragEnter(e: React.DragEvent) {
    if (lightbox || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (lightbox || !e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    if (lightbox) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = imageFromDataTransfer(e.dataTransfer);
    if (!file) return;
    setPendingImage(file);
    setSheetOpen(true);
  }

  const openLightbox = useCallback(
    (item: Inspiration, origin: { x: number; y: number }) => {
      setLightbox({ id: item.id, origin });
    },
    [],
  );

  const navigateLightbox = useCallback(
    (dir: 1 | -1) => {
      if (!inspirations || lightboxIndex < 0) return;
      const next = inspirations[lightboxIndex + dir];
      if (next) setLightbox((prev) => prev && { ...prev, id: next.id });
    },
    [inspirations, lightboxIndex],
  );

  const handleUpdateNote = useCallback((id: string, note: string) => {
    void updateNote(id, note);
  }, []);

  // No confirm dialog — delete immediately, offer undo in a brief toast.
  const handleDelete = useCallback(async (id: string) => {
    const record = await deleteInspiration(id);
    setLightbox(null);
    if (!record) return;
    setUndoRecord(record);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    undoTimer.current = setTimeout(() => setUndoRecord(null), UNDO_TOAST_MS);
  }, []);

  const handleUndo = useCallback(() => {
    if (!undoRecord) return;
    void restoreInspiration(undoRecord);
    setUndoRecord(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
  }, [undoRecord]);

  return (
    <main
      className="min-h-screen"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center justify-between px-8 py-5">
        <h1 className="font-serif text-xl italic">tasteboard</h1>
        <button
          type="button"
          onClick={() => setSheetOpen(true)}
          className="rounded-control bg-rose-surface px-3.5 py-1.5 text-sm text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
        >
          add
        </button>
      </header>

      {inspirations !== undefined &&
        (inspirations.length > 0 ? (
          <section className="px-8 pb-16 pt-2">
            <MasonryGrid items={inspirations} onItemOpen={openLightbox} />
          </section>
        ) : (
          // The empty state is the onboarding — there is no other onboarding.
          // ("load a sample board" joins it with the demo seed in step 8.)
          <section className="flex min-h-[70vh] items-center justify-center px-6 text-center">
            <p className="max-w-xl font-serif text-[28px] italic text-muted">
              paste something you love — ⌘V anywhere
            </p>
          </section>
        ))}

      {dragging && (
        <div className="pointer-events-none fixed inset-0 z-40 flex items-center justify-center bg-rose-surface/20 ring-2 ring-inset ring-rose-ink/30">
          <p className="rounded-control bg-surface px-4 py-2 text-sm text-ink shadow-[0_8px_32px_rgba(28,27,24,0.12)]">
            drop to capture
          </p>
        </div>
      )}

      {sheetOpen && (
        <CaptureSheet
          image={pendingImage}
          initialUrl={pendingUrl}
          onImageChange={setPendingImage}
          onClose={closeSheet}
        />
      )}

      {lightboxItem && lightbox && (
        <Lightbox
          item={lightboxItem}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex < inspirations!.length - 1}
          origin={lightbox.origin}
          onNavigate={navigateLightbox}
          onClose={() => setLightbox(null)}
          onUpdateNote={handleUpdateNote}
          onDelete={(id) => void handleDelete(id)}
        />
      )}

      {undoRecord && (
        <motion.div
          initial={{ opacity: 0, y: 8, x: "-50%" }}
          animate={{ opacity: 1, y: 0, x: "-50%" }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="fixed bottom-6 left-1/2 z-50 flex items-center gap-3 rounded-control border border-hairline bg-surface px-4 py-2 shadow-[0_8px_32px_rgba(28,27,24,0.12)]"
        >
          <span className="text-[13px] text-muted">deleted</span>
          <button
            type="button"
            onClick={handleUndo}
            className="text-[13px] text-rose-ink hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
          >
            undo
          </button>
        </motion.div>
      )}
    </main>
  );
}

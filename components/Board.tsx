"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useLiveQuery } from "dexie-react-hooks";
import { getAll } from "@/lib/db";
import { CaptureSheet } from "@/components/CaptureSheet";

function isEditable(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.tagName === "INPUT" ||
      target.tagName === "TEXTAREA" ||
      target.isContentEditable)
  );
}

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

export function Board() {
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pendingImage, setPendingImage] = useState<Blob | null>(null);
  const [dragging, setDragging] = useState(false);
  const dragDepth = useRef(0);
  const inspirations = useLiveQuery(getAll);

  const closeSheet = useCallback(() => {
    setSheetOpen(false);
    setPendingImage(null);
  }, []);

  // Paste anywhere: a clipboard image opens the sheet pre-filled, or replaces
  // the preview if the sheet is already open. Text paste is left alone
  // (URL-paste + metadata flow arrives with /api/metadata in step 4).
  useEffect(() => {
    function onPaste(e: ClipboardEvent) {
      const file = imageFromDataTransfer(e.clipboardData);
      if (!file) return;
      e.preventDefault();
      setPendingImage(file);
      setSheetOpen(true);
    }
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);

  // N opens an empty capture sheet — unless typing or the sheet is open.
  useEffect(() => {
    if (sheetOpen) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.key.toLowerCase() !== "n" || e.metaKey || e.ctrlKey || e.altKey)
        return;
      if (isEditable(e.target)) return;
      e.preventDefault();
      setSheetOpen(true);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [sheetOpen]);

  function onDragEnter(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    dragDepth.current += 1;
    setDragging(true);
  }

  function onDragOver(e: React.DragEvent) {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
  }

  function onDragLeave() {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDragging(false);
  }

  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const file = imageFromDataTransfer(e.dataTransfer);
    if (!file) return;
    setPendingImage(file);
    setSheetOpen(true);
  }

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

      {/* Placeholder content area — replaced by the masonry grid in step 3. */}
      <section className="flex min-h-[70vh] items-center justify-center px-6 text-center">
        {inspirations && inspirations.length > 0 ? (
          <p className="text-[13px] text-muted">
            {inspirations.length} saved — the grid arrives in step 3
          </p>
        ) : (
          <p className="max-w-md font-serif text-[28px] italic text-muted">
            paste something you love — ⌘V anywhere
          </p>
        )}
      </section>

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
          onImageChange={setPendingImage}
          onClose={closeSheet}
        />
      )}
    </main>
  );
}

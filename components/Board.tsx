"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, MotionConfig } from "framer-motion";
import { useLiveQuery } from "dexie-react-hooks";
import {
  type Inspiration,
  deleteInspiration,
  getAll,
  restoreInspiration,
  searchInspirations,
  updateNote,
} from "@/lib/db";
import { isEditableTarget } from "@/lib/dom";
import { exportBoard, importBoard } from "@/lib/backup";
import { clearDemoBoard, hasDemoData, loadDemoBoard } from "@/lib/demo";
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

  // Search filters the grid live — the grid just thins. The lightbox
  // navigates the filtered list too, so ←/→ matches what's on screen.
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const visible = useMemo(
    () => searchInspirations(inspirations ?? [], query),
    [inspirations, query],
  );

  // Lightbox tracks the open item by id (indexes shift as items come and go).
  const [lightbox, setLightbox] = useState<{
    id: string;
    origin: { x: number; y: number };
  } | null>(null);
  const lightboxIndex = lightbox
    ? visible.findIndex((i) => i.id === lightbox.id)
    : -1;
  const lightboxItem = lightboxIndex >= 0 ? visible[lightboxIndex] : null;

  const [undoRecord, setUndoRecord] = useState<Inspiration | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Export/import: one at a time, with a brief outcome notice.
  const [porting, setPorting] = useState<"export" | "import" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    return () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
      if (noticeTimer.current) clearTimeout(noticeTimer.current);
    };
  }, []);

  const showNotice = useCallback((text: string) => {
    setNotice(text);
    if (noticeTimer.current) clearTimeout(noticeTimer.current);
    noticeTimer.current = setTimeout(() => setNotice(null), 4000);
  }, []);

  // Demo seed: the empty state's "load a sample board". The "demo data"
  // notice shows while demo records exist, unless dismissed (persisted so it
  // stays dismissed across reloads; cleared again when demo data goes away).
  const DEMO_NOTICE_KEY = "tasteboard-demo-notice-dismissed";
  const [seeding, setSeeding] = useState(false);
  const [demoNoticeDismissed, setDemoNoticeDismissed] = useState(true);
  useEffect(() => {
    setDemoNoticeDismissed(localStorage.getItem(DEMO_NOTICE_KEY) === "1");
  }, []);
  const demoPresent = hasDemoData(inspirations ?? []);

  async function handleLoadDemo() {
    if (seeding) return;
    setSeeding(true);
    try {
      const n = await loadDemoBoard();
      localStorage.removeItem(DEMO_NOTICE_KEY);
      setDemoNoticeDismissed(false);
      if (n === 0) showNotice("couldn't load the sample board");
    } catch {
      showNotice("couldn't load the sample board");
    } finally {
      setSeeding(false);
    }
  }

  async function handleClearDemo() {
    await clearDemoBoard(inspirations ?? []);
    localStorage.removeItem(DEMO_NOTICE_KEY);
    setDemoNoticeDismissed(false);
  }

  function dismissDemoNotice() {
    localStorage.setItem(DEMO_NOTICE_KEY, "1");
    setDemoNoticeDismissed(true);
  }

  async function handleExport() {
    if (porting) return;
    setPorting("export");
    try {
      const { blob, filename } = await exportBoard();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
    } catch {
      showNotice("couldn't export");
    } finally {
      setPorting(null);
    }
  }

  async function handleImportFile(file: File) {
    if (porting) return;
    setPorting("import");
    try {
      const n = await importBoard(file);
      showNotice(
        n > 0
          ? `imported ${n} inspiration${n === 1 ? "" : "s"}`
          : "nothing to import",
      );
    } catch {
      showNotice("couldn't import — is that a tasteboard export?");
    } finally {
      setPorting(null);
    }
  }

  // Lock background scroll while a full-page overlay is up.
  useEffect(() => {
    if (!sheetOpen && !lightbox) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [sheetOpen, lightbox]);

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

  // N opens an empty capture sheet, / focuses search — unless typing or
  // another overlay is up.
  useEffect(() => {
    if (sheetOpen || lightbox) return;
    function onKeyDown(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditableTarget(e.target)) return;
      if (e.key.toLowerCase() === "n") {
        e.preventDefault();
        setSheetOpen(true);
      } else if (e.key === "/") {
        e.preventDefault();
        searchRef.current?.focus();
      }
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
      if (lightboxIndex < 0) return;
      const next = visible[lightboxIndex + dir];
      if (next) setLightbox((prev) => prev && { ...prev, id: next.id });
    },
    [visible, lightboxIndex],
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
    <MotionConfig reducedMotion="user">
    <main
      className="min-h-screen"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      <header className="flex items-center gap-6 px-8 py-5">
        <h1 className="font-serif text-xl italic">tasteboard</h1>
        <div className="flex flex-1 justify-center">
          {inspirations !== undefined && inspirations.length > 0 && (
            <input
              ref={searchRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="search your taste"
              onKeyDown={(e) => {
                if (e.key === "Escape") {
                  if (query) setQuery("");
                  else e.currentTarget.blur();
                }
              }}
              className="w-full max-w-xs rounded-control border border-hairline bg-surface px-3 py-1.5 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rose-ink"
            />
          )}
        </div>
        <div className="flex items-center gap-4">
          {inspirations !== undefined && inspirations.length > 0 && (
            <button
              type="button"
              onClick={() => void handleExport()}
              disabled={porting !== null}
              className="text-[13px] text-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink disabled:opacity-50"
            >
              {porting === "export" ? "exporting…" : "export"}
            </button>
          )}
          <button
            type="button"
            onClick={() => importInputRef.current?.click()}
            disabled={porting !== null}
            className="text-[13px] text-muted transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink disabled:opacity-50"
          >
            {porting === "import" ? "importing…" : "import"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept=".zip,application/zip"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = "";
            }}
          />
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="rounded-control bg-rose-surface px-3.5 py-1.5 text-sm text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
          >
            add
          </button>
        </div>
      </header>

      {inspirations !== undefined &&
        (inspirations.length > 0 ? (
          <>
            {demoPresent && !demoNoticeDismissed && (
              <div className="flex items-center justify-center gap-4 pb-4 text-[13px] text-muted">
                <span>showing demo data</span>
                <button
                  type="button"
                  onClick={() => void handleClearDemo()}
                  className="text-rose-ink hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
                >
                  clear demo
                </button>
                <button
                  type="button"
                  aria-label="dismiss notice"
                  onClick={dismissDemoNotice}
                  className="transition-colors hover:text-ink focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
                >
                  ✕
                </button>
              </div>
            )}
            <section className="px-8 pb-16 pt-2">
              <MasonryGrid items={visible} onItemOpen={openLightbox} />
            </section>
          </>
        ) : (
          // The empty state is the onboarding — there is no other onboarding.
          <section className="flex min-h-[70vh] flex-col items-center justify-center gap-6 px-6 text-center">
            <p className="max-w-xl font-serif text-[28px] italic text-muted">
              paste something you love — ⌘V anywhere
            </p>
            <button
              type="button"
              onClick={() => void handleLoadDemo()}
              disabled={seeding}
              className="text-sm text-muted underline-offset-4 transition-colors hover:text-rose-ink hover:underline focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink disabled:opacity-60"
            >
              {seeding ? "loading sample board…" : "just browsing? load a sample board"}
            </button>
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
          hasNext={lightboxIndex < visible.length - 1}
          origin={lightbox.origin}
          onNavigate={navigateLightbox}
          onClose={() => setLightbox(null)}
          onUpdateNote={handleUpdateNote}
          onDelete={(id) => void handleDelete(id)}
        />
      )}

      {(undoRecord || notice) && (
        <div className="pointer-events-none fixed bottom-6 left-1/2 z-50 flex -translate-x-1/2 flex-col items-center gap-2">
          {undoRecord && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto flex items-center gap-3 rounded-control border border-hairline bg-surface px-4 py-2 shadow-[0_8px_32px_rgba(28,27,24,0.12)]"
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
          {notice && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, ease: "easeOut" }}
              className="pointer-events-auto rounded-control border border-hairline bg-surface px-4 py-2 text-[13px] text-muted shadow-[0_8px_32px_rgba(28,27,24,0.12)]"
            >
              {notice}
            </motion.div>
          )}
        </div>
      )}
    </main>
    </MotionConfig>
  );
}

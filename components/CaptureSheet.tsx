"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { saveInspiration } from "@/lib/db";
import { makeThumb } from "@/lib/images";

const NOTE_PROMPTS = [
  "What caught your eye first?",
  "What would you steal from this?",
];

// Module-level cursor so the placeholder rotates across sheet opens.
let promptCursor = 0;

interface CaptureSheetProps {
  image: Blob | null;
  onImageChange: (image: Blob) => void;
  onClose: () => void;
}

export function CaptureSheet({
  image,
  onImageChange,
  onClose,
}: CaptureSheetProps) {
  const [note, setNote] = useState("");
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [prompt] = useState(
    () => NOTE_PROMPTS[promptCursor++ % NOTE_PROMPTS.length],
  );

  const previewUrl = useMemo(
    () => (image ? URL.createObjectURL(image) : null),
    [image],
  );
  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    };
  }, [previewUrl]);

  const canSave = image !== null && note.trim() !== "" && !saving;

  async function handleSave() {
    if (!image || note.trim() === "" || saving) return;
    setSaving(true);
    setError(null);
    try {
      const { thumb, width, height } = await makeThumb(image);
      await saveInspiration({
        note: note.trim(),
        url: url.trim() || undefined,
        title: title.trim() || undefined,
        image,
        thumb,
        width,
        height,
      });
      onClose();
    } catch {
      setError("couldn't save — try again");
      setSaving(false);
    }
  }

  // Cmd+Enter saves, Esc discards — window-level so it works regardless of
  // which field has focus. No deps array: re-binds with fresh state each render.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      } else if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        void handleSave();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/30 p-6"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="capture inspiration"
        className="w-full max-w-lg rounded-card bg-surface p-5 shadow-[0_24px_64px_rgba(28,27,24,0.18)]"
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- blob URL preview; next/image can't optimize these
          <img
            src={previewUrl}
            alt=""
            className="max-h-72 w-full rounded-card border border-hairline bg-paper object-contain"
          />
        ) : (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="flex h-40 w-full items-center justify-center rounded-card border border-dashed border-hairline text-sm text-muted focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink"
          >
            paste a screenshot — ⌘V
          </button>
        )}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) onImageChange(file);
          }}
        />

        <label className="mt-4 block">
          <span className="mb-1.5 block text-[13px] text-muted">
            why I saved this
          </span>
          <textarea
            autoFocus
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder={prompt}
            className="w-full resize-none rounded-control border border-hairline bg-surface px-3 py-2 text-sm text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rose-ink"
          />
        </label>

        <input
          type="text"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="url (optional)"
          className="mt-2 w-full rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rose-ink"
        />
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="title (optional)"
          className="mt-2 w-full rounded-control border border-hairline bg-surface px-3 py-1.5 text-[13px] text-ink placeholder:text-muted focus:outline-none focus:ring-1 focus:ring-rose-ink"
        />

        {error && <p className="mt-2 text-[13px] text-rose-ink">{error}</p>}

        <div className="mt-4 flex items-center justify-between">
          <span className="text-[13px] text-muted">⌘↩ save · esc discard</span>
          <button
            type="button"
            disabled={!canSave}
            onClick={() => void handleSave()}
            className="rounded-control bg-rose-surface px-4 py-1.5 text-sm text-ink transition-opacity hover:opacity-90 focus:outline-none focus-visible:ring-1 focus-visible:ring-rose-ink disabled:opacity-40 disabled:hover:opacity-40"
          >
            {saving ? "saving…" : "save"}
          </button>
        </div>
      </div>
    </div>
  );
}

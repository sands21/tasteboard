import Dexie, { type EntityTable } from "dexie";
import { nanoid } from "nanoid";

/**
 * One saved piece of visual inspiration. The `note` ("why I saved this") is the
 * product; everything else is a gallery around it. Image blobs live here too —
 * all data is local to the visitor's browser (IndexedDB). See CLAUDE.md.
 */
export interface Inspiration {
  id: string; // nanoid
  createdAt: number; // epoch ms
  note: string; // REQUIRED — "why I saved this"
  url?: string;
  title?: string;
  image: Blob; // original screenshot, stored AS-IS, never recompressed
  thumb: Blob; // ~600px-wide WebP, generated via canvas at save time
  width: number; // thumb dimensions — reserve masonry space before load
  height: number; //   (zero layout shift)
}

export type NewInspiration = Omit<Inspiration, "id" | "createdAt">;

/**
 * The single storage seam. All Dexie access lives in this file — components
 * call the exported helpers and never touch Dexie (or `db`) directly. This
 * keeps any future migration (e.g. Neon + Vercel Blob) a change to this one
 * module.
 */
const db = new Dexie("tasteboard") as Dexie & {
  inspirations: EntityTable<Inspiration, "id">;
};

// Index on createdAt for newest-first ordering. Search is an in-memory
// substring filter (see searchInspirations) — no search-index columns.
db.version(1).stores({
  inspirations: "id, createdAt",
});

export async function saveInspiration(
  input: NewInspiration,
): Promise<Inspiration> {
  const inspiration: Inspiration = {
    id: nanoid(),
    createdAt: Date.now(),
    ...input,
  };
  await db.inspirations.add(inspiration);
  return inspiration;
}

export async function getAll(): Promise<Inspiration[]> {
  return db.inspirations.orderBy("createdAt").reverse().toArray();
}

/**
 * In-memory case-insensitive substring filter on note + title — deliberately
 * no search library. Pure function: the caller passes the live item list.
 */
export function searchInspirations(
  items: Inspiration[],
  query: string,
): Inspiration[] {
  const q = query.trim().toLowerCase();
  if (!q) return items;
  return items.filter(
    (i) =>
      i.note.toLowerCase().includes(q) ||
      (i.title?.toLowerCase().includes(q) ?? false),
  );
}

export async function updateNote(id: string, note: string): Promise<void> {
  await db.inspirations.update(id, { note });
}

/** Deletes and returns the record so the caller can offer undo. */
export async function deleteInspiration(
  id: string,
): Promise<Inspiration | undefined> {
  const record = await db.inspirations.get(id);
  await db.inspirations.delete(id);
  return record;
}

/** Puts a deleted record back exactly as it was (same id and createdAt). */
export async function restoreInspiration(record: Inspiration): Promise<void> {
  await db.inspirations.put(record);
}

import Dexie, { type EntityTable } from "dexie";

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

/**
 * The single storage seam. All Dexie access lives in this file — components
 * never import Dexie directly. This keeps any future migration (e.g. Neon +
 * Vercel Blob) a change to this one module.
 */
const db = new Dexie("tasteboard") as Dexie & {
  inspirations: EntityTable<Inspiration, "id">;
};

// Index on createdAt for newest-first ordering. Search is an in-memory
// substring filter (see searchInspirations) — no search-index columns.
db.version(1).stores({
  inspirations: "id, createdAt",
});

export { db };

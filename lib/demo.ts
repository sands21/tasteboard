import demoData from "@/lib/demo-data.json";
import {
  type Inspiration,
  deleteInspirations,
  restoreInspiration,
} from "@/lib/db";
import { makeThumb } from "@/lib/images";

// The bundled sample board: images live in /public/demo, records here in
// lib/demo-data.json. Demo ids are deterministic so loading twice never
// duplicates and "clear demo" knows exactly what to remove — the visitor's
// own saves are untouched.

export const DEMO_ID_PREFIX = "demo-";

interface DemoRecord {
  file: string;
  note: string;
  title?: string;
}

const records = demoData as DemoRecord[];

export function hasDemoData(items: Inspiration[]): boolean {
  return items.some((i) => i.id.startsWith(DEMO_ID_PREFIX));
}

/**
 * Inserts the sample board through the normal save path — fetch the bundled
 * image, generate the thumb as usual, store. createdAt is staggered into the
 * past so the board reads like a collection built over weeks, not a dump.
 * Returns how many records loaded; individually broken ones are skipped.
 */
export async function loadDemoBoard(): Promise<number> {
  let loaded = 0;
  for (let i = 0; i < records.length; i++) {
    const rec = records[i];
    try {
      const res = await fetch(rec.file);
      if (!res.ok) continue;
      const image = await res.blob();
      const { thumb, width, height } = await makeThumb(image);
      await restoreInspiration({
        id: `${DEMO_ID_PREFIX}${String(i + 1).padStart(2, "0")}`,
        createdAt: Date.now() - i * 3 * 86400e3,
        note: rec.note,
        title: rec.title,
        image,
        thumb,
        width,
        height,
      });
      loaded++;
    } catch {
      // skip records whose image is missing or undecodable
    }
  }
  return loaded;
}

export async function clearDemoBoard(items: Inspiration[]): Promise<void> {
  const ids = items
    .filter((i) => i.id.startsWith(DEMO_ID_PREFIX))
    .map((i) => i.id);
  if (ids.length > 0) await deleteInspirations(ids);
}

import JSZip from "jszip";
import { getAll, restoreInspiration } from "@/lib/db";
import { makeThumb } from "@/lib/images";

// Export zip layout:
//   data.json          — versioned manifest, records reference image filenames
//   images/<id>.<ext>  — original images, stored as-is
// Thumbs are not exported: the original is the archive, the thumb is
// disposable and gets regenerated on import. This format is the backup story,
// the localhost→production bridge, and the seed for any future migration.

const FORMAT_VERSION = 1;

interface ManifestRecord {
  id: string;
  createdAt: number;
  note: string;
  url?: string;
  title?: string;
  imageFile: string;
  imageType: string;
}

interface Manifest {
  version: number;
  exportedAt: number;
  inspirations: ManifestRecord[];
}

function extFromMime(mime: string): string {
  switch (mime) {
    case "image/png":
      return "png";
    case "image/jpeg":
      return "jpg";
    case "image/webp":
      return "webp";
    case "image/gif":
      return "gif";
    case "image/avif":
      return "avif";
    case "image/svg+xml":
      return "svg";
    default:
      return "img";
  }
}

export async function exportBoard(): Promise<{ blob: Blob; filename: string }> {
  const items = await getAll();
  const zip = new JSZip();

  const records: ManifestRecord[] = items.map((i) => ({
    id: i.id,
    createdAt: i.createdAt,
    note: i.note,
    ...(i.url ? { url: i.url } : {}),
    ...(i.title ? { title: i.title } : {}),
    imageFile: `images/${i.id}.${extFromMime(i.image.type)}`,
    imageType: i.image.type || "application/octet-stream",
  }));

  items.forEach((item, k) => {
    zip.file(records[k].imageFile, item.image);
  });

  const manifest: Manifest = {
    version: FORMAT_VERSION,
    exportedAt: Date.now(),
    inspirations: records,
  };
  zip.file("data.json", JSON.stringify(manifest, null, 2));

  const blob = await zip.generateAsync({ type: "blob" });
  const date = new Date().toISOString().slice(0, 10);
  return { blob, filename: `tasteboard-${date}.zip` };
}

function isValidRecord(r: unknown): r is ManifestRecord {
  if (typeof r !== "object" || r === null) return false;
  const rec = r as Record<string, unknown>;
  return (
    typeof rec.id === "string" &&
    typeof rec.createdAt === "number" &&
    typeof rec.note === "string" &&
    typeof rec.imageFile === "string"
  );
}

/**
 * Restores from an export zip. Thumbs are regenerated from the originals.
 * Records keep their id and createdAt, and same-id records are overwritten,
 * so re-importing the same zip is idempotent (a merge, not a duplicate).
 * Returns how many records were imported; malformed entries are skipped.
 */
export async function importBoard(file: Blob): Promise<number> {
  const zip = await JSZip.loadAsync(file);
  const dataFile = zip.file("data.json");
  if (!dataFile) throw new Error("not a tasteboard export: data.json missing");

  const manifest = JSON.parse(await dataFile.async("string")) as Manifest;
  if (!Array.isArray(manifest.inspirations)) {
    throw new Error("malformed manifest");
  }

  let imported = 0;
  for (const rec of manifest.inspirations) {
    if (!isValidRecord(rec) || rec.note.trim() === "") continue;
    const imgEntry = zip.file(rec.imageFile);
    if (!imgEntry) continue;

    const bytes = await imgEntry.async("arraybuffer");
    const image = new Blob([bytes], {
      type:
        typeof rec.imageType === "string" && rec.imageType
          ? rec.imageType
          : "image/png",
    });

    try {
      const { thumb, width, height } = await makeThumb(image);
      await restoreInspiration({
        id: rec.id,
        createdAt: rec.createdAt,
        note: rec.note,
        url: typeof rec.url === "string" ? rec.url : undefined,
        title: typeof rec.title === "string" ? rec.title : undefined,
        image,
        thumb,
        width,
        height,
      });
      imported++;
    } catch {
      // skip records whose image can't be decoded
    }
  }
  return imported;
}

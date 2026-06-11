const THUMB_MAX_WIDTH = 600;
const THUMB_QUALITY = 0.8;

export interface ThumbResult {
  thumb: Blob;
  width: number;
  height: number;
}

/**
 * Generates the grid thumbnail for an original image: ~600px-wide WebP at
 * ~0.8 quality via canvas. Never upscales. The original blob is stored as-is
 * elsewhere — this output is disposable.
 */
export async function makeThumb(image: Blob): Promise<ThumbResult> {
  const bitmap = await createImageBitmap(image);
  try {
    const scale = Math.min(1, THUMB_MAX_WIDTH / bitmap.width);
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(bitmap, 0, 0, width, height);

    const thumb = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) =>
          blob ? resolve(blob) : reject(new Error("thumbnail encoding failed")),
        "image/webp",
        THUMB_QUALITY,
      );
    });

    return { thumb, width, height };
  } finally {
    bitmap.close();
  }
}

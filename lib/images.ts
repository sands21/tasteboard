const THUMB_MAX_WIDTH = 600;
const THUMB_QUALITY = 0.8;

export interface ThumbResult {
  thumb: Blob;
  width: number;
  height: number;
}

interface DecodedImage {
  source: CanvasImageSource;
  width: number;
  height: number;
  cleanup: () => void;
}

// createImageBitmap is the fast path but can't decode every format the
// browser can display (SVG, notably). Fall back to an <img> element.
async function decodeImage(image: Blob): Promise<DecodedImage> {
  try {
    const bitmap = await createImageBitmap(image);
    return {
      source: bitmap,
      width: bitmap.width,
      height: bitmap.height,
      cleanup: () => bitmap.close(),
    };
  } catch {
    const url = URL.createObjectURL(image);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("image decode failed"));
        img.src = url;
      });
      if (!img.naturalWidth || !img.naturalHeight) {
        throw new Error("image has no intrinsic size");
      }
      return {
        source: img,
        width: img.naturalWidth,
        height: img.naturalHeight,
        cleanup: () => URL.revokeObjectURL(url),
      };
    } catch (err) {
      URL.revokeObjectURL(url);
      throw err;
    }
  }
}

/**
 * Generates the grid thumbnail for an original image: ~600px-wide WebP at
 * ~0.8 quality via canvas. Never upscales. The original blob is stored as-is
 * elsewhere — this output is disposable.
 */
export async function makeThumb(image: Blob): Promise<ThumbResult> {
  const decoded = await decodeImage(image);
  try {
    const scale = Math.min(1, THUMB_MAX_WIDTH / decoded.width);
    const width = Math.max(1, Math.round(decoded.width * scale));
    const height = Math.max(1, Math.round(decoded.height * scale));

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas 2d context unavailable");
    ctx.drawImage(decoded.source, 0, 0, width, height);

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
    decoded.cleanup();
  }
}

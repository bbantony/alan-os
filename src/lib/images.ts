// Client-side image downscaling, done before a photo is ever uploaded.
//
// TWO REASONS THIS HAS TO EXIST.
//
// 1. Server Actions cap their request body at 1 MB in Next.js by default, and
//    this app doesn't raise it. A photo from a modern phone camera is 2-5 MB,
//    so `uploadReceipt` — which takes the whole file as FormData — rejected
//    every real receipt photo with a 413 before it reached storage or the AI.
//    Raising the limit instead would just move the problem: the same photo
//    would then cost a multi-megabyte upload on shop wifi and burn the free
//    Supabase Storage tier.
// 2. SPEC.md Part E6 requires it outright for journal photos ("compressed
//    client-side (~1600px max) to protect the 1GB free tier"), so this lives
//    in lib/ rather than inside the money module — Phase 6 needs the same
//    helper.
//
// Everything here runs in the browser: `document`, `Image` and canvas are not
// available on the server, so only client components may call it.

export const DEFAULT_MAX_EDGE = 1600;
const DEFAULT_QUALITY = 0.82;
/** Comfortably inside the 1 MB Server Action limit, with room for the rest of the form. */
const TARGET_MAX_BYTES = 900_000;
/** Retry qualities if the first pass is still too big for the wire. */
const FALLBACK_QUALITIES = [0.7, 0.55, 0.4];

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not read that image."));
    };
    img.src = url;
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => {
    canvas.toBlob((blob) => resolve(blob), "image/jpeg", quality);
  });
}

/**
 * Downscales `file` so its longest edge is at most `maxEdge`, re-encodes it as
 * JPEG, and steps the quality down until it fits comfortably under the upload
 * limit. Returns a new `File`.
 *
 * Never throws for an unreadable or unsupported image — it returns the original
 * file, so the upload path still runs and the caller's own error handling
 * decides what the person sees. Silently doing nothing is the right failure
 * mode here: a slightly-too-big upload that might still work beats refusing to
 * try at all.
 */
export async function compressImage(
  file: File,
  maxEdge: number = DEFAULT_MAX_EDGE
): Promise<File> {
  if (typeof document === "undefined") return file;
  if (!file.type.startsWith("image/")) return file;

  try {
    const img = await loadImage(file);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));

    // Already small enough in both dimensions and on disk — leave it alone
    // rather than re-encoding it and losing quality for nothing.
    if (scale === 1 && file.size <= TARGET_MAX_BYTES) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.width * scale));
    canvas.height = Math.max(1, Math.round(img.height * scale));

    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    let blob = await canvasToBlob(canvas, DEFAULT_QUALITY);
    for (const quality of FALLBACK_QUALITIES) {
      if (blob && blob.size <= TARGET_MAX_BYTES) break;
      blob = await canvasToBlob(canvas, quality);
    }
    if (!blob) return file;

    const name = file.name.replace(/\.[^.]+$/, "") || "photo";
    return new File([blob], `${name}.jpg`, { type: "image/jpeg", lastModified: Date.now() });
  } catch {
    return file;
  }
}

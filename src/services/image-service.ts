/**
 * Client-side image utilities (used-phones showroom, ads).
 *
 * Images are compressed on-device (canvas → JPEG) before being persisted.
 * EXIF orientation is honored via `createImageBitmap(..., { imageOrientation:
 * 'from-image' })` when available, so Android photos render upright with no
 * storage of the original file.
 */

export interface CompressOptions {
  maxDimension?: number;
  quality?: number;
}

const DEFAULT_MAX_DIMENSION = 900;
const DEFAULT_QUALITY = 0.72;

function readFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not read image'));
    };
    img.src = url;
  });
}

function scaleTo(target: number, w: number, h: number): { w: number; h: number } {
  const scale = Math.min(1, target / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

function canvasFromImage(img: HTMLImageElement, maxDimension: number): HTMLCanvasElement {
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w <= 0 || h <= 0) throw new Error('Invalid image dimensions');
  const { w: targetW, h: targetH } = scaleTo(maxDimension, w, h);
  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas;
}

/**
 * Decode an image into an oriented, max-dimension-limited canvas.
 * Uses createImageBitmap with EXIF orientation when the browser supports it,
 * otherwise falls back to <img> decoding (EXIF metadata is simply ignored).
 */
async function decodeCanvas(file: File, maxDimension: number): Promise<HTMLCanvasElement> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
      const { width: w, height: h } = bitmap;
      if (w > 0 && h > 0) {
        const { w: targetW, h: targetH } = scaleTo(maxDimension, w, h);
        const canvas = document.createElement('canvas');
        canvas.width = targetW;
        canvas.height = targetH;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.fillStyle = '#000';
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(bitmap, 0, 0, targetW, targetH);
        }
        bitmap.close();
        if (ctx) return canvas;
      }
      bitmap.close();
    } catch {
      // fall through to <img> path
    }
  }
  const img = await readFile(file);
  return canvasFromImage(img, maxDimension);
}

export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const canvas = await decodeCanvas(file, maxDimension);
  return canvas.toDataURL('image/jpeg', quality);
}

export async function compressImageToBlob(file: File, options: CompressOptions = {}): Promise<Blob> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;
  const canvas = await decodeCanvas(file, maxDimension);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      'image/jpeg',
      quality,
    );
  });
}

export async function compressImages(files: File[], options: CompressOptions = {}): Promise<string[]> {
  const results: string[] = [];
  for (const file of files) {
    try {
      results.push(await compressImage(file, options));
    } catch {
      // Skip unreadable/unsupported files silently.
    }
  }
  return results;
}

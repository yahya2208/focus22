/**
 * Client-side image utilities for the used-phones showroom.
 *
 * Images are compressed on-device (canvas → JPEG data-URL) before being
 * persisted to localStorage, keeping storage small and lazy-loading fast.
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

export async function compressImage(file: File, options: CompressOptions = {}): Promise<string> {
  const maxDimension = options.maxDimension ?? DEFAULT_MAX_DIMENSION;
  const quality = options.quality ?? DEFAULT_QUALITY;

  const img = await readFile(file);
  const { naturalWidth: w, naturalHeight: h } = img;
  if (w <= 0 || h <= 0) throw new Error('Invalid image dimensions');

  const scale = Math.min(1, maxDimension / Math.max(w, h));
  const targetW = Math.max(1, Math.round(w * scale));
  const targetH = Math.max(1, Math.round(h * scale));

  const canvas = document.createElement('canvas');
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');

  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, targetW, targetH);
  ctx.drawImage(img, 0, 0, targetW, targetH);

  return canvas.toDataURL('image/jpeg', quality);
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

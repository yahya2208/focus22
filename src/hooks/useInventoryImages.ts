import { useEffect, useRef, useState } from 'react';
import { centralListImages } from '../services/inventory-central-service';

/**
 * Resolves the display image URLs for an inventory record. Uses the initial
 * `fallback` (device.images) when non-empty; otherwise lists the record's
 * `inventory-images` folder and maps object names to public URLs (cached per
 * record by centralListImages). Records without images resolve to [] — no
 * broken image is rendered. Re-runs only when recordId changes.
 */
export function useInventoryImages(
  recordId: string | null | undefined,
  fallback: string[] = [],
): string[] {
  const initial = useRef(fallback);
  const [images, setImages] = useState<string[]>(initial.current?.length ? initial.current : []);

  useEffect(() => {
    if (!recordId) return;
    if (initial.current?.length) return;
    let cancelled = false;
    centralListImages(recordId).then((urls) => {
      if (!cancelled) setImages(urls);
    });
    return () => {
      cancelled = true;
    };
  }, [recordId]);

  return images;
}

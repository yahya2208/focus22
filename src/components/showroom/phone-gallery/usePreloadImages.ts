import { useEffect, useRef } from 'react';

/**
 * Preloads images adjacent to the current index.
 * Only the current image + immediate neighbors are preloaded (eager);
 * all others stay lazy. The browser dedupes by URL, so no duplicate fetches.
 */
export function usePreloadImages(
  images: readonly string[],
  currentIndex: number,
  windowSize: number = 1,
): void {
  const preloadedRef = useRef(new Set<string>());

  useEffect(() => {
    const newKeys = new Set<string>();

    for (let offset = -windowSize; offset <= windowSize; offset++) {
      const i = (currentIndex + offset + images.length) % images.length;
      const src = images[i];
      if (src && !preloadedRef.current.has(src)) {
        newKeys.add(src);
      }
    }

    if (newKeys.size === 0) return;

    const imgElements: HTMLImageElement[] = [];
    for (const src of newKeys) {
      const img = new Image();
      img.src = src;
      preloadedRef.current.add(src);
      imgElements.push(img);
    }

    return () => {
      for (const img of imgElements) {
        img.src = '';
      }
    };
  }, [images, currentIndex, windowSize]);
}

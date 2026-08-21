import { useMemo } from 'react';
import type { InventoryRecord } from '../../../services/inventory-service';

export interface FeedSlide {
  src: string;
  deviceId: string;
  brand: string;
  model: string;
  variant: string;
  sellPrice?: number;
  city?: string;
  condition: string;
  imageIndex: number;
  totalImages: number;
  slideIndex: number;
}

/**
 * Flattens all images from all devices into a single ordered feed.
 * Device order is preserved; images within each device maintain their original order.
 * The result is a flat array suitable for a Reels-style vertical scroll feed.
 *
 * `resolvedImages` maps deviceId → resolved URL array (from centralListImages).
 * Falls back to device.images when no resolved entry exists for a device.
 */
export function useReelFeed(
  devices: readonly InventoryRecord[],
  resolvedImages?: Map<string, string[]>,
): FeedSlide[] {
  return useMemo(() => {
    const slides: FeedSlide[] = [];
    let slideIndex = 0;

    for (const device of devices) {
      const images = (resolvedImages?.get(device.id) ?? device.images ?? []);
      if (images.length === 0) continue;

      for (let i = 0; i < images.length; i++) {
        const src = images[i];
        if (!src) continue;
        slides.push({
          src,
          deviceId: device.id,
          brand: device.brand,
          model: device.model,
          variant: device.variant,
          sellPrice: device.sellPrice,
          city: device.city,
          condition: device.condition,
          imageIndex: i,
          totalImages: images.length,
          slideIndex: slideIndex++,
        });
      }
    }

    return slides;
  }, [devices, resolvedImages]);
}

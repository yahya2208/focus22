import { useCallback, useState } from 'react';

export interface FavoritesApi {
  /** Placeholder (لاحقاً) — shows a "قريباً" toast; no storage yet. */
  save: () => void;
  showToast: boolean;
  dismissToast: () => void;
}

/**
 * Favorite placeholder (v5.1 §6): the header button stays wired but only signals
 * a "قريباً" toast — no storage in this phase.
 */
export function useFavorites(): FavoritesApi {
  const [showToast, setShowToast] = useState(false);

  const save = useCallback(() => {
    setShowToast(true);
  }, []);

  const dismissToast = useCallback(() => {
    setShowToast(false);
  }, []);

  return { save, showToast, dismissToast };
}

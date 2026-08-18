/**
 * Shared catalog formatting and conversion utilities.
 *
 * Single source of truth for:
 *  - RAM conversion (GB ↔ MB)
 *  - Storage formatting (GB / TB)
 *  - Variant label generation (compact + detailed)
 */

// ─── RAM Conversion ───────────────────────────────────────────────────────────

/** Convert user-facing RAM string (e.g. "8") to integer MB for DB storage. */
export function toRamMb(ramGb: string): number {
  return Math.round(Number(ramGb) * 1024);
}

// ─── Storage Conversion ───────────────────────────────────────────────────────

/** Convert user-facing storage string (e.g. "256") to integer GB for DB storage. */
export function toStorageGb(storageGb: string): number {
  return Math.round(Number(storageGb));
}

// ─── Formatting ───────────────────────────────────────────────────────────────

/** Format ram_mb integer to human-readable label: `8 GB`. */
export function formatRam(ramMb: number): string {
  const gb = ramMb / 1024;
  return `${gb} GB`;
}

/** Format storage_gb integer to human-readable label: `256 GB` or `1 TB`. */
export function formatStorage(storageGb: number): string {
  if (storageGb >= 1024) {
    const tb = storageGb / 1024;
    return tb % 1 === 0 ? `${tb} TB` : `${storageGb} GB`;
  }
  return `${storageGb} GB`;
}

// ─── Variant Labels ───────────────────────────────────────────────────────────

/**
 * Compact variant label from DB integer values.
 * Examples: "8/256", "12/512", "8/1T"
 */
export function variantCompactLabel(ramMb: number, storageGb: number): string {
  const ramPart = ramMb >= 1024 ? `${ramMb / 1024}` : `${ramMb}`;
  const storPart = storageGb >= 1024 ? `${storageGb / 1024}T` : `${storageGb}`;
  return `${ramPart}/${storPart}`;
}

/**
 * Detailed human-readable variant label from DB integer values.
 * Examples: "8 GB / 256 GB", "12 GB / 512 GB"
 */
export function variantDetailedLabel(ramMb: number, storageGb: number): string {
  return `${formatRam(ramMb)} / ${formatStorage(storageGb)}`;
}

// ─── Allowed Values ───────────────────────────────────────────────────────────

/** Allowed RAM values in GB (for validation of user input). */
export const ALLOWED_RAM_GB = new Set([
  0.25, 0.5, 1, 2, 3, 4, 6, 8, 12, 16, 18, 24, 32,
]);

/** Allowed storage values in GB (for validation of user input). */
export const ALLOWED_STORAGE_GB = new Set([
  4, 8, 16, 32, 64, 128, 256, 512, 1024, 2048,
]);

/** Check if a RAM value in GB is in the allowed set. */
export function isValidRamGb(ramGb: number): boolean {
  return ALLOWED_RAM_GB.has(ramGb);
}

/** Check if a storage value in GB is in the allowed set. */
export function isValidStorageGb(storageGb: number): boolean {
  return ALLOWED_STORAGE_GB.has(storageGb);
}

// ─── Region Options ───────────────────────────────────────────────────────────

export const REGION_OPTIONS = [
  { value: '', label: 'Global' },
  { value: 'US', label: 'US' },
  { value: 'EU', label: 'EU' },
  { value: 'IN', label: 'IN' },
  { value: 'CN', label: 'CN' },
  { value: 'GL', label: 'Global (GL)' },
  { value: 'MEA', label: 'MEA' },
];

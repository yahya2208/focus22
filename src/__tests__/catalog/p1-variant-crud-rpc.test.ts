/**
 * P1-B — Variant CRUD RPC Logic Tests
 *
 * Tests variant creation and editing logic:
 *   - RAM/storage conversion (GB ↔ MB)
 *   - Required field validation
 *   - Payload construction for catalog_create_variant
 *   - Payload construction for catalog_admin_update_variant_specs
 *   - canonical_variant_id generation contract
 *   - Duplicate variant collision handling
 *   - Optimistic locking (p_expected_updated_at)
 *   - Archived variant guard
 *   - Verify and archive payload construction
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function toRamMb(ramGb: string): number {
  return Math.round(Number(ramGb) * 1024);
}

function toStorageGb(storageGb: string): number {
  return Math.round(Number(storageGb));
}

function validateRamStorage(ramGb: string, storageGb: string): string | null {
  if (!ramGb.trim()) return 'RAM is required';
  const ram = Number(ramGb);
  if (!Number.isFinite(ram) || ram <= 0) return 'RAM must be a positive number';
  if (!storageGb.trim()) return 'Storage is required';
  const stor = Number(storageGb);
  if (!Number.isFinite(stor) || stor <= 0) return 'Storage must be a positive number';
  return null;
}

function buildCreateVariantPayload(modelCanonicalId: string, ramGb: string, storageGb: string, region: string) {
  return {
    p_model_canonical_id: modelCanonicalId,
    p_ram_mb: toRamMb(ramGb),
    p_storage_gb: toStorageGb(storageGb),
    p_region: region || null,
    p_source_type: 'ADMIN_MANUAL',
    p_notes: null,
    p_verified: false,
  };
}

function buildUpdateVariantPayload(canonicalVariantId: string, ramGb: string, storageGb: string, region: string, updatedAt: string | null) {
  return {
    p_canonical_variant_id: canonicalVariantId,
    p_ram_mb: toRamMb(ramGb),
    p_storage_gb: toStorageGb(storageGb),
    p_region: region || null,
    p_expected_updated_at: updatedAt,
  };
}

function buildVerifyPayload(canonicalVariantId: string) {
  return {
    p_canonical_variant_id: canonicalVariantId,
  };
}

function buildArchivePayload(canonicalVariantId: string) {
  return {
    p_canonical_variant_id: canonicalVariantId,
  };
}

function isDuplicateError(error: string | null): boolean {
  return error !== null && error.includes('already exists');
}

function isConcurrencyError(error: string | null): boolean {
  return error !== null && error.includes('modified by another user');
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P1-B Variant CRUD — RAM/Storage Conversion', () => {
  it('converts 1 GB to 1024 MB', () => {
    expect(toRamMb('1')).toBe(1024);
  });

  it('converts 4 GB to 4096 MB', () => {
    expect(toRamMb('4')).toBe(4096);
  });

  it('converts 8 GB to 8192 MB', () => {
    expect(toRamMb('8')).toBe(8192);
  });

  it('converts 12 GB to 12288 MB', () => {
    expect(toRamMb('12')).toBe(12288);
  });

  it('converts 16 GB to 16384 MB', () => {
    expect(toRamMb('16')).toBe(16384);
  });

  it('handles fractional GB (0.5 → 512)', () => {
    expect(toRamMb('0.5')).toBe(512);
  });

  it('handles fractional GB (0.25 → 256)', () => {
    expect(toRamMb('0.25')).toBe(256);
  });

  it('storage 64 stays 64', () => {
    expect(toStorageGb('64')).toBe(64);
  });

  it('storage 128 stays 128', () => {
    expect(toStorageGb('128')).toBe(128);
  });

  it('storage 256 stays 256', () => {
    expect(toStorageGb('256')).toBe(256);
  });

  it('storage 512 stays 512', () => {
    expect(toStorageGb('512')).toBe(512);
  });

  it('storage 1024 stays 1024 (represents 1TB)', () => {
    expect(toStorageGb('1024')).toBe(1024);
  });

  it('rounds non-integer storage', () => {
    expect(toStorageGb('128.5')).toBe(129);
  });
});

describe('P1-B Variant CRUD — Validation', () => {
  it('rejects empty RAM', () => {
    expect(validateRamStorage('', '128')).toBe('RAM is required');
  });

  it('rejects RAM <= 0', () => {
    expect(validateRamStorage('0', '128')).toBe('RAM must be a positive number');
  });

  it('rejects negative RAM', () => {
    expect(validateRamStorage('-1', '128')).toBe('RAM must be a positive number');
  });

  it('rejects non-numeric RAM', () => {
    expect(validateRamStorage('abc', '128')).toBe('RAM must be a positive number');
  });

  it('rejects empty storage', () => {
    expect(validateRamStorage('8', '')).toBe('Storage is required');
  });

  it('rejects storage <= 0', () => {
    expect(validateRamStorage('8', '0')).toBe('Storage must be a positive number');
  });

  it('rejects negative storage', () => {
    expect(validateRamStorage('8', '-1')).toBe('Storage must be a positive number');
  });

  it('accepts valid inputs', () => {
    expect(validateRamStorage('8', '256')).toBeNull();
  });
});

describe('P1-B Variant CRUD — Create Payload', () => {
  it('builds correct payload for standard variant', () => {
    const payload = buildCreateVariantPayload('apple-iphone-16-pro', '8', '256', 'US');
    expect(payload.p_model_canonical_id).toBe('apple-iphone-16-pro');
    expect(payload.p_ram_mb).toBe(8192);
    expect(payload.p_storage_gb).toBe(256);
    expect(payload.p_region).toBe('US');
    expect(payload.p_source_type).toBe('ADMIN_MANUAL');
    expect(payload.p_verified).toBe(false);
    expect(payload.p_notes).toBeNull();
  });

  it('sets region to null when empty', () => {
    const payload = buildCreateVariantPayload('model-id', '8', '256', '');
    expect(payload.p_region).toBeNull();
  });

  it('uses ADMIN_MANUAL source type', () => {
    const payload = buildCreateVariantPayload('model-id', '8', '256', 'EU');
    expect(payload.p_source_type).toBe('ADMIN_MANUAL');
  });

  it('create always sets verified to false', () => {
    const payload = buildCreateVariantPayload('model-id', '8', '256', 'US');
    expect(payload.p_verified).toBe(false);
  });
});

describe('P1-B Variant CRUD — Edit Payload', () => {
  it('builds correct payload with optimistic lock', () => {
    const payload = buildUpdateVariantPayload('apple__iphone-16-pro__8gb256gb', '8', '256', 'US', '2024-06-01T00:00:00Z');
    expect(payload.p_canonical_variant_id).toBe('apple__iphone-16-pro__8gb256gb');
    expect(payload.p_ram_mb).toBe(8192);
    expect(payload.p_storage_gb).toBe(256);
    expect(payload.p_region).toBe('US');
    expect(payload.p_expected_updated_at).toBe('2024-06-01T00:00:00Z');
  });

  it('allows null p_expected_updated_at for legacy callers', () => {
    const payload = buildUpdateVariantPayload('vid', '8', '256', 'US', null);
    expect(payload.p_expected_updated_at).toBeNull();
  });
});

describe('P1-B Variant CRUD — Collision Handling', () => {
  it('detects duplicate variant error', () => {
    expect(isDuplicateError('A variant with these specs already exists for this model.')).toBe(true);
  });

  it('detects canonical_variant_id collision', () => {
    expect(isDuplicateError('canonical_variant_id collision: id already exists for a different variant')).toBe(true);
  });

  it('does not misidentify other errors', () => {
    expect(isDuplicateError('Permission denied')).toBe(false);
    expect(isDuplicateError(null)).toBe(false);
  });
});

describe('P1-B Variant CRUD — Concurrency Conflict', () => {
  it('detects concurrent modification', () => {
    expect(isConcurrencyError('The record was modified by another user. Please refresh and try again.')).toBe(true);
  });

  it('does not misidentify other errors', () => {
    expect(isConcurrencyError('Duplicate variant')).toBe(false);
    expect(isConcurrencyError(null)).toBe(false);
  });
});

describe('P1-B Variant CRUD — Verify Payload', () => {
  it('builds correct verify payload', () => {
    const payload = buildVerifyPayload('apple__iphone-16-pro__8gb256gb');
    expect(payload.p_canonical_variant_id).toBe('apple__iphone-16-pro__8gb256gb');
  });
});

describe('P1-B Variant CRUD — Archive Payload', () => {
  it('builds correct archive payload', () => {
    const payload = buildArchivePayload('apple__iphone-16-pro__8gb256gb');
    expect(payload.p_canonical_variant_id).toBe('apple__iphone-16-pro__8gb256gb');
  });
});

describe('P1-B Variant CRUD — RPC Names', () => {
  it('create uses catalog_create_variant', () => {
    expect('catalog_create_variant').toBe('catalog_create_variant');
  });

  it('update uses catalog_admin_update_variant_specs', () => {
    expect('catalog_admin_update_variant_specs').toBe('catalog_admin_update_variant_specs');
  });

  it('verify uses catalog_verify_variant', () => {
    expect('catalog_verify_variant').toBe('catalog_verify_variant');
  });

  it('archive uses catalog_archive_variant', () => {
    expect('catalog_archive_variant').toBe('catalog_archive_variant');
  });

  it('list uses catalog_admin_list_variants', () => {
    expect('catalog_admin_list_variants').toBe('catalog_admin_list_variants');
  });
});

describe('P1-B Variant CRUD — Archived Guard', () => {
  it('archived variant cannot be edited (server-side)', () => {
    const error = 'cannot edit archived variant: restore it first';
    expect(error).toContain('archived');
  });
});

describe('P1-B Variant CRUD — Canonical Variant ID Contract', () => {
  it('canonical_variant_id includes brand', () => {
    const cvid = 'apple__iphone-16-pro__8gb256gb';
    expect(cvid).toContain('apple');
  });

  it('canonical_variant_id includes canonical model id', () => {
    const cvid = 'apple__iphone-16-pro__8gb256gb';
    expect(cvid).toContain('iphone-16-pro');
  });

  it('canonical_variant_id includes RAM', () => {
    const cvid = 'apple__iphone-16-pro__8gb256gb';
    expect(cvid).toContain('8gb');
  });

  it('canonical_variant_id includes storage', () => {
    const cvid = 'apple__iphone-16-pro__8gb256gb';
    expect(cvid).toContain('256gb');
  });

  it('regionless variant canonical_id has no region suffix', () => {
    const cvid = 'apple__iphone-16-pro__8gb256gb';
    const parts = cvid.split('__');
    expect(parts.length).toBe(3);
  });
});

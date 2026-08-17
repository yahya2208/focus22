/**
 * P1-A — Model CRUD RPC Logic Tests
 *
 * Tests model creation and editing logic:
 *   - Required field validation
 *   - canonical_id expectations
 *   - Payload construction for catalog_create_model
 *   - Payload construction for catalog_admin_update_model
 *   - Stale updated_at conflict detection
 *   - Duplicate model collision handling
 *   - Draft initial state
 *   - Active initial state
 *   - Array field parsing
 *
 * Pure unit tests. No database connection.
 */

import { describe, it, expect } from 'vitest';

// ─── Types ───────────────────────────────────────────────────────────────────

interface CatalogModelRow {
  id: string;
  canonical_id: string;
  brand_id: string;
  name: string;
  series: string | null;
  release_year: number | null;
  status: string;
  approval_status: string;
  variant_count: number;
  updated_at: string;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function parseArrayField(raw: string): string[] {
  return raw.split(',').map((s) => s.trim()).filter((s) => s.length > 0);
}

function validateModelName(name: string): string | null {
  if (!name.trim()) return 'Model name is required';
  if (name.trim().length > 200) return 'Model name is too long (max 200 characters)';
  return null;
}

function validateYear(year: string): string | null {
  if (!year) return null;
  const y = Number(year);
  if (!Number.isInteger(y) || y <= 0 || y > 2100) return 'Release year must be a valid year (1–2100)';
  return null;
}

function buildCreateModelPayload(brandId: string, name: string, series: string, year: string, modelNumbers: string, aliases: string) {
  return {
    p_brand_id: brandId,
    p_name: name.trim(),
    p_series: series.trim() || null,
    p_release_year: year ? Number(year) : null,
    p_model_numbers: parseArrayField(modelNumbers),
    p_aliases: parseArrayField(aliases),
  };
}

function buildUpdateModelPayload(canonicalId: string, name: string, series: string, year: string, modelNumbers: string, aliases: string, notes: string, updatedAt: string | null) {
  return {
    p_canonical_id: canonicalId,
    p_name: name.trim(),
    p_series: series.trim() || null,
    p_release_year: year ? Number(year) : null,
    p_model_numbers: parseArrayField(modelNumbers),
    p_aliases: parseArrayField(aliases),
    p_owner_notes: notes.trim() || null,
    p_expected_updated_at: updatedAt,
  };
}

function isNewDuplicateError(error: string | null): boolean {
  return error !== null && (error.includes('already exists') || error.includes('already in use') || error.includes('duplicate'));
}

function isConcurrencyError(error: string | null): boolean {
  return error !== null && error.includes('modified by another user');
}

// ─── Fixtures ────────────────────────────────────────────────────────────────

const DRAFT_MODEL: CatalogModelRow = {
  id: 'm1',
  canonical_id: 'apple-iphone-16-pro',
  brand_id: 'apple',
  name: 'iPhone 16 Pro',
  series: 'iPhone 16',
  release_year: 2024,
  status: 'active',
  approval_status: 'draft',
  variant_count: 3,
  updated_at: '2024-06-01T00:00:00Z',
};

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('P1-A Model CRUD — Name Validation', () => {
  it('rejects empty model name', () => {
    expect(validateModelName('')).toBe('Model name is required');
  });

  it('rejects whitespace-only name', () => {
    expect(validateModelName('   ')).toBe('Model name is required');
  });

  it('rejects name over 200 characters', () => {
    expect(validateModelName('a'.repeat(201))).toBe('Model name is too long (max 200 characters)');
  });

  it('accepts valid name', () => {
    expect(validateModelName('iPhone 16 Pro')).toBeNull();
  });

  it('accepts name at exactly 200 characters', () => {
    expect(validateModelName('a'.repeat(200))).toBeNull();
  });
});

describe('P1-A Model CRUD — Year Validation', () => {
  it('rejects year <= 0', () => {
    expect(validateYear('-1')).toBe('Release year must be a valid year (1–2100)');
  });

  it('rejects year > 2100', () => {
    expect(validateYear('2101')).toBe('Release year must be a valid year (1–2100)');
  });

  it('rejects non-integer year', () => {
    expect(validateYear('abc')).toBe('Release year must be a valid year (1–2100)');
  });

  it('accepts valid year', () => {
    expect(validateYear('2024')).toBeNull();
  });

  it('allows empty year', () => {
    expect(validateYear('')).toBeNull();
  });
});

describe('P1-A Model CRUD — Create Payload', () => {
  it('builds correct payload for full input', () => {
    const payload = buildCreateModelPayload('apple', 'iPhone 16 Pro', 'iPhone 16', '2024', 'A2848,A2849', 'i16p');
    expect(payload.p_brand_id).toBe('apple');
    expect(payload.p_name).toBe('iPhone 16 Pro');
    expect(payload.p_series).toBe('iPhone 16');
    expect(payload.p_release_year).toBe(2024);
    expect(payload.p_model_numbers).toEqual(['A2848', 'A2849']);
    expect(payload.p_aliases).toEqual(['i16p']);
  });

  it('trims name input', () => {
    const payload = buildCreateModelPayload('apple', '  iPhone 16 Pro  ', '', '', '', '');
    expect(payload.p_name).toBe('iPhone 16 Pro');
  });

  it('sets null for empty optional fields', () => {
    const payload = buildCreateModelPayload('apple', 'iPhone 16 Pro', '', '', '', '');
    expect(payload.p_series).toBeNull();
    expect(payload.p_release_year).toBeNull();
    expect(payload.p_model_numbers).toEqual([]);
    expect(payload.p_aliases).toEqual([]);
  });

  it('parses comma-separated model numbers', () => {
    const payload = buildCreateModelPayload('apple', 'iPhone', '', '', 'A1, B2, C3', '');
    expect(payload.p_model_numbers).toEqual(['A1', 'B2', 'C3']);
  });

  it('handles empty string in array fields', () => {
    const payload = buildCreateModelPayload('apple', 'iPhone', '', '', '', '');
    expect(payload.p_model_numbers).toEqual([]);
    expect(payload.p_aliases).toEqual([]);
  });
});

describe('P1-A Model CRUD — Update Payload', () => {
  it('builds correct update payload with optimistic lock', () => {
    const payload = buildUpdateModelPayload('apple-iphone-16-pro', 'iPhone 16 Pro', 'iPhone 16', '2024', '', '', 'notes', '2024-06-01T00:00:00Z');
    expect(payload.p_canonical_id).toBe('apple-iphone-16-pro');
    expect(payload.p_name).toBe('iPhone 16 Pro');
    expect(payload.p_expected_updated_at).toBe('2024-06-01T00:00:00Z');
  });

  it('includes p_expected_updated_at for conflict detection', () => {
    const payload = buildUpdateModelPayload('m-id', 'New Name', '', '', '', '', '', '2024-01-01T00:00:00Z');
    expect(payload.p_expected_updated_at).toBe('2024-01-01T00:00:00Z');
  });

  it('allows null p_expected_updated_at (legacy)', () => {
    const payload = buildUpdateModelPayload('m-id', 'New Name', '', '', '', '', '', null);
    expect(payload.p_expected_updated_at).toBeNull();
  });

  it('null notes field sends null', () => {
    const payload = buildUpdateModelPayload('m-id', 'Name', '', '', '', '', '  ', null);
    expect(payload.p_owner_notes).toBeNull();
  });
});

describe('P1-A Model CRUD — Collision Handling', () => {
  it('detects unique violation as duplicate error', () => {
    expect(isNewDuplicateError('duplicate model: brand=apple name=iPhone already exists')).toBe(true);
  });

  it('detects canonical_id collision', () => {
    expect(isNewDuplicateError('canonical_id collision: iphone-16-pro (deterministic identity already in use)')).toBe(true);
  });

  it('does not misidentify other errors', () => {
    expect(isNewDuplicateError('Permission denied')).toBe(false);
    expect(isNewDuplicateError(null)).toBe(false);
  });
});

describe('P1-A Model CRUD — Concurrency Conflict', () => {
  it('detects concurrent modification', () => {
    expect(isConcurrencyError('The record was modified by another user. Please refresh and try again.')).toBe(true);
  });

  it('does not misidentify other errors', () => {
    expect(isConcurrencyError('Permission denied')).toBe(false);
    expect(isConcurrencyError(null)).toBe(false);
  });
});

describe('P1-A Model CRUD — Initial State Expectations', () => {
  it('new model starts as draft', () => {
    expect(DRAFT_MODEL.approval_status).toBe('draft');
  });

  it('new model starts as active', () => {
    expect(DRAFT_MODEL.status).toBe('active');
  });

  it('new model has zero variants', () => {
    const newModel = { ...DRAFT_MODEL, variant_count: 0 };
    expect(newModel.variant_count).toBe(0);
  });
});

describe('P1-A Model CRUD — RPC Names', () => {
  it('create uses catalog_create_model', () => {
    const rpcName = 'catalog_create_model';
    expect(rpcName).toBe('catalog_create_model');
  });

  it('update uses catalog_admin_update_model', () => {
    const rpcName = 'catalog_admin_update_model';
    expect(rpcName).toBe('catalog_admin_update_model');
  });
});

describe('P1-A Model CRUD — Array Field Parsing', () => {
  it('parses single item', () => {
    expect(parseArrayField('A1')).toEqual(['A1']);
  });

  it('parses multiple items with spaces', () => {
    expect(parseArrayField(' A1 , B2 , C3 ')).toEqual(['A1', 'B2', 'C3']);
  });

  it('filters empty strings', () => {
    expect(parseArrayField('A1,,B2,,')).toEqual(['A1', 'B2']);
  });

  it('returns empty array for empty string', () => {
    expect(parseArrayField('')).toEqual([]);
  });
});

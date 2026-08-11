import { describe, it, expect, beforeEach, vi } from 'vitest';
import { uploadRecordImage, resetCentralInventoryState } from '../../services/inventory-central-service';
import alignmentSql from '../../../supabase/inventory-central/10-image-path-relative-alignment.sql?raw';

const calls = vi.hoisted(() => ({
  upload: [] as { bucket: string; path: string }[],
  addImage: [] as { recordId: string; path: string }[],
  publicUrl: [] as string[],
}));

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    storage: {
      from: (bucket: string) => ({
        upload: async (path: string) => {
          calls.upload.push({ bucket, path });
          return { error: null, data: { path } };
        },
        getPublicUrl: (path: string) => {
          calls.publicUrl.push(path);
          return {
            data: {
              publicUrl: `https://example.supabase.co/storage/v1/object/public/inventory-images/${path}`,
            },
          };
        },
      }),
    },
    rpc: async (fn: string, args: Record<string, unknown>) => {
      if (fn === 'inventory_add_image') {
        calls.addImage.push({
          recordId: String(args.p_inventory_id),
          path: String(args.p_path),
        });
        return { data: true, error: null };
      }
      return { data: null, error: null };
    },
  }),
}));

// Production regression (2026-08): POST /object/inventory-images/inventory-images/{id}/{uuid}.jpg → 400
// because the object path duplicated the bucket name. Contract (Rev 4): the path
// passed to storage.from('inventory-images').upload() must be RELATIVE — {id}/{uuid}.jpg —
// and the DB contract (RPC + policies) must use the same relative form.
const RECORD_ID = '550e8400-e29b-41d4-a716-446655440000';
const RELATIVE_PATH_RE = new RegExp(`^${RECORD_ID}/[0-9a-f-]{36}\\.jpg$`);

function blob(): Blob {
  return new Blob(['image-bytes'], { type: 'image/jpeg' });
}

describe('uploadRecordImage — relative object-path contract', () => {
  beforeEach(() => {
    calls.upload.length = 0;
    calls.addImage.length = 0;
    calls.publicUrl.length = 0;
    resetCentralInventoryState();
  });

  it('uploads to the inventory-images bucket with a RELATIVE path (no duplicated bucket name)', async () => {
    await uploadRecordImage(RECORD_ID, blob());

    expect(calls.upload).toHaveLength(1);
    const { bucket, path } = calls.upload[0]!;
    expect(bucket).toBe('inventory-images');
    expect(path.startsWith('inventory-images/')).toBe(false);
    expect(path).toMatch(RELATIVE_PATH_RE);
  });

  it('passes the same relative path to inventory_add_image (p_path)', async () => {
    await uploadRecordImage(RECORD_ID, blob());

    expect(calls.addImage).toHaveLength(1);
    expect(calls.addImage[0]!.recordId).toBe(RECORD_ID);
    expect(calls.addImage[0]!.path).toBe(calls.upload[0]!.path);
    expect(calls.addImage[0]!.path.startsWith('inventory-images/')).toBe(false);
  });

  it('builds the public URL and return value from the same relative path', async () => {
    const result = await uploadRecordImage(RECORD_ID, blob());

    expect(calls.publicUrl).toHaveLength(1);
    expect(calls.publicUrl[0]!).toBe(calls.upload[0]!.path);
    expect(result.path).toBe(calls.upload[0]!.path);
    expect(result.url).toContain('inventory-images/');
    expect(result.url.endsWith(calls.upload[0]!.path)).toBe(true);
  });
});

describe('10-image-path-relative-alignment.sql — DB contract matches the relative path', () => {
  const forward = alignmentSql.split('SECTION 2 — ROLLBACK')[0]!;
  const rollback = alignmentSql.split('SECTION 2 — ROLLBACK')[1] ?? '';

  it('has both an executable FORWARD and an explicit executable ROLLBACK section', () => {
    expect(forward).toContain('CREATE OR REPLACE FUNCTION public.inventory_add_image');
    expect(forward).toContain('CREATE POLICY "Staff upload inventory-images"');
    expect(forward).toContain('CREATE POLICY "Staff update inventory-images"');
    expect(rollback).toContain('restore the EXACT previous contract');
    expect(rollback).toContain('CREATE OR REPLACE FUNCTION public.inventory_add_image');
    expect(rollback).toContain('CREATE POLICY "Staff upload inventory-images"');
    expect(rollback).toContain('CREATE POLICY "Staff update inventory-images"');
  });

  it('FORWARD RPC validates RELATIVE p_path (no inventory-images/ prefix)', () => {
    expect(forward).toContain("p_path LIKE p_inventory_id::text || '/%'");
    expect(forward).not.toContain("p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'");
  });

  it('FORWARD policies use qualified relative storage.objects.name {id}/% folder match and keep admin authorization', () => {
    expect(forward).toContain('storage.objects.name LIKE i.id::text || \'/%\'');
    expect(forward).not.toContain("name LIKE 'inventory-images/%'");
    expect(forward).not.toContain("name LIKE 'inventory-images/' || i.id::text || '/%'");
    // Security model preserved: admin/super_admin gate + bucket scoping on both policies.
    expect(forward).toContain("u.role IN ('admin','super_admin')");
    expect(forward).toContain("bucket_id = 'inventory-images'");
  });

  it('FORWARD policy DROP+CREATE uses the exact original policy names', () => {
    expect(forward).toContain('DROP POLICY IF EXISTS "Staff upload inventory-images" ON storage.objects');
    expect(forward).toContain('DROP POLICY IF EXISTS "Staff update inventory-images" ON storage.objects');
    expect(forward).toContain('CREATE POLICY "Staff upload inventory-images"');
    expect(forward).toContain('CREATE POLICY "Staff update inventory-images"');
  });

  it('ROLLBACK restores the exact PREFIXED RPC path validation', () => {
    expect(rollback).toContain("p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'");
    expect(rollback).toContain("RAISE EXCEPTION 'path must start with inventory-images/%', p_inventory_id");
    expect(rollback).not.toContain("p_path LIKE p_inventory_id::text || '/%'");
  });

  it('ROLLBACK restores the exact PREFIXED upload/update policies with admin authorization intact', () => {
    expect(rollback).toContain('DROP POLICY IF EXISTS "Staff upload inventory-images" ON storage.objects');
    expect(rollback).toContain('DROP POLICY IF EXISTS "Staff update inventory-images" ON storage.objects');
    expect(rollback).toContain("name LIKE 'inventory-images/%'");
    expect(rollback).toContain("name LIKE 'inventory-images/' || i.id::text || '/%'");
    expect(rollback).toContain("u.role IN ('admin','super_admin')");
    expect(rollback).toContain("bucket_id = 'inventory-images'");
  });

  it('no other policy, table, RPC, or permission is touched by forward or rollback', () => {
    // Executable statements only (documentation comments may name the untouched items).
    expect(alignmentSql).not.toContain('DROP POLICY IF EXISTS "Public read inventory-images"');
    expect(alignmentSql).not.toContain('CREATE POLICY "Public read inventory-images"');
    expect(alignmentSql).not.toContain('DROP POLICY IF EXISTS "Staff delete inventory-images"');
    expect(alignmentSql).not.toContain('CREATE POLICY "Staff delete inventory-images"');
    expect(alignmentSql).not.toMatch(/CREATE( OR REPLACE)? FUNCTION public\.inventory_remove_image/);
    expect(alignmentSql).not.toContain('ALTER TABLE');
    expect(alignmentSql).not.toContain('CREATE TABLE');
    expect(alignmentSql).not.toContain('ALTER POLICY');
  });
});

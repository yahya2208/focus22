import { describe, expect, it } from 'vitest';
import applySql from '../../../supabase/inventory-central/01-inventory-apply.sql?raw';
import rollbackSql from '../../../supabase/inventory-central/02-inventory-rollback.sql?raw';
import evidenceSql from '../../../supabase/inventory-central/03-pre-apply-evidence.sql?raw';
import verifySql from '../../../supabase/inventory-central/04-post-apply-verify.sql?raw';
import adsApplySql from '../../../supabase/ads-multi-image/01-ads-multi-image-apply.sql?raw';
import adsRollbackSql from '../../../supabase/ads-multi-image/02-ads-multi-image-rollback.sql?raw';
import adsEvidenceSql from '../../../supabase/ads-multi-image/03-pre-apply-evidence.sql?raw';
import adsVerifySql from '../../../supabase/ads-multi-image/04-post-apply-verify.sql?raw';
import adsBackfillSql from '../../../supabase/ads-multi-image/05-ad-images-backfill.sql?raw';
import adsGenericApplySql from '../../../supabase/ads-generic-destinations/01-ads-generic-destinations-apply.sql?raw';
import adsGenericRollbackSql from '../../../supabase/ads-generic-destinations/02-ads-generic-destinations-rollback.sql?raw';
import adsGenericEvidenceSql from '../../../supabase/ads-generic-destinations/03-pre-apply-evidence.sql?raw';
import adsGenericVerifySql from '../../../supabase/ads-generic-destinations/04-post-apply-verify.sql?raw';
import adsDestEnabledApplySql from '../../../supabase/ads-destination-enabled/01-ads-destination-enabled-apply.sql?raw';
import adsDestEnabledRollbackSql from '../../../supabase/ads-destination-enabled/02-ads-destination-enabled-rollback.sql?raw';
import adsDestEnabledEvidenceSql from '../../../supabase/ads-destination-enabled/03-pre-apply-evidence.sql?raw';
import adsDestEnabledVerifySql from '../../../supabase/ads-destination-enabled/04-post-apply-verify.sql?raw';
import adsSlideDestApplySql from '../../../supabase/ads-slide-destinations/01-ads-slide-destinations-apply.sql?raw';
import adsSlideDestRollbackSql from '../../../supabase/ads-slide-destinations/02-ads-slide-destinations-rollback.sql?raw';
import adsSlideDestEvidenceSql from '../../../supabase/ads-slide-destinations/03-pre-apply-evidence.sql?raw';
import adsSlideDestVerifySql from '../../../supabase/ads-slide-destinations/04-post-apply-verify.sql?raw';

const MIGRATIONS = import.meta.glob('../../../supabase/migrations/*.sql', {
  eager: true,
  query: '?raw',
  import: 'default',
}) as Record<string, string>;

const migration19 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00019_inventory_central.sql'),
)?.[1] as string;

const migration20 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00020_ads_multi_image.sql'),
)?.[1] as string;

const migration22 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00022_generic_ads_destinations.sql'),
)?.[1] as string;

const migration23 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00023_ads_destination_enabled.sql'),
)?.[1] as string;

const migration24 = Object.entries(MIGRATIONS).find(([key]) =>
  key.includes('00024_ads_image_destinations.sql'),
)?.[1] as string;

void migration24; // used only for existence check

function basename(key: string): string {
  return key.split('/').pop() ?? key;
}

function numericPrefix(name: string): number | null {
  const m = name.match(/^(\d+)_/);
  return m ? Number(m[1]) : null;
}

function stripSqlComments(sql: string): string {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');
}

function executableLines(sql: string): string[] {
  return sql
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => {
      const t = line.trim();
      return t !== '' && !t.startsWith('--');
    });
}

function bodyFrom(sql: string): string {
  const lines = sql.split('\n');
  const firstNonComment = lines.findIndex((line) => !line.trimStart().startsWith('--'));
  return lines.slice(firstNonComment === -1 ? 0 : firstNonComment).join('\n');
}

function createFunctionSigs(sql: string): Map<string, number> {
  const sigs = new Map<string, number>();
  const re = /create or replace function public\.(\w+)\s*\(([\s\S]*?)\)\s*returns/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]!;
    const args = m[2] ?? '';
    sigs.set(name, args.split(',').filter((s) => s.trim().length > 0).length);
  }
  return sigs;
}

function dropFunctionSigs(sql: string): Map<string, number> {
  const sigs = new Map<string, number>();
  const re = /drop function if exists public\.(\w+)\(([^)]*)\)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(sql)) !== null) {
    const name = m[1]!;
    const args = m[2] ?? '';
    sigs.set(name, args.split(',').filter((s) => s.trim().length > 0).length);
  }
  return sigs;
}

function countOccurrences(haystack: string, needle: string): number {
  return haystack.split(needle).length - 1;
}

describe('Migration numbering', () => {
  it('zero-padded migration numbers (00001..00021) are unique', () => {
    const names = Object.keys(MIGRATIONS).map(basename);
    const nums = names
      .filter((name) => /^\d{5}_/.test(name))
      .map(numericPrefix)
      .filter((n): n is number => n !== null);
    expect(new Set(nums).size).toBe(nums.length);
  });

  it('the only legacy non-padded files are the known 003/004 pair', () => {
    const legacy = Object.keys(MIGRATIONS)
      .map(basename)
      .filter((name) => /^\d{3}_/.test(name) && !/^\d{5}_/.test(name))
      .sort();
    expect(legacy).toEqual(['003_add_session_lifecycle.sql', '004_add_analytics_events_indexes.sql']);
  });

  it('00042 is the highest migration number; 00020..00034 + 00042 all exist', () => {
    const nums = Object.keys(MIGRATIONS)
      .map(basename)
      .map(numericPrefix)
      .filter((n): n is number => n !== null);
    expect(Math.max(...nums)).toBe(42);
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00020_ads_multi_image.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00021_ad_images_device_id.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00022_generic_ads_destinations.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00023_ads_destination_enabled.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00024_ads_image_destinations.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00025_catalog_inventory_bridge.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00026_inventory_source_label.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00027_fix_gen_random_bytes_schema_qualification.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00028_ads_images_staff_read_policy.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00029_phone_view_counters.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00030_phone_search_events.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00031_phone_intelligence_rpc.sql');
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00034_recover_my_challenge_state.sql');
    // CHALLENGE-LINKED CAMPAIGN QR (P0 QR Safety, owner-authorized):
    // shipped as FILE ONLY — owner applies 00042 in the Supabase SQL Editor.
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00042_link_campaign_to_challenge.sql');
  });

  it('00019 body (after header comments) matches 01-inventory-apply.sql body', () => {
    expect(migration19).toBeDefined();
    // 00019 is the base migration; 01-inventory-apply.sql is the canonical
    // "deploy from scratch" file that now reflects the post-00026 state
    // (with source_label). Verify 01-apply has the final signatures.
    expect(bodyFrom(applySql)).toContain('p_source_label  text DEFAULT NULL');
    expect(bodyFrom(applySql)).toContain('source_label, total_purchased');
    expect(bodyFrom(applySql)).toContain('NULLIF(btrim(p_source_label), \'\')');
    // 00019 is preserved as the historical base migration (18-arg pre-00026).
  });

  it('00020 body (executable lines) matches 01-ads-multi-image-apply.sql body', () => {
    expect(migration20).toBeDefined();
    expect(executableLines(migration20)).toEqual(executableLines(adsApplySql));
  });
});

describe('Migration 00022 — Generic Ads Destinations (PHASE 1 foundation)', () => {
  it('00022 body (executable lines) matches 01-ads-generic-destinations-apply.sql body', () => {
    expect(migration22).toBeDefined();
    expect(executableLines(migration22)).toEqual(executableLines(adsGenericApplySql));
  });

  it('00022 is additive-only: adds the 3 columns, never touches existing ads structure', () => {
    const executable = executableLines(migration22).join('\n');
    expect(migration22).toContain('ADD COLUMN IF NOT EXISTS destination_type TEXT NOT NULL DEFAULT');
    expect(migration22).toContain('ADD COLUMN IF NOT EXISTS destination JSONB NOT NULL DEFAULT');
    expect(migration22).toContain('ADD COLUMN IF NOT EXISTS title TEXT NOT NULL DEFAULT');
    // No destructive statements, no table/trigger/RLS/storage/RPC rewrites (executable SQL only).
    for (const forbidden of ['DROP TABLE', 'DROP COLUMN', 'DROP TRIGGER', 'DROP POLICY',
                             'CREATE OR REPLACE FUNCTION', 'ALTER PUBLICATION', 'DELETE FROM',
                             'TRUNCATE', 'CREATE TABLE']) {
      expect(executable, `00022 must not contain ${forbidden}`).not.toContain(forbidden);
    }
    // ad_images must not be touched by this phase (executable SQL only).
    expect(executable).not.toContain('ad_images');
  });

  it('00022 CHECK admits exactly phone/external/internal/whatsapp', () => {
    expect(migration22).toContain('ads_destination_type_valid');
    expect(migration22).toContain("destination_type IN ('phone', 'external', 'internal', 'whatsapp')");
  });

  it('rollback drops exactly what 00022 added (constraint + 3 columns), nothing else', () => {
    expect(adsGenericRollbackSql).toContain('DROP CONSTRAINT IF EXISTS ads_destination_type_valid');
    expect(adsGenericRollbackSql).toContain('DROP COLUMN IF EXISTS destination_type');
    expect(adsGenericRollbackSql).toContain('DROP COLUMN IF EXISTS destination');
    expect(adsGenericRollbackSql).toContain('DROP COLUMN IF EXISTS title');
    for (const forbidden of ['DROP TABLE', 'DROP TRIGGER', 'DROP POLICY', 'DROP FUNCTION',
                             'ALTER PUBLICATION', 'DELETE FROM']) {
      expect(adsGenericRollbackSql, `rollback must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('pre-apply evidence asserts the new columns + constraint are ABSENT, and reads rows without DDL', () => {
    expect(adsGenericEvidenceSql).toContain("column_name IN ('destination_type', 'destination', 'title')");
    expect(adsGenericEvidenceSql).toContain("conname = 'ads_destination_type_valid'");
    expect(adsGenericEvidenceSql).toContain('SELECT placement, enabled, image_path, image_url, link, alt, device_id, sort_order');
    expect(adsGenericEvidenceSql).toContain('FROM public.ad_images');
    expect(adsGenericEvidenceSql).toContain('trg_ad_images_mirror');
  });

  it('post-apply verify asserts the backfill contract and that existing layers are untouched', () => {
    expect(adsGenericVerifySql).toContain('ads_destination_type_valid');
    expect(adsGenericVerifySql).toContain('jsonb_typeof(destination)');
    expect(adsGenericVerifySql).toContain("destination_type <> 'phone'");
    expect(adsGenericVerifySql).toContain('trg_ad_images_mirror');
    expect(adsGenericVerifySql).toContain('pg_policies');
    expect(adsGenericVerifySql).toContain("p.proname IN ('ad_is_admin'");
  });
});

describe('Migration 00023 — Destination-aware enabled rule (Step 2)', () => {
  it('00023 body (executable lines) matches 01-ads-destination-enabled-apply.sql body', () => {
    expect(migration23).toBeDefined();
    expect(executableLines(migration23)).toEqual(executableLines(adsDestEnabledApplySql));
  });

  it('00023 replaces the same constraint name with the destination-aware meaning', () => {
    expect(migration23).toContain('DROP CONSTRAINT IF EXISTS ads_enabled_requires_link');
    expect(migration23).toContain('ADD CONSTRAINT ads_enabled_requires_link');
    expect(migration23).toContain("destination_type = 'phone' AND btrim(link) <> ''");
    expect(migration23).toContain("destination_type IN ('external', 'internal', 'whatsapp')");
    expect(migration23).toContain('NOT VALID');
  });

  it('00023 is constraint-only: no destructive statements, no fallback between destination and link', () => {
    const executable = executableLines(migration23).join('\n');
    for (const forbidden of ['DROP TABLE', 'DROP COLUMN', 'DROP TRIGGER', 'DROP POLICY',
                             'DROP FUNCTION', 'CREATE OR REPLACE FUNCTION', 'ALTER PUBLICATION',
                             'DELETE FROM', 'TRUNCATE', 'CREATE TABLE']) {
      expect(executable, `00023 must not contain ${forbidden}`).not.toContain(forbidden);
    }
    // ad_images must not be touched by this step (executable SQL only).
    expect(executable).not.toContain('ad_images');
  });

  it('rollback restores the original Batch 4A meaning verbatim', () => {
    expect(adsDestEnabledRollbackSql).toContain('DROP CONSTRAINT IF EXISTS ads_enabled_requires_link');
    expect(adsDestEnabledRollbackSql).toContain("CHECK (enabled = FALSE OR btrim(link) <> '')");
    for (const forbidden of ['DROP TABLE', 'DROP TRIGGER', 'DROP POLICY', 'DROP FUNCTION',
                             'ALTER PUBLICATION', 'DELETE FROM', 'DROP COLUMN']) {
      expect(adsDestEnabledRollbackSql, `rollback must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('pre-apply evidence asserts the current def + destination columns + violation baseline', () => {
    expect(adsDestEnabledEvidenceSql).toContain("conname = 'ads_enabled_requires_link'");
    expect(adsDestEnabledEvidenceSql).toContain("column_name IN ('destination_type', 'destination', 'title')");
    expect(adsDestEnabledEvidenceSql).toContain('rows_violate_new_enabled_rule');
    expect(adsDestEnabledEvidenceSql).toContain('enabled_non_phone_rows');
  });

  it('post-apply verify probes the full truth table and keeps VALIDATE blocked', () => {
    expect(adsDestEnabledVerifySql).toContain("conname = 'ads_enabled_requires_link'");
    expect(adsDestEnabledVerifySql).toContain('rows_violate_new_enabled_rule');
    expect(adsDestEnabledVerifySql).toContain('probe_phone_empty_link');
    expect(adsDestEnabledVerifySql).toContain('probe_external');
    expect(adsDestEnabledVerifySql).toContain('probe_internal');
    expect(adsDestEnabledVerifySql).toContain('probe_whatsapp');
  });
});

describe('Migration 00024 — Per-Slide Destinations (PHASE 4A)', () => {
  it('00024 body (executable lines) matches 01-ads-slide-destinations-apply.sql body', () => {
    expect(migration24).toBeDefined();
    expect(executableLines(migration24)).toEqual(executableLines(adsSlideDestApplySql));
  });

  it('00024 is additive: adds the 2 nullable columns to ad_images, never touches ads structure', () => {
    const executable = executableLines(migration24).join('\n');
    expect(migration24).toContain('ADD COLUMN IF NOT EXISTS destination_type TEXT');
    expect(migration24).toContain('ADD COLUMN IF NOT EXISTS destination JSONB');
    // ad_images columns are NULLable (NULL = inherit the ad destination).
    expect(adsSlideDestApplySql).toContain('destination_type TEXT');
    // No destructive DDL against ads / ad_images existing layers. (DELETE FROM
    // inside the new RPC is expected — it is the 00021 replace contract.)
    for (const forbidden of ['DROP TABLE', 'DROP COLUMN', 'DROP TRIGGER', 'DROP POLICY',
                             'DROP CONSTRAINT', 'ALTER PUBLICATION',
                             'CREATE TABLE', 'ALTER TABLE public.ads']) {
      expect(executable, `00024 must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('00024 CHECK admits exactly NULL/external/whatsapp/internal and NEVER phone', () => {
    const executable = executableLines(migration24).join('\n');
    expect(migration24).toContain('ad_images_destination_type_valid');
    expect(migration24).toContain("destination_type IN ('external', 'whatsapp', 'internal')");
    expect(migration24).toContain('NOT VALID');
    // phone is excluded from the executable SQL — phone slides stay on device_id (00021).
    expect(executable).not.toContain("'phone'");
  });

  it('00024 adds the new superset RPC and NEVER touches the 00021 RPCs (backward compat)', () => {
    const executable = executableLines(migration24).join('\n');
    expect(migration24).toContain('CREATE OR REPLACE FUNCTION public.ad_replace_images_destinations');
    expect(migration24).toContain('p_destination_types text[]');
    expect(migration24).toMatch(/p_destinations\s+jsonb\[\]/);
    // The 00021 RPCs are NOT redefined or dropped by 00024 (comments may mention them).
    expect(executable).not.toContain('ad_replace_images_devices');
    expect(executable).not.toContain('ad_add_image_devices');
    expect(executable).not.toContain('CREATE OR REPLACE FUNCTION public.ad_replace_images_devices');
  });

  it('rollback drops exactly what 00024 added (RPC + constraint + 2 columns), nothing else', () => {
    const executable = executableLines(adsSlideDestRollbackSql).join('\n');
    expect(adsSlideDestRollbackSql).toContain('DROP FUNCTION IF EXISTS public.ad_replace_images_destinations');
    expect(adsSlideDestRollbackSql).toContain('DROP CONSTRAINT IF EXISTS ad_images_destination_type_valid');
    expect(adsSlideDestRollbackSql).toContain('DROP COLUMN IF EXISTS destination_type');
    expect(adsSlideDestRollbackSql).toContain('DROP COLUMN IF EXISTS destination');
    for (const forbidden of ['DROP TABLE', 'DROP TRIGGER', 'DROP POLICY', 'DROP VIEW',
                             'ALTER PUBLICATION', 'DELETE FROM', 'ad_replace_images_devices']) {
      expect(executable, `rollback must not contain ${forbidden}`).not.toContain(forbidden);
    }
  });

  it('pre-apply evidence asserts the new columns/constraint/RPC are ABSENT and the 00021 baseline is PRESENT', () => {
    expect(adsSlideDestEvidenceSql).toContain("column_name IN ('destination_type', 'destination')");
    expect(adsSlideDestEvidenceSql).toContain("conname = 'ad_images_destination_type_valid'");
    expect(adsSlideDestEvidenceSql).toContain("p.proname = 'ad_replace_images_destinations'");
    expect(adsSlideDestEvidenceSql).toContain("ad_images_device_id_format");
    expect(adsSlideDestEvidenceSql).toContain("'ad_add_image_devices', 'ad_replace_images_devices'");
    expect(adsSlideDestEvidenceSql).toContain('total_ad_images');
  });

  it('post-apply verify asserts the inherit-default contract, phone rejection probes and backward compat', () => {
    expect(adsSlideDestVerifySql).toContain('ad_images_destination_type_valid');
    expect(adsSlideDestVerifySql).toContain('convalidated');
    expect(adsSlideDestVerifySql).toContain('dest_type_assigned');
    expect(adsSlideDestVerifySql).toContain('dest_assigned');
    expect(adsSlideDestVerifySql).toContain('__probe_00024_null_dest__');
    expect(adsSlideDestVerifySql).toContain('__probe_00024_phone__');
    expect(adsSlideDestVerifySql).toContain('__probe_00024_external__');
    expect(adsSlideDestVerifySql).toContain('__probe_00024_whatsapp__');
    expect(adsSlideDestVerifySql).toContain('__probe_00024_internal__');
    expect(adsSlideDestVerifySql).toContain('check_violation');
    expect(adsSlideDestVerifySql).toContain("p.proname = 'ad_replace_images_destinations'");
    expect(adsSlideDestVerifySql).toContain("'ad_add_image_devices', 'ad_replace_images_devices'");
  });
});

describe('01-ads-slide-destinations-apply.sql ↔ 02-ads-slide-destinations-rollback.sql consistency', () => {
  it('every function created in 01 is dropped in 02 with an identical signature', () => {
    const created = createFunctionSigs(adsSlideDestApplySql);
    const dropped = dropFunctionSigs(adsSlideDestRollbackSql);
    expect(created.size).toBeGreaterThan(0);
    expect(dropped.size).toBe(created.size);
    for (const [name, argc] of created) {
      expect(dropped.has(name), `02 must drop ${name}`).toBe(true);
      expect(dropped.get(name), `${name} argument-count mismatch between 01 and 02`).toBe(argc);
    }
    for (const name of dropped.keys()) {
      expect(created.has(name), `02 drops ${name} but 01 does not create it`).toBe(true);
    }
  });

  it('rollback never touches the 00021 RPCs or the ads table (backward compat)', () => {
    const executable = executableLines(adsSlideDestRollbackSql).join('\n');
    expect(executable).not.toContain('ad_replace_images_devices');
    expect(executable).not.toContain('ad_add_image_devices');
    expect(executable).not.toContain('ALTER TABLE public.ads');
  });
});

describe('00014 exclusion', () => {
  it('00014_inventory_tables.sql is frozen but never executed/referenced by executable SQL', () => {
    expect(Object.keys(MIGRATIONS).map(basename)).toContain('00014_inventory_tables.sql');
    for (const [key, content] of Object.entries(MIGRATIONS)) {
      const name = basename(key);
      if (name === '00014_inventory_tables.sql') continue;
      expect(stripSqlComments(content), `${name} must not execute anything referencing 00014`).not.toContain(
        '00014',
      );
    }
    expect(stripSqlComments(applySql)).not.toContain('00014');
    expect(stripSqlComments(rollbackSql)).not.toContain('00014');
  });
});

describe('01-inventory-apply.sql ↔ 02-inventory-rollback.sql consistency', () => {
  it('every function created in 01 is dropped in 02 with an identical signature', () => {
    const created = createFunctionSigs(applySql);
    const dropped = dropFunctionSigs(rollbackSql);
    expect(created.size).toBeGreaterThan(0);
    expect(dropped.size).toBe(created.size);
    for (const [name, argc] of created) {
      expect(dropped.has(name), `02 must drop ${name}`).toBe(true);
      expect(dropped.get(name), `${name} argument-count mismatch between 01 and 02`).toBe(argc);
    }
    for (const name of dropped.keys()) {
      expect(created.has(name), `02 drops ${name} but 01 does not create it`).toBe(true);
    }
  });

  it('rollback order reverses apply order (tables / view / RPCs / storage)', () => {
    expect(applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_items')).toBeLessThan(
      applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_images'),
    );
    expect(applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_images')).toBeLessThan(
      applySql.indexOf('CREATE TABLE IF NOT EXISTS public.inventory_movements'),
    );
    expect(rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_movements')).toBeLessThan(
      rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_images'),
    );
    expect(rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_images')).toBeLessThan(
      rollbackSql.indexOf('DROP TABLE IF EXISTS public.inventory_items'),
    );

    expect(applySql.indexOf('CREATE OR REPLACE VIEW public.v_public_inventory')).toBeLessThan(
      applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_is_admin'),
    );
    expect(rollbackSql.indexOf('DROP FUNCTION IF EXISTS public.inventory_is_admin')).toBeLessThan(
      rollbackSql.indexOf('DROP VIEW IF EXISTS public.v_public_inventory'),
    );

    expect(applySql.indexOf('-- 9) Storage bucket')).toBeGreaterThan(
      applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_add_item'),
    );
    expect(rollbackSql.indexOf("DELETE FROM storage.buckets WHERE id = 'inventory-images'")).toBeLessThan(
      rollbackSql.indexOf('DROP FUNCTION IF EXISTS public.inventory_add_item'),
    );
  });
});

describe('Phase 2C security invariants (01 / 00019)', () => {
  const files: Array<{ label: string; sql: string }> = [
    { label: '01-inventory-apply.sql', sql: applySql },
    { label: '00019_inventory_central.sql', sql: migration19 },
  ];

  for (const { label, sql } of files) {
    it(`${label}: storage write access uses CREATE POLICY with WITH CHECK, never raw storage.policies inserts`, () => {
      expect(sql).not.toContain('INSERT INTO storage.policies');
      expect(sql).not.toContain('supabase_realtime.publication');
      expect(countOccurrences(sql, 'CREATE POLICY "Staff upload inventory-images"')).toBe(1);
      expect(countOccurrences(sql, 'CREATE POLICY "Staff update inventory-images"')).toBe(1);
      expect(countOccurrences(sql, 'CREATE POLICY "Staff delete inventory-images"')).toBe(1);
      expect(sql).toContain('WITH CHECK');
    });

    it(`${label}: all storage writes and management RPCs are admin/super_admin only`, () => {
      const adminChecks = countOccurrences(sql, "u.role IN ('admin','super_admin')");
      expect(adminChecks).toBeGreaterThanOrEqual(4);
      expect(sql).toContain("name LIKE 'inventory-images/%'");
    });

    it(`${label}: inventory_add_image validates folder prefix + object existence + locks the row`, () => {
      expect(sql).toContain("p_path LIKE 'inventory-images/' || p_inventory_id::text || '/%'");
      expect(sql).toContain('storage.objects');
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain("RAISE EXCEPTION 'object % does not exist in inventory-images bucket'");
    });

    it(`${label}: stock RPCs refuse archived/discontinued/deleted rows`, () => {
      const guards = countOccurrences(sql, "status NOT IN ('archived','discontinued','deleted')");
      expect(guards).toBeGreaterThanOrEqual(3);
    });

    it(`${label}: EXECUTE is revoked from PUBLIC for all 14 inventory functions`, () => {
      const revokes = countOccurrences(sql, 'REVOKE ALL ON FUNCTION');
      expect(revokes).toBe(14);
    });

    it(`${label}: realtime uses guarded ALTER PUBLICATION, not raw internal-table inserts`, () => {
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_items');
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.inventory_images');
    });

    it(`${label}: UUID generation is consistent via gen_random_uuid()`, () => {
      expect(sql).not.toContain('uuid_generate_v4');
      expect(countOccurrences(sql, 'gen_random_uuid()')).toBeGreaterThanOrEqual(3);
    });
  }
});

describe('02-inventory-rollback.sql (G1/G2/G3)', () => {
  it('deletes storage objects before dropping the bucket — no orphans (G1)', () => {
    const objectsDelete = rollbackSql.indexOf("DELETE FROM storage.objects WHERE bucket_id = 'inventory-images'");
    const bucketDrop = rollbackSql.indexOf("DELETE FROM storage.buckets WHERE id = 'inventory-images'");
    expect(objectsDelete).toBeGreaterThan(-1);
    expect(bucketDrop).toBeGreaterThan(objectsDelete);
  });

  it('storage policy names match the final names created in 01 (G2/H12)', () => {
    for (const name of [
      'Public read inventory-images',
      'Staff upload inventory-images',
      'Staff update inventory-images',
      'Staff delete inventory-images',
    ]) {
      expect(applySql, `01 must create policy "${name}"`).toContain(`CREATE POLICY "${name}"`);
      expect(rollbackSql, `02 must drop policy "${name}"`).toContain(
        `DROP POLICY IF EXISTS "${name}" ON storage.objects`,
      );
    }
  });

  it('warns that rollback erases central data (G3)', () => {
    expect(rollbackSql).toContain('ERASES central data');
  });
});

describe('03-pre-apply-evidence.sql (E1/E2/E3)', () => {
  it('proves table absence with to_regclass, never queries non-existent tables (E1)', () => {
    expect(countOccurrences(evidenceSql, 'to_regclass')).toBeGreaterThanOrEqual(4);
    expect(evidenceSql).not.toMatch(/FROM\s+public\.inventory_(items|images|movements)/);
  });

  it('checks functions, bucket, storage policies, publication, uuid generator, users.id (E2)', () => {
    expect(evidenceSql).toContain("p.proname LIKE 'inventory_%'");
    expect(evidenceSql).toContain("storage.buckets WHERE id = 'inventory-images'");
    expect(evidenceSql).toContain('pg_policies');
    expect(evidenceSql).toContain('pg_publication_tables');
    expect(evidenceSql).toContain("pubname = 'supabase_realtime'");
    expect(evidenceSql).toContain("p.proname = 'gen_random_uuid'");
    expect(evidenceSql).toContain("table_name = 'users' AND column_name = 'id'");
  });

  it('proves at least one admin/super_admin exists before apply (E3)', () => {
    expect(evidenceSql).toContain("role IN ('admin','super_admin')");
  });
});

describe('04-post-apply-verify.sql (G4/G5/G6)', () => {
  it('checks the admin baseline via public.users, not auth.uid() (G4)', () => {
    expect(verifySql).toContain("FROM public.users WHERE role IN ('admin','super_admin')");
    expect(verifySql).not.toContain('auth.uid()');
  });

  it('verifies storage policies and absence of PUBLIC EXECUTE (G5)', () => {
    expect(verifySql).toContain("'Staff upload inventory-images'");
    expect(verifySql).toContain("'Staff update inventory-images'");
    expect(verifySql).toContain("'Staff delete inventory-images'");
    expect(verifySql).toContain('14_no_public_exec');
  });

  it('pins the exact RPC count to 14 and the realtime contract (G6)', () => {
    expect(verifySql).toContain('EXACTLY 14 functions');
    expect(verifySql).toContain("proname LIKE 'inventory_%'");
    expect(verifySql).toContain("'10_no_inventory_central_pub'");
    expect(verifySql).toContain("'15_realtime_tables'");
    expect(verifySql).toContain('pg_publication_tables');
  });
});

describe('H13 ownership model', () => {
  it('management list enforces admin-only via the single authorization gate inventory_is_admin()', () => {
    const mgmtStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_management_list');
    const mgmtEnd = applySql.indexOf('GRANT EXECUTE ON FUNCTION public.inventory_management_list');
    const mgmt = applySql.slice(mgmtStart, mgmtEnd);
    expect(mgmt).toContain('IF NOT public.inventory_is_admin() THEN');
    expect(mgmt).not.toContain('researcher');

    const adminStart = applySql.indexOf('CREATE OR REPLACE FUNCTION public.inventory_is_admin');
    const adminEnd = applySql.indexOf('GRANT EXECUTE ON FUNCTION public.inventory_is_admin');
    const adminGate = applySql.slice(adminStart, adminEnd);
    expect(adminGate).toContain("u.role IN ('admin','super_admin')");
    expect(adminGate).not.toContain('researcher');

    const movementsStart = applySql.indexOf('CREATE POLICY "Staff read inventory movements"');
    const movementsEnd = applySql.indexOf('REVOKE ALL ON public.inventory_items');
    const movementsPolicy = applySql.slice(movementsStart, movementsEnd);
    expect(movementsPolicy).toContain("u.role IN ('admin','super_admin','researcher')");
  });
});

describe('01-ads-multi-image-apply.sql ↔ 02-ads-multi-image-rollback.sql consistency', () => {
  it('every function created in 01 is dropped in 02 with an identical signature', () => {
    const created = createFunctionSigs(adsApplySql);
    const dropped = dropFunctionSigs(adsRollbackSql);
    expect(created.size).toBeGreaterThan(0);
    expect(dropped.size).toBe(created.size);
    for (const [name, argc] of created) {
      expect(dropped.has(name), `02 must drop ${name}`).toBe(true);
      expect(dropped.get(name), `${name} argument-count mismatch between 01 and 02`).toBe(argc);
    }
    for (const name of dropped.keys()) {
      expect(created.has(name), `02 drops ${name} but 01 does not create it`).toBe(true);
    }
  });

  it('rollback order reverses apply order (mirror helper / table / RPCs / storage)', () => {
    expect(adsApplySql.indexOf('CREATE TABLE IF NOT EXISTS public.ad_images')).toBeLessThan(
      adsApplySql.indexOf('CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror'),
    );
    expect(adsApplySql.indexOf('CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror')).toBeLessThan(
      adsApplySql.indexOf('CREATE OR REPLACE FUNCTION public.ad_is_admin'),
    );
    expect(adsRollbackSql.indexOf('DROP TRIGGER IF EXISTS trg_ad_images_mirror')).toBeLessThan(
      adsRollbackSql.indexOf('DROP FUNCTION IF EXISTS public.sync_ads_image_mirror'),
    );
    expect(adsRollbackSql.indexOf('DROP FUNCTION IF EXISTS public.sync_ads_image_mirror')).toBeLessThan(
      adsRollbackSql.indexOf('DROP TABLE IF EXISTS public.ad_images'),
    );
    expect(adsRollbackSql.indexOf('DROP TABLE IF EXISTS public.ad_images')).toBeLessThan(
      adsRollbackSql.indexOf('DROP FUNCTION IF EXISTS public.ad_is_admin'),
    );
  });
});

describe('Ads multi-image security invariants (01 / 00020)', () => {
  const files: Array<{ label: string; sql: string }> = [
    { label: '01-ads-multi-image-apply.sql', sql: adsApplySql },
    { label: '00020_ads_multi_image.sql', sql: migration20 },
  ];

  for (const { label, sql } of files) {
    it(`${label}: storage upload hardening uses CREATE POLICY with WITH CHECK, never raw storage.policies inserts`, () => {
      expect(sql).not.toContain('INSERT INTO storage.policies');
      expect(sql).not.toContain('supabase_realtime.publication');
      expect(sql).toContain('CREATE POLICY "Staff upload ads-images"');
      expect(sql).toContain('WITH CHECK');
    });

    it(`${label}: upload policy requires admin role AND the ads-images/% or ads/% prefix`, () => {
      expect(countOccurrences(sql, "u.role IN ('admin','super_admin')")).toBeGreaterThanOrEqual(2);
      expect(sql).toContain("(name LIKE 'ads-images/%' OR name LIKE 'ads/%')");
      expect(sql).toContain("name LIKE 'ads-images/' || a.placement || '/%'");
    });

    it(`${label}: ad_% RPCs gate on ad_is_admin(), validate prefix + object existence, and lock the row`, () => {
      expect(sql).toContain('IF NOT public.ad_is_admin() THEN');
      expect(sql).toContain("p_path LIKE 'ads-images/' || p_ad_placement || '/%'");
      expect(sql).toContain('storage.objects');
      expect(sql).toContain('FOR UPDATE');
      expect(sql).toContain('does not exist in ads-images bucket');
    });

    it(`${label}: EXECUTE is revoked from PUBLIC for exactly the 4 ad_% RPCs`, () => {
      expect(countOccurrences(sql, 'REVOKE ALL ON FUNCTION')).toBe(4);
      expect(countOccurrences(sql, 'GRANT EXECUTE ON FUNCTION')).toBe(4);
    });

    it(`${label}: ad_images is SELECT-only for public — RPCs are the only write path`, () => {
      expect(sql).toContain('REVOKE ALL ON public.ad_images FROM anon, authenticated');
      expect(sql).toContain('GRANT SELECT ON public.ad_images TO anon, authenticated');
      expect(sql).not.toContain('GRANT INSERT, UPDATE, DELETE ON public.ad_images');
    });

    it(`${label}: realtime uses guarded ALTER PUBLICATION, never raw internal-table inserts`, () => {
      expect(sql).toContain('ALTER PUBLICATION supabase_realtime ADD TABLE public.ad_images');
    });

    it(`${label}: UUID generation is consistent via gen_random_uuid()`, () => {
      expect(sql).not.toContain('uuid_generate_v4');
      expect(sql).toContain('gen_random_uuid()');
    });

    it(`${label}: cover exclusivity is enforced (partial unique index + RPC guard)`, () => {
      expect(sql).toContain('CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_images_cover');
      expect(sql).toContain('WHERE is_cover = TRUE');
      expect(sql).toContain('at most one image can be the cover');
    });
  }
});

describe('sync_ads_image_mirror — deleting the last ad_images row blanks the mirror (ISSUE 1)', () => {
  const files: Array<{ label: string; sql: string }> = [
    { label: '01-ads-multi-image-apply.sql', sql: adsApplySql },
    { label: '00020_ads_multi_image.sql', sql: migration20 },
  ];

  for (const { label, sql } of files) {
    it(`${label}: no rows left (last row deleted) resets ads.image_path and image_url to empty`, () => {
      const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror()');
      expect(fnStart).toBeGreaterThanOrEqual(0);
      const fn = sql.slice(fnStart, sql.indexOf('$$;', fnStart));
      // Cover exists -> mirror stores the cover.
      expect(fn).toContain('IF v_cover_path IS NOT NULL THEN');
      expect(fn).toContain('SET image_path = v_cover_path,');
      expect(fn).toContain('image_url  = ' + "''");
      // No rows remain (last row deleted) -> mirror is blanked, never left stale.
      expect(fn.indexOf('ELSE')).toBeGreaterThan(fn.indexOf('SET image_path = v_cover_path,'));
      expect(fn).toContain("SET image_path = '',");
      expect(fn).toContain('WHERE placement = v_placement;');
    });

    it(`${label}: blanking UPDATE is valid SQL — single SET with comma-separated columns, never a repeated SET`, () => {
      const fnStart = sql.indexOf('CREATE OR REPLACE FUNCTION public.sync_ads_image_mirror()');
      expect(fnStart).toBeGreaterThanOrEqual(0);
      const fn = sql.slice(fnStart, sql.indexOf('$$;', fnStart));
      // A valid UPDATE ... SET a = x, b = y never repeats the SET keyword.
      expect(fn).not.toMatch(/SET\s+image_url/);
      // Extract the blanking UPDATE statement (the one inside the ELSE branch).
      const elseIdx = fn.indexOf('ELSE');
      const blank = fn.slice(elseIdx);
      const upStart = blank.indexOf('UPDATE public.ads');
      expect(upStart).toBeGreaterThanOrEqual(0);
      const whereEnd = 'WHERE placement = v_placement;';
      const stmt = blank.slice(upStart, blank.indexOf(whereEnd, upStart) + whereEnd.length);
      const lines = stmt.split('\n').map((l) => l.trim());
      expect(lines[0]).toBe('UPDATE public.ads');
      expect(lines[1]).toBe("SET image_path = '',");
      expect(lines[2]).toBe("image_url  = ''");
      expect(lines[3]).toBe('WHERE placement = v_placement;');
    });
  }
});

describe('02-ads-multi-image-rollback.sql (G1/G2/G3 for ads)', () => {
  it('never deletes storage objects or the bucket — files survive rollback (B-1)', () => {
    expect(adsRollbackSql).not.toContain('DELETE FROM storage.objects');
    expect(adsRollbackSql).not.toContain('DELETE FROM storage.buckets');
  });

  it('restores the 00015 upload policy VERBATIM (no placement hardening)', () => {
    expect(adsRollbackSql).toContain('DROP POLICY IF EXISTS "Staff upload ads-images" ON storage.objects');
    expect(adsRollbackSql).toContain('CREATE POLICY "Staff upload ads-images"');
    expect(adsRollbackSql).toContain("bucket_id = 'ads-images'");
    expect(adsRollbackSql).toContain("u.role IN ('admin','super_admin')");
    expect(adsRollbackSql).not.toContain("OR name LIKE 'ads/%'");
  });

  it('erases the multi-image layer: trigger, helper, table, RPCs, realtime membership', () => {
    expect(adsRollbackSql).toContain('DROP TRIGGER IF EXISTS trg_ad_images_mirror');
    expect(adsRollbackSql).toContain('DROP TABLE IF EXISTS public.ad_images');
    expect(adsRollbackSql).toContain('DROP FUNCTION IF EXISTS public.ad_is_admin');
    expect(adsRollbackSql).toContain('ALTER PUBLICATION supabase_realtime DROP TABLE public.ad_images');
  });
});

describe('03-pre-apply-evidence.sql (ads)', () => {
  it('proves ad_images absence with to_regclass, never queries non-existent tables', () => {
    expect(countOccurrences(adsEvidenceSql, 'to_regclass')).toBeGreaterThanOrEqual(1);
    expect(adsEvidenceSql).not.toMatch(/FROM\s+public\.ad_images/);
  });

  it('checks functions, bucket, storage policies, publication, uuid generator, users baseline', () => {
    expect(adsEvidenceSql).toContain("p.proname LIKE 'ad\\_%'");
    expect(adsEvidenceSql).toContain("storage.buckets WHERE id = 'ads-images'");
    expect(adsEvidenceSql).toContain("'Staff upload ads-images'");
    expect(adsEvidenceSql).toContain('pg_publication_tables');
    expect(adsEvidenceSql).toContain("pubname = 'supabase_realtime'");
    expect(adsEvidenceSql).toContain("p.proname = 'gen_random_uuid'");
    expect(adsEvidenceSql).toContain("table_name = 'users' AND column_name = 'id'");
  });

  it('proves at least one admin/super_admin exists before apply', () => {
    expect(adsEvidenceSql).toContain("role IN ('admin','super_admin')");
  });

  it('captures the legacy ad-with-image count (check 7) that the backfill guard compares', () => {
    expect(adsEvidenceSql).toContain('legacy_ads_with_image');
    expect(adsEvidenceSql).toContain(
      "FROM public.ads WHERE image_path IS NOT NULL AND image_path <> ''",
    );
  });
});

describe('04-post-apply-verify.sql (ads)', () => {
  it('pins the exact RPC count to 4 ad_% functions with no PUBLIC execute leak', () => {
    expect(adsVerifySql).toContain("p.proname LIKE 'ad\\_%'");
    expect(adsVerifySql).toContain('08_no_public_exec');
  });

  it('verifies storage policies (4 total, upload one hardened with placement check)', () => {
    expect(adsVerifySql).toContain("'Public read ads-images'");
    expect(adsVerifySql).toContain("'Staff upload ads-images'");
    expect(adsVerifySql).toContain("'Staff update ads-images'");
    expect(adsVerifySql).toContain("'Staff delete ads-images'");
    expect(adsVerifySql).toContain('10_hardened_upload_policy');
  });

  it('verifies the mirror invariant and backfill rows', () => {
    expect(adsVerifySql).toContain('12_backfill_rows');
    expect(adsVerifySql).toContain('13_mirror_invariant');
    expect(adsVerifySql).toContain('trg_ad_images_mirror');
  });
});

describe('05-ad-images-backfill.sql (ads)', () => {
  it('mirrors legacy single-image ads 1:1 (position 0, cover) with ON CONFLICT rerunnability', () => {
    expect(adsBackfillSql).toContain('INSERT INTO public.ad_images');
    expect(adsBackfillSql).toContain('ON CONFLICT (ad_placement, path) DO NOTHING');
    expect(adsBackfillSql).toContain('FROM public.ads');
    expect(adsBackfillSql).toContain("WHERE image_path IS NOT NULL AND image_path <> ''");
  });

  it('guards the backfill with an all-or-nothing count check', () => {
    expect(adsBackfillSql).toContain('BEGIN;');
    expect(adsBackfillSql).toContain('COMMIT;');
    expect(adsBackfillSql).toContain('RAISE EXCEPTION');
  });
});

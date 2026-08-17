/**
 * P2 — LIVE DB READ-ONLY RECONNAISSANCE
 *
 * READ-ONLY probes against the live Supabase database.
 * Establishes baseline state for pre-migration documentation.
 * Does NOT modify any data.
 *
 * Usage: npx tsx scripts/catalog-p2-live-recon.ts
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

// Load .env manually (no dotenv dependency)
function loadEnv() {
  try {
    const envPath = join(process.cwd(), '.env');
    const content = readFileSync(envPath, 'utf8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx < 0) continue;
      const key = trimmed.substring(0, eqIdx).trim();
      const val = trimmed.substring(eqIdx + 1).trim();
      process.env[key] = val;
    }
  } catch { /* ignore */ }
}
loadEnv();

const URL = process.env.VITE_SUPABASE_URL;
const KEY = process.env.VITE_SUPABASE_ANON_KEY;

if (!URL || !KEY) {
  console.error('ERROR: VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY required in .env');
  process.exit(1);
}

const supabase = createClient(URL, KEY);

async function probe(label: string, fn: () => Promise<{ data: unknown; error: unknown }>) {
  const { data, error } = await fn();
  const err = error as { message?: string; code?: string } | null;
  if (err) {
    console.log(`  ${label}: ERROR — ${err.message} (${err.code || 'unknown'})`);
  } else {
    console.log(`  ${label}: OK — ${JSON.stringify(data).substring(0, 200)}`);
  }
}

async function main() {
  console.log('=== P2 LIVE DB READ-ONLY RECONNAISSANCE ===');
  console.log(`URL: ${URL}`);
  console.log();

  // ─── A. Model counts ──────────────────────────────────────────────
  console.log('--- A. Data baseline ---');

  const { count: modelCount } = await supabase
    .from('catalog_models')
    .select('*', { count: 'exact', head: true });
  console.log(`  catalog_models count: ${modelCount}`);

  const { count: variantCount } = await supabase
    .from('catalog_variants')
    .select('*', { count: 'exact', head: true });
  console.log(`  catalog_variants count: ${variantCount}`);

  // Approval status distribution
  const { data: draftCount } = await supabase
    .rpc('catalog_is_admin'); // Just test if RPC is callable
  console.log(`  catalog_is_admin (anon): ${draftCount}`);

  // ─── B. Anon ACL probes (pre-migration) ───────────────────────────
  console.log();
  console.log('--- B. Anon ACL probes (PRE-MIGRATION) ---');

  // Test: can anon execute approve_model?
  await probe('catalog_admin_approve_model(text,boolean) (old 2-param)', () =>
    supabase.rpc('catalog_admin_approve_model' as never, { p_canonical_id: 'test', p_approve: false } as never)
  );

  // Test: can anon execute the new 3-param approve_model? (should not exist yet)
  await probe('catalog_export_snapshot()', () =>
    supabase.rpc('catalog_export_snapshot' as never)
  );

  // ─── C. RPC existence check ───────────────────────────────────────
  console.log();
  console.log('--- C. RPC existence (pre-migration) ---');

  // Test: can we read catalog_models directly (anon SELECT)?
  const { count: anonModels } = await supabase
    .from('catalog_models')
    .select('*', { count: 'exact', head: true });
  console.log(`  catalog_models SELECT (anon): ${anonModels !== null ? 'ALLOWED (count=' + anonModels + ')' : 'BLOCKED'}`);

  const { count: anonVariants } = await supabase
    .from('catalog_variants')
    .select('*', { count: 'exact', head: true });
  console.log(`  catalog_variants SELECT (anon): ${anonVariants !== null ? 'ALLOWED (count=' + anonVariants + ')' : 'BLOCKED'}`);

  // ─── D. Approval status distribution ──────────────────────────────
  console.log();
  console.log('--- D. Approval status distribution ---');

  const PAGE = 1000;
  const statusCounts: Record<string, number> = {};
  let from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('catalog_models')
      .select('approval_status, status')
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      const key = `${row.approval_status}/${row.status}`;
      statusCounts[key] = (statusCounts[key] || 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  for (const [k, v] of Object.entries(statusCounts).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  // ─── E. Variant status distribution ───────────────────────────────
  console.log();
  console.log('--- E. Variant status distribution ---');
  const varStatusCounts: Record<string, number> = {};
  from = 0;
  for (;;) {
    const { data, error } = await supabase
      .from('catalog_variants')
      .select('status')
      .range(from, from + PAGE - 1);
    if (error || !data) break;
    for (const row of data) {
      varStatusCounts[row.status] = (varStatusCounts[row.status] || 0) + 1;
    }
    if (data.length < PAGE) break;
    from += PAGE;
  }
  for (const [k, v] of Object.entries(varStatusCounts).sort()) {
    console.log(`  ${k}: ${v}`);
  }

  console.log();
  console.log('=== RECONNAISSANCE COMPLETE ===');
}

main().catch((err) => {
  console.error('FATAL:', err);
  process.exit(1);
});

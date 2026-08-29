/**
 * LIVE probe against the Supabase target using the anon key (the ONLY
 * credential available). Enumerates the exposed public schema via PostgREST
 * OpenAPI introspection, then exercises the anon-executable public surfaces:
 *   - v_public_listings / v_public_inventory (correct columns)
 *   - category_products_for_category() (public RPC — proves 42703 fix)
 *   - delivery_create_order as anon (proves UNAUTHENTICATED guard)
 *   - public RLS read on category_products
 *
 * Run: node --import tsx scripts/live-verify-probe.ts
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function loadEnv(file: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf-8').split(/\r?\n/)) {
    const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (m && !m[1].startsWith('#')) out[m[1]!] = m[2]!.trim();
  }
  return out;
}
const env = { ...process.env, ...loadEnv(path.resolve(__dirname, '../.env')) };
const url = env.VITE_SUPABASE_URL;
const anon = env.VITE_SUPABASE_ANON_KEY;
if (!url || !anon) {
  console.error('Missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY in .env');
  process.exit(2);
}
const sb = createClient(url, anon, { auth: { persistSession: false } });

function j(v: unknown): string {
  if (v === undefined || v === null) return String(v);
  return typeof v === 'string' ? v : JSON.stringify(v, null, 0);
}

async function probe(label: string, fn: () => Promise<{ data: unknown; error: unknown }>) {
  try {
    const { data, error } = await fn();
    console.log(`\n[${label}]\ndata=${error ? 'null' : j(data)}\nerror=${error ? j(error) : 'none'}`);
  } catch (e) {
    try {
      const anyE = e as { message?: string; status?: number; body?: unknown };
      console.log(`\n[${label}] status=${anyE.status ?? 'n/a'} body=${j(anyE.body ?? anyE.message)}`);
    } catch {
      console.log(`\n[${label}] THREW ${(e as Error).message}`);
    }
  }
}

async function main() {
  // 1) PostgREST OpenAPI instead of raw rpc fetch.
  const specRes = await fetch(url + '/', { headers: { apikey: anon, Authorization: `Bearer ${anon}` } });
  const specText = await specRes.text();
  try {
    const spec = JSON.parse(specText) as { paths?: Record<string, unknown>; definitions?: unknown };
    const defs = spec.definitions ?? (spec as { components?: { schemas?: Record<string, unknown> } }).components?.schemas ?? {};
    console.log('\n=== OPENAPI: exposed tables/views (paths) ===');
    const paths = spec.paths ?? {};
    const tableNames = Object.keys(paths)
      .filter((p) => !p.includes('/rpc/'))
      .map((p) => p.replace(/^\//, '').replace(/\?.*$/, ''))
      .filter(Boolean);
    console.log('tables/views:', tableNames.sort().join(', '));
    console.log('has category_products:', tableNames.includes('category_products'));
    console.log('has v_public_listings:', tableNames.includes('v_public_listings'));
    console.log('has v_public_inventory:', tableNames.includes('v_public_inventory'));
    const rpcs = Object.keys(paths)
      .filter((p) => p.includes('/rpc/'))
      .map((p) => p.split('/rpc/')[1]);
    console.log('\n=== RPC exposures (PostgREST) ===');
    console.log(
      rpcs
        .filter((r) => r.startsWith('category_products'))
        .sort()
        .join('\n'),
    );
    if (!rpcs.some((r) => r.startsWith('category_products'))) {
      console.log('(no category_products RPCs exposed to this key/role)');
    }
    console.log('delivery_create_order exposed:', rpcs.includes('delivery_create_order'));
    console.log('delivery_estimate exposed:', rpcs.includes('delivery_estimate'));
    console.log('\n=== category_products columns (from definitions) ===');
    const def = (defs as Record<string, { properties?: Record<string, unknown> }>)['category_products'];
    if (def?.properties) {
      console.log('columns:', Object.keys(def.properties).sort().join(', '));
    } else {
      console.log('(no definition exposed)');
    }
  } catch {
    console.log('OpenAPI parse failed; raw head:\n' + specText.slice(0, 400));
  }

  // 2) Real category ids (Phones from probe) for RPC test.
  const phonesUuid = 'd63bd2b0-ce06-4d23-8f5b-243fd30303ac';
  await probe('category_products_for_category(PHONES)',
    () => sb.rpc('category_products_for_category', { p_category_id: phonesUuid }));
  await probe('category_products_for_category(fake-no-members)',
    () => sb.rpc('category_products_for_category', { p_category_id: '00000000-0000-0000-0000-000000000000' }));

  // 3) Correct v_public_listings columns + visibility gate demonstration.
  await probe('v_public_listings sample',
    () => sb.from('v_public_listings').select('id, category, brand, model, price, price_period, quantity, status, images').limit(4));
  await probe('v_public_listings by category (gate)',
    () => sb.from('v_public_listings').select('category', { count: 'exact', head: true }));

  // 4) v_public_inventory (legacy phones view) — minimal columns.
  await probe('v_public_inventory sample',
    () => sb.from('v_public_inventory').select('id').limit(4));
  await probe('v_public_inventory count',
    () => sb.from('v_public_inventory').select('id', { count: 'exact', head: true }));

  // 5) anon auth guard on order creation.
  await probe('delivery_create_order as ANON (expect UNAUTHENTICATED)',
    () => sb.rpc('delivery_create_order', {
      p_customer: { name: 't', phone: '1', zone_id: '00000000-0000-0000-0000-000000000000', address: '', notes: '' },
      p_items: [],
    }));
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

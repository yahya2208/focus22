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
const url = env.VITE_SUPABASE_URL!;
const anon = env.VITE_SUPABASE_ANON_KEY!;
const sb = createClient(url, anon, { auth: { persistSession: false } });
const j = (v: unknown) => (v === undefined || v === null ? String(v) : typeof v === 'string' ? v : JSON.stringify(v));

async function main() {
  const { data, error } = await sb
    .from('v_public_listings')
    .select('id, category, brand, model, price, price_period, quantity, status')
    .limit(60);
  console.log('error:', error ? j(error) : 'none', 'rows:', Array.isArray(data) ? data.length : 'n/a');
  if (Array.isArray(data)) {
    const byCat: Record<string, { sale: string[]; monthly: string[] }> = {};
    for (const r of data) {
      byCat[r.category] ??= { sale: [], monthly: [] };
      const key = r.price_period === 'monthly' ? 'monthly' : 'sale';
      byCat[r.category][key].push(`${r.id} | ${r.brand} ${r.model} | price=${r.price} period=${r.price_period} qty=${r.quantity} status=${r.status}`);
    }
    for (const [cat, buckets] of Object.entries(byCat)) {
      console.log(`\n--- category=${cat} ---`);
      console.log('sale:', buckets.sale.slice(0, 3));
      console.log('monthly:', buckets.monthly.slice(0, 3));
    }
  }
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

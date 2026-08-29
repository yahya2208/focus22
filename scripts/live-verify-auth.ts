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

function decode(jwt: string) {
  try {
    const p = jwt.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(Buffer.from(p, 'base64').toString('utf-8'));
  } catch (e) {
    return { err: (e as Error).message };
  }
}

const tag = Math.random().toString(36).slice(2, 8);
const email = `dbg-${tag}@example.com`;
const password = 'VerifyTemp123!';

async function main() {
  const { data: su } = await sb.auth.signUp({ email, password });
  const at = su?.session?.access_token;
  if (!at) { console.log('no session'); process.exit(0); }
  console.log('JWT claims:', JSON.stringify(decode(at), null, 2));

  const authed = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error: setErr } = await authed.auth.setSession({ access_token: at, refresh_token: su!.session!.refresh_token });
  console.log('setSession err:', setErr ? j(setErr) : 'none');
  const cur = (await authed.auth.getSession()).data.session;
  console.log('current token present:', Boolean(cur?.access_token));

  // Which RPCs are reachable as this authenticated user (vs anon)?
  const adminList = await authed.rpc('category_products_admin_list', { p_category_id: '00000000-0000-0000-0000-000000000000' });
  console.log('admin_list (authed):', adminList.error ? 'ERR ' + j(adminList.error) : 'data ' + j(adminList.data));

  const adminAssign = await authed.rpc('category_products_admin_assign', { p_category_id: '00000000-0000-0000-0000-000000000000', p_product_ids: [] });
  console.log('admin_assign (authed):', adminAssign.error ? 'ERR ' + j(adminAssign.error) : 'data ' + j(adminAssign.data));

  const order = await authed.rpc('delivery_create_order', {
    p_customer: { name: 'T', phone: '1', zone_id: '00000000-0000-0000-0000-000000000000', address: '', notes: '' },
    p_items: [],
  });
  console.log('delivery_create_order (authed):', order.error ? 'ERR ' + j(order.error) : 'data ' + j(order.data));

  console.log('\nTEST USER:', email, 'id=', su?.user?.id);
}

main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

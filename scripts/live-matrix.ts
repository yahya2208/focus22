import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const env: Record<string,string> = {};
for (const line of fs.readFileSync(path.resolve(__dirname,'../.env'),'utf-8').split(/\r?\n/)) {
  const m = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
  if (m && !m[1].startsWith('#')) env[m[1]!]=m[2]!.trim();
}
const url = env.VITE_SUPABASE_URL!;
const anon = env.VITE_SUPABASE_ANON_KEY!;
const j = (v: unknown) => JSON.stringify(v);

const PROBE = {
  phone: 'da5a0594-f9ce-483b-846e-a16e7bb6b0d9',
  zone: '56808708-01c6-4b2b-8ad5-f0ecffdaff69',
};

async function main() {
  const sb = createClient(url, anon, { auth: { persistSession: false } });
  const tag = Math.random().toString(36).slice(2, 8);
  const email = `mat-${tag}@example.com`;
  const { data: su } = await sb.auth.signUp({ email, password: 'VerifyTemp123!' });
  const at = su?.session?.access_token;
  console.log('authed user:', su?.user?.id ?? 'FAIL');
  if (!at) { console.log('NO SESSION — abort'); process.exit(0); }
  const authed = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  await authed.auth.setSession({ access_token: at, refresh_token: su!.session!.refresh_token });

  const customer = { name: 'Verify Agent', phone: '9', zone_id: PROBE.zone, address: '1 Test St', notes: 'live matrix' };

  console.log('\n--- CASE A: invalid catalog_ref (random uuid) ---');
  const a = await authed.rpc('delivery_create_order', {
    p_customer: customer,
    p_items: [{ catalog_ref: '11111111-1111-1111-1111-111111111111', name: 'hack', unit_price: 5, quantity: 99 }],
  });
  console.log('result:', a.error ? 'ERR ' + j(a.error) : 'OK ' + j(a.data));

  console.log('\n--- CASE F: real phone, MANIPULATED client payload (unit_price=1, quantity=99) ---');
  const f = await authed.rpc('delivery_create_order', {
    p_customer: customer,
    p_items: [{ catalog_ref: PROBE.phone, name: 'Fake Hacked Name', unit_price: 1, quantity: 99 }],
  });
  console.log('result:', f.error ? 'ERR ' + j(f.error) : 'OK ' + j(f.data));
  const orderId = Array.isArray(f.data) ? (f.data as { id?: string }[])[0]?.id : (f.data && typeof f.data === 'object' && 'id' in f.data ? (f.data as { id?: string }).id : undefined);

  console.log('\n--- CASE F2: read back the created order (what price/qty persisted) ---');
  if (orderId) {
    const r = await authed.from('orders').select('id, status, total').eq('id', orderId).maybeSingle().then(x => x.error ? {err:x.error} : x.data);
    console.log('order readback:', j(r));
  } else {
    console.log('no order id returned');
  }

  console.log('\nTEST USER:', email, 'id=', su?.user?.id, '(report for cleanup)');
}
main().then(() => process.exit(0)).catch((e) => { console.error(e); process.exit(1); });

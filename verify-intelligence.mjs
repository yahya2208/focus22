// FINAL GATE — verifies get_phone_intelligence against REAL authenticated staff session.
//
// Run with a REAL staff account (admin / super_admin / researcher):
//   FOCUS_STAFF_EMAIL=you@example.com FOCUS_STAFF_PASSWORD=... node verify-intelligence.mjs
//
// Credentials are read from env only — never stored, logged, or committed.
// No request.jwt.claims tricks: this exercises the real GoTrue → JWT → RLS path.
//
// Contract under test (00031 Section 5): search_to_phone lists phones ACTUALLY
// selected from search results — it aggregates phone_search_selections and
// INNER JOINs inventory. Expected devices are therefore derived from the
// actual phone_search_selections rows (staff-readable via RLS policy), NEVER
// from the search-result/inventory set.
//
// Checks:
//   1. RPC executes without 42883 / any error key
//   2. search_analytics contains 'oppo' AND 'samsung' with selection_count >= 1
//   3. search_to_phone mirrors phone_search_selections exactly:
//      every actually-selected device present with its exact selection_count,
//      no unselected device listed, and the documented Oppo A5s fixture pick present
//   4. search_without_selection does NOT list oppo/samsung
//   5. demand_overview exists and is an array
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const email = process.env.FOCUS_STAFF_EMAIL;
const password = process.env.FOCUS_STAFF_PASSWORD;
if (!email || !password) {
  console.error('Usage: FOCUS_STAFF_EMAIL=... FOCUS_STAFF_PASSWORD=... node verify-intelligence.mjs');
  console.error('(account must have role admin | super_admin | researcher in public.users)');
  process.exit(1);
}

const env = Object.fromEntries(
  readFileSync('.env', 'utf8')
    .split(/\r?\n/)
    .filter((l) => l.includes('=') && !l.trim().startsWith('#'))
    .map((l) => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]),
);

const db = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});

const { error: authErr } = await db.auth.signInWithPassword({ email, password });
if (authErr) { console.error('SIGN-IN FAILED:', authErr.message); process.exit(1); }
console.log('Signed in as:', email);

const short = (uuid) => String(uuid).slice(0, 8);

const { data, error } = await db.rpc('get_phone_intelligence', { p_time_range: 'all', p_brand: null });

let failures = 0;
const check = (name, ok, detail) => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
};

if (error) {
  check('1. RPC executes without error', false, `${error.code ?? ''} ${error.message}`);
  process.exit(1);
}
check('1. no 42883 / no error key', !(data && typeof data.error === 'string'), data?.error ?? '');

const sa = Array.isArray(data?.search_analytics) ? data.search_analytics : null;
check('2/A. search_analytics is an array', Array.isArray(sa));
if (!sa) process.exit(1);
const findQ = (q) => sa.find((r) => r.query === q);
check("2/B-C. search_analytics has 'oppo'", !!findQ('oppo'), JSON.stringify(findQ('oppo') ?? null));
check("2. search_analytics has 'samsung'", !!findQ('samsung'), JSON.stringify(findQ('samsung') ?? null));
check("2. oppo selection_count >= 1", (findQ('oppo')?.selection_count ?? 0) >= 1);
check("2. samsung selection_count >= 1", (findQ('samsung')?.selection_count ?? 0) >= 1);

// ── CHECK 3 — contract-exact: mirror of ACTUAL phone_search_selections ──────
// Ground truth read through the staff SELECT policy (00030), not invented.
const selRes = await db.from('phone_search_selections').select('device_id');
if (selRes.error) { check('3. read phone_search_selections', false, selRes.error.message); process.exit(1); }
const truth = new Map();
for (const r of selRes.data ?? []) truth.set(r.device_id, (truth.get(r.device_id) ?? 0) + 1);
console.log(`      ground truth: ${(selRes.data ?? []).length} selection row(s) across ${truth.size} device(s)`);

const stp = Array.isArray(data?.search_to_phone) ? data.search_to_phone : null;
check('D. search_to_phone is an array', Array.isArray(stp));
if (!stp) process.exit(1);

// E-F equivalent, driven by actual selections: EVERY really-selected device
// must appear with its exact count. Samsung appears only if a real Samsung
// selection row exists — never demanded merely because results contained one.
for (const [deviceId, cnt] of truth) {
  const row = stp.find((r) => r.device_id === deviceId);
  const ok = !!row && row.selection_count === cnt;
  check(`3/E-F. selected device ${short(deviceId)}… present with exact selection_count=${cnt}`, ok,
    row ? `rpc count=${row.selection_count}` : 'MISSING from search_to_phone');
}

// No unselected inventory/search-result device may be required or listed.
const extras = stp.filter((r) => !truth.has(r.device_id));
check('3. no unselected device listed in search_to_phone', extras.length === 0,
  extras.map((r) => short(r.device_id)).join(',') || 'none');

// Documented live-fixture pin: the debugged real pick.
const A5S = '9ae7b89b-4464-4731-942a-7cc3192cce0e'; // Oppo A5s — actual production selection
if (truth.has(A5S)) {
  const a5s = stp.find((r) => r.device_id === A5S);
  check(`3. known fixture pick Oppo A5s (${short(A5S)}…) present`, !!a5s && a5s.selection_count >= 1,
    a5s ? `selection_count=${a5s.selection_count}, brand=${a5s.brand} ${a5s.model}` : 'MISSING');
}

// ── CHECK 4 / 5 ─────────────────────────────────────────────────────────────
const sws = Array.isArray(data?.search_without_selection) ? data.search_without_selection : [];
const leaked = sws.filter((r) => r.query === 'oppo' || r.query === 'samsung').map((r) => r.query);
check('G. search_without_selection does NOT list oppo/samsung', leaked.length === 0, leaked.join(',') || 'clean');

check('H. demand_overview exists and is an array', Array.isArray(data?.demand_overview),
  `length=${Array.isArray(data?.demand_overview) ? data.demand_overview.length : 'n/a'}`);

console.log(failures === 0 ? '\nALL CHECKS PASSED — safe to commit.' : `\n${failures} CHECK(S) FAILED.`);
process.exit(failures === 0 ? 0 : 1);

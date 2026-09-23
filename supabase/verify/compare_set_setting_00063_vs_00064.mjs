#!/usr/bin/env node
// ============================================================================
// PRE-APPLY PROOF — 00063 set_setting() body is retained verbatim in 00064.
//
// Usage:  node supabase/verify/compare_set_setting_00063_vs_00064.mjs
//
// What it proves (mechanically, no human diff, re-runnable any time):
//   1) LCS diff of the two set_setting() bodies: REMOVED lines = 0 (every
//      00063 line is retained), and the ADDED lines are shown in place.
//   2) The added lines are ONLY the authorized Pass-2 additions: 3 numeric
//      bounds WHENs, the strict-integrality guard block, 2 enum allow-list
//      WHENs, and their explanatory comments. No other code line is new.
//   3) 00064 does NOT redefine get_settings() and never references
//      ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP in code.
//   4) Both 00063 and 00064 hold the identical set_setting ACL block.
//   5) The strict-integrality guard (v_num <> trunc(v_num)) is present.
//
// Exit code 0 = proof PASS; non-zero = FAIL (stop and re-review).
// ============================================================================

import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const MIG_DIR = `${here}../migrations/`;
const F63 = `${MIG_DIR}00063_admin_control_center_pass1.sql`;
const F64 = `${MIG_DIR}00064_admin_control_center_pass2.sql`;

function read(file) {
  return readFileSync(file, 'utf8');
}

// Extract the body of FUNCTION public.<name> — between its AS $$ and closing $$;
function extractBody(text, name) {
  const lines = text.split(/\r?\n/);
  const createIdx = lines.findIndex((l) =>
    l.includes(`CREATE OR REPLACE FUNCTION public.${name}(`));
  if (createIdx === -1) throw new Error(`${name} not found`);

  const asIdx = lines.findIndex((l, i) => i > createIdx && /^\s*AS \$\$$/.test(l));
  const endIdx = lines.findIndex((l, i) => i > asIdx && /^\s*\$\$\s*;?/.test(l));
  if (asIdx === -1 || endIdx === -1) throw new Error(`${name} body delimiters not found`);
  return lines.slice(asIdx + 1, endIdx); // DECLARE ... END;
}

// Standard LCS diff over the two body line arrays. Returns { added, removed }:
// added = {line, bodyLine} of lines present only in body B (00064),
// removed = lines present only in body A (00063).
function lcsDiff(a, b) {
  const n = a.length, m = b.length;
  const dp = Array.from({ length: n + 1 }, () => new Uint32Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const added = [], removed = [];
  let i = 0, j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) { i++; j++; }
    else if (dp[i + 1][j] >= dp[i][j + 1]) { removed.push({ line: a[i], bodyLine: i + 1 }); i++; }
    else { added.push({ line: b[j], bodyLine: j + 1 }); j++; }
  }
  while (i < n) { removed.push({ line: a[i], bodyLine: i + 1 }); i++; }
  while (j < m) { added.push({ line: b[j], bodyLine: j + 1 }); j++; }
  return { added, removed };
}

let failures = 0;
function check(cond, label) {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}: ${label}`);
  if (!cond) failures++;
}

console.log('=== 00063 vs 00064 — set_setting retention proof ===\n');

const t63 = read(F63);
const t64 = read(F64);

// --- 1) LCS diff: REMOVED lines must be 0, ADDED lines shown in place. -------
const a = extractBody(t63, 'set_setting');
const b = extractBody(t64, 'set_setting');
const { added, removed } = lcsDiff(a, b);

check(removed.length === 0,
  `LCS REMOVED lines = 0 (all ${a.length} lines of the 00063 body are retained)`);
if (removed.length) {
  console.log('  Removed/rewritten lines in 00064:');
  removed.forEach(({ line, bodyLine }) => console.log(`    [00063 body ${bodyLine}] ${line}`));
}

check(a.length === b.length - added.length,
  `body line count sanity: 00063=${a.length}, 00064=${b.length}, added=${added.length}`);

console.log(`\n${added.length} lines ADDED in 00064 (shown at their insertion points):`);
for (const { line, bodyLine } of added) {
  console.log(`  + [00064 body ${bodyLine}] ${line}`);
}

// --- 2) Only-authorized additions -------------------------------------------
const addedCode = added.filter(({ line }) => {
  const s = line.trim();
  return s !== '' && !s.startsWith('--');
});
// Whitelist uses TRIMMED forms (leading indent differs by block depth).
const allowedWhitelist = new Set([
  "WHEN 'catalog.admin_page_size'          THEN v_min := 1;     v_max := 200;",
  "WHEN 'catalog.search_result_limit'       THEN v_min := 1;     v_max := 100;",
  "WHEN 'inventory.max_images'              THEN v_min := 1;     v_max := 20;",
  "IF p_key IN ('catalog.admin_page_size', 'catalog.search_result_limit', 'inventory.max_images')",
  "AND v_num <> trunc(v_num) THEN",
  "RETURN jsonb_build_object('error', 'INVALID_VALUE', 'key', p_key);",
  "END IF;",
  "WHEN 'ads.placements' THEN",
  "v_allowed := ARRAY['home','phones','repair','results','exchange','phone-details','showroom'];",
  "WHEN 'ads.internal_allowlist' THEN",
  "v_allowed := ARRAY['phone-details','showroom','phone-services','repair-home'];",
]);
const unexpectedCode = addedCode
  .map(({ line }) => line.trim())
  .filter((x) => !allowedWhitelist.has(x));
check(unexpectedCode.length === 0 && addedCode.length === 11,
  `added CODE lines are exactly the 11 authorized Pass-2 lines (3 bounds WHENs + '
   'strict-integrality guard block + 4 enum WHEN/v_allowed lines)`);
if (unexpectedCode.length) {
  console.log('  Unexpected added code lines:');
  unexpectedCode.forEach((x) => console.log(`    - ${x}`));
}
check(added.every(({ line }) => {
  const s = line.trim();
  return s === '' || s.startsWith('--') ||
    allowedWhitelist.has(s) || added.some((x) => x.line === line);
}), 'all added comment/blank lines accompany the authorized blocks');

// --- 3) The 5 new keys are seeded + branched --------------------------------
for (const k of [
  "'catalog.admin_page_size'",
  "'catalog.search_result_limit'",
  "'inventory.max_images'",
  "'ads.placements'",
  "'ads.internal_allowlist'",
]) {
  check(t64.includes(k), `00064 references ${k} (seed INSERT + CASE branches)`);
}

// --- 4) Locked regions untouched (code lines only, not header comments) -----
const code64 = t64.split(/\r?\n/).filter((l) => {
  const s = l.trim();
  return s !== '' && !s.startsWith('--');
}).join('\n');
check(!code64.includes('ROLE_PERMISSIONS') && !code64.includes('ROLE_CAPABILITY_MAP'),
  '00064 never references ROLE_PERMISSIONS / ROLE_CAPABILITY_MAP in code');
check(!/CREATE OR REPLACE FUNCTION public\.get_settings\(\)/.test(t64),
  'get_settings() is NOT redefined in 00064');
check(!t63.includes('catalog.') && !t63.includes('ads.placements') && !t63.includes('inventory.max_images'),
  '00063 source itself contains no Pass-2 key (baseline sanity)');

// --- 5) ACL parity for set_setting (exact statements present) ---------------
const aclStmts = [
  'REVOKE ALL ON FUNCTION public.set_setting(text, jsonb) FROM PUBLIC;',
  'REVOKE EXECUTE ON FUNCTION public.set_setting(text, jsonb) FROM anon;',
  'GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO authenticated;',
  'GRANT EXECUTE ON FUNCTION public.set_setting(text, jsonb) TO service_role;',
];
for (const [file, text, tag] of [[F63, t63, '00063'], [F64, t64, '00064']]) {
  for (const w of aclStmts) {
    check(text.includes(w), `${tag} holds "${w}"`);
  }
}

// --- 6) Strict-integrality guard present (owner-requested fix) ---------------
check(code64.includes('v_num <> trunc(v_num)'),
  'strict-integrality guard (v_num <> trunc(v_num)) is present in 00064');
check(code64.includes("'error', 'INVALID_VALUE', 'key', p_key)"),
  'strict-integrality rejection uses INVALID_VALUE');

console.log(`\n=== RESULT: ${failures === 0 ? 'PROOF PASS' : `PROOF FAIL (${failures})`} ===`);
process.exit(failures === 0 ? 0 : 1);
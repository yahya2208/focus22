# CR-00007 — campaigns anon direct-grant remediation (Least-Privilege Hardening)

| الحقل | القيمة |
|---|---|
| Change ID | CR-00007 |
| التاريخ | 2026-08-09 |
| المرجع | Round-2 LIVE evidence (2026-08-09) · `docs/audits/campaigns-hd-remediation-diagnosis.md` · `docs/security/production-security-audit.md` · `CR-00006` |
| التصنيف | Hardening (Least Privilege) — **ليست معالجة تعرّض طارئ** |
| النطاق | `public.campaigns` · grants لـ `anon` فقط |
| الحالة | ⏸ **PENDING APPLY** — بانتظار موافقة مالك بعد مراجعة pre-apply snapshot |
| الجهة المنفذة | `10-CR-00007-pre-apply-snapshot.sql` · `10-CR-00007-campaigns-anon-grant.sql` (APPLY) · `10-CR-00007-rollback.sql` · `10-CR-00007-verify.sql` |
| السياسة الحاكمة | Evidence Before Apply · موافقة صريحة · Rollback · fail-closed |

---

## 1) السبب (Root Cause)

- جدول `campaigns` (عهد P5) يحمل ACL افتراضية من Supabase تُمنح عند إنشاء الجدول: `anon`/`authenticated` لديهما `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE` (مثبّت في Round-2 LIVE evidence).
- **لا تعرّض فعلي**: الأثر المحدِّد هو RLS (`direct grant + RLS ⇒ effective access`). `anon` لا يقرأ أي صف (لا سياسة له)، وقراءة/كتابة `authenticated` محصورة بسياسة `Admins manage campaigns` (`USING is_admin()`).
- الهدف: **إزالة الـ ACL غير الضروري لـ `anon`** كتحصين Least Privilege — لا إعادة فتح لـ LV-3 (يبقى `CLOSED — LIVE VERIFIED` ما لم يُثبت انحدار).

## 2) النموذج (Before / After)

| الدور | Before | After (المعتمد) |
|---|---|---|
| anon | ALL (default ACL، أثر فعلي 0 عبر RLS) | **لا صلاحيات** (REVOKE ALL) |
| authenticated | ALL (default ACL) | **دون تغيير** — إلزامي لنموذج RLS (أدمن عبر `is_admin()`) |
| service_role | ALL | **دون تغيير** |

## 3) SQL — التطبيق (نص حرفي، `10-CR-00007-campaigns-anon-grant.sql`)

```sql
BEGIN;

DO $$ … guards (RLS enabled · Admins policy present · no broad policy ·
      anon HAS privileges (baseline) · authenticated SELECT intact) … $$;

REVOKE ALL ON public.campaigns FROM anon;

COMMIT;
```

- **التغيير الوحيد**: `REVOKE ALL ON public.campaigns FROM anon;`
- **ليس idempotent**: إعادة تشغيله بعد نجاح التطبيق → **ABORT آمن** (الحارس: anon بلا صلاحيات).
- **لا تغيير**: `authenticated` · `service_role` · RLS · RPCs · schema · بيانات · أي جدول آخر. **لا fallback صامت.**

## 4) SQL — التراجع (نص حرفي، `10-CR-00007-rollback.sql`)

```sql
BEGIN;
DO $$ … guard: anon بلا صلاحيات (لا شيء للتراجع) … $$;
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.campaigns TO anon;
COMMIT;
```

- يُعيد بالضبط ACL `anon` السابق حسب pre-apply evidence (بلا GRANT OPTION). **لا تخمين.**

## 5) Pre-Apply Evidence (مطلوب قبل أي APPLY)

شغّل `10-CR-00007-pre-apply-snapshot.sql` (read-only) على LIVE وثبّت الناتج:
- A) `relrowsecurity`/`relforcerowsecurity` لـ `public.campaigns`.
- B) `pg_policies` لـ campaigns (المتوقع: `Admins manage campaigns` فقط).
- C) ACL خام (`aclexplode`) + `role_table_grants` + `has_table_privilege` للـ anon/authenticated/service_role + `rolbypassrls=false` لـ anon.
- D) RPC posture + body (`lookup_campaign_by_short_code`).
- E) QR baseline: `kq7Iej` → صف واحد (كود فعّال)؛ `ZZZZZZ` → 0 صفوف.
- F) قراءة مباشرة من anon → 0 صفوف (RLS سليمة).

**مصدر داعم (فحص المالك على LIVE — موثّق 2026-08-09):** `columns_verdict=ALL_COLUMNS_PRESENT` · `rls_verdict=POSTURE_UNCHANGED` · `rpc_verdict=RPC_INTACT` · `anon.rolbypassrls=false` · `anon_direct_rows=0` · `lookup_campaign_by_short_code('kq7Iej')` تحت anon تعيد الحملة الصحيحة · `anon` لديه ACL واسعة (SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE) غير مطلوبة لمسار QR العام.

## 6) Post-Apply Verification (بعد APPLY — `10-CR-00007-verify.sql`)

| Check | متوقع |
|---|---|
| anon grants | كلها FALSE (7 امتيازات) |
| authenticated grants | كاملة (SELECT/INSERT/UPDATE/DELETE) — CRUD الأدمن سليم |
| service_role | دون تغيير |
| RLS | `relrowsecurity=true` · سياسة واحدة `Admins manage campaigns` |
| RPC | `RPC_INTACT` + anon lookup لكود فعّال → صف واحد + كود غير صالح → 0 |
| anon direct read | 0 صفوف (مطابق قبل/بعد) |

## 7) Regression Gates (أُجريت محلياً — لا تغيير في كود التطبيق)

```text
TypeScript   PASS (tsc --noEmit exit 0)
ESLint       PASS (0 errors; 5195 baseline warnings — دون تغيير)
Tests        PASS (118 files / 1159 tests)
Build        PASS (vite build OK)
```

+ Security sweep (static): صفر `.from('campaigns')` خارج `campaign-service.ts` (Research Console فقط) · صفر `.from('qr_codes'|placements|placement_history|analytics_events')` · `.rpc()` عند `lookup_campaign_by_short_code` + `has_super_admin` فقط · لا attribution/telemetry/localStorage في QR runtime · عميل Supabase يستخدم ANON key فقط.

## 8) حدود النطاق (لا يُلمس)

`authenticated` grants · `service_role` · RLS policies · RPCs · campaigns schema · qr_codes · placements · placement_history · analytics_events · sessions/users/devices/ads/inventory/catalog/repair · `/c/<SHORT_CODE>` · 404.html · Phase B QR parser · Phase 2.3 ownership · CR-00005 · LV-3 · P7-01..03.

## 9) حالة ما بعد الإغلاق (المتوقع)

`CR-00007 → CLOSED — LIVE VERIFIED` بعد: pre-apply snapshot موثّق + موافقة مالك + APPLY + post-apply verify + admin/public regressions على LIVE. **لا تُعلن CLOSED بدون أدلة LIVE بعد التطبيق.**

> **HARD STOP**: لا commit/push/tag/deploy ولا APPLY قبل موافقة المالك الصريحة بعد مراجعة pre-apply evidence.

# Gate 05 — `catalog_create_model` RPC · Final Report

| البند | القيمة |
|---|---|
| Gate ID | **GATE 05** — Catalog Central: `public.catalog_create_model` RPC + `catalog_model_id` slugify fix + guarded cleanup + ACL hardening |
| المشروع | Supabase `fmggysdqigtejxbfpgtg` · run as `postgres` (SQL Editor) |
| النطاق | `public.catalog_create_model(text,text,text,integer,text[],text[])` — OID 19103 · SECURITY DEFINER · owner `postgres` · single overload |
| **الحالة** | ✅ **GATE 05 CLOSED — PASS (10/10)** |
| التاريخ | 2026-08-13 |
| القرار | لا تبدأ أي Phase/Gate/إصلاح لاحق، ولا أي reconciliation لـ Golden Catalog (3004 → 866) حتى قرار المالك |

---

## 1) Objective

إتاحة إنشاء طراز (model) واحد للكتالوج عبر RPC أدمن-فقط، بهوية `canonical_id` مطابقة تمامًا لقاعدة TypeScript، مع حماية:

- `anon` لا يملك EXECUTE (تم إغلاقها).
- `authenticated` يملك EXECUTE فقط مع حراسة `is_admin()` داخل الدالة.
- البيانات/الملفات: كتالوج 866 طراز، Inventory 17 عنصرًا، كل شيء بدون تغيير.

---

## 2) What was applied (تنفيذ فعلي، بالترتيب)

| الملف | النطاق/الأثر |
|---|---|
| `supabase/catalog-central/05-catalog-create-model-rpc-apply.sql` | Guard additivity (لا توجد دالة سابقة) + `CREATE OR REPLACE FUNCTION catalog_create_model(...)` SECURITY DEFINER + `catalog_model_id(text,text)` + `REVOKE ALL FROM PUBLIC` + `GRANT EXECUTE TO authenticated` |
| `supabase/catalog-central/06-catalog-create-model-id-fix-apply.sql` | إصلاح slugify في `catalog_model_id()` ليطابق القاعدة TS حرفيًا (lowercase أولًا ثم regex؛ NFKD no-op على نص ASCII). الخطأ السابق: regex قبل lower → `'Galaxy Z Test' → 'alaxy-est'`؛ الـ mismatches انخفضت من 862 إلى 0 |
| `supabase/catalog-central/07-catalog-create-model-id-fix-cleanup.sql` | حذف محروس fail-closed لصفّي الاختبار الشارد فقط: `samsung-alaxy-est` و`samsung-alaxy-2-est` — أي انحراف = إجهاض بدون حذف |
| `supabase/catalog-central/09-catalog-create-model-rpc-acl-fix.sql` | صلاحيات فقط على الدالة: `REVOKE ALL FROM PUBLIC` · `REVOKE EXECUTE FROM anon` · `GRANT EXECUTE TO authenticated` |

**أدوات فحص (للتوثيق):** `08-catalog-acl-diagnose-readonly.sql` (قراءة فقط) لتشخيص ACL · `05-catalog-create-model-rpc-verify-v2.sql` للتحقق النهائي (10/10).

---

## 3) The blocker — anon EXECUTE — root cause (مثبتة بالأدلة)

**الحالة الحية قبل الإصلاح (OID 19103):**

```
proacl = {postgres=X/postgres, anon=X/postgres, authenticated=X/postgres, service_role=X/postgres}
anon_execute = true (مطلوب false) · authenticated = true (صحيح) · public = false · service_role = true · postgres = true
```

**المصدر:** لم يصدر هذا الـ grant من أي ملف في المستودع (بحث شامل: لا `GRANT ... TO anon` على الدالة في `supabase/migrations/` ولا `security-hardening/` ولا `catalog-central/`، ولا `ALTER DEFAULT PRIVILEGES` ولا `ON ALL FUNCTIONS` في أي مكان). المصدر هو **Supabase default privileges على مستوى المنصة**: تُمنح EXECUTE تلقائيًا لـ `anon`/`authenticated`/`service_role` لأي دالة جديدة في schema `public` عند إنشائها.

**لماذا فشل REVOKE FROM PUBLIC:** `05-apply` (سطرا 140-141) نفّذ `REVOKE ALL FROM PUBLIC` + `GRANT TO authenticated` فقط. وREVOKE FROM PUBLIC لا يزيل إدخالًا صريحًا `anon=X` — فيبقى anon بصلاحية EXECUTE. نفس الظاهرة شُخّصت وعولجت سابقًا لـ `get_campaign_qr_metrics(uuid)` في:

- `supabase/qr-measurement/01-campaign-qr-metrics-apply.sql:371-376`
- `supabase/qr-measurement/04-campaign-qr-metrics-acl-live-fix.sql`

**الإصلاح:** ملف `09` — صلاحيات فقط على التوقيع الدقيق: إزالة `anon=X` والحفاظ على `service_role`/`postgres` كما هما.

**الحالة بعد الإصلاح (نتيجة صفوف الـ5):**

```
anon=false · authenticated=true · public=false · service_role=true · postgres=true
```

---

## 4) Verification — Gate 05 v2 (10/10 PASS)

| # | الاختبار | النتيجة |
|---|---|---|
| 1 | `identity_all_866` | ✅ PASS — `identity_mismatches=0` (866/866) |
| 2 | `overrides_1to1` | ✅ PASS — o13/o14/o15/o16 = true (4/4) |
| 3 | `acl_grants` | ✅ PASS — `anon=false` · `authenticated=true` |
| 4 | `no_auth_forbidden` | ✅ PASS — `42501` (insufficient_privilege) |
| 5 | `admin_create` | ✅ PASS — `samsung-galaxy-z-test` / `active` |
| 6 | `duplicate_collision` | ✅ PASS — `23505` (unique_violation) |
| 7 | `canonical_collision` | ✅ PASS — `23505` |
| 8 | `metadata_create` | ✅ PASS — `samsung-galaxy-z2-test` / `Z` / `2026` |
| 9 | `cleanup` | ✅ PASS — صفوف الاختبار المؤقتة أُزيلت (remaining=0) |
| 10 | `final_baselines` | ✅ PASS — models=**866** · inventory=**17** · fp=`1c5d9b8a117a93f03335e7296abddec1` |

**الحكم: Gate 05 مغلق — PASS 10/10.**

---

## 5) Scope discipline (ما لم يمسّه هذا الـ Gate)

- ❌ لا تغيير على منطق `catalog_create_model` (body unchanged).
- ❌ لا تغيير على بيانات الكتالوج (866 intact) — فقط الصفان الشارّدان خلف guard صارم (07).
- ❌ لا تغيير على Inventory (17 + fingerprint ثابت).
- ❌ لا تغيير على RLS / Golden Catalog / GATE 4 / أي RPC آخر.
- ✅ التعديل الوحيد على منطق داخل نطاق الـ Gate: إصلاح slugify في `catalog_model_id()` (06).
- ✅ كائن جديد للنطاق فقط: `public.catalog_gate05_verify()` (حارس اختبار؛ إزالة اختيارية لاحقًا بـ `DROP FUNCTION`).

---

## 6) Final state & artifacts

- `catalog_create_model` ACL نهائي: `anon=false` · `authenticated=true` · `public=false` · `service_role=true` · `postgres=true`.
- الملفات في `supabase/catalog-central/`: `05-apply` · `05-rollback` · `05-verify` · `05-verify-v2` · `06-apply` · `07-cleanup` · `08-acl-diagnose-readonly` · `09-acl-fix`.
- لم يتم أي commit (بانتظار قرار المالك).

---

## 7) Decision boundary — HARD STOP

تنتهي المرحلة عند هذا الحد. **لا تبدأ** أي مرحلة/بوابة/إصلاح لاحق، **ولا** أي reconciliation لـ Golden Catalog **3004 → 866**، إلا بقرار صريح من المالك.

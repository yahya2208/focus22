# CR-00006 — LV-3 · campaigns read RLS hardening (Release Blocker)

| الحقل | القيمة |
|---|---|
| Change ID | CR-00006 |
| التاريخ | 2026-08-09 |
| المرجع | `docs/security/production-security-audit.md` (LV-3) · `docs/security/remediation-roadmap.md` (Phase 1 item 3 / LV-3 · Blocked by Schema) · `supabase/security-hardening/phase1/03-LV3-campaigns-schema-gap.md` · Final Release Inventory (2026-08-09) |
| التصنيف | إصلاح أمني — **Release Blocker** (data exposure عبر قراءة عريضة) |
| النهج المعتمد | **Role-Based / Admin-only read** — قرار مالك صريح. **Phase 2.3 (ownership model / `user_id`) تبقى FROZEN.** |
| الحالة | ⏸ **PENDING APPLY** — الملفات الأربعة كُتبت (Phase A)؛ بانتظار مطابقة baseline على LIVE ثم التنفيذ + التحقق |
| الجهة المنفذة | سكربت التطبيق `09-LV3-campaigns-read-rls.sql` · التراجع `…-rollback.sql` · التحقق `…-verify.sql` |
| السياسة الحاكمة | `docs/security/operations/change-management.md` — Evidence Before Apply · موافقة صريحة · Rollback · لا `set_config(..., false)` |

---

## 1) السبب الجذري (Root Cause)

- `campaigns` في LIVE DB عليها سياستان (snapshot معتمد: `production-security-audit.md:233` + `CR-004:55-56`):
  - `Admins manage campaigns` — **ALL** · TO authenticated · `USING is_admin()` → الكتابة محصورة بأدمن (سليمة، **لا تُمس**).
  - `Authenticated read campaigns` — **SELECT** · TO authenticated · `USING auth.role()='authenticated'` **بلا قيد صف** → **أي مستخدم مسجّل (user/guest/researcher) يقرأ كل الحملات** بما فيها `budget`/`notes`/`material`/معلومات القناة — **LV-3، كشف تجاري**.
- RLS مفعّلة على الجدول (F-03 `ALL_RLS_PROTECTED`) لكن السياسة نفسها عريضة — التمكين وحده لا يمنع.
- لا عمود ملكية قابل للاستخدام: لا `user_id`/`owner_id` (UUID)؛ `created_by`/`last_edited_by` **TEXT وNULL لجميع الصفوف** → لا يمكن بناء سياسة Owner Scope.

## 2) النموذج الأمني (Before / After)

| الدور | Before | After (المعتمد) |
|---|---|---|
| anon | 0 (بلا جلسة) | 0 — دون تغيير |
| user | **كل الحملات** | **0** |
| guest | **كل الحملات** | **0** |
| researcher | **كل الحملات** | **0** — مطابق لـ `ROLE_CAPABILITY_MAP` (analyst محروم) |
| admin | كل الحملات | كامل — عبر `Admins manage campaigns` |
| super_admin | كل الحملات | كامل — عبر `Admins manage campaigns` |

- المبدأ: **Least Privilege** + محاذاة تامة مع ADR-001 A7 (`admin→research_admin`، `super_admin` فقط لديهم capability قراءة `campaigns`).
- لا تُستخدم `is_research_role()` هنا عمداً (ستمنح researcher/analyst امتيازاً غير مستخدم — يرفضه التطبيق).

## 3) مبررات عدم فتح Phase 2.3

- لا Runtime consumer يقرأ جدول `campaigns` مباشرة (grep: صفر `from('campaigns')` في src).
- لا ownership model صالح حاليًا؛ `created_by` غير صالح.
- QR يستخدم `lookup_campaign_by_short_code` بمخرجات محدودة (SECURITY DEFINER) — لا يمرّ عبر RLS الجدول.
- Least Privilege يتحقق كاملاً بإزالة القراءة العامة للمصادقين — **دون أي تغيير schema أو backfill**.
- إضافة `user_id` + backfill تبقى في **Phase 2.3 مجمّدة** (خارج نطاق هذا CR).

## 4) SQL — التطبيق (نص حرفي، `09-LV3-campaigns-read-rls.sql`)

```sql
BEGIN;

DO $$
DECLARE
  v_read  TEXT;
  v_admin TEXT;
  v_rls   BOOLEAN;
BEGIN
  SELECT policyname INTO v_read
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Authenticated read campaigns';

  SELECT policyname INTO v_admin
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Admins manage campaigns';

  SELECT relrowsecurity INTO v_rls
  FROM pg_class
  WHERE oid = 'public.campaigns'::regclass;

  IF v_read IS NULL THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — "Authenticated read campaigns" is missing on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;

  IF v_admin IS NULL THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — "Admins manage campaigns" is missing on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;

  IF v_rls IS DISTINCT FROM true THEN
    RAISE EXCEPTION 'ABORT: baseline mismatch — RLS is not enabled on public.campaigns; state differs from CR-00006 baseline. No change applied.';
  END IF;
END $$;

DROP POLICY "Authenticated read campaigns" ON public.campaigns;

COMMIT;

SELECT tablename, policyname, cmd, roles, qual
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'campaigns'
ORDER BY policyname;
```

- **التغيير الوحيد**: `DROP POLICY "Authenticated read campaigns" ON public.campaigns;`
- **ليس idempotent**: مصمّم كـ **baseline-guarded / fail-closed / single-application**. إعادة تشغيله بعد نجاح التطبيق → **ABORT آمن** لأن baseline لم يعد مطابقاً (السياسة غائبة).
- **لا تغيير**: `Admins manage campaigns` · RPCs · schema · بيانات · أي جدول آخر. **لا fallback صامت.**

## 5) SQL — التراجع (نص حرفي، `09-LV3-campaigns-read-rls-rollback.sql`)

```sql
BEGIN;

DO $$
DECLARE
  v_read TEXT;
BEGIN
  SELECT policyname INTO v_read
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename  = 'campaigns'
    AND policyname = 'Authenticated read campaigns';

  IF v_read IS NOT NULL THEN
    RAISE EXCEPTION 'ABORT: "Authenticated read campaigns" already exists on public.campaigns; nothing to roll back.';
  END IF;
END $$;

CREATE POLICY "Authenticated read campaigns" ON public.campaigns
  FOR SELECT TO authenticated
  USING (auth.role() = 'authenticated');

COMMIT;
```

## 6) أثر الصفوف والبيانات

- **0 صفوف بيانات** — تغيير سياسة RLS فقط (DDL على pg_policies). لا backfill، لا migrate، لا ترحيل، لا أعمدة.

## 7) خطة التحقق (قراءة فقط — `09-LV3-campaigns-read-rls-verify.sql`)

### Before Apply (إلزامي، يُثبَت على LIVE)
1. `Authenticated read campaigns` موجودة. 2. `Admins manage campaigns` موجودة. 3. RLS مفعّلة على campaigns. 4. الـ exact definitions (cmd/roles/qual/with_check) عبر Section A.
- **أي اختلاف عن baseline → HARD STOP** (لا تطبيق).

### After Apply (على LIVE — إثبات فعلي لا استنتاج)
| Probe | متوقع |
|---|---|
| anon `count(*)` | 0 |
| user | 0 |
| guest | 0 |
| researcher | 0 |
| admin | = `campaigns_total` |
| super_admin | = `campaigns_total` |
| Policy snapshot | `Authenticated read campaigns` غائبة؛ `Admins manage campaigns` كما هي (دون تغيير) |
| QR: `lookup_campaign_by_short_code(<short_code فعّال>)` بدور anon | يعيد id/short_code/name/is_active — **لا كسر QR** |
| Write regression (admin/super_admin، صف واحد `SET id=id` + ROLLBACK) | يمر (نفس الأدمن) — لا تغيير بيانات دائم |

## 8) Regression Gates (بعد نجاح DB verification)

```text
TypeScript      PASS
ESLint          PASS
Tests           PASS
Build           PASS
```
+ اختبارات مركزة: Auth · RBAC · permissions · campaigns · QR · Research · P6 · P7 · privacy. (لا تغيير src — الهدف إثبات عدم الانحدار.)

## 9) FINAL EVIDENCE — Definition of Done (لهذا CR)

```text
CR-00006
Status: CLOSED — LIVE VERIFIED
```
1. Before policy snapshot · 2. Applied SQL · 3. After policy snapshot · 4. user = 0 · 5. guest = 0 · 6. researcher = 0 · 7. admin = expected access · 8. super_admin = expected access · 9. QR RPC regression PASS · 10. campaign admin write regression PASS · 11. TypeScript PASS · 12. ESLint PASS · 13. Tests PASS · 14. Build PASS.

## 10) Check-list إدارة التغيير

**Pre-Apply (2.1):** [x] CR-### مسجل (هذه الوثيقة) · [x] السبب بالأدلة · [x] SQL Preview كامل أعلاه · [x] الصفوف المتوقعة = 0 · [x] الصفوف المتأثرة = 0 · [ ] snapshot baseline فعلي على LIVE (Section A) · [x] خطة Rollback · [x] موافقة مالك صريحة · [ ] Checklist القسم 7 Before-Apply مُثبَت.

**Post-Apply (2.2):** [ ] row_count فعلي = 0 · [ ] مقارنة Before/After (Section A) · [ ] تحقق سلامة · [ ] لا آثار جانبية.

## 11) حدود النطاق (لا يُلمس في هذا CR)

CR-00005 · E-9 · Repair System · Inventory · Ads · Catalog المؤجل · QR Schema (ما عدا حملة القراءة محل LV-3) · DV-1..DV-9 · CV-2 · CV-4 · CV-7/CV-8 · LV-5 · CR-004.3 · Headers · F-07 · F-10 · Phases 2/3/4 · **Phase 2.3 ownership — FROZEN**.

## 12) الحالة بعد الإغلاق (المتوقع)

`LV-3 → CLOSED / LIVE VERIFIED` مع بقاء `F-03 → CLOSED / LIVE VERIFIED` و`F-09 → CLOSED / LIVE ABSENCE VERIFIED`. ثم تُفتح **FINAL CAMPAIGN + QR RUNTIME READINESS AUDIT** (وظيفي — منفصل عن closure الأمني).

> **HARD STOP**: لا Commit / Push / Tag / Deploy — التقرير النهائي يُسلَّم أولاً للمراجعة.

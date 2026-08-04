# C3 — Privilege Audit (تقرير مستقل)

| الحقل | القيمة |
|---|---|
| المراجعة | C3 · Privilege Audit |
| الأولوية | 🔴 قصوى (صلاحيات زائدة = سطح هجوم مباشر) |
| الأداة | `supabase/security-hardening/phase-c/C3-privilege-audit.sql` (قراءة خالصة · Result Set واحد) |
| الحالة | 🟡 **تحت الإغلاق** — CR-004.1/CR-004.2 منفَّذان PASS (أدلة القسم 3)، بانتظار إعادة تشغيل الأداة لتوثيق C3.1–C3.8 وقرار CR-004.3 (C3.4) ثم الإغلاق |
| المرجع | `docs/security/phase-c/README.md` · `change-management.md` |

## 1) الهدف

مراجعة حدود الصلاحيات: الأدوار (Roles) · Schema privileges · Table privileges ·
Function EXECUTE · Sequences · Views · Extensions · وضع RLS على جداول `public` ·
**وسياسات RLS نفسها (Policies)**.

## 2) معايير القبول

- [ ] لا دور غير `postgres`/`service_role` بصلاحيات superuser/bypassrls غير مبرَّرة (C3.1).
- [ ] لا منح CREATE على أي مخطط لـ anon/authenticated؛ وUSAGE على `public` فقط حيث يلزم (C3.2).
- [ ] أي جدول قابل للوصول من anon/authenticated إمّا بمستوى مبرَّر (قراءة/كتابة مقصودة) أو عليه RLS مفعّل (C3.3 + C3.8).
- [ ] دوال `public` القابلة للتنفيذ من anon/authenticated كلها مبرَّرة (C3.4 — يطابق C1.7).
- [ ] لا sequence مكشوفة لـ anon/authenticated (C3.5).
- [ ] أي view مقروء من anon/authenticated مبرَّر (C3.6).
- [ ] الإضافات المثبتة (extensions) معروفة وضرورية وبتفويضها الصحيح (C3.7).
- [ ] كل جدول `public` له RLS مفعّل ما لم يُبرَّر خلافه (C3.8).
- [ ] سياسات RLS (C3.9): كل سياسة موجَّهة للأدوار الصحيحة، بـ USING/WITH CHECK سليمين، ولا توجد فجوة (جدول RLS بلا سياسات لمفرداته أو سياسة ALL مفرطة).

## 3) الأدلة (تُلصق النتائج الفعلية — لا الادعاءات)

> نفِّذ `C3-privilege-audit.sql` في SQL Editor وألصق **الصف الواحد** الناتج
> (عمود `audit_result`: JSON يُظهر C3.1 → C3.8). كل قرار إغلاق يُبنى على هذه النتائج.

### أدلة C3.9 (سياسات RLS — من `C3b-policy-snapshot.sql` قبل/بعد CR-004)

- **قبل (مرجعية الحالة السيئة):** 11 سياسة موجهة للعموم رغم أسماء تسجيلية
  (Authenticated/Admins/Users) + سياسة `Bootstrap insert first user` على
  `public.users` موجهة للعموم → **NOT PASS**.
- **بعد (بعد تنفيذ CR-004):** السياسات الـ 11 على الصلاحية العامة أصبحت على
  صلاحية المسجل (authenticated) عبر `ALTER POLICY`، وسياسة التمهيد محذوفة.
  **لا توجد** سياسة عامة باسمها يوحي بالتسجيل.
- **خط الأساس الوظيفي:** لم تُسجَّل نتائج الاختبارات الوظيفية قبل التنفيذ
  صراحةً — تُعاد الآن بعد التنفيذ للمقارنة.

## 4) النتائج (Findings)

| C3.x | الملاحظة | المستوى (حرج/متوسط/منخفض/معلوماتي) | القرار |
|---|---|---|---|
| C3.1 | الأدوار: لا superuser إلا `supabase_admin` (أداري). `bypassrls=true` على postgres/service_role/supabase_etl_admin/supabase_read_only_user (أدوار Supabase مدارة). `anon`/`authenticated` = `bypassrls=false` | معلوماتي | ✅ مقبول |
| C3.2 | مخططات: USAGE لـ anon/authenticated على المخططات القياسية (قياسي Supabase)، **لا** CREATE لأي مخطط | معلوماتي | ✅ مقبول |
| C3.3 | جداول `public` كلها RLS مفعّل. `realtime.subscription` بلا RLS (Supabase داخلي). جداول storage مدارة من Supabase | معلوماتي | ✅ مقبول |
| C3.4 | دوال `SECURITY DEFINER` المكشوفة (anon/authenticated): app_role · is_admin · is_research_role · has_super_admin · lookup_campaign_by_short_code · increment_qr_counter — **كلها مُبرَّرة** في C1 (ADRs) وCR-003 أصلح `search_path` للثلاث التي كانت بلا search_path. يتبقى **increment_qr_counter** (مكشوفة للعموم) معلَّقة بقرار تدفق QR | متوسط | 🟡 **CR-004.3 معلّق** (قرار QR flow — خيار من الثلاثة) |
| C3.5 | sequences: `realtime.subscription_id_seq` بلا select/update، USAGE فقط (يلزم realtime) | معلوماتي | ✅ مقبول |
| C3.6 | views: `pg_stat_statements(_info)` قابلة للقراءة — قياسي Supabase (إحصاءات أداء) | معلوماتي | ✅ مقبول |
| C3.7 | الإضافات: pg_stat_statements · pgcrypto · plpgsql · supabase_vault · uuid-ossp — قياسية/ضرورية | معلوماتي | ✅ مقبول |
| C3.8 | كل جداول `public`: `rls=true` · `force=false` · `owner=postgres` | معلوماتي | ✅ مقبول |
| C3.9 | سياسات RLS: 12 سياسة موجهة للعموم (11 باسم تسجيلي + 1 تمهيد) — **مُعالَجة عبر CR-004** (ALTER POLICY → authenticated + حذف سياسة التمهيد). الـ after-snapshot: 25 سياسة كلها roles=authenticated، permissive، USING/WITH CHECK سليمة | حرج | ✅ مُعالَج (CR-004 PASS) — لا سياسة عامة باسم تسجيلي |

## 5) قرار الإغلاق (مستقل)

- [ ] ✅ **مُغلقة** — كل معايير القبول محققة بالأدلة.
- [ ] 🟡 **مفتوحة** — تُسجَّل النتائج وتُعالج عبر CR مستقل.

**الحالة:** C3.1–C3.3 وC3.5–C3.9 = ✅ مقبولة بالأدلة (نفِّذت `C3-privilege-audit.sql`
ونتيجة JSON C3.1→C3.9 موثقة). **عائق الإغلاق الوحيد:** C3.4 ← قرار **CR-004.3**
(مصير تعرّض `increment_qr_counter` للعموم في تدفق QR) — يُغلق C3 فور اتخاذه.

التاريخ: ________ · الموقّع: ________

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-04 | إنشاء الأداة (قراءة خالصة · Result Set واحد) + القالب — بعد إغلاق C2 |
| 2026-08-04 | C3.9: رصد 12 سياسة عامة عبر C3b → **NOT PASS** → CR-004 (المحوران 1 و2) |
| 2026-08-04 | تنفيذ CR-004 PASS (شبكة cr004_evidence) + after-snapshot: 11 سياسة = authenticated، سياسة التمهيد محذوفة → توثيق C3.9 كمعالَج |
| 2026-08-04 | CR-004.3 (increment_qr_counter) **مؤجَّل** بقرار QR flow — يربط بمعيار C3.4 |
| 2026-08-04 | تنفيذ `C3-privilege-audit.sql` (نتيجة C3.1→C3.9 موثقة): C3.1–C3.3 وC3.5–C3.9 ✅ مقبولة · C3.4 🟡 بانتظار CR-004.3 → C3 **بانتظار قرار QR flow للإغلاق** |

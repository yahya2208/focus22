# Phase 1 — Production Emergency Hardening (Workspace)

**المرجع:** `docs/security/remediation-roadmap.md` (Baseline v2.1 · Gate 1) · **الأدلة:** `docs/security/production-security-audit.md` (v4.0)

> **سياسة التنفيذ:** كل بند على PR مستقل، يُنفَّذ عبر SQL Editor بصلاحيات owner، وكل تغيير يسبقه/يتبعه توثيق قبل/بعد. **لا يُطبَّق على Production إلا بعد مراجعة.**
>
> **قاعدة التأجيل (قرار المستخدم 2026-08-02):** لا يُؤجَّل إصلاح من Phase 1 إلى Phase 2 تلقائياً. يُنفَّذ في Phase 1 **كل ما لا يعتمد على قرار معماري** (توزيع أدوار / شكل طبقة التفويض). يُؤجَّل فقط ما يرتبط فعلياً بتلك القرارات:
> - الحارس الداخلي للدوال الإدارية (طبقة التفويض المعتمدة) — Phase 2.
> - توسعة قراءة أدوار إضافية (باحث/أدمن على بيانات الآخرين) — Phase 2.
> - Rate Limit / Quota لمنصة `analytics_events` (اختيار منصة/قيم) — Phase 2.
>
> **نتيجة الفحص (2026-08-02):** حصر القراءة بالمِلكية (`auth.uid() = …`)، ربط `sessions.user_id`، إزالة UPDATE العريض على `qr_codes`، وقيد INSERT على `analytics_events` — كلها **مستقلة عن التصميم** وتُنفَّذ الآن (بنود 2-5 أدناه).

## مانيفست التنفيذ (Files to Execute — بالترتيب)

> **قاعدة من اليوم فصاعداً:** تُعرض قائمة الملفات القابلة للتنفيذ بالترتيب مع حالتها قبل أي تنفيذ. لا يُنفَّذ على Production إلا الملفات بحالة `✅ جاهز`، وكل ملف يُغلق بدورة (Review → Apply → Verify → Document → Close → Commit).

| # | الملف | الغرض | LV | الحالة |
|---|---|---|---|---|
| 1 | `01-LV9-revoke-admin-rpc-execute.sql` | REVOKE EXECUTE عن `admin_promote_user` من anon/authenticated/PUBLIC | LV-9 | ✅ **مُغلق بالكامل** (2026-08-02) — ملتزم `d2c1ce7` |
| 2 | `02-LV1-LV2-LV4-owner-read-policies.sql` | حصر قراءة users/sessions/analytics_events + devices/calibrations/surveys: ملكية + قراءة كل مربوطة بالدور + تقييد جلسات الضيف | LV-1/2/4 + §III.0 4-6 | ✅ **مُغلق بالكامل** (2026-08-02) — Runtime evidence: A/B لا يقرؤان صفوف بعضهما (`[]`) |
| 3 | `03-LV3-campaigns-schema-gap.md` | **Blocked by schema** — لا عمود ملكية فعّال (created_by NULL) | LV-3 | 📝 موثّق — يُحسم في Phase 2 |
| 4 | `04-handle-new-user-force-guest.sql` | تجاهل دور العميل في `handle_new_user` → فرض `guest` دائماً (يقفل NR-1 P0) | NR-1 (P0) | ✅ **مُغلق بالكامل** (2026-08-02) — إثبات حي: signup بـ`role:"super_admin"` → `users.role='guest'` |
| 5 | `05-bootstrap-super-admin-revoke-execute.sql` | REVOKE EXECUTE عن `bootstrap_super_admin` من anon/authenticated/PUBLIC | §III.0 | ✅ **مُغلق بالكامل** (2026-08-02) — probe: `42501 permission denied` |
| 6 | `06-LV10-sessions-insert-ownership.sql` | إسقاط `Authenticated insert sessions` (بلا فحص ملكية) → لا تُتبقى سوى `Users manage own sessions` (`WITH CHECK auth.uid()=user_id`) | LV-10 | ✅ **مُغلق بالكامل** (2026-08-02) — Probe حي: قبل `rows_inserted=1` (متقاطع ينجح) · بعد `42501 new row violates row-level security policy` |
| 7 | `07-LV11-qr-codes-remove-broad-update.sql` | إسقاط `Anyone can update qr scan counts` (USING/WITH CHECK true) → لا يبقى سوى `Admins manage qr codes` (أدمن) + RPC الآمن | LV-11 | ✅ **مُغلق بالكامل** (2026-08-02) — Probe حي: anon UPDATE قبل `true` · بعد `false` (0 صفوف) |
| 8 | `08-LV5-analytics-insert-ownership.sql` | قيد INSERT analytics_events بالمِلكية: إسقاط `Anyone can insert analytics events` + `Authenticated users insert own analytics events` (`TO authenticated`، `WITH CHECK (user_id IS NULL OR user_id=auth.uid())`) — يبقي تليمتري NULL (Rate Limit = Phase 2) | LV-5 | ✅ **مُغلق بالكامل** (2026-08-02) — Probe حي (transaction+rollback): بعد الإسقاط anon `42501` · ملكية مسموح · NULL مسموح · عابر `42501`؛ أنفذ الإسقاط مرتين (الأولى لم تُسقط العريضة فعلياً — درس جرد pg_policies) |
| 9 | (تحقق) | تشغيل proacl/pg_policies/Probe بعد كل بند | — | ✅ **نُفِّذ — Baseline Verification PASS** (2026-08-02) — انظر قسم التحقق النهائي |

> **Methodological Note (2026-08-02):** Every production policy change is accepted **only** after a complete *Before → Apply → Diagnostic After* cycle. Intermediate contradictory observations are treated as **inconclusive** until resolved with diagnostic evidence (e.g., LV-11: an `anon_update_succeeded=true` right after the DROP was resolved via a consolidated diagnostic row `anon · rls_on=true · bypass=false · update_policy_count=0` → `false`; the earlier value was a SQL Editor execution-order artifact, documented rather than ignored).

## مراجعة الدوال الإدارية — أول بند في مراجعة بند 2 (لا تغيير الآن)

> قرار المستخدم 2026-08-02: لا نغيّر `bootstrap_super_admin` / `has_super_admin` / `handle_new_user` الآن، لكن نراجع وظيفة كل دالة أولاً لتصنيفها (Trigger-only / RLS-only / RPC-callable) قبل أي قرار منح مستقبلي. ما زالت جميعها تمنح EXECUTE لـ anon/authenticated/PUBLIC (ثابت من Step B).

**استعلام التصنيف (نفّذه في SQL Editor):**
```sql
select p.proname,
       p.prorettype::regtype as return_type,
       pg_get_function_arguments(p.oid) as args,
       pg_get_functiondef(p.oid) as definition
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('bootstrap_super_admin','has_super_admin','handle_new_user')
order by p.proname;
```

**معايير التصنيف الأولية (تُؤكَّد من التعريف الفعلي):**
| الدالة | الاستخدام المتوقع | النتيجة المرشحة |
|---|---|---|
| `handle_new_user` | Trigger-only بتصميمها؛ التدقيق أظهر **عدم وجود triggers** مربوط (DV-10) | لا تحتاج EXECUTE من عميل → **مرشحة للـ REVOKE** |
| `has_super_admin` | تُستدعى من RLS (`Bootstrap insert first user` with_check) | **تحذير:** REVOKE من anon/authenticated قد يكسر سياسة bootstrap (سياسة RLS تنفَّذ بصلاحيات المتصل) → تُبقي على منحها كاستثناء موثّق أو تُعاد هندستها في Phase 2 |
| `bootstrap_super_admin` | RPC عام قابل للاستدعاء، حارس super_admin (NR-2) | الأخطر → **مرشحة للـ REVOKE** (بمرآة LV-9) |

**الأدلة المؤكدة (pg_get_functiondef — 2026-08-02):**
- `bootstrap_super_admin(uuid)` → `RETURNS void`, `SECURITY DEFINER`: `IF public.has_super_admin() ... UPDATE users SET role='super_admin'` — **يغيِّر الصلاحيات بصلاحيات المالك، بلا أي فحص لهوية/دور المتصل** (يعتمد فقط على `has_super_admin()` — ليس Authorization). 🔴
- `handle_new_user()` → `RETURNS trigger`, `SECURITY DEFINER`: INSERT إلى users من `NEW.*` — **دالة Trigger لا تُصمَّم للاستدعاء من REST/RPC**.
- `has_super_admin()` → `RETURNS boolean`, `STABLE SECURITY DEFINER`: `SELECT exists(...)` — **دالة مساعدة خادعة**: استخدامها داخل RLS يجعل REVOKE قراراً خطيراً.

**جدول القرار الحالي (Evidence over Interpretation):**
| Function | النوع | Client callable | مستخدمة في RLS | مستخدمة في Trigger | القرار |
|---|---|---|---|---|---|
| `bootstrap_super_admin` | RPC | ⏳ غير مثبت بعد | لا | لا | 🔴 مراجعة أمنية إلزامية قبل أي قرار |
| `handle_new_user` | Trigger | لا (تصميماً) | لا | ⏳ يُثبت بالاستعلام 1 | 🟢 مرشحة REVOKE إن تأكد عدم وجود Trigger |
| `has_super_admin` | Helper | نعم (عن طريق RLS/Policies) | ✅ **مثبت** (`Bootstrap insert first user`) | لا | 🟡 مؤجلة حتى فحص الاعتماديات — REVOKE قد يكسر bootstrap |

> **دليل RLS جاهز بالفعل:** من لقطة pg_policies السابقة، `Bootstrap insert first user` → `WITH CHECK (has_super_admin() = false)` — أي أن `has_super_admin` **مستخدمة فعلاً داخل سياسة RLS** → REVOKE من anon/authenticated سيكسر تقييم السياسة (تُنفَّذ بصلاحيات المتصل).

**التحقق المتبقي (ثلاثة استعلامات):**
```sql
-- (1) هل توجد Trigger تستخدم handle_new_user؟ (0 صف = غير مربوطة)
select tgname, tgrelid::regclass as table_name, tgenabled
from pg_trigger
where tgfoid = 'public.handle_new_user()'::regprocedure;

-- (2) هل توجد دوال أخرى تعتمد على has_super_admin / bootstrap_super_admin؟
select p.proname as dependent_function
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname not in ('has_super_admin','bootstrap_super_admin')
  and (pg_get_functiondef(p.oid) ilike '%has_super_admin%'
       or pg_get_functiondef(p.oid) ilike '%bootstrap_super_admin%');

-- (3) هل تُستخدم has_super_admin داخل سياسات RLS؟ (مؤكدة جزئياً)
select schemaname, tablename, policyname, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and (coalesce(qual,'') ilike '%has_super_admin%'
       or coalesce(with_check,'') ilike '%has_super_admin%');
```

**نتائج التحقق (2026-08-02):**

| الاستعلام | النتيجة | الدلالة |
|---|---|---|
| (1) Trigger لـ `handle_new_user` | ✅ **مُوجودة: `on_auth_user_created` على `auth.users`، `tgenabled = O` (مفعّلة)** | **DV-10 في التقرير مُكذَّب** — الدالة **نشطة فعلياً** وتُشغَّل عند كل تسجيل Auth |
| (2) دوال تعتمد على `has_super_admin`/`bootstrap_super_admin` | ✅ **ناجح بعد إعادة التشغيل: `bootstrap_super_admin` فقط** (لا دوال تعتمد عليها) | الدالة الوحيدة المعتمدة عليها هي هي نفسها — REVOKE بلا اعتماديات |
| (3) `has_super_admin` داخل RLS | ✅ مؤكدة: `Bootstrap insert first user` → `WITH CHECK (has_super_admin() = false)` | REVOKE من anon/authenticated يكسر سياسة البوتبستراب |

### ⚠️ FINDING (أدلة جديدة تغيّر الواقع الأمني — مطلب معالجة عاجلة)

**DV-10 مُكذَّب + مسار NR-1 (حقن الدور) **مفتوح فعلياً****:

- `on_auth_user_created` **مربوطة بـ `handle_new_user` ومفعّلة** على `auth.users`.
- `handle_new_user` يقرأ `coalesce(NEW.raw_user_meta_data ->> 'role', 'guest')` ويكتبه في `public.users.role`.
- `raw_user_meta_data` قابلة للتحكم من العميل عند التسجيل (`POST /auth/v1/signup` مع `user_metadata`).
- النتيجة المحتملة: **تسجيل ذاتي بدور `admin`/`super_admin` في metadata → ترقية صلاحيات كاملة** — وهو بالضبط المسار الذي أعلنه التقرير «مُحسم: لا مسار تنفيذ» (بسبب DV-10 الخاطئ).
- الدالة `SECURITY DEFINER` (تتجاوز RLS) وبدون allowlist لأدوار.

**ملاحظة تقنية حاسمة:** REVOKE EXECUTE عن `handle_new_user` **لا يصحح الحقن** — المهاجم لا يستدعي الدالة مباشرة، بل يغذي `raw_user_meta_data` التي يقرؤها الـ Trigger. الإصلاح الحقيقي: **تجاهل دور العميل داخل الدالة** (فرض `guest`/allowlist) أو قراءة من `app_metadata` (متحكَّم بها سيرفراً) بدل `raw_user_meta_data`.

**قرارات مطلوبة من المستخدم:**
1. اعتماد تعديل تقرير التدقيق إلى **v3.7**: تصحيح DV-10 (trigger موجودة ومفعّلة)، وإعادة تصنيف NR-1 من «مُحسم: لا مسار» إلى «**مسار تنفيذ مؤكد — حقن دور عند التسجيل**» (أو بند LV جديد).
2. اعتماد **إصلاح طارئ Phase 1** لـ `handle_new_user` (فرض دور آمن — لا قبول `role` من metadata) — يقفل الترقية دون انتظار Phase 2.
3. إعادة النظر في جدول القرار للدوال الثلاث على ضوء النتائج (أدناه).

### 🔴🔴 اكتشاف أعمق — مسار البوتبستراب نفسه معطوب (2026-08-02)

**المصدر:** `src/screens/auth/AdminSetupScreen.tsx:57-66` — تدفّق إعداد أول مشرف **يوقّع المستخدم عبر `supa.auth.signUp` مع `options.data.role = 'super_admin'`**.

**ميكانيكية التصعيد (خطيرة):**
1. العميل يوقّع حساباً (أو يوقّع API مباشرة) مع `role: 'super_admin'` في `user_metadata`.
2. `supabase_auth_admin` يُدرج في `auth.users` → trigger `on_auth_user_created` (مفعّلة) → `handle_new_user`.
3. `handle_new_user` = `SECURITY DEFINER` → **يتجاوز RLS** → يقرأ `raw_user_meta_data->>'role'` ويكتبه في `public.users.role`.
4. **لا يوجد أي حارس في `handle_new_user`** — لا فحص `has_super_admin()` ولا allowlist.

**نتيجتان:**
- **أي مهاجم يمكنه التسجيل الذاتي بدور `super_admin`/`admin` عبر API مباشرة** (تجاوز واجهة الشاشة) → استحواذ إداري كامل — **حتى لو وُجد super_admin مسبقاً**.
- **حارس RLS المقصود (`Bootstrap insert first user`: `WITH CHECK has_super_admin()=false`) معطوب**: يُطبَّق على الإدراج المباشر في `public.users`، لكن إدراج الـ Trigger يمرّ عبر `SECURITY DEFINER` فيتجاوزه تماماً.

**القيد الوظيفي:** التطبيق **يعتمد** على مسار «دور من metadata» للبوتبستراب الشرعي — لذا لا يمكن تجريد الدور ببساطة دون كسر إعداد أول مشرف. الإصلاح الطارئ يجب أن يحفظ البوتبستراب ويغلق التصعيد.

**الخيارات (عُرضت على المستخدم — قُطع الحسم باختيار C):**
- ~~A: حارس داخل `handle_new_user` (سماح مشروط بترقية الدور)~~ — رفضه المستخدم: يبقي الدالة تعتمد على قيمة يرسلها العميل (raw_user_meta_data) حتى لو أصبح القرار أعقد.
- ~~B: إزالة دور من metadata نهائياً + bootstrap عبر service_role~~ — مؤجل (تغيير معماري واسع يتطلب تعديل `AdminSetupScreen` أيضاً) → Phase 2.
- **✅ C (المعتمد لـ Phase 1):** تجاهل `role` القادم من `raw_user_meta_data` **تماماً** داخل `handle_new_user` → تعيين `role='guest'` دائماً. الترقية إلى `admin`/`super_admin` عبر مسار إداري موثوق فقط (service_role / bootstrap موثّق). يغلق أخطر مسار حقن للأدوار مع الحفاظ على مبدأ Least Privilege دون تغييرات معمارية واسعة.

**أولوية الجولة (حسم المستخدم):** إصلاح `handle_new_user` (البند 4) **أولاً** → اختبار إنشاء مستخدم → ثم REVOKE `bootstrap_super_admin` (البند 5) → تحقق موحّد → إغلاق البندين في نفس الجولة/PR.

**جدول القرار النهائي (2026-08-02 — اعتمد المستخدم الخيار C):**
| Function | النوع | Client callable | مستخدمة في RLS | مستخدمة في Trigger | القرار النهائي |
|---|---|---|---|---|---|
| `handle_new_user` | Trigger | لا | لا | ✅ **نعم (مفعّلة)** | ✅ **KEEP + إصلاح (البند 4):** تجاهل دور العميل نهائياً — فرض `role='guest'` دائماً. الترقية إلى admin/super_admin عبر مسار إداري موثوق فقط |
| `has_super_admin` | Helper | عبر RLS | ✅ **نعم** (مثبت) | لا | ✅ **Documented Exception** — تُبقي EXECUTE لـ anon/authenticated (مطلوبة لسياسة bootstrap) |
| `bootstrap_super_admin` | RPC | ❌ **لا (مثبت: بلا استدعاء في src/)** | لا | لا | ✅ **REVOKE (البند 5)** — بمرآة LV-9 (المسار الشرعي للإعداد لا يمر بها أبداً) |

**أدلة استدعاء العميل (بحث في مصدر التطبيق — 2026-08-02):**
- `grep -rln` لـ `admin_promote_user | bootstrap_super_admin | has_super_admin | handle_new_user` في `src/` → المطابقة الوحيدة: `src/screens/auth/AdminSetupScreen.tsx:26` = `.rpc('has_super_admin')`.
- `.rpc(...)` في كود التطبيق: `increment_qr_counter` (`src/core/qr/campaign.ts`) + `lookup_campaign_by_short_code` (`src/core/supabase/data-service.ts`) فقط.
- **الخلاصة:** `has_super_admin` **قابلة للاستدعاء من العميل فعلياً** (شاشة الإعداد الإداري) + مستخدمة في RLS → **KEEP (Documented Exception)**. `bootstrap_super_admin` و`handle_new_user` **بلا أي استدعاء من العميل** → REVOKE EXECUTE منهما عن anon/authenticated آمن وظيفياً للتطبيق.

**معلومة تحقق إضافية حاسمة (2026-08-02):** probe مباشر `has_super_admin` عبر PostgREST (جلسة anon) → **`true`** — أي أن super_admin **موجود فعلياً في Production**:
- فرض `guest` في `handle_new_user` لا يكسر الإدارة الحالية (المشرف موجود).
- `bootstrap_super_admin` مرفوضة أصلاً بحارسها (يوجد مشرف) → REVOKE بلا أي مخاطرة وظيفية.

بعد إرسال ناتج التصنيف نُثبّت القرار (REVOKE / استثناء موثّق) كبند مستقل قبل/مع تطبيق بند 2.

## بند 2 (LV-1/LV-2/LV-4) — Baseline قبل + قرارات الحوكمة (2026-08-02)

### 02-LV-owner-read-baseline-before (Evidence — لقطة pg_policies الحية)

**Finding:** سياسات SELECT العريضة (`auth.role()='authenticated'` بلا قيد صف) **تلغي عزل الملكية** — لأن PostgreSQL يجمع السياسات بـ OR.

| الجدول | السياسة العريضة | سياسات الملكية المصاحبة |
|---|---|---|
| users | `Authenticated read users` | `Bootstrap insert first user` (INSERT) · `Admins update user roles` (UPDATE) |
| sessions | `Authenticated read sessions` | `Users manage own sessions` ALL: `auth.uid()=user_id OR user_id IS NULL` |
| analytics_events | `Authenticated read analytics events` | `Anyone can insert analytics events` (INSERT، true) |
| devices | `Authenticated read devices` | `Users manage own devices` ALL (owner) · `Authenticated insert devices` |
| calibrations | `Authenticated read calibrations` | `Users manage own calibrations` ALL (owner) · `Authenticated insert calibrations` |
| surveys | `Authenticated read surveys` | `Users manage own surveys` ALL (owner) · `Authenticated insert surveys` |

**Risk:** كشف بيانات عابرة بين الحسابات authenticated (بريد/أدوار/قياسات علمية/أحداث/جلسات ضيف).

### قرارات الحوكمة (قرار المستخدم — تعدّل نطاق البند 02)

1. **إضافة قراءة كل مربوطة بالدور** (`researcher/admin/super_admin`) — الدافع: قراءات Research Console / Business Intelligence **عابرة للمستخدمين بتصميم** (`src/business-intelligence/api.ts`، `src/core/research/api-supabase.ts`)، وبوابة `permissions.ts` **UI فقط لا RLS**. التنفيذ عبر دالة مساعدة `is_research_role()` SECURITY DEFINER (نمط `has_super_admin`) لتفادي recursion في سياسة `users`. **هذا يُدخل في Phase 1 ما كان مؤجَّلاً لـ Phase 2 — موثّق هنا كقرار (مواءمة roadmap = بند معلّق).**
2. **analytics_events:** ملكية + دور فقط — بلا قراءة عامة.
3. **جلسات الضيف (`user_id IS NULL`):** لا يقرؤها أي authenticated عادي — عبر إعادة تعريف `Users manage own sessions` بلا شرط NULL. **أمان وظيفي مثبت:** كل إدراجات sessions في src تستخدم uid حقيقي (`session-repository.ts:110-115` يرمي خطأ إن لم يُصادق؛ لا `user_id:null/undefined`).

### حالة البند 2
- الملف `02-…` أُعيدت كتابته وفق القرارات الثلاثة — **بانتظار مراجعة المستخدم ثم Apply** (قبل → apply → بعد → probe → commit مستقل).

## خط الأساس (Baseline — قبل الإصلاح، من تقرير v3.6)

| الكيان | الحالة قبل | المصدر |
|---|---|---|
| `admin_promote_user` proacl | `EXECUTE`: PUBLIC, anon, authenticated, postgres, service_role | proacl (بند III.0-10) |
| استدعاء anon لـ `admin_promote_user` | **نجح** (P0001 على صفّ صفري، أثر صفر) | PostgREST probe (III.0-11) |
| سياسات RLS العريضة | `Authenticated read …` بلا قيد صف على users/sessions/campaigns/analytics_events/devices/calibrations/qr_codes/surveys | pg_policies (DV-9) |
| `sessions` INSERT | بلا فحص ملكية `user_id` | pg_policies (LV-10) |
| `analytics_events` INSERT | `Anyone can insert` — بلا قيد | pg_policies (LV-5) |
| `qr_codes` UPDATE | `Anyone can update qr scan counts` | pg_policies (LV-11) |

## عناصر التنفيذ (بالترتيب المعتمد — كل بند بدورة: مراجعة → تطبيق → تحقق → توثيق → إغلاق → Commit)

| # | البند | المعرّف | يعتمد على تصميم Phase 2؟ | حالة الملف | الحالة على Production |
|---|---|---|---|---|---|
| 1 | REVOKE EXECUTE عن `admin_promote_user` | LV-9 | لا | `01-LV9-revoke-admin-rpc-execute.sql` | ⏳ قيد المراجعة — لم يُطبَّق |
| 2 | حصر قراءة users/sessions/campaigns/analytics_events بالمِلكية | LV-1..LV-4 | لا (الجزء الأساسي: `auth.uid()`) | — | ⏳ Pending |
| 3 | ربط `sessions.user_id` بجلسة المصادقة | LV-10 | لا | — | ⏳ Pending |
| 4 | إزالة UPDATE العريض على `qr_codes` (الكتابة عبر RPC الآمن فقط) | LV-11 | لا | — | ⏳ Pending |
| 5 | قيد INSERT على `analytics_events` (المِلكية) + Rate Limit/Quota/Cleanup | LV-5 | جزئي (المِلكية لا؛ Rate Limit نعم) | — | ⏳ Pending |
| 6 | تشغيل التحقق الكامل | — | — | (أدناه) | ⏳ Pending |
| 7 | تثبيت Baseline الجديدة (snapshot بعد) | — | — | — | ⏳ Pending |

## إغلاق البند 1 (LV-9) — دورة Review → Apply → Verify → Document → Close → Commit

| الخطوة | الإجراء | المسؤول | الحالة |
|---|---|---|---|
| A | مراجعة SQL (توافق اصطلاح المستودع، التوقيع، نطاق EXECUTE فقط) | المستخدم | ✅ أُعدّت للمراجعة (الملف `01-…`) |
| B | تشغيل `proacl`/الجرد **قبل** (الاستعلام أدناه) | المستخدم (SQL Editor) | ⏳ Pending |
| C | تطبيق SQL على بيئة مناسبة وفق الخطة | المستخدم (SQL Editor — owner) | ⏳ Pending |
| D | إعادة تشغيل `proacl` **بعد** ومقارنة | المستخدم | ⏳ Pending |
| E | توثيق الفرق قبل/بعد في سجل التنفيذ | مُنفَّذ (أنا) | ⏳ Pending |
| F | إغلاق LV-9 في سجل التنفيذ ثم Commit خاص بالبند | مُنفَّذ (أنا) | ⏳ Pending |

**استعلام Step B/D (الجرد = الخطوة 1 من خطة التنفيذ):**
```sql
select p.proname,
       p.proacl,
       p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```
> **تحذير جرد:** `increment_qr_counter` دالة QR whitelist-safe وتحتاج EXECUTE لـ anon/authenticated — **لا تُلمس**. المستهدَف بالمنع: الإدارية فقط (`admin_promote_user`, `bootstrap_super_admin`, `handle_new_user`, `has_super_admin`).

**دورة Runtime Probe للتحقق:** POST `/rest/v1/rpc/admin_promote_user` بجسم `{target_user_id:"00000000-0000-0000-0000-000000000000", new_role:"super_admin"}` من جلسة anon → المتوقع بعد الإصلاح: `403`/`42501` (وقبل: `P0001`).

## نتيجة البند 1 (LV-9) — قبل/بعد موثَّق (2026-08-02)

**Step B (قبل):** `admin_promote_user` → `proacl {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` + `SECURITY DEFINER=true` — مطابق تماماً لدليل تقرير v3.6.
**Step C:** REVOKE ALL عن PUBLIC / anon / authenticated — نُفّذ بلا أخطاء.
**Step D (بعد):** `proacl {postgres=X, service_role=X}` — اختفى PUBLIC ✅ / anon ✅ / authenticated ✅.

**تقييم المستخدم: 10/10** — بلا Side Effects.
**حالة LV-9:** ✅ **مُغلق بالكامل داخل Gate 1** (2026-08-02) بعد نجاح الـ Runtime Probe:
```
HTTP/1.1 401 Unauthorized          ← تغليف بوابة Supabase
Proxy-Status: PostgREST; error=42501
{"code":"42501","details":null,"hint":null,"message":"permission denied for function admin_promote_user"}
```
- **قبل (تقرير v3.6):** نفس الطلب وصل لجسم الدالة وعاد `P0001 User not found.`
- **بعد:** `42501 permission denied` — الدالة محجوبة عن anon قبل التنفيذ. **Verification = PASS.**
- الحارس الداخلي (`can_manage_users()` / `is_super_admin()` / Authorization Layer) = **Phase 2** وفق الـ Baseline.

**ملاحظات الجرد (من Step B — تُؤكَّد وثيقة التقرير، لا تُلمس خارج ترتيب الخطة):**
- لا تزال PUBLIC EXECUTE: `bootstrap_super_admin`, `handle_new_user`, `has_super_admin`, `update_updated_at` — تُعالَج في مواقعها المحددة في الـ Baseline (ترتيب معتمد: LV-9 → LV-1..4 → LV-10 → LV-11 → LV-5). `increment_qr_counter` و`lookup_campaign_by_short_code` تبقيان (whitelist-safe).
- سياسات RLS الحية مطابقة تماماً لما وثّقه التقرير (DV-9/LV-1..4/LV-10/LV-11/LV-5) — التقرير دقيق.

## دورة البندين 4-5 (NR-1 + §III.0) — جاهزة للتنفيذ (قرار المستخدم C، 2026-08-02)

**الترتيب المعتمد من المستخدم:** إصلاح `handle_new_user` (04) أولاً → اختبار إنشاء مستخدم → REVOKE `bootstrap_super_admin` (05) → تحقق موحّد → إغلاق البندين معاً في نفس الجولة/PR.

### Step B (قبل — SQL Editor، owner)
```sql
-- 4: التعريف الحي الحالي لـ handle_new_user (التقاط Before)
select pg_get_functiondef('public.handle_new_user()'::regprocedure);
-- 5: proacl الحالي لـ bootstrap_super_admin
select p.proname, p.proacl from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public' and p.proname in ('bootstrap_super_admin','handle_new_user');
```

### Step C (تطبيق)
1. شغّل `04-handle-new-user-force-guest.sql`.
2. **اختبار إنشاء مستخدم (أثبت لا تصعيد):** سجّل عبر REST بدور malicious في metadata، ثم تحقق أن `users.role = 'guest'`:
   ```bash
   # (من سطر الأوامر — سياق anon) — سجّل بحساب مؤقت وmetadata role:'super_admin'
   curl -s -X POST "https://fmggysdqigtejxbfpgtg.supabase.co/auth/v1/signup" \
     -H "apikey: <ANON>" -H "Content-Type: application/json" \
     -d '{"email":"escalation-test-<الطابع>@example.com","password":"Test-1234","data":{"role":"super_admin","display_name":"Escalation Test"}}'
   ```
   ثم في SQL Editor: `select id, role, display_name from public.users where email = 'escalation-test-<الطابع>@example.com';`
   **المتوقع:** `role = 'guest'` (وليس `super_admin`) = لا تصعيد.
3. **تنظيف الاختبار (SQL Editor):** `delete from public.users where email = 'escalation-test-<الطابع>@example.com';` ثم حذف حساب auth المقابل (service_role/postgres).
4. شغّل `05-bootstrap-super-admin-revoke-execute.sql`.

### Step D (بعد)
```sql
select p.proname, p.proacl, p.prosecdef
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('bootstrap_super_admin','handle_new_user','admin_promote_user','has_super_admin');
```

### Runtime Probe (صفر الأثر)
- `bootstrap_super_admin`: POST `/rest/v1/rpc/bootstrap_super_admin` بجسم `{"target_user_id":"00000000-0000-0000-0000-000000000000"}` من anon → المتوقع بعد: `401`/`42501 permission denied` (مثل LV-9).
- `handle_new_user`: لا توجد RPC مباشرة (دالة trigger) — التحقق بالتعريف (pg_get_functiondef يظهر `'guest'`) + اختبار التسجيل أعلاه.

## نتيجة البندين 4-5 (NR-1 + §III.0) — قبل/بعد موثَّق (2026-08-02)

**Step B (قبل):** `handle_new_user` تثق بـ `coalesce(NEW.raw_user_meta_data->>'role','guest')` · `bootstrap_super_admin` proacl = `{PUBLIC, anon, authenticated, postgres, service_role}`.

**Step C (تطبيق):**
1. `04-handle-new-user-force-guest.sql` — `CREATE OR REPLACE` يفرض `role='guest'` ثابتاً. **ملاحظة REVISION:** نسخة v1 استخدمت `now()::text` (مشتقة من `00002`) → كسرت الإدراج لأن السكيمة الحية `timestamptz` (خطأ `42804`) — صُحّحت إلى `now()`. درس: الاشتقاق من `pg_get_functiondef` (الحي) لا من migrations.
2. **اختبار التسجيل (إثبات لا تصعيد):** `POST /auth/v1/signup` بـ metadata `{"role":"super_admin","display_name":"Escalation Test"}` → **HTTP 200**، الحساب `ee8f07f5-…` → فحص `users.role` = **`guest`** (عبر REST بـ access_token الحساب). ✅ **لا حقن دور.**
3. تنظيف حساب الاختبار (public.users + auth.users).
4. `05-bootstrap-super-admin-revoke-execute.sql` — REVOKE ALL عن PUBLIC/anon/authenticated.

**Step D (بعد):**
| الدالة | proacl | الحالة |
|---|---|---|
| `bootstrap_super_admin` | `{postgres=X, service_role=X}` | ✅ مغلقة |
| `admin_promote_user` | `{postgres=X, service_role=X}` | ✅ (LV-9، ثابتة) |
| `handle_new_user` | `{=X, postgres=X, anon=X, authenticated=X, service_role=X}` | ✅ KEEP — trigger-only؛ الإصلاح في مصدر الحقيقة (الدور) لا ACL |
| `has_super_admin` | `{=X, postgres=X, anon=X, authenticated=X, service_role=X}` | ✅ Documented Exception (RLS + شاشة الإعداد) |

**Runtime Probe (بند 5):** POST `/rest/v1/rpc/bootstrap_super_admin` (anon) →
```
HTTP/1.1 401 Unauthorized
Proxy-Status: PostgREST; error=42501
{"code":"42501","message":"permission denied for function bootstrap_super_admin"}
```
= PASS (مرآة LV-9).

**حالة البندين:** ✅ **مُغلَقان رسمياً داخل Gate 1** (2026-08-02). NR-1 في تقرير التدقيق انتقل من «مُحسم: لا مسار» (DV-10 خاطئ) إلى **«مسار مؤكد → مُغلَق»** (تقرير v3.7).

**الحالة الأمنية النهائية (RBAC):**
| المسار | الحالة |
|---|---|
| Signup → metadata role injection | ✅ Closed |
| Anonymous/Authenticated bootstrap RPC | ✅ Closed |
| Existing super_admin access | ✅ Preserved |
| Admin promotion | ✅ Backend/service_role only |
| Role source of truth | ✅ Database enforced (`'guest'`) |

## نتيجة البند 2 (LV-1/LV-2/LV-4) — قبل/بعد موثَّق (2026-08-02)

**قبل:** 6 سياسات SELECT عريضة (`auth.role()='authenticated'` بلا قيد صف) على users/sessions/analytics_events/devices/calibrations/surveys → أي authenticated يقرأ كل صفوف الآخرين (OR يلغي الملكية). `Users manage own sessions` كانت تشمل `user_id IS NULL` (جلسات ضيف مقروءة للعموم).

**التطبيق (قرارات المستخدم الثلاثة):**
1. دالة مساعدة `is_research_role()` (SECURITY DEFINER STABLE، نمط `has_super_admin`) لمنح القراءة الكاملة لـ researcher/admin/super_admin — **بلا recursion** (تفادي استعلام ذاتي على users).
2. 6 سياسات «Users read own …` + 6 سياسات «Researchers read all …` بدل العريضة.
3. إعادة تعريف `Users manage own sessions` بلا `user_id IS NULL`.

**بعد (pg_policies):** لا أي qual عريض متبقٍ؛ `sessions` بلا NULL؛ السياسات المصاحبة (INSERT/UPDATE/ALL) محفوظة.

**Runtime evidence (اختبار A/B فعلي):**
- A (guest) يقرأ `users` → صفّه فقط (صف B مخفي).
- A يقرأ صف B تحديداً → `[]` · B يقرأ صف A → `[]` (قراءة عابرة محجوبة).
- anon على الجداول الست → `[]`.

**تحقق إضافي — `Bootstrap insert first user` ليس مسار ترقية (2026-08-02):**
- `with_check = (has_super_admin() = false)` مؤكدة (pg_policies).
- مع وجود super_admin (probe = true) → الشرط خاطئ → **أي INSERT عميل على users مُرفض**، حتى مع اختيار `role` (لا سياسة INSERT أخرى على users).
- المسارات الوحيدة لكتابة `users.role`: trigger `handle_new_user` (يفرض `guest`) + `Admins update user roles` (أدمن فقط) + RPC الإدارية (محجوبة عن العميل).
- الخلاصة: **لا مسار عميل لكتابة دور مرتفع** — البند 2 مغلق.

**حالة البند 2:** ✅ **مُغلق رسمياً داخل Gate 1** (2026-08-02). ملاحظة حوكمة: توسعة نطاق البند بقراءات مربوطة بالدور (كانت مؤجلة لـ Phase 2) — موثّقة كقرار؛ **مواءمة الـ roadmap v2.2→v2.3 بندٌ معلّق**.

## نتيجة البند 6 (LV-10) — قبل/بعد موثَّق (2026-08-02)

**قبل:** السياسات على sessions كانت تُجمع بـ OR: `Users manage own sessions` (ALL، `WITH CHECK auth.uid()=user_id`) **و** `Authenticated insert sessions` (INSERT، roles=public، `WITH CHECK auth.role()='authenticated'`) → الأخيرة **تلغي فحص الملكية**: أي authenticated يُدرج جلسة كاملة (بما فيها `scientific_results`) بأي `user_id` موجود.

**الأدلة (قبل):**
- FK سليم مفرد: `sessions_user_id_fkey` → `public.users(id)` (pg_constraint — التكرار 4× في information_schema كان أثر join صناعياً).
- بيانات نظيفة: 69/69 مملوكة · 0 يتيمة · 0 ضيف.
- مسار الإدراج الآمن بالبناء: `session-repository.ts:120` يفرض `user_id=getUserId()=auth.uid()`؛ `data-service.ts:433` بلا callers.
- **Probe حي مؤكد:** حساب A (44 جلسة) يُدرج ضمن معاملة بـ `user_id=B` عبر قالب نسخ (يضمن NOT NULL/FK) → `rows_inserted=1 · inserted_user_id=979e…` — **الثغرة مؤكدة عملياً** (بدل نظري).

**التطبيق:** `drop policy if exists "Authenticated insert sessions" on public.sessions;` — بلا أي فهرس (وجدنا `idx_sessions_user_id` موجوداً؛ لا فهرس مكرر).

**بعد (أدلة حية):**
- نفس probe المتقاطع → **`42501 new row violates row-level security policy for table "sessions"`** — مرفوض.
- إدراج الملكية (نفس A) → يُرجع الصف (`user_id=a549…`) — مسار التطبيق سليم.
- السياسة الوحيدة المتبقية القادرة على INSERT: `Users manage own sessions` (`WITH CHECK auth.uid()=user_id`).

**ملاحظات الإغلاق:** جلسات الضيف (`user_id IS NULL`) لم تعد قابلة للإنشاء عبر RLS عميل — متسق مع بند 2/قرار 3 (و0 جلسة ضيف حالياً)؛ إن لزم مسار موثوق/خدمي متاح. **البند 6 (LV-10) مُغلق رسمياً داخل Gate 1.**

## نتيجة البند 7 (LV-11) — قبل/بعد موثَّق (2026-08-02)

**قبل:** `Anyone can update qr scan counts` — UPDATE، roles={public}، **USING true / WITH CHECK true** → أي عميل (حتى anon بلا جلسة) يعدّل `scan_count`/`registration_count`/... لأي صف مباشرة — **Business Integrity Attack**: تزوير نجاح حملات/تقارير/ROI، ويتجاوز RPC الآمن `increment_qr_counter`.

**الأدلة (قبل):**
- **Probe حي (transaction+rollback، `set local role anon`):** `update qr_codes set scan_count=999999999` → `anon_update_succeeded = true` — **تلاعب مجهول مؤكد عملياً**.
- سياسات qr_codes (pg_policies): `Admins manage qr codes` (ALL، أدمن/super_admin فقط) · `Authenticated read qr codes` (SELECT) · العريضة (UPDATE).
- المسار المشروع الوحيد المستخدم: `increment_qr_counter` (**SECURITY DEFINER** + allowlist أعمدة IF/ELSIF) — `campaign.ts:198,203`؛ الكتابة المباشرة (`createQRCode`/`updateQRCodeStats`) **بلا callers** في src.

**التطبيق:** `drop policy if exists "Anyone can update qr scan counts" on public.qr_codes;`

**بعد (أدلة حية):**
- نفس probe المجهول → `anon_update_succeeded = false` — **محجوب** (0 صفوف).
- صف تشخيصي موحّد يؤكد البيئة: `acting_role=anon · rls_on=true · anon_bypass_rls=false · update_policy_count=0 · row_security=on`.
- RPC `increment_qr_counter` يعمل بعد الإسقاط (SECURITY DEFINER — void بلا خطأ) → عدّادات الحملات سليمة.
- (ملاحظة منهجية: نتائج `true` وسيطة كانت **ترتيب تنفيذ** — الـ probe سبق اكتمال الإسقاط؛ الصف التشخيصي هو المرجع.)

**ملاحظات الإغلاق:** لا سياسة UPDATE متبقية لغير الأدمن؛ `Admins manage qr codes` يغطي الإدارة. **البند 7 (LV-11) مُغلق رسمياً داخل Gate 1.**

## نتيجة البند 8 (LV-5) — قبل/بعد موثَّق (2026-08-02)

**قبل:** `Anyone can insert analytics events` — INSERT، roles={public}، `WITH CHECK true` → أي عميل (حتى anon بلا جلسة) يُدرج أحداثاً بلا حدود (**Database DoS**) وبأي `user_id` (تلويث/حقن نتائج).

**القرار (الخيار B):** بيانات حية 8863 حدثاً — **8420 بـ user_id NULL (~95%)**: تليمتري التطبيق يُدرج بلا user_id (مسار `src/core/telemetry/index.ts:122-134` → `user_id: event.userId ?? undefined`؛ لا callers لـ `setUserId` في الإنتاج) → فرض `user_id=auth.uid()` كان سيكسر ~95% من الإدراج. السياسة الجديدة تفرض `TO authenticated` + `WITH CHECK ((user_id IS NULL) OR (user_id = auth.uid()))` → يغلق anon-bot DoS، يمنع النسب العابر، ويبقي تليمتري NULL.

**التطبيق:** `08-LV5-analytics-insert-ownership.sql` — `drop policy "Anyone can insert analytics events"` + `create policy "Authenticated users insert own analytics events"`.

**أدلة (بعد):** مصفوفة 4 حالات في Production (transaction+rollback):
| الحالة | الدور | user_id | النتيجة |
|---|---|---|---|
| anon | anon | null | `42501 new row violates row-level security policy` — مرفوض ✅ |
| ملكية | authenticated (A) | a549a010-… | مسموح ✅ |
| تليمتري NULL | authenticated (A) | null | مسموح ✅ |
| عابر | authenticated (A) | 979e… (B) | `42501` — مرفوض ✅ |

**درس منهجي (مسجَّل):** التطبيق الأول لم يُسقط العريضة فعلياً — جرد pg_policies أظهر الاثنتين معاً (OR يُبقي المسار مفتوحاً: عابر مسموح). أُعيد الإسقاط كجملة مستقلة ثم تحققت السياسات الثلاث فقط (`Authenticated users insert own analytics events` + سياساتا القراءة) واكتملت المصفوفة. **الخلاصة: الإغلاق لا يُعتمد بإنشاء السياسة الجديدة، بل بجرد pg_policies بعد التطبيق يؤكد غياب القديمة.**

**ملاحظة وظيفية:** `flushInternal` في التليمتري تلتقط أخطاء الإدراج وتعيدها للقائمة (لا انهيار)؛ أي حدث pre-login (جلسة anon) لن يُحفظ — يُعالَج إن لزم في Phase 2 (مسار موثوق/بيئة). سبام المسجّلين بكمية = Rate Limit في Phase 2.

**حالة البند:** ✅ **مُغلق رسمياً داخل Gate 1.**

## التحقق (Verification — يُشغَّل بعد كل بند)

1. **proacl:** `select proname, proacl from pg_proc where proname in ('admin_promote_user','bootstrap_super_admin','handle_new_user','has_super_admin','increment_qr_counter');` → ألا يعود anon/authenticated/PUBLIC ضمن الممنوح إدارياً.
2. **Runtime Probe (صفر-الأثر):** POST `/rest/v1/rpc/admin_promote_user` بصفّ صفري من جلسة anon → المتوقع `403`/`42501` (و**ليس** `P0001`).
3. **pg_policies:** إعادة `select policyname, cmd, qual, with_check from pg_policies where schemaname='public';` ومقارنة زوال الأنماط العريضة.

## معايير القبول (Phase 1)
- لا توجد أي دالة إدارية قابلة للاستدعاء من `anon`/`authenticated` دون تفويض (probe → 403/42501).
- أي مستخدم لا يقرأ بيانات مستخدم آخر.
- `INSERT sessions` بـ `user_id` مستخدم آخر يفشل.
- آلاف الأحداث في `analytics_events` مقيَّدة.
- `UPDATE qr_codes` مباشر مرفوض.

## Rollback (إن رُصد انحدار إنتاجي)
1. Stop deployment.
2. Restore previous policies (من snapshot قبل).
3. Restore previous function definitions.
4. Verify application health.
5. Re-run Phase 1 verification.

## سجل التنفيذ (Execution Log)

| التاريخ | البند | الفعل | المرجع | الحالة |
|---|---|---|---|---|
| 2026-08-02 | إعداد الفرع `security/remediation-phase1` | checkout | Branch Policy (الـ baseline) | ✅ |
| 2026-08-02 | مسودة بند 1 (LV-9 REVOKE) | كتابة الملف `01-…` | ترتيب Phase 1 بند 1 | ✅ |
| 2026-08-02 | مراجعة ذاتية + مواءمة اصطلاح المستودع (REVOKE ALL) | review | 00007 convention | ✅ |
| 2026-08-02 | إعادة تصنيف بنود 2-5 (قابل الآن/مؤجَّل) | قرار المستخدم | قاعدة التأجيل | ✅ |
| 2026-08-02 | LV-9 Step A — SQL جاهز لمراجعة المستخدم | review | دورة الإغلاق | ✅ |
| 2026-08-02 | LV-9 Step B — جرد proacl + pg_policies (قبل) | apply-prep | SQL Editor | ✅ |
| 2026-08-02 | LV-9 Step C — تطبيق REVOKE على Production | apply | SQL Editor | ✅ |
| 2026-08-02 | LV-9 Step D — جرد proacl (بعد) | verify | SQL Editor | ✅ (المتوقع الحرفي) |
| 2026-08-02 | LV-9 Step E — توثيق الفرق قبل/بعد (أعلاه) | document | سجل التنفيذ | ✅ |
| 2026-08-02 | LV-9 Step F — Runtime Probe | verify | PostgREST (bash curl) | ✅ **42501 permission denied** = PASS |
| 2026-08-02 | **LV-9 Close** — الإغلاق الرسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | Commit خاص بالبند 1 (LV-9) | commit | سياسة Branch/PR | ✅ `d2c1ce7` |
| 2026-08-02 | Push + PR للبند 1 (LV-9) | push | سياسة Branch/PR | ⏳ بانتظار قرار المستخدم |
| 2026-08-02 | مسودة بند 2 (LV-1/2/4 owner-read policies) | كتابة الملف `02-…` | ترتيب Phase 1 بند 2 | 📝 قيد المراجعة |
| 2026-08-02 | LV-3 campaigns — **Blocked by schema** (created_by NULL) | توثيق `03-…` | قرار المستخدم | 📝 مُوثّق — يحسم في Phase 2 |
| 2026-08-02 | ملاحظة DV: `sessions.id` TEXT مقابل UUID في العلاقات | توثيق | مراجعة التصميم | 📝 في `03-…` |
| 2026-08-02 | تحقق استدعاء العميل لـ `bootstrap_super_admin` (قراءة AdminSetupScreen.tsx) | verify | evidence | ✅ غير مستدعاة — **+ اكتشاف أن الإعداد الشرعي يمر عبر `signUp(... role:'super_admin')`** |
| 2026-08-02 | Probe مباشر `has_super_admin` (REST anon) | verify | PostgREST (bash curl) | ✅ `true` — يوجد super_admin فعلي في Production |
| 2026-08-02 | حسم قرار الإصلاح — **الخيار C** (تجاهل دور العميل نهائياً → فرض guest) + ترتيب الجولة | قرار المستخدم | سجل القرار | ✅ |
| 2026-08-02 | كتابة البند 4 (`04-handle-new-user-force-guest.sql`) | write | التعريف الأصلي 00002:35-56 + قرار C | ✅ جاهز |
| 2026-08-02 | كتابة البند 5 (`05-bootstrap-super-admin-revoke-execute.sql`) | write | مرآة LV-9 + أدلة (a-d) | ✅ جاهز |
| 2026-08-02 | تحديث README: مانيفست + جدول القرار النهائي + دورة البندين 4-5 | document | — | ✅ |
| 2026-08-02 | **Apply 04 + اختبار تسجيل + Apply 05 + تحقق موحّد** | apply/verify | SQL Editor + REST | ✅ |
| 2026-08-02 | **الانحدار 42804 (v1 من 04) + تصحيحه إلى now()** | fix | SQL Editor | ✅ |
| 2026-08-02 | **إغلاق البندين 4-5 (NR-1 + §III.0)** — دورة كاملة بالأدلة | close | سجل التنفيذ | ✅ |
| 2026-08-02 | ترقية تقرير التدقيق إلى v3.7 (تصحيح DV-10 + تصنيف NR-1 مؤكد → مغلق) | document | دورة الإغلاق | ✅ |
| 2026-08-02 | Commit خاص بالجولة (البندان 4-5 + v3.7) | commit | سياسة Branch/PR | ✅ `3d4982a` |
| 2026-08-02 | بند 2: قرارات الحوكمة الثلاثة (دور-بوابة / analytics ملكية+دور / تقييد الضيف) | قرار المستخدم | سجل القرار | ✅ |
| 2026-08-02 | بند 2: إعادة كتابة `02-…` وفق القرارات + توثيق Baseline قبل | write/document | سجل التنفيذ | ✅ |
| 2026-08-02 | بند 2: Apply (6 ملكية + 6 دور + is_research_role + إعادة تعريف sessions) | apply | SQL Editor | ✅ |
| 2026-08-02 | بند 2: After pg_policies — تطابق كامل (لا qual عريض، بلا NULL) | verify | SQL Editor | ✅ |
| 2026-08-02 | بند 2: Runtime evidence (A/B cross-user probe + anon) | verify | PostgREST (bash curl) | ✅ محجوب فعلياً |
| 2026-08-02 | بند 2: تنظيف حسابَي الاختبار | cleanup | SQL Editor | ✅ |
| 2026-08-02 | **بند 2 Close** — إغلاق رسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | Commit مستقل للبند 2 | commit | سياسة Branch/PR | ✅ `a6ffe6d` |
| 2026-08-02 | مواءمة الـ roadmap (v2.2→v2.3: توسعة نطاق البند 2 بقراءات الدور) | document | بند معلّق | ⏳ |
| 2026-08-02 | بند 6 (LV-10): Snapshot قبل — FK واحد `sessions_user_id_fkey` → `public.users(id)` (pg_constraint) + 69/69 مملوكة + 0 يتيمة + فهرس `idx_sessions_user_id` موجود | verify | SQL Editor | ✅ |
| 2026-08-02 | بند 6: أدلة كود — `session-repository.ts:120` يفرض `user_id=auth.uid()`؛ `data-service.ts:433` بلا callers | verify | grep/read src | ✅ |
| 2026-08-02 | بند 6: سياسات sessions (قبل) — `Authenticated insert sessions` (roles=public، with_check `auth.role()='authenticated'`) تُلغى الملكية عبر OR | verify | pg_policies | ✅ |
| 2026-08-02 | بند 6: **Probe حي مؤكد للثغرة** — متقاطع INSERT (A→B) ضمن CTE+rollback: `a_owns_sessions=44 · rows_inserted=1 · inserted_user_id=979e…` | verify | SQL Editor | 🔴 ثغرة مؤكدة |
| 2026-08-02 | بند 6: كتابة `06-LV10-sessions-insert-ownership.sql` (DROP POLICY فقط — بلا index؛ `idx_sessions_user_id` موجود) | write | أدلة (a-e) | ✅ جاهز |
| 2026-08-02 | بند 6: Apply — `drop policy "Authenticated insert sessions"` | apply | SQL Editor | ✅ |
| 2026-08-02 | بند 6: After probe — متقاطع → `42501 new row violates row-level security policy` · ملكية (نفس A) → يُرجع الصف | verify | SQL Editor | ✅ PASS |
| 2026-08-02 | **بند 6 Close (LV-10)** — إغلاق رسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | بند 7 (LV-11): أدلة كود — الكتابة الوحيدة المستخدمة = RPC `increment_qr_counter` (campaign.ts:198,203)؛ `updateQRCodeStats`/`createQRCode` بلا callers | verify | grep/read src | ✅ |
| 2026-08-02 | بند 7: Snapshot — سياسات qr_codes + تعريف `increment_qr_counter` (**SECURITY DEFINER** + allowlist) | verify | pg_policies + pg_get_functiondef | ✅ |
| 2026-08-02 | بند 7: **Probe حي (قبل)** — anon UPDATE `scan_count` → `anon_update_succeeded=true` | verify | SQL Editor | 🔴 ثغرة مؤكدة |
| 2026-08-02 | بند 7: Apply — `drop policy "Anyone can update qr scan counts"` + تأكيد الغياب (pg_policies) | apply | SQL Editor | ✅ |
| 2026-08-02 | بند 7: تحقق وسيط — بعد الإسقاط عاد probe `true` (شذوذ) → تشخيص RLS (مفعّلة، لا bypass، لا سياسة UPDATE) | verify | SQL Editor | ⚠️ ترتيب تنفيذ |
| 2026-08-02 | بند 7: **Probe حي (بعد، صف تشخيصي موحّد)** — `anon_update_succeeded=false` + RPC يعمل بلا خطأ | verify | SQL Editor | ✅ PASS |
| 2026-08-02 | **بند 7 Close (LV-11)** — إغلاق رسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | بند 8 (LV-5): Snapshot — سياسة `Anyone can insert analytics events` (roles=public، with_check true) + بيانات 8863 حدثاً (8420 NULL user_id ≈ 95%) | verify | pg_policies + count | ✅ |
| 2026-08-02 | بند 8: أدلة كود — `telemetry/index.ts:122-134` `user_id: event.userId ?? undefined`؛ لا callers لـ `setUserId`؛ `referral.ts` recordScan/recordConversion بلا callers | verify | grep/read src | ✅ |
| 2026-08-02 | بند 8: قرار الخيار B (TO authenticated + NULL/mلكية) — تأكيد المستخدم | decision | سجل القرار | ✅ |
| 2026-08-02 | بند 8: كتابة `08-LV5-analytics-insert-ownership.sql` (drop + create) | write | أدلة (a-e) | ✅ جاهز |
| 2026-08-02 | بند 8: **شذوذ وسيط** — حالة العابر عادت مسموحة + نواتج مُسمّاة غير حاسمة → تشخيص موحّد | verify | SQL Editor | ⚠️ غير حاسم |
| 2026-08-02 | بند 8: **جرد pg_policies كشف التطبيق الأول ناقصاً** — العريضة ما زالت حية (الاثنتان معاً) → OR يُبقي المسار مفتوحاً | verify | pg_policies | 🔴 غير مُسقَط |
| 2026-08-02 | بند 8: **إعادة الإسقاط كجملة مستقلة** + جرد: السياسات الثلاث فقط (لا `Anyone can insert`) | apply | SQL Editor | ✅ |
| 2026-08-02 | بند 8: **مصفوفة بعد نظيفة** — anon `42501` · ملكية مسموح · NULL مسموح · عابر `42501` | verify | SQL Editor | ✅ PASS |
| 2026-08-02 | **بند 8 Close (LV-5)** — إغلاق رسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | ترقية تقرير التدقيق إلى v4.0 (LV-5 Closed + درس جرد pg_policies) | document | دورة الإغلاق | ✅ |

## التحقق النهائي الموحّد (Baseline Verification — 2026-08-02)

**الختم بعد إغلاق كل البنود القابلة للتنفيذ — مصفوفة probes حية (SQL Editor):**

| probe | النتيجة | الحكم |
|---|---|---|
| pg_policies / proacl / RLS | مطابقة للحالة المستهدفة | ✅ |
| anon RPC إدارية (admin_promote_user / bootstrap_super_admin) | `42501 permission denied` | ✅ |
| has_super_admin (anon) | `true` — حارس bootstrap سليم | ✅ |
| A(super_admin)→B قراءة | `1` — دور-بوابة (بتصميم) | ✅ |
| B(user)→A قراءة | `0` — عزل ملكية | ✅ |
| anon قراءة users | `0` | ✅ |
| sessions متقاطع (A→B) | `42501` | ✅ |
| qr anon UPDATE | `0` صفوف | ✅ |
| analytics anon INSERT | `42501` + `0` مُحفظ | ✅ |
| analytics ملكية / عابر | مسموح / `42501` | ✅ |
| تنظيف probes | `0` متبقٍ | ✅ |

**الخاتمة:** **لا انحدار.** الحالة النهائية = **Baseline v4.0 (Security Baseline المجمّدة)**. الوحيد المتبقي ضمن النطاق: **LV-3 (Blocked by schema)** — موثّق في `03-LV3-campaigns-schema-gap.md`، يُحسم في Phase 2. المتبقي خارج النطاق (Phase 2): Rate Limit/Quota لـ analytics_events، طبقة التفويض/الحارس الداخلي، توسعة قراءة أدوار، NR-2 staging، مزامنة migrations، بنود P1 (ExportUtils، repair migrations، headers).

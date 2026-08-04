# CR-004 — تضييق حدود سياسات RLS (TO PUBLIC → authenticated) + سياسة التمهيد + مراجعة RPC

| الحقل | القيمة |
|---|---|
| Change ID | CR-004 |
| الإصدار | 4.0 (بعد اعتماد المحورين الأول والثاني) |
| التاريخ | 2026-08-04 |
| المرجع | C3 — Privilege + RLS/Policy Audit (القرار: **OPEN**) · C3b — Policy Snapshot (الحالة: ✅ PASS) |
| التصنيف | إصلاح أمني من Phase C (C3) — دفاع في العمق، لا إصلاح تسريب مؤكد |
| الحالة | ✅ **معتمدة للتنفيذ** — CR-004.1 وCR-004.2 معتمدان · CR-004.3 مؤجل بقرار تصميمي · السكربت جاهز بانتظار بدء التسلسل |
| الجهة المنفذة | سكربت `supabase/security-hardening/phase-c/CR-004-execute.sql` · سكربت التراجع `CR-004-rollback.sql` |
| السياسة الحاكمة | `docs/security/operations/change-management.md` — Evidence Before Apply · موافقة صريحة · Rollback |

---

## 1) الخلفية والسبب (Evidence Before Apply)

نتيجة المراجعة المشتركة بعد الـ snapshot:

- لا يوجد دليل على تسريب بيانات حالياً لـ anon — شروط السماح وشروط التحقق
  الحالية تمنع ذلك فعلياً.
- لكن توجد **ضعف تصميمي معلَن**: 11 سياسة اسمها يوحي بأنها موجَّهة للمستخدم
  المسجل، بينما قائمة الأدوار فيها هي **TO PUBLIC**.
- القرار: تضييق قائمة الأدوار إلى **authenticated** فقط دون أي تغيير في
  الشروط — فيبقى السلوك الوظيفي كما هو حرفياً، ويُغلق سطح الصلاحية المعلنة.
- أي تغيير مستقبلي في الشرط لن يفتح السياسة لغير المسجلين بعد الآن.

**سبب غياب الأثر الوظيفي (منطق الحماية نفسه):** أي دور غير مدرج في قائمة
أدوار السياسة لا تُقيَّم له تلك السياسة أصلاً، وعندها يرفض النظام العملية افتراضياً.
الضيف لم يكن يمرر شروط هذه السياسات (مبنية على دور الجلسة أو ملكية الصف أو
دوال حارسة)، فإخراجه من القائمة لا يغيّر النتيجة الفعلية لأي عملية. هذا المبدأ
مُفصَّل لكل سياسة على حدة في قسم تحليل الأثر.

---

## 2) نطاق التغيير — 3 محاور فقط

| المحور | المضمون | الحالة في هذه الوثيقة |
|---|---|---|
| CR-004.1 | تضييق 11 سياسة من TO PUBLIC إلى authenticated | ✅ **معتمد** — سكربت التنفيذ جاهز |
| CR-004.2 | سياسة التمهيد على جدول المستخدمين | ✅ **معتمد (الخيار أ: حذف)** — بعد سلسلة الأدلة الستة |
| CR-004.3 | دالة عداد رمز الاستجابة السريعة | ⏸ **مؤجل** — بانتظار القرار المعماري لتدفق رمز الاستجابة السريعة |

لا يتضمن هذا التغيير: جداول الجلسات ولا أحداث التحليلات (حالتها سليمة ولا
يُمس بها) ولا إجبار الحماية (Force RLS — قرار مؤجَّل).

---

## 3) CR-004.1 — الحالة الحالية لكل سياسة (من الـ snapshot)

| الجدول | اسم السياسة | الأمر | الحالي | المقترح | الشرط (يُحفظ كما هو) |
|---|---|---|---|---|---|
| public.calibrations | Authenticated insert calibrations | INSERT | PUBLIC | authenticated | `auth.role() = 'authenticated'` (WITH CHECK) |
| public.calibrations | Users manage own calibrations | ALL | PUBLIC | authenticated | `user_id = auth.uid()` (USING + WITH CHECK) |
| public.campaigns | Admins manage campaigns | ALL | PUBLIC | authenticated | `is_admin()` (USING) |
| public.campaigns | Authenticated read campaigns | SELECT | PUBLIC | authenticated | `auth.role() = 'authenticated'` (USING) |
| public.devices | Authenticated insert devices | INSERT | PUBLIC | authenticated | `auth.role() = 'authenticated'` (WITH CHECK) |
| public.devices | Users manage own devices | ALL | PUBLIC | authenticated | `user_id = auth.uid()` (USING + WITH CHECK) |
| public.qr_codes | Admins manage qr codes | ALL | PUBLIC | authenticated | `is_admin()` (USING) |
| public.qr_codes | Authenticated read qr codes | SELECT | PUBLIC | authenticated | `auth.role() = 'authenticated'` (USING) |
| public.surveys | Authenticated insert surveys | INSERT | PUBLIC | authenticated | `auth.role() = 'authenticated'` (WITH CHECK) |
| public.surveys | Users manage own surveys | ALL | PUBLIC | authenticated | `user_id = auth.uid()` (USING + WITH CHECK) |
| public.users | Admins update user roles | UPDATE | PUBLIC | authenticated | `is_admin()` (USING) |

> ملاحظة تقنية: التغيير يتم عبر `ALTER POLICY ... TO authenticated`
> (يستبدل قائمة الأدوار فقط) وليس بإسقاط وإعادة إنشاء، حتى لا يتعرض الشرط
> لأي تغيير بالخطأ. نصوص الشروط أعلاه للتوثيق فقط.

### المشكلة الأمنية الدقيقة

سياسة معلنة للعموم رغم أن اسمها وشرطها يقصدان المسجلين. أي مراجعة أمنية
مستقبلية أو تعديل للشرط قد يفتح سياسة "تظن نفسها مقيدة". التضييق يجعل نية
السياسة مطابقة لتنفيذها.

---

## 4) SQL المقترح — CR-004.1 (نص حرفي)

```sql
alter policy "Authenticated insert calibrations" on public.calibrations to authenticated;
alter policy "Users manage own calibrations"       on public.calibrations to authenticated;

alter policy "Admins manage campaigns"             on public.campaigns   to authenticated;
alter policy "Authenticated read campaigns"        on public.campaigns   to authenticated;

alter policy "Authenticated insert devices"        on public.devices     to authenticated;
alter policy "Users manage own devices"            on public.devices     to authenticated;

alter policy "Admins manage qr codes"              on public.qr_codes    to authenticated;
alter policy "Authenticated read qr codes"         on public.qr_codes    to authenticated;

alter policy "Authenticated insert surveys"        on public.surveys     to authenticated;
alter policy "Users manage own surveys"            on public.surveys     to authenticated;

alter policy "Admins update user roles"            on public.users       to authenticated;
```

- الأثر: **0 صفوف بيانات** — تغيير DDL على قوائم الأدوار فقط.
- كل الأسماء مأخوذة حرفياً من الـ snapshot؛ سيُدرج في سكربت التنفيذ خطوة
  تحقق قراءة فقط تطابق الاسم قبل كل أمر، وتوقف التنفيذ عند أي اختلاف.

### بوابة تحقق إلزامية قبل CR-004.1 (قراءة فقط)

قبل تنفيذ أي أمر، يُشغَّل الاستعلام التالي ويمرّ بنتيجة مطابقة:

```sql
select
  rolname,
  rolsuper,
  rolbypassrls
from pg_roles
where rolname in ('postgres', 'service_role', 'anon', 'authenticated');
```

- النتيجة المطلوبة للمتابعة: دور الخدمة بسمة تجاوز الحماية مفعّلة
  (`rolbypassrls = true`).
- إن كانت القيمة غير ذلك → **توقف فوراً**، ولا يُنفَّذ أي تضييق، وتُعاد
  مراجعة قائمة الأدوار المستهدفة (يُضاف دور الخدمة صراحةً أو يُعاد التصميم).
- السبب موضَّح في قسم دور الخدمة وصاحب القاعدة أدناه.

---

## 5) تحليل أثر التغيير — لكل سياسة على حدة (قسم جديد)

قاعدة الحكم المطبقة على كل السياسات: التضييق يغيّر **قائمة الأدوار** فقط،
والشروط التي تمنع الضيف هي نفسها محفوظة. "الذي يستطيع فعلياً قبل التعديل"
هو الذي يجتاز الشرط بغض النظر عن القائمة، و"الذي سيستطيع بعد التعديل" هو نفسه
تماماً لأن الشروط لم تتغير.

| # | الجدول / السياسة | من كان يستطيع فعلياً قبل التعديل | من سيستطيع بعد التعديل | تدفق متأثر؟ | السبب والدليل |
|---|---|---|---|---|---|
| 1 | calibrations / Authenticated insert calibrations | المسجلون فقط (الشرط: `auth.role() = 'authenticated'`) | المسجلون فقط | لا | الضيف لا يمرر الشرط أصلاً؛ إدراج المعايرة يتم في سياق المسجل فقط |
| 2 | calibrations / Users manage own calibrations | المسجل الذي يملك الصف (`user_id = auth.uid()`) | المسجل الذي يملك الصف | لا | الضيف لا يملك معرّفاً (`auth.uid()` فارغاً)؛ إدارة المعايرة داخل لوحة المسجل |
| 3 | campaigns / Admins manage campaigns | المسجل الذي يمرر `is_admin()` فقط | المسجل الذي يمرر `is_admin()` فقط | لا | إنشاء الحملات وإيقافها في `src/core/qr/campaign.ts` من سياق إداري مسجل |
| 4 | campaigns / Authenticated read campaigns | المسجلون فقط (الشرط: `auth.role() = 'authenticated'`) | المسجلون فقط | لا | قراءة الحملات الحالية في `src/core/supabase/data-service.ts` من سياق مسجل |
| 5 | devices / Authenticated insert devices | المسجلون فقط (الشرط: `auth.role() = 'authenticated'`) | المسجلون فقط | لا | تسجيل الأجهزة في `src/core/supabase/PersistenceProvider.tsx` بعد تسجيل الدخول |
| 6 | devices / Users manage own devices | المسجل الذي يملك الجهاز | المسجل الذي يملك الجهاز | لا | نفس ما سبق؛ لا يوجد إنشاء جهاز بصلاحية ضيف |
| 7 | qr_codes / Admins manage qr codes | المسجل الذي يمرر `is_admin()` فقط | المسجل الذي يمرر `is_admin()` فقط | لا | إدارة الرموز إدارية بحتة من لوحة المسؤول |
| 8 | qr_codes / Authenticated read qr codes | المسجلون فقط (الشرط: `auth.role() = 'authenticated'`) | المسجلون فقط | لا | حلّ الرمز للضيف لا يقرأ الجدول مباشرة بل عبر دالة `lookup_campaign_by_short_code` الممنوحة للضيف والمسجل |
| 9 | surveys / Authenticated insert surveys | المسجلون فقط (الشرط: `auth.role() = 'authenticated'`) | المسجلون فقط | لا | إرسال الاستبيان من سياق مسجل؛ لا يوجد إرسال بصلاحية ضيف |
| 10 | surveys / Users manage own surveys | المسجل الذي يملك الاستبيان | المسجل الذي يملك الاستبيان | لا | إدارة الاستبيانات داخل حساب المسجل |
| 11 | users / Admins update user roles | المسجل الذي يمرر `is_admin()` فقط | المسجل الذي يمرر `is_admin()` فقط | لا | تحديث الأدوار من لوحة إدارية؛ لا توجد واجهة ضيف |

### ملاحظة عن الصف الثامن (قراءة رموز الاستجابة السريعة)

حلّ الرمز عند الضيف لا يقرأ جدول الرموز مباشرة، بل عبر الدالة الحارسة الممنوحة
للضيف والمسجل، وتفويضها الحالي منضبط أصلاً (منح للضيف والمسجل فقط، لا للعموم)
كما في `supabase/migrations/00007_lookup_campaign_by_short_code.sql`. لذلك لا
يتأثر مسار الرمز عند الضيف بهذا التضييق.

### ملاحظة عن الصفوف 5 و 6 (الأجهزة)

لا يوجد في الكود أي إنشاء جهاز يُنفَّذ بصلاحية ضيف؛ تسجيل الأجهزة يحدث في
سياق مسجل بعد تسجيل الدخول كما في `src/core/supabase/PersistenceProvider.tsx`.

---

## 6) CR-004.2 — سياسة التمهيد على جدول المستخدمين

### الحالة الحالية

| الجدول | اسم السياسة | الأمر | الحالي | الشرط |
|---|---|---|---|---|
| public.users | Bootstrap insert first user | INSERT | PUBLIC | `has_super_admin() = false` (WITH CHECK) |

### المبدأ: لا حذف بمجرد وجود مسؤول

وجود مستخدم إداري وحده **لا يكفي**. يُشترط إثبات أن السياسة لم تعد مستخدمة
إطلاقاً عبر ثلاثة أدلة، ثم يُتخذ القرار (حذف نهائي / تقييد / إبقاء).

### الدليل الأول — كود التطبيق (موثَّق من المستودع)

- لا يوجد أي إدراج مباشر في جدول المستخدمين من كود التطبيق.
- إنشاء أول مسؤول يتم عبر `auth.signUp` في الشاشة:
  `src/screens/auth/AdminSetupScreen.tsx`
- ثم يتولى الزناد `handle_new_user` إنشاء الصف، وهو دالة بصلاحية موسعة
  (`SECURITY DEFINER`) يملكها صاحب القاعدة، فتتجاوز الحماية ولا تحتاج أي سياسة.
- قراءة أدوار المستخدمين تتم عبر `select` بعد تسجيل الدخول
  (`src/core/auth/index.ts`)، ولا علاقة لها بسياسة الإدراج.

### الدليل الثاني — زنادات قاعدة البيانات (استعلام قراءة فقط — يُشغَّل)

```sql
select
  t.tgname            as trigger_name,
  t.tgenabled::text   as enabled,
  p.proname           as function_name,
  n.nspname || '.' || p.proname as function_qualified
from pg_trigger t
join pg_class c on c.oid = t.tgrelid
join pg_proc p on p.oid = t.tgfoid
join pg_namespace n on n.oid = p.pronamespace
where c.relname = 'users'
  and c.relnamespace = 'public'::regnamespace
  and not t.tgisinternal;
```

- النتيجة المطلوبة: **لا صفوف** — لا يوجد زناد على جدول المستخدمين يعتمد
  على سياسة الإدراج.

### الدليل الثالث — دوال تكتب في جدول المستخدمين (استعلام قراءة فقط — يُشغَّل)

```sql
with f as (
  select
    p.oid,
    n.nspname || '.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' as fqn,
    p.prosecdef                     as security_definer,
    pg_get_userbyid(p.proowner)     as owner,
    p.proconfig                     as config,
    pg_get_functiondef(p.oid)       as body
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.prokind = 'f'
)
select
  fqn,
  case when security_definer then 'SECURITY DEFINER' else 'SECURITY INVOKER' end as security,
  owner,
  config
from f
where body ~* 'insert[[:space:]]+into[[:space:]]+(public[[:space:]]*\.)?[[:space:]]*users';
```

- النتيجة المطلوبة: أي دالة مكتشفة يجب أن تكون بصلاحية موسعة يملكها صاحب
  القاعدة (مثل `handle_new_user`) — عندها لا تخضع للحماية ولا تحتاج السياسة.
- إن وُجدت دالة بصلاحية عادية (INVOKER) تكتب في الجدول → يُعلَّق القرار ويُحلَّل.

### الدليل الرابع — التعريف الكامل للدالة handle_new_user (استعلام قراءة فقط)

فحص اسم الإدراج وحده لا يكفي؛ قد تستخدم الدالة تحديثاً أو إدراجاً مدمجاً أو
استدعاء دالة أخرى. لذلك يُشترط مراجعة جسم الدالة كاملاً:

```sql
select pg_get_functiondef(
  'public.handle_new_user()'::regprocedure
);
```

### الدليل الخامس — أماكن استدعاء الدالة handle_new_user (استعلام قراءة فقط)

تُراجَع كل الزنادات التي تستدعي الدالة لمعرفة مصدر التفعيل الفعلي:

```sql
select
  t.tgname,
  c.relname,
  p.proname
from pg_trigger t
join pg_proc p on p.oid = t.tgfoid
join pg_class c on c.oid = t.tgrelid
where p.proname = 'handle_new_user';
```

### الدليل السادس — علاقة الدالة بحماية الجدول (استعلام قراءة فقط — البوابة الأخيرة)

سؤال حاسم: هل الحماية على جدول المستخدمين تُطبَّق على الدالة أم تُتجاوز؟
القرار يختلف جذرياً حسب الإجابة، فيُشترط التحقق من حالتين:

**حالة جدول المستخدمين وحماية الصفوف:**

```sql
select
  c.relname,
  c.relrowsecurity,
  c.relforcerowsecurity,
  pg_get_userbyid(c.relowner) as owner
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname = 'users';
```

**مالك الدالة وصيغتها مقارنة بمالك الجدول:**

```sql
select
  n.nspname || '.' || p.proname as function_name,
  pg_get_userbyid(p.proowner)   as owner,
  p.prosecdef                   as security_definer
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'handle_new_user';
```

### القرار (يُتخذ بعد وصول نتائج الأدلة الستة)

- الأدلة الستة كلها سليمة → **الخيار أ: حذف السياسة نهائياً**.
- لا يوجد زناد ودوال سليمة لكن يُفضل تحفّظ إضافي → **الخيار ب: تقييدها إلى دور الخدمة**.
- وُجد اعتماد فعلي غير متوقع → **الخيار ج: إبقاؤها** وتُعاد دراسة التصميم.

### SQL المقترح — CR-004.2 (الخيار أ — لا يُنفَّذ إلا بعد نجاح الأدلة الثلاثة)

```sql
drop policy "Bootstrap insert first user" on public.users;
```

### SQL المقترح — CR-004.2 (الخيار ب — بديل)

```sql
alter policy "Bootstrap insert first user" on public.users to service_role;
```

### أثر CR-004.2

- لا يمنع إنشاء مستخدمين جدداً — تدفق التسجيل عبر مصادقة Supabase يبقى،
  والزناد `handle_new_user` يتولى إنشاء صف المستخدم.
- إنشاء مستخدم إداري مستقبلي لن يتم عبر العموم، بل عبر قناة موثوقة:
  خدمة الخادم أو دالة داخلية حصرية — وهذا هو السلوك المطلوب.

---

## 7) CR-004.3 — دالة عداد رمز الاستجابة السريعة (أدلة أولاً — لا تنفيذ هنا)

### الحالة الحالية (من C3.4 + C3b)

- الدالة: `public.increment_qr_counter(uuid, text)`
- صيغة SECURITY DEFINER، وتم في CR-003 ضبط `search_path = public` لها.
- منح التنفيذ ما زال يشمل **PUBLIC** وفق نتيجة C3.4.

### الدليل من كود التطبيق — أين تُستدعى (موثَّق)

- رفع عدد المسح يحدث من مسار الرمز فور فتحه في:
  `src/App.tsx` ← `createCampaignStore().recordScan(...)`
- والدالة المسؤولة في:
  `src/core/qr/campaign.ts` ← `client.rpc('increment_qr_counter', ...)`
- هذا المسار يعمل **قبل تسجيل الدخول** للضيف الذي يفتح الرابط.

**النتيجة:** منح التنفيذ للضيف (anon) مطلوب لكي تعمل عدّادات المسح للضيوف،
ما لم يُنقل الاستدعاء إلى دالة حافة بصلاحيات خدمية. قرار "المسجلون فقط"
بدون هذه النقلة **سيكسر عدّادات المسح للضيوف**.

### أدلة قاعدة البيانات (قراءة فقط — تُشغَّل قبل أي قرار)

```sql
select pg_get_functiondef('public.increment_qr_counter(uuid, text)'::regprocedure) as definition;

select
  coalesce(nullif(r.rolname, ''), 'public') as grantee,
  a.privilege_type as privilege
from pg_proc p
cross join lateral aclexplode(p.proacl) a
left join pg_roles r on r.oid = a.grantee
where p.proname = 'increment_qr_counter'
  and p.pronamespace = 'public'::regnamespace;
```

### قرار التصميم المفتوح (يُتخذ بعد وصول الأدلة — لا REVOKE الآن)

| الخيار | الوصف | الملاءمة بعد الدليل |
|---|---|---|
| أ — الإبقاء للضيف والمسجل | منح التنفيذ للضيف والمسجل (لا للعموم) + تقوية داخل الدالة | مناسب إذا بقي رفع العداد من الضيف كما هو الآن |
| ب — المسجلون فقط | منح التنفيذ للمسجلين فقط | **يُرفض** ما لم يؤكد المشروع أن العدّادات لا تُرفع إلا بعد التسجيل، والدليل الحالي يعارض ذلك |
| ج — نقل إلى دالة حافة | سحب منح التنفيذ ونقل الاستدعاء لخدمة بصلاحيات خدمية | مناسب إن أريد فحص وتحقق إضافي قبل كل رفع، لكنه يتطلب بنية جديدة (لا توجد دوال حافة حالياً) |

**ملاحظة:** القرار النهائي يُضاف كقسم تكميلي لـ CR-004.3 بعد استلام الأدلة،
ولا يُنفَّذ أي أمر تنفيذ لهذه الدالة ضمن CR-004 الحالي.

---

## 8) دور الخدمة وصاحب القاعدة — لماذا لن يتأثرا (قسم جديد)

### مواضع الاعتماد عليهما في المشروع (يُوثَّق للتدقيق الأمني)

- إنشاء الجداول والترحيلات تُنفَّذ بصلاحيات صاحب القاعدة:
  `supabase/migrations`
- سكربتات التدقيق والتصحيح تُنفَّذ بنفس الصلاحيات:
  `supabase/security-hardening`
- إنشاء صف المستخدم عبر الزناد `handle_new_user` بصلاحية موسعة يملكها صاحب
  القاعدة.
- عميل التطبيق يستخدم الضيف والمسجل فقط، ولا توجد دوال حافة في المستودع.

### لماذا لا يتأثران بهذا التغيير

- صاحب القاعدة (postgres): مالك الجداول ويملك صلاحية عليا، والحماية لا تُطبَّق
  على المالك إلا عند فرضها (FORCE RLS) — والفرض غير مفعّل حالياً ولم يُفعَّل
  في هذا التغيير.
- دور الخدمة (service_role): يعتمد المشروع على تجاوزه للحماية بسبب سمة الدور
  (`rolbypassrls`). هذه السمة **تُتحقق بقراءة فقط قبل التنفيذ** كبوابة إلزامية
  (القسم 4)، ولا يُسلَّم بها افتراضاً.
- علاوة على ذلك: هذا التغيير لا يمس منح الجداول، ولا سمة الأدوار، ولا أي
  عملية تخص أدوار الخدمة.

### النتيجة

- إن كانت بوابة التحقق سليمة → لا أثر على أدوار الخدمة أو صاحب القاعدة،
  والوثيقة تستند إلى دليل وليس افتراضاً.
- إن لم تكن سليمة → يتوقف التنفيذ فوراً كما هو منصوص في بوابة التحقق.

---

## 9) الصفوف المتأثرة (Expected Rows)

- **0 صفوف بيانات** — التغيير كله DDL على قوائم أدوار السياسات وحذف سياسة.
- لا أي INSERT/UPDATE/DELETE، ولا GRANT/REVOKE على الجداول أو الدوال في
  CR-004.1 وCR-004.2.

---

## 10) خطة Rollback

سكربت التراجع الجاهز للاستخدام فوراً:
`supabase/security-hardening/phase-c/CR-004-rollback.sql`

- يعيد الـ 11 سياسة إلى PUBLIC.
- يعيد إنشاء سياسة التمهيد بنصها الأصلي.
- يشمل بوابة تحقق تمنع التطبيق المزدوج أو على حالة غير متوقعة.
- يعيد شبكة تحقق واحدة بنتيجة الحكم النهائي.

### إلغاء CR-004.1 (إعادة الأدوار إلى PUBLIC)

```sql
alter policy "Authenticated insert calibrations" on public.calibrations to public;
alter policy "Users manage own calibrations"       on public.calibrations to public;
alter policy "Admins manage campaigns"             on public.campaigns   to public;
alter policy "Authenticated read campaigns"        on public.campaigns   to public;
alter policy "Authenticated insert devices"        on public.devices     to public;
alter policy "Users manage own devices"            on public.devices     to public;
alter policy "Admins manage qr codes"              on public.qr_codes    to public;
alter policy "Authenticated read qr codes"         on public.qr_codes    to public;
alter policy "Authenticated insert surveys"        on public.surveys     to public;
alter policy "Users manage own surveys"            on public.surveys     to public;
alter policy "Admins update user roles"            on public.users       to public;
```

### إلغاء CR-004.2 (الخيار أ — إعادة إنشاء سياسة التمهيد)

```sql
create policy "Bootstrap insert first user"
on public.users for insert to public
with check (has_super_admin() = false);
```

> نص شرط التحقق أعلاه يطابق ما ورد في الـ snapshot؛ في حال كان النص الحرفي
> في قاعدة البيانات مختلفاً، يُعاد إنشاؤه بالنص المأخوذ من أرشيف الـ snapshot
> نفسه (وليس هذا الملف).

---

## 11) التحقق بعد التنفيذ (Post-Apply) — قسم موسَّع

### 11.1 إعادة تشغيل أدوات القراءة فقط

- إعادة تشغيل أداة `C3b-policy-snapshot.sql` → الـ 11 سياسة أصبحت قائمة
  أدوارها للمسجلين، وسياسة التمهيد غير موجودة (إن نُفذ الخيار أ).
- إعادة تشغيل `C3-privilege-audit.sql` → تحديث C3.9 وC3.4.

### 11.2 اختبارات عملية قبل وبعد التنفيذ (إلزامية)

تُنفَّذ كلها **قبل** التنفيذ (خط أساس) و**بعد** التنفيذ، وتُقارن النتائج.
أي اختبار كان يعمل قبل ثم فشل بعد → **يُوقف اعتماد CR-004** ولا يُغلق حتى
يُفسَّر ويُحلَّ.

| # | الاختبار | الوصف المطلوب |
|---|---|---|
| 1 | تسجيل مستخدم جديد | إنشاء حساب جديد بالبريد وتأكيد وجود صف في جدول المستخدمين |
| 2 | دخول مستخدم عادي | تسجيل الدخول والوصول إلى بياناته الشخصية وقراءة الصف الخاص به |
| 3 | دخول باحث | تسجيل الدخول بحساب باحث وفتح لوحة الباحثين |
| 4 | دخول مدير | تسجيل الدخول بحساب إداري وفتح لوحة الإدارة |
| 5 | تدفق رمز الاستجابة السريعة | فتح رابط رمز قصير كضيف وحل الحملة وظهور تدفق اللعبة |
| 6 | جلسة لعبة | بدء جلسة لعبة وإتمامها |
| 7 | حفظ الجلسة | التأكد من كتابة الجلسة في جدول الجلسات بعد الاكتمال |
| 8 | حفظ أحداث التحليلات | التأكد من كتابة أحداث التحليلات (تسجيل/حدث لعبة) |

### 11.3 جمع الأدلة في شبكة واحدة

تُجمع كل النتائج في **شبكة واحدة** عبر سكربت `CR-004-execute.sql`
(يُسلَّم مع الاعتماد): قبل/بعد لكل سياسة + نتيجة أدلة التمهيد + نتيجة بوابة
دور الخدمة + final_verdict.

- **final_verdict المتوقع:** `PASS — 11 policies tightened to authenticated; bootstrap policy decision applied; RLS intact; functional tests matched`.

---

## 12) الموافقة

- [x] ✅ **CR-004.1 (تضييق 11 سياسة): معتمد** — مراجعة المراجع بتاريخ 2026-08-04.
- [x] ✅ **CR-004.2 (سياسة التمهيد): معتمد — الخيار أ (حذف)** — بتاريخ 2026-08-04،
      بعد اكتمال سلسلة الأدلة الستة:
      1. كود التطبيق لا يُدرج مباشرة في جدول المستخدمين.
      2. لا يوجد زناد على جدول المستخدمين.
      3. الدالة الوحيدة الكاتبة في الجدول هي `handle_new_user` بصلاحية موسعة.
      4. الجسم الكامل: إدراج مدمج فقط، لا استدعاءات داخلية ولا SQL ديناميكي.
      5. المستدعي الوحيد هو الزناد `on_auth_user_created` على جدول المصادقة.
      6. مالك الدالة ومالك الجدول كلاهما صاحب القاعدة، بسمة تجاوز الحماية،
         والحماية المفروضة غير مفعّلة.
- [ ] 🔄 **CR-004.3 (دالة العداد): مؤجل** — مرتبط بالقرار المعماري لتدفق
      رمز الاستجابة السريعة (تأثير مباشر على الضيوف وسلامة العدادات).
      لا أي REVOKE أو GRANT أو تعديل للدالة قبل اعتماد التصميم.
- [x] ✅ **التنفيذ النهائي: معتمد** — بتاريخ 2026-08-04، وفق التسلسل في القسم 13
      دون أي اختصار، وبسكربت `CR-004-execute.sql` وسكربت التراجع الجاهز
      `CR-004-rollback.sql`.

---

## 13) تسلسل التنفيذ (بعد الاعتماد النهائي)

1. تشغيل أداة الـ snapshot وأرشفة النتيجة كـ "قبل":
   `supabase/security-hardening/phase-c/C3b-policy-snapshot.sql`
2. تشغيل سكربت التنفيذ ولصق شبكة الأدلة الناتجة:
   `supabase/security-hardening/phase-c/CR-004-execute.sql`
   (البوابات مدمجة داخله: تطابق الأسماء، وجود سياسة التمهيد، بوابة دور
   الخدمة، وعدم فرض الحماية — أي فشل يوقف التنفيذ قبل أي تغيير).
3. تشغيل أداة الـ snapshot مرة ثانية وأرشفة النتيجة كـ "بعد".
4. إعادة تشغيل أداة C3 ولصق النتيجة لتحديث C3.9 وC3.4.
5. تنفيذ الاختبارات العملية الواردة في القسم 11.2 ومقارنتها بخط الأساس.
6. التأكد من خلو السجلات من أخطاء بعد الاختبارات.
7. إغلاق CR-004 رسمياً وإغلاق مراجعة C3.

**ملاحظة مسجلة:** السكربت يُنفَّذ مرة واحدة كاملة، ولا يجوز تشغيل أوامره
تفرقةً. Rollback الكامل جاهز في السكربت المستقل `CR-004-rollback.sql`
(القسم 10).

---

## 14) نتيجة التنفيذ (شبكة cr004_evidence — 2026-08-04)

- **before:** السياسات الـ 12 كلها على الصلاحية العامة (public).
- **after:** السياسات الـ 11 أصبحت على صلاحية المسجل (authenticated)، وسياسة
  التمهيد أصبحت غير موجودة.
- **force_rls_users:** غير مفعّلة.
- **expected_rows:** 0 صفوف بيانات.
- **final_verdict:** `PASS — 11 policies tightened to authenticated; Bootstrap insert first user dropped; RLS intact`

النتيجة مطابقة تماماً للتوقعات الواردة في القسم 4 و6، ودفق الحماية سليم.

### تأكيد الـ snapshot بعد التنفيذ (C3b — 2026-08-04)

- السياسات الـ 11 المستهدفة: قائمة أدوارها = المسجل (authenticated) في كل الجداول
  (معايرة، حملات، أجهزة، رموز، استبيانات، مستخدمون).
- سياسة التمهيد: **غير موجودة** في قائمة السياسات.
- السياسات غير المستهدفة (التحليلات، الجلسات، سياسات القراءة للباحثين):
  بقيت على صلاحية المسجل دون أي تغيير.
- لا توجد أي سياسة باسمها يوحي بالتسجيل وقائمة أدوارها عامة.

---

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-04 | إنشاء CR-004 (نسخة 1) — بانتظار الاعتماد، لا تنفيذ |
| 2026-08-04 | **نسخة 2** — تحليل أثر لكل سياسة · أدلة إلزامية لسياسة التمهيد · دليل كود لمسار العداد · قسم دور الخدمة · اختبارات عملية قبل وبعد |
| 2026-08-04 | **نسخة 3** — استلام أدلة قاعدة البيانات: بوابة دور الخدمة ✅ (service_role و postgres يتجاوزان الحماية) · الدوال الكاتبة في جدول المستخدمين (handle_new_user فقط، بصلاحية موسعة) · تفويض دالة العداد (EXECUTE للعموم) — إضافة الدليلين الرابع والخامس |
| 2026-08-04 | **نسخة 4** — استلام الدليلين الرابع والخامس (الجسم الكامل: إدراج مدمج فقط؛ المستدعي الوحيد: on_auth_user_created) + الدليل السادس (المالك موحد + تجاوز الحماية + لا فرض) → **اعتماد CR-004.1 وCR-004.2** (حذف سياسة التمهيد) · CR-004.3 مؤجل بقرار تصميمي · إعداد سكربت CR-004-execute.sql ببوابات تحقق مدمجة |
| 2026-08-04 | **نسخة 5** — مراجعة سطرية للسكربت → **اعتماد التنفيذ النهائي** ✅ · إعداد سكربت التراجع المستقل `CR-004-rollback.sql` · التسلسل المعتمد: snapshot قبل ← تنفيذ ← أدلة ← snapshot بعد ← مراجعة C3 ← اختبارات وظيفية |

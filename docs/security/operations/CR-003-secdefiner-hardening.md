# CR-003 — تقوية SECURITY DEFINER: `search_path` + نظافة EXECUTE

| الحقل | القيمة |
|---|---|
| Change ID | CR-003 |
| التاريخ | 2026-08-04 |
| المرجع | C1 — SECURITY DEFINER Audit (`docs/security/phase-c/C1-secdefiner-audit.md`) — القرار: **OPEN** |
| التصنيف | إصلاح أمني من Phase C (C1) |
| الحالة | ✅ **مُغلق** (التحقق: `final_verdict = PASS`) |
| الجهة المنفذة | Supabase SQL Editor (دور owner) |
| السكربت | `supabase/security-hardening/phase-c/CR-003-execute.sql` |

---

## 1) السبب (Evidence Before Apply — من شبكات C1)

- **F1/F2/F3** — 3 دوال `SECURITY DEFINER` بلا `search_path` صريح
  (`proconfig = (none)` = DEFAULT — عرضة لـ schema hijacking):
  `public.handle_new_user()` · `public.has_super_admin()` ·
  `public.increment_qr_counter(uuid, text)`.
- **F4** — `handle_new_user` ممنوحة `EXECUTE` إلى `public`/`anon`/`authenticated`
  رغم أنها دالة trigger فقط (تُشغَّل تلقائياً على `auth.users` — الـ trigger يتجاوز
  فحص EXECUTE)، فسحب EXECUTE لا يكسر تدفق التسجيل ويُزيل سطحاً غير مبرَّر.

## 2) الحالة الحالية (ليُؤكَّد قبل التنفيذ)

```sql
-- توقع: 3 صفوف proconfig = (none)/NULL + handle_new_user EXECUTE = true للجميع
select n.nspname, p.proname, p.proconfig
from pg_proc p join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname in ('handle_new_user', 'has_super_admin', 'increment_qr_counter');

select has_function_privilege('public', 'public.handle_new_user()', 'EXECUTE') as pub,
       has_function_privilege('anon', 'public.handle_new_user()', 'EXECUTE')  as anon,
       has_function_privilege('authenticated', 'public.handle_new_user()', 'EXECUTE') as auth;
```

**متوقع:** `proconfig` = NULL/(none) للثلاثة · `pub/anon/auth` = true.

## 3) SQL Preview (النص الحرفي — القسم الفعلي من السكربت)

```sql
alter function public.handle_new_user() set search_path = public;          -- F1
alter function public.has_super_admin() set search_path = public;          -- F2
alter function public.increment_qr_counter(uuid, text) set search_path = public; -- F3

revoke all on function public.handle_new_user() from public, anon, authenticated; -- F4
```

**ملاحظة أمان:** DDL فقط — لا تعديل على أجسام الدوال (المنطق يبقى كما هو) ولا
على البيانات. لا تُلمس بقية الدوال (كلها صريحة `search_path`).

## 4) الصفوف المتوقعة / المتأثرة

- **Expected row count:** 0 صفوف بيانات — تغيير DDL (config/ACL) فقط، بلا صفوف.
- **التأثير الجانبي:** لا شيء — الدوال تبقى قابلة للاستدعاء من حُرّاسها الحاليين؛
  `handle_new_user` يستمر بالعمل عبر trigger `auth.users` (يُثبَت في `cr003_evidence`).

## 5) Rollback

- **F1–F3 (عكس search_path):**
  ```sql
  alter function public.handle_new_user() reset search_path;
  alter function public.has_super_admin() reset search_path;
  alter function public.increment_qr_counter(uuid, text) reset search_path;
  ```
- **F4 (استعادة EXECUTE الأصلي إن لزم):**
  ```sql
  grant execute on function public.handle_new_user() to public, anon, authenticated;
  ```

## 6) التحقق بعد التنفيذ (Post-Apply)

- `cr003_evidence` (شبكة واحدة) يلتقط: `before/after` لـ search_path (الثلاثة) +
  `before/after` لـ EXECUTE + `trigger_handle_new_user` (بقاء الـ trigger) +
  `final_verdict`.
- **final_verdict المتوقع:** `PASS — 3 search_paths explicit; handle_new_user EXECUTE revoked; trigger intact`.
- **سلامة:** كل دالة تبقى قابلة للاستدعاء من مستخدميها الحاليين (عدا سحب EXECUTE
  المتعمد من `handle_new_user`).

## 7) الموافقة

- [x] ✅ **معتمد** (المشروع/المستخدم) — التاريخ: 2026-08-04
- الأدلة تُلتقط في **شبكة واحدة** عبر `CR-003-execute.sql`:
  1. `before` search_path ×3 + `before` EXECUTE — من الحالة الجارية.
  2. تنفيذ ALTER ×3 + REVOKE ×1 حرفياً.
  3. `after` search_path ×3 + `after` EXECUTE.
  4. `trigger_handle_new_user` — إثبات بقاء الـ trigger (سلامة تدفق التسجيل).
  5. `final_verdict` — تحديث هذا الملف بالنتائج الفعلية.
  6. إغلاق Change ID رسمياً بعد النجاح، ثم إغلاق مراجعة **C1**.

## 8) تنفيذ الفعل + النتيجة (من شبكة `cr003_evidence` — 2026-08-04)

- before_search_path_handle_new_user: **(default)**
- before_search_path_has_super_admin: **(default)**
- before_search_path_increment_qr_counter: **(default)**
- after_search_path_handle_new_user: **{search_path=public}**
- after_search_path_has_super_admin: **{search_path=public}**
- after_search_path_increment_qr_counter: **{search_path=public}**
- before_execute_handle_new_user: **public=true anon=true auth=true**
- after_execute_handle_new_user: **public=false anon=false auth=false**
- trigger_handle_new_user: **on_auth_user_created on auth.users**
- final_verdict: **PASS — 3 search_paths explicit; handle_new_user EXECUTE revoked; trigger intact**

النتيجة: إصلاح كامل مطابق للتوقعات — DDL فقط (0 صفوف بيانات)، ودفق التسجيل سليم
(trigger `on_auth_user_created` ما زال حياً على `auth.users`).

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-04 | إنشاء CR-003 (F1–F4) + سكربت `CR-003-execute.sql` + إحالته للموافقة |
| 2026-08-04 | **اعتماد CR-003** — شرط: تنفيذ `CR-003-execute.sql` بموجب `change-management.md` |
| 2026-08-04 | **إغلاق CR-003 رسمياً** — `final_verdict = PASS` · search_path ×3 = `{search_path=public}` · EXECUTE `handle_new_user` = false للجميع · trigger سليم |

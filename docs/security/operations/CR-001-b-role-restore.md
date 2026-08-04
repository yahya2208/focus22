# CR-001 — استعادة دور المستخدم B إلى `user`

| الحقل | القيمة |
|---|---|
| Change ID | CR-001 |
| التاريخ | 2026-08-03 |
| المرجع | Incident `2026-08-03-baseline-reverify-incident.md` |
| التصنيف | استرجاع حادث (D1) |
| الحالة | ✅ **مُغلق** (التحقق: `final_verdict = PASS`) |
| الجهة المنفذة | Supabase SQL Editor (دور owner) |
| السكربت | `supabase/security-hardening/phase2/09-2.1.6-cr-001-cr-002-execute.sql` — القسم [CR-001] |

---

## 1) السبب (Evidence Before Apply)

- بروب `04-2.1.6` (RCA: H1 — تسريب `request.jwt.claims` بمدى SESSION) رقّى
  `users.role(B)` من `user` إلى `admin`.
- أدلة الحادث: R013 → `B.role = admin` · `updated_at = 2026-08-03 18:30:05Z`
  (ضمن نافذة الحادث) · R002 الحارس حي والأصل `user`.
- **هذا CR لاسترجاع حالة صلاحيات مستخدم حقيقي — منفصل كلياً عن scan_count
  (D2) المُغلقة بقرار إداري ولا تُسترجَع.**

## 2) الحالة الحالية (ليُؤكَّد قبل التنفيذ)

```sql
-- توقع: صف واحد بدور admin
select id, email, role, updated_at
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';
```

**متوقع:** `role = 'admin'`. إذا ظهر `role = 'user'` → CR مُنجز سابقاً ولا
يُحدَّث شيء.

## 3) SQL Preview (النص الحرفي)

```sql
update public.users
   set role = 'user'
 where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0'
   and role = 'admin';   -- حارس: يلمس الصف المحدد فقط، وفقط إذا كان ما زال admin
```

## 4) الصفوف المتوقعة / المتأثرة

- **Expected row count:** 0 أو 1 (استعلام `count(*)` نفس الشرط).
- **الصف المتأثر:** B = `979e7949-794f-4386-b2a4-dc207d4fb0d0` فقط (المفتاح
  الأساسي في الشرط + حارس `role='admin'`).
- **التأثير الجانبي:** عمود `updated_at` يتغير (سلوك تعديل). لا شيء آخر.

## 5) Snapshot / Rollback

- القيمة الأصلية معروفة (دور `user`) — الاسترجاع حرفياً عكس نفس UPDATE.
- تُحفظ لقطة (`select` لقسم 2 قبل التنفيذ) في سجل الـ CR.

## 6) التحقق بعد التنفيذ (Post-Apply)

```sql
-- توقع: role = 'user'
select id, email, role, updated_at
from public.users
where id = '979e7949-794f-4386-b2a4-dc207d4fb0d0';

-- توقع: لا يبقى أي مستخدم بخلاف A بصلاحيات لم تُقرّر
select id, role from public.users where role in ('admin','super_admin');
```

**سلامة:** `updated_at` بعد التنفيذ > `18:30:05Z`، والدور `user`. لا صفوف زائدة.

## 7) الموافقة

- [x] ✅ **معتمد** (المشروع/المستخدم) — التاريخ: 2026-08-03
- **شرط الموافقة:** الالتزام الكامل بـ `change-management.md` وليس استثناءً منها.
  الأدلة تُلتقط في **شبكة واحدة** عبر `09-2.1.6-cr-001-cr-002-execute.sql`:
  1. `expected_rows` — تأكيد عدد الصفوف المتوقع قبل التنفيذ (0 أو 1).
  2. `before_state` — SELECT تشخيصي قبل التنفيذ.
  3. تنفيذ SQL المُستهدف فقط بحارس `role='admin'` مع تسجيل `rows_affected` (GET DIAGNOSTICS).
  4. `after_state` + `verification` — SELECT تحقق بعد التنفيذ.
  5. `final_verdict` — تحديث هذا الملف بالنتائج الفعلية (وليس المتوقعة فقط).
  6. إغلاق الـ Change ID رسمياً بعد نجاح التحقق.

## 8) تنفيذ الفعل + النتيجة (من شبكة `cr_evidence` — 2026-08-03)

- expected_rows: **0**
- before_state: **role=user**
- rows_affected: **0**
- after_state: **role=user**
- verification: **rows id=B AND role=user = 1**
- final_verdict: **PASS — B is user, no admin residue for B**
- النتيجة: الحالة النهائية المطلوبة كانت موجودة بالفعل وقت التنفيذ — لا تغيير مطلوب (`rows_affected = 0` هو السلوك الصحيح، وليس فشلاً).

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-03 | إنشاء CR بانتظار الموافقة |
| 2026-08-03 | **اعتماد CR-001** — شرط: تنفيذ عبر `09-2.1.6-cr-001-cr-002-execute.sql` بموجب `change-management.md` |
| 2026-08-03 | **إغلاق CR-001 رسمياً** — `final_verdict = PASS` · `rows_affected = 0` (B كان `user` أصلاً) · التحقق بعدي: صف واحد لـ B بدور `user`، لا بقايا admin |

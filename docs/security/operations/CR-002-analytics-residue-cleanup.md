# CR-002 — حذف بقايا `baseline_reverify%` من analytics_events

| الحقل | القيمة |
|---|---|
| Change ID | CR-002 |
| التاريخ | 2026-08-03 |
| المرجع | Incident `2026-08-03-baseline-reverify-incident.md` (D3) |
| التصنيف | تنظيف بقايا حادث (D3) |
| الحالة | ✅ **مُغلق** (التحقق: `final_verdict = PASS`) |
| الجهة المنفذة | Supabase SQL Editor (دور owner) |
| السكربت | `supabase/security-hardening/phase2/09-2.1.6-cr-001-cr-002-execute.sql` — القسم [CR-002] |

---

## 1) السبب (Evidence Before Apply)

- بروب `04-2.1.6` (الخطوة E9) أنشأ صفاً في `analytics_events` بـ
  `event_type = 'baseline_reverify_owner'`؛ فشل تنظيفه لعدم وجود سياسة DELETE
  على الجدول (D4 — عيب في تنظيف البروب، وليس اختراق صلاحيات).
- الحالة الأصلية المعروفة: **لا يوجد** أي صف بـ `event_type like 'baseline_reverify%'`.

## 2) الحالة الحالية (ليُؤكَّد قبل التنفيذ)

```sql
-- توقع: صف واحد فقط هو residue، راجع id قبل الحذف
select id, user_id, event_type, created_at
from public.analytics_events
where event_type like 'baseline_reverify%';
```

**متوقع:** صف واحد `baseline_reverify_owner` بُني خلال نافذة الحادث.

## 3) SQL Preview (النص الحرفي)

```sql
delete from public.analytics_events
where event_type like 'baseline_reverify%';   -- نطاق: أنواع البروب فقط
```

**ملاحظة أمان:** لا يوجد سياسة DELETE على الجدول، لذا يُنفَّذ بالدور owner
فقط. الشرط مقصور على بادئة البروب لمنع أي حذف خارجها.

## 4) الصفوف المتوقعة / المتأثرة

- **Expected row count:** 1 (بعد المعاينة في القسم 2).
- **الصف المتأثر:** صف(وف) `baseline_reverify%` فقط.
- **التأثير الجانبي:** لا شيء — باقي التحليلات (`analytics_visible`) خارج النطاق.

## 5) Snapshot / Rollback

- يُحفظ ناتج القسم 2 (id/created_at) قبل الحذف.
- لا حاجة لنسخة احتياطية: الصف أثري من حادث والقيمة الأصلية "لا يوجد".

## 6) التحقق بعد التنفيذ (Post-Apply)

```sql
-- توقع: 0
select count(*) as remaining_residue
from public.analytics_events
where event_type like 'baseline_reverify%';
```

**سلامة:** العدد `0`، ولا تغيير في أي صف آخر من الجدول.

## 7) الموافقة

- [x] ✅ **معتمد** (المشروع/المستخدم) — التاريخ: 2026-08-03
- **شرط الموافقة:** الالتزام الكامل بـ `change-management.md` وليس استثناءً منها.
  الأدلة تُلتقط في **شبكة واحدة** عبر `09-2.1.6-cr-001-cr-002-execute.sql`:
  1. `expected_rows` — تأكيد عدد الصفوف المتوقع قبل التنفيذ.
  2. `before_state` — SELECT تشخيصي قبل التنفيذ (count + types).
  3. تنفيذ SQL المُستهدف فقط بنطاق `baseline_reverify%` مع تسجيل `rows_affected` (GET DIAGNOSTICS).
  4. `after_state` + `verification` — SELECT تحقق بعد التنفيذ (المتوقع `0`).
  5. `final_verdict` — تحديث هذا الملف بالنتائج الفعلية (وليس المتوقعة فقط).
  6. إغلاق الـ Change ID رسمياً بعد نجاح التحقق.

## 8) تنفيذ الفعل + النتيجة (من شبكة `cr_evidence` — 2026-08-03)

- expected_rows: **0**
- before_state: **count=0, types=(none)**
- rows_affected: **0**
- after_state: **count=0**
- verification: **remaining baseline_reverify% = 0**
- final_verdict: **PASS — zero residue**
- النتيجة: لم توجد بقايا للحذف وقت التنفيذ — `rows_affected = 0` هو السلوك الصحيح، ويثبت أن الجدول بالحالة المطلوبة.

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-03 | إنشاء CR بانتظار الموافقة |
| 2026-08-03 | **اعتماد CR-002** — شرط: تنفيذ عبر `09-2.1.6-cr-001-cr-002-execute.sql` بموجب `change-management.md` |
| 2026-08-03 | **إغلاق CR-002 رسمياً** — `final_verdict = PASS` · `rows_affected = 0` (لا بقايا موجودة) · التحقق بعدي: `0` صف `baseline_reverify%` |

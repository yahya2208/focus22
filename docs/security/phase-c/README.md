# Phase C — Production Hardening (مرحلة ما بعد الحادث)

**الإصدار:** 1.0 · **التاريخ:** 2026-08-03 · **المرجع:** FOCUS v2.0 Strategic Reset ·
**مرجع السياسات:** `docs/security/operations/change-management.md` ·
**الحالة:** نشطة بعد إغلاق 2.1.6

> **سؤال الحكم لكل عمل جديد:** هل يقلل هذا من **مخاطر الإنتاج** أو يزيد
> **موثوقية الإصدار**؟ إذا نعم → ضمن Phase C (تقوية) أو Phase E (جاهزية النشر).
> إذا لا → يؤجَّل إلى ما بعد الإصدار.
>
> **قاعدة إلزامية:** لا تُدمج مراجعات Phase C في تقرير واحد ضخم. **لكل مراجعة
> تقرير مستقل وقرار إغلاق مستقل** — يسهّل أي تدقيق مستقبلي أو مراجعة خارجية.

---

## 1) الترتيب المعتمد (بالأولوية/المخاطر — وليس بسهولة التنفيذ)

| # | المراجعة | مبرر الأولوية (المخاطر) | أدوات الفحص | الحالة |
|---|---|---|---|---|
| **C1** | **SECURITY DEFINER Audit** | امتياز متسرب في دالة SECURITY DEFINER = تسريب كامل للصلاحيات (أعلى أثر). نقاط الفحص: `search_path` · الملكية · أي Dynamic SQL · أي Privilege Escalation | `supabase/security-hardening/phase-c/C1-secdefiner-audit.sql` | ✅ **مُغلقة** (CR-003: PASS — search_path ×3 + EXECUTE `handle_new_user`) |
| **C2** | **Trigger Audit** | Triggers آثار جانبية خفية تُشغَّل خارج إرادة المطور — خاصة `handle_new_user`. نقاط الفحص: كل trigger حي، متى/كيف يعمل، الآثار الجانبية | `supabase/security-hardening/phase-c/C2-trigger-audit.sql` | ✅ **مُغلقة** (PASS — لا CR؛ لا `set_config(..., false)`؛ ترابط الدوال سليم) |
| **C3** | **Privilege + RLS/Policy Audit** | صلاحيات زائدة = سطح هجوم. نقاط الفحص: Roles · Schema/Table/Function/Sequence/View privileges · Extensions · RLS posture + Policies (USING/WITH CHECK) | `supabase/security-hardening/phase-c/C3-privilege-audit.sql` | 🟡 **تحت الإغلاق** (CR-004.1/2 PASS — C3.9 مُعالَج؛ يتبقى CR-004.3 + إعادة تشغيل الأداة + الاختبارات الوظيفية) |
| **C4** | **Constraints & FK Audit** | سلامة النزاهة: Foreign Keys · CHECK · UNIQUE · NOT NULL · سلوك ON DELETE / ON UPDATE | 🔲 |
| **C5** | **Migration Audit** | قابلية البناء من الصفر: ترتيب الـ migrations · لا اعتماد على بيانات مسبقة · تطابق schema مع الحقيقة الحية | 🔲 |
| **C6** | **Index Audit** | أداء: الفهارس المفقودة · المكررة · غير المستخدمة | 🔲 |

## 2) عقد المراجعة المستقلة (لكل مراجعة C1–C6 — إلزامي)

كل مراجعة = **وحدتها الكاملة** ولا تُدمج:

| العنصر | المتطلب |
|---|---|
| **الهدف** | مخرَج واضح ومقيس من المراجعة |
| **معايير القبول** | شرط(شروط) مقيسة يُحكم بها على الاكتمال |
| **الأدلة** | SQL حي (أو Runtime) موثّق بالنتائج الفعلية — لا ادعاءات |
| **التقرير المستقل** | ملف منفصل: `docs/security/phase-c/<C#>-*.md` |
| **قرار الإغلاق المستقل** | فتح/إغلاق لكل مراجعة على حدة مع مبرر |

**ضمانات أي أداة فحص (موروثة من درس الحادث):** قراءة خالصة — SELECT/EXPLAIN/
كتالوجات فقط · لا `set_config(..., false)` · لا `set role` · لا جداول مؤقتة ·
لا DDL/GRANT · الجلسة بعد التشغيل = قبلها حرفياً.

**قاعدة Result Set واحد (إلزامية لكل أدوات التدقيق C1–C6):** أي سكربت تدقيق
يُعيد **نتيجة واحدة فقط** — صف واحد/عمود واحد (JSON موحد عبر CTE + `jsonb_agg`
أو شبكة أدلة موحدة)، لأن محرر Supabase يعرض آخر Result Set فقط. لا يُكتب أي
Audit بعدة `SELECT` متفرقة. مزاياها: تعمل على أي أداة (Supabase/pgAdmin/DBeaver/
psql) · لا يضيع أي نتيجة · قابلة للأرشفة والمقارنة بين تشغيلين · مناسبة
لأتمتة التقارير.

**لو تطلب أي بند لاحقاً تغييراً فعلياً:** يُنفَّذ عبر CR مستقل بموجب
`change-management.md` (أدلة قبلية، Expected rows، موافقة، Rollback، تحقق لاحق).

## 3) اصطلاح التسمية والمكان

- أدوات الفحص (قراءة): `supabase/security-hardening/phase-c/C<n>-*.sql`
- التقارير المستقلة: `docs/security/phase-c/C<n>-*-audit.md`
- التغييرات التصحيحية (عند الحاجة): CR مستقل في `docs/security/operations/`

## 4) الخروج من Phase C إلى Phase E

تُعتبر Phase C مكتملة عندما تُغلق C1–C6 كلها بقراراتها المستقلة المبنية على
الأدلة. عندها يُخضَع المشروع لبنود Phase E (Release Readiness) الواردة في
`change-management.md` §6 — **لا يُنشر مع أي بند أحمر.**

## سجل التغييرات

| التاريخ | التغيير |
|---|---|
| 2026-08-03 | إطلاق Phase C — إعادة ترتيب بالخطورة (C1 SECURITY DEFINER أولاً) + عقد المراجعة المستقلة |
| 2026-08-04 | C1: تنفيذ الأداة ولصق النتائج — القرار **OPEN** (search_path ×3 + EXECUTE `handle_new_user`) → CR-003 بانتظار الموافقة |
| 2026-08-04 | **إغلاق CR-003** (`final_verdict = PASS`) → **إغلاق C1** ✅ — التالي: C2 Trigger Audit |
| 2026-08-04 | **إغلاق C2** ✅ (PASS — لا CR) · اعتماد قاعدة **Result Set واحد** لكل أدوات التدقيق · التالي: C3 Privilege Audit |
| 2026-08-04 | **C2.5b** — body كامل لـ `handle_new_user` مراجَع (search_path/qualification/REVOKE كلها محققة) → **لا CR-004** · إغلاق C2 نهائي |
| 2026-08-04 | **C3.9** — رصد 12 سياسة عامة عبر `C3b-policy-snapshot.sql` → NOT PASS → **CR-004** (المحوران 1 و2) |
| 2026-08-04 | **تنفيذ CR-004 PASS** + after-snapshot (11 سياسة = authenticated، تمهيد محذوف) → توثيق C3.9 كمُعالَج · CR-004.3 مؤجَّل بقرار QR flow |

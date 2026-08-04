# Incident Report — Baseline Reverify 04-2.1.6 (Production Data Mutation)

- **الحالة:** ✅ **مُغلق بالكامل (CLOSED)** — RCA (H1) · E1–E10 attestation · scan_count (قرار إداري) · **CR-001 ✅** · **CR-002 ✅** · لا بقايا تشغيلية · انتقل المشروع رسمياً إلى Production Hardening (Phase C)
- **التاريخ:** 2026-08-03
- **الفرع:** `security/remediation-phase2`
- **الخطورة:** Security/Production Incident (تغيير فعلي لبيانات Production أثناء تشغيل Probe للتحقق)
- **النطاق:** `public.users` (صف واحد) · `public.qr_codes` (8 صفوف) · `public.analytics_events` (صف واحد)

---

## 1) ملخص الحادث

خلال مهمة 2.1.6 (Baseline Verification)، شُغِّلت نسخة **select-based** من
`04-2.1.6-baseline-reverify.sql` في SQL Editor على Production. هذه النسخة كانت
تكتب النتائج في جدول مؤقت بدلاً من NOTICEs، **وأُزيلت منها حواجز
`begin/rollback`**، فتحوّل البروب — الذي كان يفترض أن يكون Zero Side Effect —
إلى أداة كتبت فعلياً في جداول الإنتاج.

> **مبدأ غير قابل للتفاوض:** ما تبقّى من التحقيق **قراءة خالصة (Observe only)**.
> لا بروبات تكتب، لا حذف، لا استرجاع، قبل إثبات السبب الجذري (Root Cause)
> بالأدلة. أي إصلاح الآن سيخفي السبب.

## 2) حقائق مؤكدة بالأدلة (وليست فرضيات)

| # | الحقيقة | الدليل | الحكم |
|---|---|---|---|
| **D1** | `users.role(B)` أصبح `admin` (كان `user`) | استعلام على `public.users` حيث `id=B` | ✅ مؤكد |
| **D2** | 8 صفوف في `qr_codes.scan_count` أصبحت `999999999` | `SELECT count(*) FROM qr_codes WHERE scan_count=999999999` → `8` | ✅ مؤكد |
| **D3** | صف `baseline_reverify_owner` بقي في `analytics_events` | استعلام على `analytics_events` | ✅ مؤكد |
| **D4** | `analytics_events` **لا توجد** فيها سياسة DELETE | `pg_policies` → INSERT + SELECT فقط | ✅ مؤكد |

**استنتاج D4:** بقاء صف D3 **ليس** خطأً في RLS، بل نتيجة طبيعية: البروب (E9) أنشأ
الصف كـ `authenticated` ثم لم يستطع حذفه لعدم وجود سياسة DELETE — **عيوب تنظيف
في البروب نفسه**، وليس اختراقاً للصلاحيات.

### 2.1) قرار الإغلاق الإداري — scan_count (2026-08-03، FOCUS v2.0)

**بموجب قرار الإدارة: تُعتبر أضرار D2 (scan_count) **مغلقة من ناحية البيانات**:
- لا يوجد PITR متاح.
- الصفوف المتأثرة (8) كانت **تجريبية** ولا تمثل قيمة تشغيلية أو بحثية.
- يُمنع استهلاك أي وقت إضافي في محاولات استرجاع تلك القيم.

لا يُنفَّذ أي UPDATE لاستعادة scan_count. هذا القرار مثبت هنا ليبقى قابلاً
للتتبع (Change ID: INC-2026-08-03-D2-close).

## 3) السؤال المفتوح — لم يُحسم (H1 أم H2؟)

لا يوجد دليل قاطع حتى الآن لترجيح أي منهما:

- **H1 — عطل في البروب (Probe Fault):**
  `set_config('request.jwt.claims', A, false)` في البروب — `false` = نطاق
  **الجلسة (SESSION)** — تسرّب هوية A إلى الخطوات اللاحقة (بما فيها خطوات
  `set role anon`)، فأصبحت `auth.uid()` تعيد A حتى تحت anon، فمرّ الحارس
  والسياسات.
  - مؤشرات داعمة: استمرار تسجيل D1/D2 رغم وجود حارس 2.1.3 (يتوقف على R-001) وسياسة qr_codes الضيقة (تتوقف على R-006).
- **H2 — خلل حقيقي في طبقة الصلاحيات:**
  حارس 2.1.3 غير حي فعلياً، أو سياسة عريضة على `qr_codes`، أو مشكلة
  SECURITY DEFINER/privilege — تسمح للـ anon بالكتابة دون أي تسريب.

> **ممنوع:** اعتماد أي فرضية قبل اكتمال Phase B. المرجّحات قوية لـ H1، لكنها
> مؤشرات، **ليست برهاناً**.

### 3.1) حكم RCA (Phase C — مكتمل 2026-08-03): **H1 مثبتة بالاستبعاد + بالآلية**

أدلة Phase B (`06-2.1.6-incident-evidence-collect.sql`) أغلقت الاستنتاج:

| الدليل | النتيجة |
|---|---|
| **R002/R013** | حارس 2.1.3 **حي** داخل `admin_promote_user` (`if not is_admin() → 42501`) **و** B أصبح `admin` فعلياً (18:30:05Z) |
| **R009/R010** | `EXECUTE` على `admin_promote_user` **ليس** متاحاً لـ anon/authenticated — لا تسريب |
| **R007** | سياسة `qr_codes` ضيقة: `Admins manage qr codes USING(is_admin())` فقط — لا سياسة عريضة |
| **R003/R004/R005** | السلسلة مثبتة: `is_admin → app_role → auth.uid → request.jwt.claims` |
| **R001** | حتى **المالك (owner)** مع claims فارغة: `is_admin() = false` |
| **R012** | لا DELETE policy على `analytics_events` → D3 = عيوب تنظيف البروب |

**الاستدلال (بالحذف):** حدوث D1 يعني أن `admin_promote_user` نجح أثناء التشغيل؛
بما أن الحارس حي (R002) و EXECUTE لم يكن متاحاً إلا بمنح مؤقت من البروب نفسه،
فالنجاح يتطلب `is_admin() = true` في سياق anon. و `is_admin()=true` يستحيل بلا
`auth.uid()` → قيمة `sub` داخل `request.jwt.claims`. و R001 يثبت أنه حتى المالك
يعطي `false` بلا claims. المصدر الوحيد لـ claims أثناء تشغيل البروب هو سطر
`set_config('request.jwt.claims', A, false)` (نطاق **SESSION**) الذي وضع هوية A
قبل خطوات `set role anon`. **⇒ H1 (عطل في البروب) هي التفسير الوحيد المطابق
لجميع الأدلة؛ H2 مستبعدة** (الحارس حي، السياسة ضيقة، لا تسريب EXECUTE).

**ملاحظة منهجية (تجريبية):** إثباتنا استدلالي/بالحذف وليس تجريباً معزولاً —
وهذا مقبول لإغلاق RCA، لأن الاسترجاع أدناه (B→user، حذف البقايا، استعادة
scan_count) يعيد حالة معروفة الصحة **تحت أي فرضية**، فلا يُشترط إثبات تجريبي
معزول قبل الاسترجاع الآمن.

## 4) التجميد (Phase A — Freeze)

حتى إغلاق RCA:

- ❌ لا تُشغَّل أي Probe إضافية على Production.
- ❌ لا تُطبَّق أي Migration.
- ❌ لا يُنفَّذ أي إصلاح/استرجاع (B→user، حذف الصف، استعادة scan_count).
- ❌ لا يُستأنف أي عمل في Phase 2 (2.1.5/2.1.6 أو ما بعدها).
- ⚠️ **لا يُعاد تشغيل `04-2.1.6-baseline-reverify.sql` إطلاقاً** (الملف محفوظ
  كدليل، ولا يُعدَّل حتى لا يتلوث أثر التحقيق).
- ✅ يُحفظ أي إخراج جديد (grids) كما هو دون إعادة تفسير.

## 5) الخطة (Incident Response)

| المرحلة | الوصف | الحالة |
|---|---|---|
| **A — Freeze** | لا بروبات/ترحيلات/إصلاحات حتى تُحفظ الأدلة | 🚨 نشطة |
| **B — جمع الأدلة** | كتالوج قراءة خالص للعناصر العشرة (أدناه) عبر `06-2.1.6-incident-evidence-collect.sql` | ✅ مكتمل (11 شبكة) |
| **C — إثبات السبب** | استنتاج H1/H2 من الأدلة (وليس التخمين) | ✅ **H1 مثبتة** (القسم 3.1) — H2 مستبعدة |
| **D — الإصلاح** | الإصلاح الحقيقي بعد إثبات السبب فقط (لا إصلاحات معمارية جديدة — الحارس والسياسات سليمة) | ✅ لا إصلاحات معمارية مطلوبة |
| **E — استرجاع البيانات** | B→user · حذف صف analytics · scan_count | ✅ **مكتمل**: scan_count مُغلقة بقرار إداري (§2.1) · **CR-001 ✅** (B كان `user` — لا تغيير مطلوب) · **CR-002 ✅** (لا بقايا) — الأدلة في ملفي الـ CR |
| **F — إعادة كتابة 04-2.1.6** | من الصفر — قراءة حقيقية (SELECT/EXPLAIN/pg_policies/pg_proc/has_table_privilege/has_function_privilege فقط) بلا UPDATE/INSERT/DELETE/CALL/RPC | ✅ **مكتمل** عبر `08-2.1.6-baseline-reverify-readonly.sql` — E1–E10 كلها مدعومة باستعلامات (Q1–Q6) |

> **رفع حالة Freeze (2026-08-03):** الحادث مُغلق بالكامل — لا Incident نشط ولا
> Freeze. المشروع انتقل رسمياً إلى Production Hardening (`docs/security/phase-c/README.md`).

## 6) عناصر جمع الأدلة — Phase B (المرجع `06-2.1.6-incident-evidence-collect.sql`)

| # | العنصر | المصدر |
|---|---|---|
| 1 | كود `admin_promote_user()` كاملاً | `pg_get_functiondef` |
| 2 | كود `is_admin()` | `pg_get_functiondef` |
| 3 | كود `app_role()` | `pg_get_functiondef` |
| 4 | كود `auth.uid()` (+ `auth.role`/`auth.jwt` — قرّاء الـ claims) | `pg_get_functiondef` |
| 5 | سياسات `users` | `pg_policies` |
| 6 | سياسات `qr_codes` | `pg_policies` |
| 7 | سياسات `analytics_events` | `pg_policies` |
| 8 | `proacl` للدوال المعنية | `pg_proc.proacl` |
| 9 | SECURITY DEFINER أم INVOKER | `pg_proc.prosecdef` |
| 10 | `search_path` لكل دالة | `pg_proc.proconfig` |
| + | مصفوفة EXECUTE للدوال لكل دور (anon/authenticated/service_role/postgres) | `has_function_privilege` (عبر OID — لا تخمين تواقيع) |
| + | مصفوفة صلاحيات الجداول (SELECT/INSERT/UPDATE/DELETE) لكل دور | `has_table_privilege` |
| + | حالة `request.jwt.claims` الحالية للجلسة (قراءة فقط) | `current_setting` |

**ضمانات السكربت (قابلة للتحقق بالفحص):** كل عبارة SELECT فقط · لا DDL ·
لا GRANT/REVOKE · لا `set_config` · لا `set role` · لا جداول مؤقتة · لا حاجة
لمعاملات · جلسة بعد التشغيل مطابقة حرفياً لما قبلها.

## 7) السجل

| التوقيت | الحدث |
|---|---|
| 2026-08-02 | إغلاق 2.1.1–2.1.5 بالأدلة الحية (README) |
| 2026-08-03 | تشغيل النسخة select-based من 04-2.1.6 → ملاحظة D1/D2/D3 |
| 2026-08-03 | RCA v1 → فشل `42501` (permission denied for table tmp_rca) |
| 2026-08-03 | RCA v2 → **سُحب بالمراجعة**: يعيد استخدام الآلية المتهمة `set_config(..., false)` |
| 2026-08-03 | تأكيد D1–D4 بالاستعلامات؛ إعلان Incident + Freeze |
| 2026-08-03 | **Phase B مكتمل** — 11 شبكة أدلة (حارس حي · EXECUTE سليم · سياسة qr_codes ضيقة · لا DELETE policy · B=admin@18:30:05Z) | `06-2.1.6-incident-evidence-collect.sql` |
| 2026-08-03 | **Phase C مكتمل — H1 مثبتة بالاستبعاد** (القسم 3.1)؛ H2 مستبعدة | incident report §3.1 |
| 2026-08-03 | **Phase D/E** — تجهيز `07-2.1.6-incident-restore.sql` (B→user، حذف البقايا، تشخيص scan_count) + `08-2.1.6-baseline-reverify-readonly.sql` (إعادة كتابة البروب قراءةً) | `07` · `08` |
| 2026-08-03 | **E1–E10 attestation مكتمل** (08: Q1–Q6) — كل البنود مدعومة باستعلامات؛ A4-x مؤكدة من ADR-001 | `08-2.1.6-baseline-reverify-readonly.sql` |
| 2026-08-03 | **قرار إغلاق scan_count** (FOCUS v2.0) — لا PITR، بيانات تجريبية، يُمنع مزيد من محاولات الاسترجاع | §2.1 |
| 2026-08-03 | **إصدار سياسة التغيير الإلزامية** + CR-001 (B→user) + CR-002 (بقايا analytics) بانتظار الموافقة | `docs/security/operations/change-management.md` · `CR-001` · `CR-002` |
| 2026-08-03 | **اعتماد CR-001 + CR-002** بشرط الالتزام بالسياسة · تنفيذ عبر `09-2.1.6-cr-001-cr-002-execute.sql` (شبكة أدلة واحدة) | CR-001 · CR-002 |
| 2026-08-03 | **إغلاق CR-001 + CR-002 رسمياً** — `final_verdict = PASS` لكليهما (B كان `user` · لا بقايا analytics) · لا تغييرات معلّقة مرتبطة بالحادثة | `docs/security/operations/CR-001-*.md` · `CR-002-*.md` |
| 2026-08-03 | **إغلاق الحادث بالكامل + رفع Freeze** — الانتقال الرسمي إلى Production Hardening (Phase C: C1 → C6) ثم Phase E | `docs/security/phase-c/README.md` |

## 8) المرجع

- البروب المتسبب (دليل): `supabase/security-hardening/phase2/04-2.1.6-baseline-reverify.sql`
- الأدلة (Phase B): `supabase/security-hardening/phase2/06-2.1.6-incident-evidence-collect.sql`
- الحالة: `supabase/security-hardening/phase2/README.md`
- المهام المحيطة: `01-2.1.1` · `02-2.1.2` · `03-2.1.3`

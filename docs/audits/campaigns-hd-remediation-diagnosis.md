# Campaigns Admin — HARD STOP Remediation · Diagnosis Report (Read-Only)

| الحقل | القيمة |
|---|---|
| الصفة | **Diagnosis ONLY** — لا SQL apply · لا migration · لا grants · لا RLS/RPC تغيير · لا commit/push/tag/deploy |
| التاريخ | 2026-08-09 |
| المصدر | تشغيل مالك (expanded verification) على LIVE: `final_verdict=HARD_STOP` · `columns_verdict=COLUMNS_MISSING` · `rls_verdict=POSTURE_UNCHANGED` · `rpc_verdict=RPC_INTACT` · `grants_verdict=DIRECT_GRANT_DETECTED` |
| أدوات التشخيص | قراءة فقط (SELECT/catalog + مراجعة مصدر محلية فقط): `git d082dad^` (old `data-service.ts`) · migrations 00001–00018 · `docs/security/production-security-audit.md` · `docs/security/operations/CR-00006-lv3-campaigns-read-rls.md` · `supabase/security-hardening/phase1/03-LV3-campaigns-schema-gap.md` · `docs/architecture/12-supabase.md` · `src/research-console/pages/campaigns/campaign-service.ts` |
| المنهج | evidence-based cross-check بين: (1) أقدم كود كتب/قرأ نفس جدول LIVE، (2) توثيق تفتيش LIVE الحديث، (3) migrations، (4) كود الحملات الجديد. لا يوجد وصول مباشر لقاعدة LIVE في هذه الجلسة |
| **النتيجة النهائية** | **`HARD STOP — DIAGNOSIS COMPLETE`** (لا remediations طُبِّقت) |

> ### ⚠️ FALSIFICATION NOTE (2026-08-09 — تشغيل `10-CR-00007-pre-apply-gates.sql` على LIVE)
> **الاستنتاج في §E/§G بأن anon يملك ACL مباشرة على `public.campaigns` (Supabase default) — مُكذَّب بالفحص الحي.** LIVE يثبت: anon `has_table_privilege` = false للأربعة · raw ACL بلا أي صف لـ anon · قراءة مباشرة تحت anon → `42501 permission denied for table campaigns` (وليست «0 rows عبر RLS»). `DIRECT_GRANT_DETECTED` كان يتحقق بمجرد grants `authenticated` (by design). **CR-00007 = ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED** (قرار مالك: NO DATABASE CHANGE). النموذج المصحَّح: anon = بلا ACL (هدف مُحقَّق) · authenticated/service_role = كاملة (by design).

---

## A) Executive Summary

1. **COLUMNS_MISSING — غير قابل للإعادة من أي أثر محلي (likely verification artifact).** كل عمود من الأعمدة الـ 25 التي تستخدمها خدمة الحملات (`campaign-service.ts`) لديه دليل إيجابي موثّق بوجوده على LIVE:
   - 24 عموداً كُتبت فعلياً بواسطة `data-service.ts` القديمة (P5-era) التي عملت على **نفس** قاعدة LIVE؛
   - `last_edited_by` موثّق موجوداً (TEXT، nullable) في `03-LV3-campaigns-schema-gap.md` و CR-00006؛
   - `short_code` لديه فهرس unique جزئي في migration `00007`.
   - الكود الجديد **لا** يعتمد على أي عمود ملكية (`user_id`/`owner_id` — صفر مراجع). الأعمدة الوحيدة الموثّق **غيابها** على LIVE هي `user_id`/`owner_id` (UUID) — وهي محور `Phase 2.3 FROZEN` وليست متطلباً للفيوتشر.
   - → التفسير الأرجح لـ `COLUMNS_MISSING`: قائمة expected في سكربت التحقق الموسّع تضمّنت أعمدة غير موجودة على LIVE (أنسب مرشّح: أعمدة نموذج الملكية)، أو طبق فحص data_type/nullability صارماً. **الإغلاق يتطلب مخرجات A1/A2 من التشغيل الفعلي على LIVE** (Section J).

2. **DIRECT_GRANT_DETECTED — حقيقي لكنه Inert/Legacy.** الصراحات المباشرة على `public.campaigns` لـ `anon`/`authenticated` هي **Supabase defaults** تُمنح عند إنشاء الجدول (العهد القديم). دليل: **صفر** GRANT/REVOKE على جدول `campaigns` في كامل الـ repo. تأثيرها الفعلي = 0 لأن RLS هي طبقة التحكم (POSTURE_UNCHANGED): لا سياسة لـ `anon`، وسياسة `Admins manage campaigns` (TO authenticated · `USING is_admin()`) هي الوحيدة. **`authenticated` grants إلزامية** لنموذج RLS (لو رُفعت تنكسر كتابة الأدمن نفسها عبر `authenticated`). المقترح: `REVOKE` لـ `anon` فقط (defense-in-depth، أثر صفري).

3. **RLS/RPC**: رِصانة LIVE مطابقة للخط الأساسي (POSTURE_UNCHANGED) و RPC lookup سليم (RPC_INTACT) — تُعامل كدليل حسب التعليمات.

4. **لا تغيير كود · لا migration مطلوبة لتشغيل الفيوتشر · لا تطبيق أي SQL.**

---

## B) Live Schema Inventory (evidence-compiled) + Machine-Readable Comparison

**EXPECTED_COLUMN | LIVE_PRESENT | DATA_TYPE_MATCH | NULLABILITY_COMPATIBLE | DEFAULT_PRESENT | VERDICT**

مصطلحات: `E=EXISTS` (دليل إيجابي)، `NC` = (not confirmed على LIVE — يتطلب A1)، `NA` = لا يلزم.

| EXPECTED_COLUMN | LIVE_PRESENT | DATA_TYPE_MATCH | NULLABILITY_COMPATIBLE | DEFAULT_PRESENT | VERDICT | الدليل |
|---|---|---|---|---|---|---|
| name | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert L296 |
| goal | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| campaign_type | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| country | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| state_name | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| city | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| district | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| venue | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| description | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| notes | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| budget | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| budget_currency | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| material | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| start_date | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| end_date | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| status | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert L296 |
| is_active | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert L296 |
| logo_url | E | NC | YES | NC | EXPECTED_PRESENT | old insert L296 |
| short_code | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert + M7 index |
| qr_config | E | NC | YES | NC | EXPECTED_PRESENT | old insert + schema-gap L29 |
| timeline | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert + schema-gap L29 |
| created_by | E | **text** (موثّق) | YES (nullable موثّق) | NC | EXPECTED_PRESENT | schema-gap L10-11 + CR-00006 L22 |
| last_edited_by | E | **text** (موثّق) | YES (nullable موثّق) | NC | EXPECTED_PRESENT | schema-gap L10 + CR-00006 L22 |
| created_at | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert + trigger doc |
| updated_at | E | NC | YES (يُكتب دائماً) | NC | EXPECTED_PRESENT | old insert + trigger doc (audit L329) |
| id | E | NC | NO (PK) | NC | EXPECTED_PRESENT | جميع الصفوف + select('*')/eq |

**النتيجة:** كل الأعمدة الـ 25 (+`id`) **موجودة حسب الأدلة**. لا يوجد عمود واحد مع دليل غياب بين الأعمدة التي يحتاجها الفيوتشر. الأعمدة الوحيدة الموثّق غيابها (`user_id`/`owner_id` UUID) **ليست** في الكود.

**تصنيف "الأعمدة الناقصة" (مفقودياً) حسب الحاجة** (لو أُعلن أيٌّ منها ناقصاً، لن يكون أي منها ضمن القائمة أعلاه):

| الفئة | أعمدة الفيوتشر | الأثر لو غابت فعلياً |
|---|---|---|
| create-required (insert payload) | name, short_code, status, is_active, timeline, created_by, created_at, updated_at | فشل createCampaign |
| update-write | أي عمود في `updates` spread + updated_at | فشل update لحقل معيّن |
| read-only/order/filter | id, is_active, status, created_at (order) | فشل list/get عند `.eq`/`.order` على عمود غائب |
| display/QR | qr_config, timeline, logo_url, short_code | تدهور واجهة فقط |
| optional (type-only) | last_edited_by | صفر أثر (لا يُقرأ ولا يُكتب أبداً) |

---

## C) Code References Trace (file:line · operation)

`campaign-service.ts` (ملف واحد = سطح الوصول الوحيد للجدول):

| العمود | العملية | الموقع |
|---|---|---|
| (all) | `select('*')` — list/get | L82, L96–97 |
| is_active · status | فلترة list | L83–84 |
| created_at | order | L88 |
| id | eq filter (كل العمليات) | L98, L147, L155, L161, L170, L177 |
| name…updated_at (23) | insert payload | L112–135 |
| any + updated_at | update spread | L146 |
| status, is_active, updated_at | soft-delete | L153 |
| status, is_active, updated_at | restore | L160 |
| timeline (+updated_at) | select + update | L169, L176 |
| short_code | QR deep-link contract `origin/base/c/<short_code>` (بدون query) | L74–77 |
| last_edited_by | interface optional فقط | L52 (لا قراءة/كتابة) |

UI: `CampaignDetailView.tsx` — عارض timeline + معاينة QR عبر `QRCodeLib` محلياً؛ لا يكتب خارج `campaigns`.

---

## D) Code Operability Without Missing Columns

- لا يوجد عمود غائب موثّق بين أعمدة الفيوتشر → التشغيل مكتمل.
- دفاع قائم مسبقاً: `addTimelineEntry` يلفّ بعملية `try/catch` (L178–180) — إذا كان `timeline` غير متاح لأي سبب لا ينكسر CRUD.
- لو غاب أي من insert columns → `createCampaign` يفشل عند أول insert (خطأ 400/42P01) وتعود `null` (L139). لو غاب `is_active`/`status`/`created_at` → `listCampaigns`/`update` تفشل.
- `select('*')` مرن (يتوسع للأعمدة الموجودة فقط) — لكن `.eq/.order/.select('timeline')` ليست كذلك.
- **الاستنتاج**: لا يحتاج الكود أي fallback إضافي في ضوء الأدلة الحالية.

---

## E) Grants Analysis (role_table_grants / ACLs) + Classification + REVOKE Proposal

**الحالة المكتشفة (تشغيل المالك):** `grants_verdict = DIRECT_GRANT_DETECTED` → واحد أو كلاهما (`anon`/`authenticated`) لديه grants مباشرة على `public.campaigns`.

**دليل المصدر:** صفر `GRANT`/`REVOKE` على جدول `campaigns` في كامل الـ repo (فقط grants دالة `lookup_campaign_by_short_code` M7:50-54 و M11:92-95، وgrant أعمدة على `placements` M16 — لا علاقة لها). → الصلاحيات المباشرة **غير منشأة من الكود**؛ مصدرها **Supabase default privileges** عند إنشاء الجدول في العهد القديم (SQL editor/dashboard)؛ تبقى مفعّلة عبر `ALTER DEFAULT PRIVILEGES` الخاص بـ supabase_admin الذي يمنح ALL للجداول الجديدة لـ `anon`+`authenticated`+`service_role`.

**التصنيف (Expected / Historical / Regression / Unknown):**

| grantee | privilege (نموذجي) | التصنيف | الأساس |
|---|---|---|---|
| anon | **NONE** (لا ACL — مثبَّت حياً 2026-08-09) | **Historical assumption — FALSIFIED** (لم يملك ACL أصلاً؛ انظر FALSIFICATION NOTE) | قراءة مباشرة → `42501` (رفض ACL)؛ RPC SECURITY DEFINER لا يحتاج grants الجدول |
| authenticated | ALL (default) | **Expected / By-design (Supabase default)** | مطلوب لكي يعمل RLS أصلاً؛ السياسة `Admins manage campaigns` (TO authenticated) هي التي تقرر الأثر |
| service_role | ALL (default) | **Expected (by design)** | التطبيق لا يستخدم service_role للجدول |
| Regression | — | **لا** | لا DDL/grants جديدة في هذا الفصل؛ static guard + tests تؤكد |

**REVOKE — **HOLD** (قرار مالك: لا يُقترح أي REVOKE قبل مراجعة الأدلة الحية):**

- **لا** اقتراح `REVOKE` الآن — بانتظار جولة الإثبات (Section D1/D2/D3 من السكربت الجديد `supabase/campaigns-grants-columns-evidence.sql`).
- بعد الأدلة فقط يُقيَّم كـ **CR منفصل** (خارج نطاق Campaigns Admin) بموافقة مالك صريحة:
  - `anon` direct grant = **لا يوجد (فحص حي 2026-08-09)** — الهدف مُحقَّق سلفاً. لا حاجة لأي REVOKE؛ **CR-00007 = ALREADY SATISFIED / NO-OP** (قرار مالك: NO DATABASE CHANGE).
  - `authenticated` direct grant = **By-design إلزامي** (مطلوب لكي تعمل `Admins manage campaigns` TO authenticated · `USING is_admin()` عبر JWT role) — **لا يُرفع**.
- ملاحظة ديمومة (تسجيل فقط، لا اقتراح): لمنع إعادة ظهور grants مستقبلاً تُدعى `ALTER DEFAULT PRIVILEGES` — أثر واسع على كل الجداول الجديدة؛ CR منفصل مستقبلي بموافقة مالك إذا رُغب.
- الـ checks الدورية `has_table_privilege` ستظل تُرجع true لـ authenticated دائماً — ضبط سكربت التحقق مستقبلاً ليعتبر `authenticated` By-design (انظر L).

---

## F) RLS + RPC Reconfirmation (معاملة كمُدخلات — لا إعادة قياس)

- **RLS — POSTURE_UNCHANGED (من تشغيل المالك):** RLS مفعّلة على campaigns؛ السياسة الوحيدة `Admins manage campaigns` (ALL · TO authenticated · `USING is_admin()`); غياب `Authenticated read campaigns` العريضة = مطابق لـ CR-00006 المطبق. لا حاجة لأي تغيير.
- **RPC — RPC_INTACT (من تشغيل المالك):** `lookup_campaign_by_short_code` موجود، `SECURITY DEFINER` · `STABLE` · `search_path=public` · `EXECUTE` لـ anon+authenticated (يطابق M7 و `00-permissions-inventory.md:16`). v2 غير مستخدم ويبقى دون تغيير.
- **QR contract:** `buildCampaignQrUrl` (L74–77) يبني `origin/base/c/<short_code>` plain بلا معاملات attribution؛ lookup العام يمر عبر الـ RPC فقط. دون تغيير.

---

## G) Grants vs RLS — الفرق والأثر الفعلي

- **GRANT = gate وصول المستوى الأول؛ RLS = filter صفوف.** معنى `DIRECT_GRANT_DETECTED` وجود صلاحية مستوى جدول، لكن الأثر الفعلي يحدده RLS.
- الأثر الفعلي على LIVE (مع POSTURE_UNCHANGED):

| الدور | grants | سياسة RLS | صفوف قابلة للقراءة |
|---|---|---|---|
| anon | **NONE** (لا ACL — فحص حي 2026-08-09) | لا سياسة | **0** (رفض ACL: `42501`) |
| user/guest/researcher | ALL (default) | `Admins manage campaigns` → `is_admin()=false` | **0** |
| admin/super_admin | ALL (default) | `is_admin()=true` | كامل (متوقع) |
| service_role | ALL (default) | bypass | غير مستخدم بالكود |

- → لا يوجد تعرّض بيانات جديد. `DIRECT_GRANT_DETECTED` = حالة **دفاعية (hygiene) وليست ثغرة حيّة**، وهي حاضرة على **كل** جداول التطبيق (نفس نموذج Supabase القياسي).

---

## H) campaign-service Isolation Audit

- `campaign-service.ts`: **جدول واحد فقط** `campaigns` (7 × `.from('campaigns')` — L82/96/110/145/152/159/168)؛ صفر `.rpc()`؛ صفر لمس لـ `qr_codes`/`placements`/`placement_history`/`analytics_events`/`sessions`؛ لا build لروابط attribution (تعليق L3-8 + `buildCampaignQrUrl` L74-77).
- enforcement ثابت: `campaign-admin-guard.test.ts` (9 اختبارات) يرفض أي `.from('qr_codes'…)/placements/analytics/sessions` و أي `data-service`/`core/qr` وأي معاملات attribution — أخضر.
- `CampaignDetailView` لا يكتب خارج `campaigns` (تحديث status + timeline عبر نفس الخدمة).
- **الخلاصة**: العزل سليم؛ لا Regressions.

---

## I) Legacy-P5 vs LIVE — الحقل المرجعي (Authoritative)

- **المرجع الأوثق = `data-service.ts` (git `d082dad^`، P5-era)**: كتب 24 عموداً على **نفس** جدول LIVE عبر Supabase JS client → أي عمود في insert القديم موجود فعلياً على LIVE. لا تعارض بينه وبين الكود الجديد.
- **تفتيشات LIVE موثّقة حديثاً** (schema-gap 2026-08-02، CR-00006 2026-08-09) تؤكد `created_by`/`last_edited_by` TEXT nullable وأعمدة حساسة (`budget/budget_currency/notes/material/qr_config/timeline`) موجودة (schema-gap L29).
- `docs/architecture/12-supabase.md` (L152-161) قائمة أقدم (22 عموداً) — **مجموعة فرعية** من الأعمدة المثبتة، لا تناقض.
- **الاستنتاج**: LIVE = schema عهد P5 كاملاً؛ الكود الجديد متوافق تماماً؛ لا حاجة لـ backfill أو إضافة أعمدة.

---

## J) Migration Proposal (لا تطبيق — اقتراح فقط)

- **مطلوب لتشغيل الفيوتشر: لا شيء.** لا DDL.
- **لإغلاق COLUMNS_MISSING** (اختياري، قراءة فقط — `supabase/campaigns-admin-read-only-verification.sql` A1/A2 ثم F1): أعد التشغيل ووثّق مخرجات A1 (`information_schema.columns`) كاملاً. القائمة المثبتة تُظهر كل الـ 25 موجودة → يتوقع `ALL_COLUMNS_PRESENT`. إذا أعلن السكربت الموسّع ناقصاً:
  1. قارن اسم العمود المفقود مع جدول Section B — أي اسم خارج قائمة الـ 25 (مرشّح: `user_id`/`owner_id`/`campaign_version`) = **فجوة توقّع، لا فجوة في الفيوتشر**؛ لا تُضف أعمدة (Phase 2.3 FROZEN — موثّق في CR-00006 §3/§11).
  2. إذا كان الفحص من نوع data_type/nullability: وثّق القيمة الفعلية من A1 وقيّم التوافق (كل أعمدة الجدول القديم متوافقة مع أنواع JS المستخدمة — text/numeric/date/boolean/jsonb).
- **لا migration يُقترح** (لا إضافة أعمدة، لا تعديل أنواع).

---

## K) Security Impact

- **لا تعرّض بيانات جديد**: أثر القراءة الفعلي = 0 لـ anon/user/guest/researcher، كامل للأدمن (مطابق `ROLE_CAPABILITY_MAP`/ADR-001 A7).
- **لا IDOR**: لا أعمدة ملكية → لا سياسة مالك → التحكم حصرياً عبر `is_admin()` (DB role) + gate واجهة (admin/super_admin).
- **أثر grants**: دفاعي فقط؛ `REVOKE anon` اختياري hygiene بأثر صفري.
- **المخاطر إن تُرك الوضع**: منخفضة جداً (الأثر محسوم بـ RLS)؛ البند المفتوح الوحيد = عدم دقة سكربت التحقق (`authenticated` مُصنّف كـ "direct grant" رغم أنه By-design إلزامي).

---

## L) Next Steps / Owner Actions (Round-2 Evidence Protocol — لا تعديل أي شيء)

**توجيه المالك: المطور لا يعدّل أي ملف/أي SQL؛ يجري جولة إثبات صغيرة read-only فقط.**

**الأدلة المطلوبة (سكربت جاهز: `supabase/campaigns-grants-columns-evidence.sql` — SELECT/catalog فقط):**

1. **A1/A2 الحقيقي من LIVE** لجدول `campaigns`: مخرجات `information_schema.columns` كاملة (ordinal_position, column_name, data_type, udt_name, is_nullable, column_default) + وجود الـ 25 عموداً حرفياً (A2/A3).
2. **`information_schema.role_table_grants`** للـ `anon` و`authenticated` (D1) + **ACL خام** `pg_class.relacl` عبر `aclexplode` (D2) + جدول `has_table_privilege` (D3) — الدليل الحي الفعلي لـ grants.
3. **إظهار الـ expanded verification SQL نفسه** الذي أنتج `COLUMNS_MISSING` و`DIRECT_GRANT_DETECTED` (مسؤولية من شغّله على LIVE — ليس في الـ repo).
4. **مطابقة الـ 25 عموداً حرفياً** بين: السكربت الموسّع ⇔ `campaign-service.ts` (L82-177) ⇔ مخرجات A1 من LIVE — أي اسم خارج قائمة الـ 25 = فجوة توقّع (مرشّح: `user_id`/`owner_id` — Phase 2.3 FROZEN) وليست فجوة في الفيوتشر.
5. **لا** اقتراح أو تنفيذ أي `REVOKE` قبل مراجعة الأدلة أعلاه.

**بعد الأدلة — قرار المالك:**

| الخيار | الشرط | الإجراء |
|---|---|---|
| **A — FALSE POSITIVE للأعمدة** + CR منفصل لـ anon grant | A1 يظهر كل الـ 25 موجودة؛ الغياب المزعوم خارج قائمة الفيوتشر | إغلاق بند الأعمدة؛ تقييم `REVOKE anon` كـ CR منفصل بموافقة مالك |
| **B — mismatch حقيقي** | A1 يظهر عموداً من الـ 25 غائباً فعلاً | remediation محدد بذلك العمود فقط (يتطلب CR كامل بالأدلة قبل أي DDL) |

**الحالة الرسمية (بعد مراجعة المالك):**

> **`HARD STOP — DIAGNOSIS COMPLETE`** — لا إغلاق لـ Campaigns Admin · لا deploy · لا commit/push/tag · لا SQL apply حتى: (1) استيفاء الأدلة الخمسة، (2) قرار المالك A/B، (3) أي remediation عبر CR منفصل بموافقة صريحة.

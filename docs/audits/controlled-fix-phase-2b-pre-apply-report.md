# FOCUS — Phase 2B: Pre-Apply Evidence & Schema Reconciliation Report

- **Status:** COMPLETE (READ-ONLY). Zero SQL executed, zero migrations, zero Supabase changes, zero data touched.
- **Date:** 2026-08-10
- **Scope:** Reconciling the proposed central-inventory schema before any apply phase.
- **HARD STOP:** هذا التقرير قراءة/تحليل فقط. لا تنفيذ SQL ولا migration ولا backfill ولا cutover إلا بموافقة صريحة على Phase 2C بعد مراجعة هذا التقرير.

---

## القرار المعماري المُثبَّت رسميًا (من هذه المرحلة)

| الكائن | القرار | السبب |
|---|---|---|
| `supabase/inventory-central/01-inventory-apply.sql` | **الـ SSOT للمخطط المقترح** — يُطوَّر ويُصحَّح هنا فقط | مخطط متكامل: جداول + RPCs + view + audit + storage + realtime |
| `supabase/migrations/00014_inventory_tables.sql` | **مستبعد نهائيًا من التنفيذ** | متعارض مع 01 (condition `new/used`، status بلا `deleted`، أعمدة ناقصة، RLS أقل أمانًا، عدم تطابق مع تطبيق الأسواق) |
| أي `00016/00017/00018` للمخزون | **تعارض أرقام** — الـ migration الجديد يجب أن يكون `00019_` | `00016_placements.sql` و`00017_placement_columns.sql` و`00018_lookup_scan_context_rpc.sql` موجودة فعلًا |

---

## A. Schema reconciliation

### A.1 تعارضات المخطط الحالي (المعتمد فعليًا على قيد الحياة)

- المسح الشامل (`grep` على كل `supabase/migrations/`) أثبت أن الأسماء `inventory_items`, `inventory_images`, `inventory_movements`, `inventory_*` RPCs, `v_public_inventory`, `set_inventory_updated`, `audit_inventory_change` لا تظهر في أي migration آخر (00001–00018) — **لا تعارض مع المخطط الحالي**.
- `public.users.id` هو **UUID** على قاعدة البيانات الحية (صُوّبت في baseline `00008`) — FK في 01 (`created_by UUID REFERENCES public.users(id)`) متوافق ✓.
- `update_updated_at()` الموجود (مستخدم في 00015) لا علاقة له — 01 لا يعتمد عليه ✓.
- الامتداد: 01 يستخدم `extensions.uuid_generate_v4()` (uuid-ossp) في `00078:84` لكنه يستخدم أيضًا `gen_random_uuid()` بدون schema في سطر 969 — **غير متسق** ويجب حسمه (انظر H9).

### A.2 جدول reconciliation: 00014 (مستبعد) مقابل 01-inventory-apply.sql (معتمد)

| الجانب | 00014 (مستبعد) | 01-inventory-apply.sql (معتمد) | القرار |
|---|---|---|---|
| `inventory_items.condition` | CHECK `('new','used')` فقط | CHECK بقائمة الأسواق الـ11 (New…Certified Used) | **اعتماد 01** (00014 مكسور مقابل التطبيق) |
| `inventory_items.status` | 5 قيم بلا `deleted` | 6 قيم + `deleted` (soft delete) | **اعتماد 01** |
| أعمدة `inventory_items` | بلا `code/battery_health/warranty/city/source_key/extra` | كل الأعمدة موجودة + `extra JSONB` | **اعتماد 01** |
| `inventory_items_unique_sku` | `(model_id,variant,condition,color)` | نفس المفتاح | **متطابق** — معتمد |
| `inventory_images` | `path/position/is_cover` + partial unique cover | **مطابق حرفيًا** (هيكل وجدول فهرسة) | **متطابق** — معتمد |
| `inventory_movements` | `created_by` بلا `delta/reason/metadata/actor_user_id`؛ action بلا `adjusted/sale/purchase/discontinued/deleted` | `actor_user_id + delta + reason + metadata + note`؛ action أوسع | **اعتماد 01** |
| `set_inventory_updated` / `audit_inventory_change` | مطابقتان تقريبًا | نسخة 01 أحدث (إضافة status_changed منطقية أوسع) | **اعتماد 01** |
| RPCs | `inventory_management_list()` فقط | مجموعة كاملة: add/stock/prices/details/status/publish/image | **اعتماد 01** |
| `inventory_management_list` الأدوار | يشمل `researcher` | **admin/super_admin فقط** | **قرار مالك مطلوب** (انظر H13) |
| RLS على `inventory_items` | SELECT عام + Staff ALL policy (مخاطرة) | **لا سياسات إطلاقًا** — قراءة/كتابة حصرية عبر RPC | **اعتماد 01** (أكثر أمانًا) |
| Grants | SELECT أعمدة + INSERT/UPDATE على items | `REVOKE ALL` من anon/authenticated | **اعتماد 01** |
| Storage policies | `CREATE POLICY` على `storage.objects` + تحقق دور admin (00014:299-326) | إدراج خام في `storage.policies` **بلا تحقق دور** وبمفتاح خاطئ | **اعتماد طريقة 00014** في الإصلاح (انظر C) |
| Realtime | `ALTER PUBLICATION` محمي (00014:331-345) | إدراج خام في جداول داخلية `supabase_realtime.publication(_table)` | **اعتماد طريقة 00014** (انظر H8) |
| الامتداد | `uuid_generate_v4()` بلا schema (يعتمد على search_path) | `extensions.uuid_generate_v4()` صريح | **اعتماد 01** مع حسم H9 |

**الخلاصة:** الجداول ونموذج RPC-view والـ audit من 01 تُعتمد كما هي (مع إصلاحات H). أسلوبا storage وrealtime من 00014 هما الصحيحان ويُستوردان إلى 01. ملف 00014 يبقى مستبعدًا وغير منفذ.

---

## B. Security review

الملاحظة الإيجابية أولًا: **كل RPC من نوع SECURITY DEFINER يضبط `SET search_path = public`** (مضاد لخطر search_path hijacking) ✓، وكل RPC يبدأ بفحص `inventory_is_admin()` ✓.

### B.1 جدول النتائج (خطورة / مرجع / إصلاح)

| # | الثغرة/الملاحظة | الخطورة | المرجع (01) | الإصلاح المطلوب |
|---|---|---|---|---|
| B1 | سياسة INSERT على الـ bucket تستخدم مفتاح **`using`** بينما storage يتطلب **`check`** لعمليات INSERT → الرفع سيُرفض (فشل وظيفي) | مرتفعة | سطور 940-954 | إعادة كتابة القسم 9 بأسلوب `CREATE POLICY ... WITH CHECK` (طريقة 00014) |
| B2 | سياسات الرفع **لا تتحقق من دور admin** إطلاقًا (أي authenticated يستطيع الرفع) — لو طُبّقت كما هي فهي تصعيد صلاحيات؛ حاليًا مكسورة فتُرفض | حرجة (أمنية) | سطور 940-954 | إضافة `EXISTS (SELECT 1 FROM public.users WHERE id=auth.uid() AND role IN ('admin','super_admin'))` داخل كل سياسة كتابة |
| B3 | `inventory_add_image` يقبل **أي `p_path` عشوائي** — بلا تحقق من بادئة `inventory-images/{inventory_id}/`، بلا تحقق أن الكائن موجود فعلًا، وبلا ربط فعلي بالـ inventory_id (يمكن ربط مسار من bucket آخر) | مرتفعة (تجاوز مسار) | سطور 826-873 | التحقق في RPC: `p_path LIKE 'inventory-images/' || p_inventory_id || '/%'` + فحص وجود الكائن، وسياسة INSERT تفرض `name LIKE 'inventory-images/%'` |
| B4 | **لا سياسات UPDATE/DELETE** على storage.objects للـ bucket → admin لا يستطيع استبدال/حذف كائن؛ `inventory_remove_image` يحذف الصف فقط (تعليق سطر 875 «يُحذف من bucket من قِبل التطبيق») بينما حذف الكائن **سيفشل** من العميل → أيتام مضمونة | متوسطة (دورة حياة الصور) | سطور 876-896 | إضافة سياسات UPDATE/DELETE للأدوار admin/super_admin (طريقة 00014:312-326) |
| B5 | RPCs المخزون تعيد كتابة `status = inventory_calc_status(...)` فوق archived/discontinued/deleted → إضافة مخزون لقطعة مؤرشفة/محذوفة **تُحييها صامتًا** | مرتفعة (سلامة بيانات) | 485-488، 529-532، 574-577 | رفض عمليات المخزون على العناصر غير النشطة (`WHERE status NOT IN (...)`) مثلما يفعل `inventory_set_published` |
| B6 | الدوال تُمنح `GRANT EXECUTE TO authenticated` **بدون `REVOKE EXECUTE FROM PUBLIC`** — anon يستطيع استدعاءها نظريًا (محجوب فعليًا بفحص admin الداخلي، لكن دفاع-في-العمق مفقود) | منخفضة (تصلّب) | كل الدوال 342-896 | `REVOKE ALL ON FUNCTION ... FROM PUBLIC` قبل كل grant |
| B7 | `inventory_update_prices` / `inventory_update_details` بـ COALESCE → **لا يمكن تصفير حقل** (لا «إزالة سعر»، لا «إزالة warranty») | منخفضة (قصور وظيفي) | 613-616، 662-677 | قبول sentinel أو منطق update صريح |
| B8 | `inventory_add_image` حساب `MAX(position)+1` ثم INSERT — سطران بدون قفل صف (سباق ترتيب؛ لا يخالف قيدًا لكن يفسد الترتيب) | منخفضة | 854-857 | `SELECT ... FOR UPDATE` على العنصر أو جدولة position بشكل ذري |
| B9 | لا سقف أطوال على حقول النص في `inventory_add_item/update_details` (description...إلخ) | منخفضة (تصلّب) | 394-452، 631-692 | `CHECK (char_length(x) <= N)` أو صياغة في RPC |

لا توجد فجوة سمحت فعليًا بتجاوز صلاحيات الإدارة الآن: كل RPC يفحص `inventory_is_admin()` قبل أي كتابة، و`inventory_items` بلا أي SELECT/INSERT مباشر.

---

## C. Storage/RLS review

### C.1 RLS (المعتمد — سليم)

- `inventory_items`: `ENABLE ROW LEVEL SECURITY` + `REVOKE ALL` بلا أي سياسة → **لا قراءة/كتابة مباشرة لأي دور**؛ القراءة عبر `v_public_inventory` (security_invoker=false، يعمل بصلاحية المالك، وبوابة WHERE الوحيدة = publish+quantity+status) والقراءة الإدارية عبر `inventory_management_list()` ✓
- `inventory_images`: SELECT عام محدود بالحالات المنشورة (سطور 272-279) + grant على أعمدة مختارة ✓ — لا يكشف buy_price ولا internal
- `inventory_movements`: قراءة staff فقط (admin/super_admin/researcher) ✓
- `v_public_inventory` لا يكشف `buy_price / total_* / source_key / is_published` ✓

### C.2 Storage (المطلوب إصلاحه — انظر B1–B4)

- bucket `inventory-images`: public read صحيح، `file_size_limit=5MB` + mime list صحيحة ✓ (سطور 903-918)
- سياسات القراءة/الكتابة: تُدار عبر `storage.policies` خامًا بدل `CREATE POLICY` (أسلوب البيت في 00015/00014) → **B1 (مفتاح خاطئ) وB2 (غياب فحص الدور) وB4 (غياب UPDATE/DELETE)**
- فحص المسار: لا قيد `name LIKE 'inventory-images/%'` في أي سياسة → **B3**
- `owner` في سياسات `storage.policies` = `auth.uid()` → سيكون NULL عند التشغيل من SQL Editor (لا request context) — مقبول لكن يُفضَّل تشغيل سياسات الحذف بدل الإدراج

**القرار:** إعادة كتابة القسم 9 من 01 بنمط 00014:299-326 + فحص دور + `name LIKE` للمسار.

---

## D. Migration dependency map

### D.1 ترتيب الإنشاء داخل 01 (وصحيح)

`extension → inventory_items → inventory_images → inventory_movements → triggers → RLS → grants → v_public_inventory → RPCs → bucket/policies → realtime`

### D.2 الاعتماديات الخارجية

| الاعتماد | المصدر | الحالة |
|---|---|---|
| `public.users` (id UUID) | 00002 + تصحيح 00008 | موجود ✓ |
| `uuid-ossp` أو `pgcrypto` | توفر الامتداد | **يجب إثباته في 03** (H9) |
| schemas `storage`, `supabase_realtime`, `auth` | بنية Supabase الأساسية | موجودة ✓ |
| `update_updated_at()` | — | غير مستخدم في 01 ✓ |

### D.3 تعارض الأرقام (مهم)

- `00016` و`00017` و`00018` **محجوزة فعليًا** (`placements`, `placement_columns`, `lookup_scan_context_rpc`).
- أي migration جديد للمخزون = **`00019_inventory_central.sql`** (منقول من `01-inventory-apply.sql` بعد إصلاحات H). الـ rollback يقابلها (مثل `02`) أو يُدمج في نفس الملف حسب نمط البيت؛ نمط البيت في 00015 هو ملف واحد قابل للعكس مباشرة.
- لا يوجد ترقية من مخطط مخزون سابق (00014 غير منفذ) → المخطط **additive بالكامل**.

---

## E. Pre-apply evidence requirements

### E.1 عيوب `03-pre-apply-evidence.sql` (يجب إصلاحها قبل الاستخدام)

| # | المشكلة | المرجع | الإصلاح |
|---|---|---|---|
| E1 | **سطر 17** يستعلم `FROM public.inventory_items` وهو غير موجود بعد (هذا هو المطلوب إثباته!) → خطأ يقطع البرنامج قبل عرض النتائج | سطور 17-20 | استبداله بـ `to_regclass('public.inventory_items') IS NULL` أو فحص `information_schema.tables` |
| E2 | لا يفحص: الدوال `inventory_%`، سياسات storage، publication `inventory_central`، امتداد uuid-ossp، حالة grants | — | إضافة فحوصات غياب: دوال، سياسات bucket، publication، توفر extension، `file_size_limit` للـ bucket |
| E3 | لا يثبت وجود admin واحد على الأقل | — | `SELECT count(*) FROM public.users WHERE role IN ('admin','super_admin')` |

### E.2 الشروط التي يجب أن تكون خضراء قبل Apply (Gate)

1. `to_regclass('public.inventory_items') IS NULL` (و sibling الثلاثة).
2. صفر دوال `public.inventory_%`.
3. غياب bucket `inventory-images` وغياب سياسات storage تحمل أسماء المرحلة.
4. غياب publication `inventory_central`.
5. امتداد uuid-ossp مثبت (أو قرار H9 بالتحول لـ gen_random_uuid).
6. `users` موجودة ومعها ≥1 admin/super_admin.
7. كل التصديرات (inventory-phase-c/exports) مخزّنة خارج النطاق ولا تمس.

تُشغَّل باسم `postgres` (SQL Editor) ويُحفظ المخرَج كدليل مؤرّخ.

---

## F. Backfill safety requirements

### F.1 تقييم أدوات `inventory-phase-c` (قراءة فقط ✓)

- `01-export-origin.html`: لا `setItem`/`removeItem`/fetch؛ يصدّر **كل المفاتيح** بما فيها `images` (base64 كامل داخل `catalog_inventory.value`)؛ SHA-256 للحمولة؛ يُنشئ ملف JSON قابلًا للتنزيل. **آمن** ✓
- `02-reconcile.html`: لا يكتب شيئًا؛ `MATCH` فقط للقيم المتطابقة تمامًا، وأي اختلاف/جهاز-واحد → `OWNER_REVIEW` (قرار المالك إلزامي). **آمن** ✓
- README يثبّت: التصدير من **كل Origin**، لا نختار جهازًا كمصدر، لا قرار تلقائي على الاختلاف ✓

### F.2 الفجوات التي يجب إغلاقها قبل أي Backfill (Phase E)

| # | الفجوة | المرجع | المطلوب |
|---|---|---|---|
| F1 | تقرير الـ reconcile **يُسقط `imagesData` والحقول غير المدرجة** في `normRecord` (فقط حقول محددة) → **CANONICAL DATASET يجب أن يُبنى من ملفات التصدير الخام + القرارات، وليس من تقرير المطابقة** | 02-reconcile.html:104-131، 244-268 | تأكيد أن backfill Phase E يقرأ `focus-inventory-export_*.json` الخام (مع الصور) وليس `focus-inventory-reconcile_*.json` فقط |
| F2 | مفتاح SKU = `modelId\|variant\|condition\|color` **بلا ram/storage** → احتمال دمج خاطئ لمتغيرين مختلفين | 02-reconcile.html:133-135 | إضافة ram/storage (أو استخدام code) في مفتاح المطابقة |
| F3 | SHA-256 عبر `crypto.subtle` يتطلب secure context (localhost ✓) | 01-export-origin.html:110-119 | لا فجوة تشغيلية على `localhost:5173`، لكن بدون secure context يظهر تحذير فقط |
| F4 | لا checksum لكل سجل على حدة | — | اختياري: checksum لكل سجل في Phase E |
| F5 | قاعدة مطلقة: **لا حذف localStorage حتى إثبات رباعي** (الكائن موجود + صف DB موجود + الصورة تُحلّ + تطابق item/order/cover) — وهذا مطابق لنص 01 سطور 66-68 ✓ | 01:66-68 | الاحتفاظ بالتصديرات الخام كنسخ احتياطية غير قابلة للتغيير |

**الشرط:** تشغيل التصدير على كل Origin، قرار المالك على كل `OWNER_REVIEW`، ثم دليل `03-pre-apply-evidence` أخضر — وقبل ذلك فقط أي backfill.

---

## G. Rollback verification

### G.1 فحص `02-inventory-rollback.sql` مقابل `01-inventory-apply.sql`

- ترتيب عكسي صحيح: realtime → storage → RPCs → view → policies → triggers → tables ✓ (سطور 8-61)
- **توقيعات DROP FUNCTION الـ13 كلها مطابقة** لتوقيعات الإنشاء في 01 (تمت المطابقة حرفيًا، بما فيها `inventory_update_details` ذات الـ15 معاملًا) ✓
- حذف سياسات storage بالاسمين المستخدمين في 01 (`Public read inventory images`, `Admin write inventory images`) ✓
- `inventory_is_admin/calc_status` تُسقط بعد كل RPCs ✓ — لاحظ أن `v_public_inventory` تُسقط قبل RLS policies مباشرة ✓
- الامتداد `uuid-ossp` **لا يُسقط** (مشترك — قرار صحيح) ✓

### G.2 عيوب يجب إصلاحها مع إصلاحات المرحلة

| # | الفجوة | المرجع (02) | الإصلاح |
|---|---|---|---|
| G1 | حذف bucket مباشرة دون تصفية كائناته أولًا (يفترض CASCADE من storage.objects) | سطر 25 | `DELETE FROM storage.objects WHERE bucket_id='inventory-images'` قبل حذف bucket |
| G2 | أسماء السياسات ثابتة في 02 — بعد إصلاح B1–B4 بأسلوب CREATE POLICY ستتغير الأسماء → **يجب تحديث 02 ليطابق الأسماء النهائية** | سطر 24 | مزامنة أسماء السياسات بين 01/02 بعد الإصلاح |
| G3 | الـ rollback يُفقد البيانات المركزية المضافة بعد apply — محذَّر في الترويسة ✓ | سطر 4-5 | إضافة إلزام: تشغيل rollback فقط بعد تأكيد نسخ التصدير سليمة |

### G.3 إصلاح `04-post-apply-verify.sql`

| # | المشكلة | المرجع (04) | الإصلاح |
|---|---|---|---|
| G4 | فحص `11_admin` (سطر 44) يعتمد `auth.uid()` — في SQL Editor هو NULL → سيرجع FALSE دائمًا ومضلل (التعليق يقول يجب أن يكون TRUE!) | سطر 44 | استبداله بعدّاد admin في `public.users` أو تشغيله من جلسة authenticated |
| G5 | لا يتحقق من سياسات storage ولا من grants | — | إضافة فحص لوجود سياسات bucket وغياب `EXECUTE PUBLIC` على RPCs |
| G6 | `07_rpcs` يعد `proname LIKE 'inventory_%'` (14 دالة) بدون حد أدنى/أعلى دقيق | سطر 28-30 | تحديد العدد المتوقع (14) |

---

## H. Exact blockers before Phase 2C (Schema Apply)

> لا يمكن اعتماد `01-inventory-apply.sql` والانتقال لمرحلة التنفيذ قبل إغلاق كل ما يلي. B1–B4 أمنية/وظيفية حرجة.

| Blocker | نوع | الإصلاح | الملف/السطر |
|---|---|---|---|
| **B1** مفتاح `using` بدل `check` لسياسة INSERT | وظيفي حرج | CREATE POLICY ... WITH CHECK (نمط 00014) | 01 §9 (940-954) |
| **B2** غياب فحص دور admin في سياسات الرفع | أمني حرج | إضافة EXISTS على users.role داخل كل سياسة كتابة | 01 §9 |
| **B3** غياب التحقق من المسار في `inventory_add_image` وغياب قيد `name LIKE 'inventory-images/%'` | أمني (مسار تعسفي) | تحقق البادئة داخل RPC + قيد الاسم في السياسة | 01 (826-873) + §9 |
| **B4** غياب سياسات UPDATE/DELETE storage → حذف الصور مكسور وأيتام | وظيفي/دورة حياة | إضافة UPDATE/DELETE للأدوار الإدارية | 01 §9 |
| **B5** RPCs المخزون تعيد إحياء archived/deleted صامتًا | سلامة بيانات | رفض المخزون على العناصر غير النشطة | 01 (485-488/529-532/574-577) |
| **E1** خطأ في 03 (استعلام جدول غير موجود) | تشخيصي | to_regclass | 03 (17-20) |
| **G4** فحص admin غير موثوق في 04 | تشخيصي | عدّاد admin في users | 04 (44) |
| **H8** إدراج خام في `supabase_realtime.publication(_table)` | متانة (يفشل على نسخ أخرى) | ALTER PUBLICATION محمي (نمط 00014:331-345) | 01 (963-988) |
| **H9** تبعية uuid-ossp + خلط `gen_random_uuid()` | متانة | اعتماد `gen_random_uuid()` (pgcrypto متوفر دائمًا على Supabase) أو إثبات uuid-ossp في 03 | 01 (78، 84، 969) |
| **H10** غياب `REVOKE EXECUTE FROM PUBLIC` على RPCs | تصلّب أمني | REVOKE + GRANT صريح | كل الدوال |
| **H11** تعارض رقم migration (00016-00018 محجوزة) | تنظيمي | `00019_inventory_central.sql` | migrations/ |
| **H12** سياسات storage بلا مزامنة اسم في 02 | تنظيمي | مزامنة أسماء السياسات بين 01/02 + G1 | 02 (24-25) |
| **H13** `inventory_management_list` يستثني `researcher` (00014 كان يشمله) | قرار مالك | تأكيد: هل researcher يقرأ المخزون الإداري؟ | 01 (381) |
| **F1/F2** أداة reconcile تُسقط الصور/الحقول غير المدرجة ومفتاح SKU ناقص | سلامة backfill | بناء canonical من التصديرات الخام + توسيع مفتاح SKU | inventory-phase-c/02-reconcile.html |

### الاختبارات التي يجب أن تكون خضراء قبل Schema Apply

> Phase 2B لم يمس أي كود تطبيق؛ القائمة تحمي عقد التطبيق الحالي قبل أي تنفيذ. الأوامر: `pnpm test` (vitest run), `pnpm lint`, `pnpm typecheck`.

| الاختبار | السبب |
|---|---|
| `src/__tests__/privacy/p3-stop-write-gate.test.ts` | بوابة الكتابة — لا تغيير في العقد |
| `src/__tests__/privacy/p5-telemetry-qr-removal-gate.test.ts` | بوابة p5 |
| `src/__tests__/privacy/p7-privacy-regression-gate.test.ts` | بوابة خصوصية عامة |
| `src/__tests__/s4-browse-catalog-source-gate.test.tsx` | مصدر الكتالوج (المخزون المتصل) |
| `src/__tests__/inventory/seed-and-prices.test.ts` | عقد الـ seed والأسعار المحلية |
| `src/__tests__/inventory/exchange-source.test.ts` | عقد التبادل (getExchangeableDevices) |
| `src/__tests__/inventory/AddInventoryModal.test.tsx` + `EditInventoryModal.test.tsx` | نماذج الكتابة |
| فحص ثابت جديد (يُضاف قبل 2C): لا تكرار أرقام migrations، و00014 غير مرجعي، وتطابق توقيعات 01↔02 | شبكة أمان المخطط |

---

## HARD STOP

- **تم:** المراجعة والتثبيت المعماري والـ reconciliation والأدلة.
- **لم يُنفَّذ:** لا SQL، لا migration، لا Supabase، لا backfill، لا حذف localStorage، لا نقل صور، لا تعديل UI، لا commit، لا push.
- **الخطوة التالية:** مراجعة المالك لهذا التقرير (خصوصًا B1–B5 وH13)، ثم أمر صريح لبدء Phase 2C فقط (إصلاح ملفات 01/02/03/04 وتسمية 00019، مع الاستمرار في عدم تنفيذ أي شيء على Supabase حتى أمر لاحق).

**إتمام Phase 2B لا يمنح أي تصريح تلقائي لـ Phase 2C.**

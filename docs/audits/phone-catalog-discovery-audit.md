# تقرير اكتشاف قاعدة بيانات الهواتف — Phone Catalog Discovery Audit

> التاريخ: 7 أغسطس 2026
> النطاق: اكتشاف (Read-Only) — لا تعديلات على البيانات أو المخطط أو الواجهات
> الهدف: الإجابة على 20 سؤالاً حول كتالوج الهواتف/قاعدة بيانات الأجهزة مع الإثبات

---

## 1. الملخص التنفيذي

الكتالوج الحالي = **18 علامة تجارية / 866 موديل / 1,816 نسخة (variant)** في `src/catalog/brands/*.json`.
المشكلة الجوهرية التي استدعت هذا التدقيق — **Samsung Galaxy A16 4/128 غير موجودة في الكتالوج** — مؤكَّدة بالدليل:

- `samsung.json` السطر 25 يخزّن للـ Galaxy A16 (SM-A165F) النسختين `6/128` و`8/256` فقط.
- مسار إدخال المخزون في `AddInventoryModal.tsx:101` يستخدم `VariantSelector` بدون `showAll` → القائمة محصورة بـ `getVariantsForModel()` = نسخ JSON فقط، **لا يوجد إدخال حر لـ RAM/Storage**.
- النتيجة: لا يمكن للمسؤول إضافة A16 4/128 الحقيقية في السوق الجزائري؛ إما أن تُدوَّن كـ 6/128 (مواصفات خاطئة أمام الزبون) أو لا تُدوَّن إطلاقاً.

ثانياً: الـ "Model" والـ "Variant" **منفصلان جزئياً فقط**: النسخ موجودة كصفيفة داخل كل موديل في JSON، لكن سجل المخزون وMigration Supabase يخزّنان `variant`/`ram`/`storage` كأعمدة نصية مسطّحة بدون أي جدول Variant معياري.

ثالثاً: توجد **تمثيلات قديمة/منسية** في المستودع تصف كتالوجاً أكبر (47 علامة / 3,036 موديل) لا يطابق النشط (18/866): `.catalog-store/`، `catalog-audit/`، `docs/catalog-audit.md`، `docs/catalog-coverage.md`، و`seeder.ts`/`schema.ts` التي ما زالت تستهلك `phone-catalog.ts` القديم.

---

## 2. مصادر البيانات (Data Sources)

| المصدر | المسار | الحالة | الاستخدام |
|--------|--------|--------|-----------|
| **الكتالوج النشط (SSOT للموديلات)** | `src/catalog/brands/*.json` (18 ملف) | ✅ نشط | تحميل عبر `src/catalog/loader.ts` |
| طبقة الكتالوج | `src/catalog/loader.ts` | ✅ نشط | فهارس 4 (brand/modelNumber/alias/token) + `getVariantsByName` |
| الخدمة العليا | `src/services/catalog-service.ts` | ✅ نشط | `searchCatalog`, `resolveModel`, `getSuggestedVariants` |
| توليد النسخ | `src/data/phone-variants.ts` | ✅ نشط | `RAM_VALUES`/`STORAGE_VALUES`/`generateAllVariants` (49 نسخة عامة) |
| مخزون التشغيل (SSOT للكميات) | `localStorage` عبر `src/services/inventory-service.ts` | ✅ نشط | مفاتيح `catalog_inventory`، `*_movements_v2`، `inventory_timeline_v3` |
| محرك الأسماء المستعارة | `src/services/alias-engine.ts` | ✅ نشط | عربية/إنجليزية/أرقام/رموز الموديل |
| الجودة/التحقق | `catalog-quality.ts`, `brand-rules.ts`, `variant-verification.ts` | ✅ نشط | تقرير جودة 0-100 + اختبارات |
| **متجر قديم (47/3004)** | `.catalog-store/*_v1.json` (gitignored) | ⛔ قديم | خرج `seeder.ts` بتاريخ 2026-07-29 من `phone-catalog.ts` القديم |
| **أرشيف فحص (47/3036)** | `catalog-audit/` (gitignored) | ⛔ قديم | يولّده `golden-audit.ts` بتاريخ 29/7 |
| قاعدة بيانات قديمة | `src/data/phone-database.ts` | ⛔ DEPRECATED | تعليق داخلي: إزالة في 2026-Q4، صفر استيراد إنتاجي |
| Supabase للمخزون | `supabase/migrations/00014_inventory_tables.sql` | ⛔ DRAFT، لم يُنفَّذ | بدون متغيرات بيئة → 100% localStorage |

---

## 3. حجم الكتالوج الحالي (المصدر: JSON)

| العلامة | موديلات | نسخ | نسخة واحدة فقط |
|---------|--------:|----:|----:|
| Samsung | 163 | 342 | 21 |
| Xiaomi | 135 | 325 | 3 |
| Apple | 68 | 202 | 1 |
| Honor | 65 | 135 | 11 |
| Motorola | 54 | 94 | 14 |
| Realme | 46 | 97 | 1 |
| Huawei | 44 | 75 | 18 |
| Google | 39 | 81 | 8 |
| OnePlus | 36 | 79 | 3 |
| Oppo | 36 | 67 | 8 |
| Nokia | 30 | 48 | 12 |
| Sony | 27 | 32 | 22 |
| Vivo | 31 | 55 | 9 |
| Tecno | 23 | 41 | 5 |
| Infinix | 22 | 43 | 1 |
| Asus | 20 | 47 | 0 |
| ZTE | 18 | 33 | 6 |
| Nothing | 9 | 20 | 1 |
| **الإجمالي** | **866** | **1,816** | **144** |

- 144 موديلاً بنسخة واحدة (مرشّحون لنقص النسخ).
- 0 موديل بلا نسخ؛ 0 نسخة فيها ram>storage.
- قيم RAM كسرية موجودة فقط في Apple القديمة (iPhone 1st Gen 0.25GB، iPhone 4 0.5GB).

---

## 4. فصل الموديل عن النسخة (Model vs Variant)

### في الكتالوج (JSON) — منفصل جزئياً
```ts
interface CatalogModel {
  model: string;            // "Galaxy A16"
  variants: CatalogVariant[]; // [{storage:"128",ram:"6"}, {storage:"256",ram:"8"}]
  modelNumbers: string[];   // ["SM-A165F"]
  releaseYear: number; series: string;
}
```
كل موديل يحمل صفيفة `variants` داخلية — لا يوجد كيان مستقل "جدول نسخ" لكل موديل.

### في المخزون (localStorage + Supabase DRAFT) — مسطّح
- `InventoryRecord` (inventory-service.ts:43): `modelId`, `brand`, `model`, `variant` (نص "6/128"), `ram`, `storage` — **كلها نصوص**.
- `00014_inventory_tables.sql`: `variant TEXT`, `ram TEXT`, `storage TEXT`, و`UNIQUE (model_id, variant, condition, color)` — بدون FK إلى جدول نسخ، بدون جدول `variants` معياري إطلاقاً.

### في توليد النسخ
- `generateAllVariants()`: جداء كامل (11 RAM × 9 Storage = 99) ناقص 50 استثناء = **49 نسخة عامة** (`PHONE_VARIANTS`) — **ليست خاصة بالموديل**.
- `getVariantsForModel()`: نسخ JSON الخاصة بالموديل أولاً، وإلا fallback تخميني (`getHeuristicVariants`) — مستخدَم فقط عند غياب نسخ JSON (صفر من 866 اليوم).

**الخلاصة**: لا توجد فصلة هيكلية كاملة؛ الـ variant هو تسمية نصية (زوج RAM/Storage) على سجل مسطّح.

---

## 5. دراسة حالة Samsung Galaxy A16 (السؤال الجوهري)

الدليل من `src/catalog/brands/samsung.json`:

```json
{ "model": "Galaxy A16", "series": "A", "variants": [{"storage":"128","ram":"6"},{"storage":"256","ram":"8"}], "modelNumbers":["SM-A165F"], "releaseYear":2024 }
{ "model": "Galaxy A16 5G", "series": "A", "variants": [{"storage":"128","ram":"6"},{"storage":"256","ram":"8"}], "modelNumbers":["SM-A166B"], "releaseYear":2024 }
```

الواقع: A16 4G (SM-A165F) متوفر في الأسواق (شامل الجزائر) بإصدار **4/128** و6/128 و8/256.
المقارنة: `Oppo A16` في نفس الكتالوج يحوي `4/64` و`4/128` — أي أن الكتالوج يغطي 4/128 لمنافس مباشر لكنه ينقصه لـ Galaxy A16.

### سلسلة الإخفاق
1. JSON يحوي النسختين فقط (نقص بيانات) ←
2. `VariantSelector modelName` بلا `showAll` → يعرض نسخ JSON فقط ←
3. لا `onModelNotFound` في `AddInventoryModal` (الممرّر فقط في `CustomerPhoneFlow` و`RepairRequestScreen`) ←
4. لا يمكن إنشاء سجل "غير موجود في الكتالوج" من شاشة المخزون ←
5. **A16 4/128 لا يُدخل أبداً، أو يُدخل بمواصفات 6/128 خاطئة**.

---

## 6. هل يمكن للنظام إنشاء تركيبات غير حقيقية؟

| المسار | الخلاصة |
|--------|---------|
| إدخال مخزون مسؤول (موديل معروف) | **لا** — قائمة محصورة بنسخ JSON، بلا إدخال حر |
| متجر إصلاح/خدمة (CustomerPhoneFlow) | لا `showAll` أيضاً، لكن يوجد نموذج "غير موجود في الكتالوج" يعرض القائمة العامة `PHONE_VARIANTS` (49) |
| نسخ JSON نفسها | قد تحوي أخطاء يدوية (لا يوجد فحص تلقائي للحقيقة) |
| Fallback التخمين | يمكن أن يعطي تركيبات غير دقيقة لموديل بلا نسخ (0 حالياً) |

**الخطورة الحقيقية**: أخطاء النسخ تأتي من **بيانات JSON** نفسها وليس من إدخال حر؛ يكفي خطأ واحد في ملف العلامة ليُعرض للزبون.

---

## 7. تصادم أسماء الموديلات (Bug مؤكَّد)

`ensureVariantsByName()` في `loader.ts` يبني خريطة `normalize(model)` → نسخ، مع `if (!map.has(key))` = **أول علامة تفوز**.
ترتيب `ALL_BRANDS`: … Honor ← Vivo …

توجد 3 أسماء مكررة عبر العلامات (X50/X60/X70):
| الموديل | Honor (الأول) | Vivo (الثاني — يُهزم) |
|---------|---------------|-----------------------|
| X50 | 8/128, 8/256, 12/512 | 8/128 |
| X60 | 8/128, 12/256, 12/512 | 8/128, 12/256 |
| X70 | 8/128, 12/256, 12/512 | 8/128, 12/256 |

عند اختيار **Vivo X50** في الكاسكيد، يعرض `getVariantsForModel("X50")` نسخ **Honor X50** (3 نسخ خاطئة). السبب: نقل اسم الموديل فقط بدون العلامة إلى البحث عن النسخ.

---

## 8. جرد الأصول القديمة (Stale Artifacts)

| الأصل | المحتوى | لماذا قديم |
|-------|---------|-----------|
| `.catalog-store/catalog_*_v1.json` | 47 علامة / 3,004 موديل / 9,915 alias | يولّده `seeder.ts` من `phone-catalog.ts` القديم (29/7) |
| `catalog-audit/catalog-audit-full.json` | 47 علامة / 3,036 موديل | خرج `golden-audit.ts` (29/7) |
| `docs/catalog-audit.md` | 47/3,036 بلا نسخ لكل موديل (49 عامة) | يصف الكتالوج القديم |
| `docs/catalog-coverage.md` | نفس القديم | يصف الكتالوج القديم |
| `src/database/schema.ts` + `seeder.ts` | TABLES `catalog_*_v1` + Seeder | يستهلك `phone-catalog.ts` وليس JSON الجديد |
| `src/data/phone-database.ts` | deprecated | صفر استيراد |

> ملاحظة: كل هذه Gitignored (`.catalog-store/`, `catalog-audit/`) لكنها في مجلد العمل وتوصَف في وثائق مرجعية — مصدر التباس.

---

## 9. Supabase مقابل localStorage

- `data-audit-report.md`: متغيرات البيئة غير مضبوطة → `isSupabaseAvailable()===false` → **100% من البيانات في localStorage**.
- `inventory-service.ts` لا يستورد Supabase إطلاقاً (تحقق من `grep supabase` بلا نتائج).
- `00014_inventory_tables.sql` معلّم "**DRAFT FOR REVIEW. NOT EXECUTED.**" ويوجد منه `inventory_items`/`inventory_images`/`inventory_movements`.
- كل ما في Supabase اليوم = M1 (RPC فحص QR/Session عبر `00016`–`00018`).
- الجدولان المسطّحان (localStorage الحالي و00014) متطابقان في الشكل تقريباً → ترحيل مستقبلي ممكن لكن لا يوجد اليوم.

---

## 10. مسار إدخال المخزون (Admin Flow)

```
AddInventoryModal → (بحث موديل) → VariantSelector modelName (بلا showAll)
   → getVariantsForModel → قائمة مغلقة ← لا إدخال حر، لا "غير موجود" هنا
```
- `onModelNotFound` غير ممرّر → لا موديل خارج الكتالوج.
- `CatalogCascadeSelector` (شاشات أخرى): التصفح يقرأ `localStorage catalog_brands_v1/catalog_models_v1` (لا أحد يملأها في المتصفح — seeder Node-only) بينما البحث يقرأ JSON. **فجوة مزدوجة المصدر** في نفس المكوّن.

---

## 11. التحقق والجودة

- `variant-verification.ts`: `verifyModelVariants`/`coverage` — اختبارات لكل موديل.
- `catalog-quality.ts`: تقرير `CatalogQualityReport` (aliases/نسخ/تكرارات/نسخ غير منطقية) في Catalog Health (Research Console).
- `brand-rules.ts`: قواعد خاصة بالعلامات.
- **لا يوجد** تحقق في زمن الإدخال يطابق النسخة المختارة مع الحقيقة الواقعية.

---

## 12. الهويات المعيارية (Canonical IDs)

- `modelId` = `"${brand} ${normalize(model)}"` (سلسلة نصية، لا UUID ثابت). مثال: `"Samsung Galaxy A16"`.
- ملفات JSON بلا حقل `id`؛ جداول seeder القديمة كانت تولّد `id`.
- أي إعادة تسمية/توحيد لكسر الروابط بين المخزون والكتالوج والـ price-memory (مفتاح `price_memory_v1`).

---

## 13. الصور (Images)

- `InventoryRecord.images[]` = data-URL مضغوطة مضمّنة في السجل (localStorage فقط، `updateImages`).
- لا تخزين في Supabase، لا storage bucket — الوثيقة نفسها تصفها "غير جزء من عقد المخزون، عرض بحت".

---

## 14. التكرارات (Duplicates)

- موديلات مكررة عبر العلامات: **X50/X60/X70** (Honor vs Vivo) — لا توجد طريقة تمييز بالعلامة في `getVariantsByName`.
- `docs/catalog-audit.md` القديم ادّعى "صفر تكرارات" لكن على مجموعة الـ 47 القديمة وبمعيار أسماء فقط.

---

## 15. الاختلافات الإقليمية (Regional Variants)

- كل ملف علامة يخزّن نسخاً "عالمية" بلا تمييز إقليمي (لا حقول `region`, `market`, `sim`, `network`).
- مثال: A16 4G في الجزائر 4/128 غير موجودة، بينما A16 5G (8/128 في بعض الأسواق) مغطاة بـ 6/128/8/256 فقط.
- `catalog-audit.md` القديم لاحظ فجوات إصدارات 2025-2026 حديثة جداً (Honor 300، Magic 7، OnePlus 13، Redmi Note 14، Realme 14 Pro+…) — تعني الكتالوج القديم لكن المبدأ قائم: **الحداثة نقطة ضعف مستمرة**.

---

## 16. مصدر الحقيقة الواحد (SSOT)

**الخلاصة**: مصدران حيّان + أصول ميتة عديدة.

| المجال | SSOT الحقيقي | تمثيلات منافسة/قديمة |
|--------|-------------|----------------------|
| الموديلات والنسخ | `src/catalog/brands/*.json` | `.catalog-store` (47)، `catalog-audit`، `docs/*`، `schema.ts`/`seeder.ts`، `phone-database.ts` |
| المخزون/الكميات | localStorage `catalog_inventory` | `00014_inventory_tables.sql` (DRAFT، لم يُنفَّذ) |
| الأسماء/aliases | `alias-engine.ts` فوق الـ JSON | متجر aliases القديم (9,915/19,738) |

لا يوجد "تعارض نشط بين مصدرين حيّين" في وقت التشغيل، لكن المستودع **يحوي وثائق وأكواد تثق بمصدر قديم** (seeder يعيد توليد 47/3004 من مصدر deprecated) — وهو التباس يجب حسمه قبل أي توسعة.

---

## 17. تصنيف المخاطر

| # | المخاطرة | الشدة | النوع |
|---|----------|-------|-------|
| R1 | Samsung A16 4/128 غير قابلة للإدخال (مواصفات خاطئة تُعرض للزبون) | 🔴 عالية | بيانات |
| R2 | Vivo X50/X60/X70 تُعرض بنسخ Honor الخاطئة (تصادم أسماء) | 🔴 عالية | منطق |
| R3 | Seeder يكتب متجر 47/3004 من مصدر deprecated (إعادة نشر التباس) | 🟠 متوسطة | مصدر |
| R4 | 144 موديلاً بنسخة واحدة فقط (نقص محتمل) | 🟠 متوسطة | بيانات |
| R5 | `CatalogCascadeSelector` يقرأ localStorage لا يملؤه أحد في المتصفح | 🟠 متوسطة | مصدر |
| R6 | لا هوية UUID مستقرة للموديل (ربط نصي هش) | 🟡 منخفضة | تصميم |
| R7 | لا تمييز إقليمي للنسخ | 🟡 منخفضة | تصميم |
| R8 | وثائق قديمة (catalog-audit/coverage) تصف كتالوجاً غير موجود | 🟡 منخفضة | توثيق |

---

## 18. إجابة الأسئلة العشرين

1. **ما مصادر بيانات الهواتف؟** → JSON (18 ملفاً) + `loader.ts` + `phone-variants.ts` + `alias-engine.ts` + localStorage (المخزون) + أصول قديمة (متجر 47/3004، Supabase DRAFT).
2. **ما الجداول؟** → "جداول" localStorage: `catalog_inventory`, `*_movements_v2`, `inventory_timeline_v3`, `price_memory_v1`, `popularity_*`, مفاتيح `catalog_*_v1` (تُقرأ فقط). Supabase: `inventory_items/images/movements` (00014، DRAFT).
3. **كم علامة؟** → 18 نشطة (JSON). القديم 47.
4. **كم موديلاً؟** → 866 نشط (JSON). القديم 3,036/3,004.
5. **هل Model/Variant منفصلان؟** → جزئياً: نسخ داخل الموديل في JSON؛ سجلات المخزون مسطّحة (variant نص)؛ بلا جدول نسخ معياري في 00014.
6. **هل يمكن إنشاء تركيبات غير حقيقية؟** → لا عبر الإدخال الحر للموديل المعروف؛ الخطر في أخطاء JSON نفسها + fallback تخميني + قائمة 49 العامة في مسار "غير موجود".
7. **Samsung A16 4/128 مقابل 6/128؟** → 4/128 غير موجودة في JSON؛ الإدخال محصور بالنسخ المدرجة → لا يمكن إدخال 4/128 الحقيقية (R1).
8. **كم RAM/Storage خيارات؟** → RAM 11 قيماً + كسرية 0.25/0.5؛ Storage 9 قيماً؛ الجداء الكامل 99، الفعلي 49 (بعد 50 استثناء).
9. **كيف يُختار الإصدار؟** → `getVariantsForModel` → JSON أولاً، fallback تخميني، تعديلات `MODEL_VARIANT_OVERRIDES` (فارغة اليوم).
10. **من أين تأتي بيانات JSON؟** → كتابة يدوية في v2.0.0-rc1 (commit 12e49ac)؛ لا يوجد مصدر خارجي مؤتمت (GSMArena إلخ).
11. **هل يوجد تحقق؟** → `variant-verification.ts` + `catalog-quality.ts` + `brand-rules.ts` (لا تحقق زمن الإدخال).
12. **هل توجد IDs معيارية؟** → لا؛ `modelId` = نص brand+model، الـ JSON بلا `id`.
13. **أين الصور؟** → data-URL داخل السجل (localStorage فقط).
14. **هل توجد تكرارات؟** → نعم: X50/X60/X70 عبر علامتين (Honor/Vivo).
15. **هل توجد اختلافات إقليمية؟** → لا تمثيل إقليمي؛ بيانات عامة.
16. **كم الـ aliases؟** → مولّد من الـ JSON (18 علامة)؛ القديم 19,738 (لمجموعة الـ 47).
17. **ما SSOT؟** → JSON للموديلات/النسخ، localStorage للكميات؛ كل ما عداه قديم/ميت.
18. **أين الـ SSOT فعلياً؟** → `src/catalog/brands/*.json` + `inventory-service.ts` (localStorage) — لا Supabase للمخزون اليوم.
19. **ما خطر "نسخة غير موجودة"؟** → تعارض بيانات تُعرض للزبون (A16) + تصادم أسماء (Vivo X50) + كتالوج "أحدث" مفقود.
20. **كيف نمنع تكرارها؟** → انظر التوصية (قسم 19) — لا تنفيذ الآن.

---

## 19. اتجاه المعالجة (Remediation Direction — بلا تنفيذ)

1. **سحب JSON كـ SSOT وحيد**: نقل `schema.ts`/`seeder.ts`/`golden-audit.ts` لاستهلاك الـ JSON (18/866) بدل `phone-catalog.ts`؛ إيقاف توليد متجر 47/3004.
2. **إصلاح R2**: تزويد `getVariantsForModel` بالعلامة (lookup بـ brand+model) وإلغاء أول-علامة-تفوز.
3. **إصلاح R1**: إضافة 4/128 إلى Galaxy A16 وA16 5G، ومراجعة الـ 144 موديلاً أحادي النسخة.
4. **فصل Model/Variant هيكلياً** (اختياري للمرحلة القادمة): جدول `variants` مع FK، `id` مستقر لكل موديل.
5. **أرشفة القديم**: حذف/وضع علامة على `.catalog-store`، `catalog-audit`، `docs/catalog-audit.md`، `docs/catalog-coverage.md`، `phone-database.ts`.
6. **مصدر مرجعي خارجي** (GSMArena أو ما شابه) لمزامنة دورية للنسخ/الموديلات.
7. **قرار مصيري**: إمّا تنفيذ 00014 أو إعلان localStorage رسمياً كـ SSOT للشحن.

> **STOP — لا تنفيذ قبل مراجعة صاحب القرار.**

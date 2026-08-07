# CATALOG-2 — SSOT Migration Plan — خطة الانتقال إلى مصدر الحقيقة الواحد

> التاريخ: 7 أغسطس 2026
> المرحلة: CATALOG-2 **Discovery / Migration Design** — قراءة وتحليل فقط.
> الالتزامات المطبّقة: ✅ لا Migration فعلي · ✅ لا حذف مصدر قديم · ✅ لا تغيير Inventory · ✅ لا إضافة موديلات/نسخ · ✅ لا Commit.
> مخرجات هذه المرحلة: هذا التقرير (خطة + أدلة) فقط — **STOP بانتظار الموافقة قبل أي تنفيذ.**

---

## 1. ملخص تنفيذي

الاكتشاف الأهم في هذه المرحلة **يصحّح جزءاً من التدقيق السابق**: الكود الحيّ اليوم **مربوط بالفعل بمصدر JSON الموحّد**، والتعارض المزعوم ليس "مصدرين حيّين" بل **أصولاً قديمة متجمّدة** + **فجوات ربط نصي** + **بحث بالاسم دون الشركة**.

| الحقيقة المكتشفة | الدليل |
|------------------|--------|
| `loader.ts` يستورد **18 ملف JSON فقط** | `loader.ts:1-28` (imports الـ 18 علامة) |
| `phone-catalog.ts` يشتق من `getAllModels()` (JSON) — **ليس** مصدراً مستقلاً | `phone-catalog.ts:1-20` |
| متجر `.catalog-store` (47/3004/49/9915) **بقايا قديمة** من 29/7 (قبل rc1) | counts على القرص + git: `12e49ac` 31/7 أدخل JSON |
| `phone-database.ts` **ورقة صفر استيراد** (تستورد نفسها فقط) | grep كامل في src |
| `seeder.ts` يستهلك `PHONE_CATALOG` = JSON اليوم (وليس 47) | `seeder.ts:1` |
| مخزون/أسعار/أجهزة يربطون بـ **نص** (`modelId`, `variant`, `brand\|\|model...`) | `inventory-service`, `price-memory:156`, `device-ledger` |
| تصفح الكاسكيد يقرأ `catalog_*_v1` من localStorage لا يملؤه أحد في المتصفح | `CatalogCascadeSelector.tsx:32-33` |

الخلاصة: **SSOT هو JSON فعلياً في وقت التشغيل**؛ ما يحتاج هجرة فعلية هو (أ) أرشفة الأصول القديمة بعد الإثبات، (ب) إصلاح البحث بالاسم (D3)، (ج) ربط هوية `variantId` عوض النص، (د) تحويل نموذج JSON إلى النموذج المعياري عبر **Adapter** بدون تغيير البيانات.

---

## 2. خريطة المستهلكين الكاملة (Consumer Inventory)

### 2.1 مستهلكو JSON (عبر `catalog/loader`) — النواة المشتركة

| الملف | الوظيفة | المستوى |
|-------|---------|---------|
| `src/catalog/loader.ts` | تحميل 18 JSON + فهارس (brand/modelNumber/alias/token) | ✅ SSOT |
| `src/catalog/index.ts` | إعادة التصدير العام | ✅ SSOT |
| `src/catalog/types.ts` | أنواع `CatalogBrand/Model/Variant` (النموذج القديم المسطّح) | يتحول إلى Alias نحو canonical |

### 2.2 طبقة الخدمات (تشتق من JSON)

| الملف | الوظيفة | يقرأ |
|-------|---------|------|
| `src/data/phone-catalog.ts` | `PHONE_CATALOG`/`PHONE_MODELS` (تسطيح JSON) | `getAllModels()` |
| `src/data/phone-variants.ts` | `getVariantsForModel`/`generateAllVariants` | `getVariantsByName` (D3 هنا) |
| `src/services/catalog-service.ts` | `searchCatalog`/`resolveModel`/`getSuggestedVariants`/`normalizeModelName` | loader + variants + aliases |
| `src/services/alias-engine.ts` | الأسماء المستعارة | `getAllBrands()` |
| `src/services/brand-rules.ts` | قواعد العلامات | loader |
| `src/services/price-memory.ts` | ذاكرة الأسعار (مفتاح نصي) | loader (getAllModels) |
| `src/services/catalog-quality.ts` | تقرير الجودة | `PHONE_CATALOG` + `getVariantsForModel` + `InventoryService` |

### 2.3 واجهات المستخدم (UI consumers)

| الملف | الاستهلاك | ملاحظة |
|-------|-----------|--------|
| `CatalogAutocomplete.tsx` | `searchCatalog` + `getAllBrands` | بحث فقط |
| `CatalogCascadeSelector.tsx` | تصفح = `catalog_*_v1` localStorage + بحث = `searchCatalog` + `getVariantsForModel` | **فجوة مزدوجة** |
| `CatalogCascadeTypes.tsx` | `getStockForModel`/`getPriceSummary` (مفتاح نصي `modelId`) + قراءة `catalog_models_v1` | ربط نصي |
| `VariantSelector.tsx` | `getVariantsForModel(modelName)` — **بدون brand** | يورّث D3 |
| `AddInventoryModal.tsx` | `VariantSelector modelName` بلا `showAll`/`onModelNotFound` | القائمة المغلقة |
| `CustomerPhoneFlow.tsx` | `catalog-service` + cascade + نموذج "غير موجود" | يمرر `onModelNotFound` |
| `CatalogHealth.tsx` | `PHONE_CATALOG` + `PHONE_VARIANTS` + `getAllAliases` + `InventoryService` | لوحة الجودة (Research Console) |
| شاشات العرض (Showroom/Home/InventoryScreen…) | قراءة `record.variant/ram/storage` نص | عرض فقط |

### 2.4 `phone-database.ts` — أين يُقرأ؟

**لا يُقرأ من أي مكان**: `grep "phone-database"` في src يُرجع `src/data/phone-database.ts` وحده (ورقة تستهلك `phone-variants` و`loader` لنفسها). صفر استيراد إنتاجي — مؤكَّد. ⇒ **أرشفة آمنة لاحقاً، لكن لا حذف في CATALOG-2.**

### 2.5 `getVariantsByName` — أين يُستخدم؟

| الملف | الاستخدام | الخطأ |
|-------|-----------|-------|
| `src/catalog/loader.ts` | التعريف: `ensureVariantsByName()` — **أول علامة تفوز** | D3 هنا |
| `src/data/phone-variants.ts` | `getRealVariantsForModel` (داخل `getVariantsForModel`) | يورّث D3 لكل من |
| كل من يستدعي `getVariantsForModel` (جدول 2.3) | — | يعرض نسخ شركة خاطئة عند تشابه الاسم |

المستخدمون المباشرون لـ `getVariantsForModel`: `VariantSelector`, `CatalogCascadeSelector`, `catalog-service:getSuggestedVariants`, `catalog-quality`, `variant-verification`, اختبارات.

### 2.6 مسار `seeder.ts`

```
npm run seed:catalog (seed-catalog.ts) ──► seeder.seedCatalog({force?})
npm run verify:catalog (verify-catalog.ts) ──► seeder.verifyCatalog()
npm run audit:golden (golden-audit.ts) ──► auditTables()/... يقرأ store
src/__tests__/database.test.ts ──► seedCatalog/verifyCatalog (jsdom → localStorage)
```
- المصدر: `PHONE_CATALOG` (=JSON اليوم) + `PHONE_VARIANTS` + `getAllAliases`.
- الوجهة: `getStore()` = localStorage في المتصفح، `.catalog-store/*_v1.json` في Node.
- **نقطة حرجة**: تشغيل `verify:catalog` في CLI اليوم يتحقق من **المتجر القديم 47/3004** (لم يُعَد توليده بعد rc1) → نتيجة مضلِّلة. و`seed:catalog` لو شُغّل الآن **سيكتب 18/866** (متسق مع SSOT) لكنه يعدّل قرص العمل — **ممنوع تشغيله في مرحلة الاكتشاف**.

### 2.7 استخدامات `variant` كنص (27 ملفاً)

فئات الاستخدام:
1. **كتابة/قراءة مخزون**: `inventory-service` (يكتب `variant`)، `inventory-seed` (بذرة: `'8/256'`)، `EditInventoryModal`، `InventoryRow`، `CatalogInventoryScreen`.
2. **عرض**: `ProductDetailsScreen`, `PhoneShowroom`, `SimilarPhones`, `HomeScreen`, `useShowroomState`, `whatsapp-service/message`, `ActionCard`.
3. **ربط تجميعي**: `CatalogCascadeTypes` (`canonicalVariantKey`), `catalog-quality`, `pricing-intelligence`, `customer-memory`.
4. **تخزين سعر**: `price-memory` (`brand||model||ram||storage||condition`).

### 2.8 العلاقة الحالية بين Catalog وInventory

```
InventoryRecord { modelId: "Brand Model" (نص), brand, model, variant: "6/128" (نص), ram, storage, condition, quantity, ... }
        │  ربط عبر modelId (نص، normalizeModelName)
        ▼
Catalog: loader (brands/models) + phone-variants (getVariantsForModel)
price_memory_v1: مفتاح "brand||model||ram||storage||condition" (نص)
device-ledger: brand/model (نص)
```
- **لا يوجد FK**: الهوية كلها نصوص مشتقة. أي إعادة تسمية/توحيد تكسر الربط (المخزون ↔ الأسعار ↔ الأجهزة).
- `getStockForModel(modelId)` يقرأ `catalog_models_v1` كمرجع احتياطي (لا يملؤه أحد في المتصفح).

---

## 3. معالجة الـ 1,816 Variant الحالية

| الخطوة | القرار |
|--------|--------|
| العد | 1,816 نسخة (866 موديلاً) — من JSON مباشرة |
| الهوية | كل نسخة تُحوَّل إلى `CanonicalVariant` عبر **معادلة حتمية**: `variantIdFor(brandId, modelId, ram, storage, region)` — بلا فقدان، بلا تغيير بيانات |
| الـ Provenance | نسخ JSON بلا مصدر → تُولَّد **provenance اصطناعية**: `{ source: 'catalog-json-v2.0.0-rc1', verifiedBy: 'catalog-migration', verifiedAt: null, status: 'unverified' }` — تلبي "لا نسخة بلا مصدر" بأمانة (المصدر هو "بيانات قديمة بانتظار التحقق") |
| التأثير | كل الـ 1,816 تصبح `unverified` ⇒ **حالة trustMode** (قسم 5.3) تمنع تعطّل التطبيق |
| المستقبل | إعادة تحقق في CATALOG-3 ترفع حالة كل نسخة إلى verified/official مع مصدر حقيقي |

## 4. معالجة الـ 144 Model ذات النسخة الواحدة

- لا حذف، لا دمج. تحمل كما هي في canonical مع `unverified`.
- تُدرج في **قائمة مراجعة** (تقرير يولّده Adapter): هذه أولوية CATALOG-3 للتحقق من نقص النسخ.
- القاعدة المعمارية: `isModelSelectable` في وضع legacy يقبلها (التوافق)، ووضع strict يرفضها حتى تكتمل نسخها.

---

## 5. آلية الانتقال (Transition Design)

### 5.1 نمط Adapter (إضافي بالكامل — لا يلمس JSON)

```
src/catalog/canonical.ts (CATALOG-1، جاهز)
   ▲
src/catalog/canonical-adapter.ts ← جديد: JSON → CanonicalCatalog
   │   - brandId/modelId/variantId عبر معادلات حتمية
   │   - provenance اصطناعية unverified
   │   - region default [] (لا بيانات إقليمية في JSON اليوم)
   │   - getCanonicalCatalog(): CanonicalCatalog
   │   - validateCanonicalCatalog(getCanonicalCatalog()) → تقرير فجوات
```
- **حتمي**: نفس المدخل → نفس المعرفات دائماً ⇒ لا فقدان، ترحيل قابلاً للتكرار، وقابل للتراجع.

### 5.2 الهجرة مع إبقاء النظام يعمل (خطوة-خطوة، كل خطوة تعادل عودة واحدة)

| # | الخطوة | الهدف | طريقة الإبقاء على التشغيل | التراجع |
|---|--------|-------|----------------------------|---------|
| S1 | إضافة `canonical-adapter.ts` + اختبارات | توفير الرؤية canonical | لا تستهلكه أي شاشة بعد | حذف الملف |
| S2 | إصلاح D3: `getVariantsForModel(brand, model)` بمعامل brand اختياري | منع خلط الشركات | brand غائب → سلوك قديم (متوافق) | عودة لسطر التوقيع |

> **قاعدة S2 الثابتة (قرار معتمد 2026-08-07):** لا يجوز أبداً أن يُظهر البحث عن هاتفٍ نسخةً (variant) تابعة لعلامة تجارية أخرى. مشكلة **Vivo X50 ↔ Honor X50** هي **أول اختبار يُكتب ويُمرَّر في S2** وبوابة مرور إلزامية قبل أي تعديل — وليست اختباراً نظرياً. (يرتبط بـ AT-23)
| S3 | تمرير brand لكل المستدعين (VariantSelector/AddInventoryModal/CustomerPhoneFlow/catalog-quality/variant-verification) | القضاء على البحث بالاسم | كل مستدعٍ يعبر واحداً واحداً؛ شاشة واحدة في كل خطوة | عكس الاستدعاء فقط |
| S4 | تصفح الكاسكيد: استبدال قراءة `catalog_*_v1` بـ `getSeries/getModelsBySeries` (موجودتان) | إزالة الاعتماد على localStorage غير المُملأ | أعمدة التصفح تظهر من JSON مباشرة | عكس المكوّن |
| S5 | `seeder`/`golden-audit`/`verify-catalog`: إعادة توجيه المصدر نحو canonical + اختبار يثبت `store == canonical` | إبطال الأصول القديمة تدريجياً | CLI/test فقط، لا شاشات | عكس الاستيراد |
| S6 | `variantId` في Inventory (قراءة متوافقة) — **يؤجَّل إلى CATALOG-5** | ربط قوي | لا تغيير اليوم | — |

### 5.3 حالة الثقة أثناء الفترة الانتقالية (Trust Mode)

```
trustMode: 'legacy' (افتراضي الآن) → يعرض نسخ unverified-imported (لا تعطُّل)
           'strict' (بعد CATALOG-3 لكل موديل مُتحقَّق) → verified/official فقط
```
- وضع legacy محصور بـ **النسخ الموجودة في canonical فقط** — لا إدخال حر، لا خلط شركات، لا تركيبات جديدة.
- كل موديل يكمل تحققه في CATALOG-3 يُنقل إلى strict.

---

## 6. خطة Migration / Rollback التفصيلية

| الخطوة | الملفات المتأثرة | بوابة المرور (Gate) | التراجع |
|--------|------------------|----------------------|---------|
| S1 | +`canonical-adapter.ts` + اختبار | `pnpm test` (جديد) + `tsc` | git revert S1 |
| S2 | `phone-variants.ts` (+توقيع) | اختبار X50 عبر canonical يمرّ بلا brand | revert S2 |
| S3 | 6 ملفات مستدعٍ (واحداً واحداً) | كل شاشة تعمل؛ اختبار D3 لكل ملف | revert S3 |
| S4 | `CatalogCascadeSelector.tsx` | تصفح بلا `catalog_*_v1`؛ اختبار UI | revert S4 |
| S5 | `seeder/golden-audit/verify-catalog` + test | `store == canonical`؛ CLI يعرض 18/866 | revert S5 |
| **S6 أرشفة** | `.catalog-store`, `catalog-audit`, `docs(catalog-audit/coverage)`, `phone-database.ts` | **إثبات صفر مستهلك** لكل أصل (قسم 7) ثم أرشفة في مرحلة لاحقة معتمدة | استعادة من git |

**قاعدة صريحة**: لا تُنفَّذ S6 إلا بعد اجتياز قائمة إثبات قسم 7، وبموافقة منفصلة. لا حذف في CATALOG-2.

---

## 7. إثبات انتقال كل مستهلك (قبل أي أرشفة)

| الأصل القديم | الشرط لإثبات الانتقال | وسيلة الإثبات |
|--------------|------------------------|----------------|
| `phone-database.ts` | صفر استيراد إنتاجي | grep (موجود فعلاً: لا مستهلك) |
| `.catalog-store` / `catalog-audit` | لا أداة/اختبار يقرأها بعد S5 | grep `catalog-store`/`catalog-audit` خارج seeder المعاد توجيهه |
| `docs/catalog-audit.md` + `catalog-coverage.md` | بدائل جديدة من canonical | استبدال الوثيقتين |
| `PHONE_CATALOG` (تسطيح) | مستهلكوه (CatalogHealth/catalog-quality/seeder) عبر canonical | grep `PHONE_CATALOG` |
| `variant` كنص في المخزون | يُنفَّذ في CATALOG-5 (خارج النطاق هنا) | قائمة 27 ملفاً تبقى حتى CATALOG-5 |

---

## 8. اختبارات القبول المقترحة لـ CATALOG-2

| المعرف | الاختبار | يضمن |
|--------|----------|------|
| AT-20 | Adapter يُنتج canonical مطابقاً للـ JSON (866 موديلاً/1,816 نسخة) | no-loss |
| AT-21 | Adapter حتمي (نفس المدخل → نفس المعرفات) | قابلية التكرار |
| AT-22 | كل نسخة canonical تحمل provenance (ولو unverified) | لا نسخة بلا مصدر |
| AT-23 | `getVariantsForModel('X50','vivo')` ≠ نسخ Honor — **أول اختبار في S2 + بوابة إلزامية** | D3 مُصلَح (لا خلط شركات أبداً) |
| AT-24 | تصفح الكاسكيد بلا `catalog_*_v1` | إزالة الاعتماد |
| AT-25 | CLI verify يعرض 18/866 لا 47/3004 | إبطال القديم |
| AT-26 | `store == canonical` بعد S5 | seeder يستخدم SSOT |
| AT-27 | المجموعة الكاملة 1083+ اختباراً أخضر | لا كسر |
| AT-28 | صفر استيراد `phone-database.ts` بعد S6 (قبل الأرشفة) | جاهزية الأرشفة |

---

## 9. المخاطر

| # | الخطر | الاحتمال | التخفيف |
|---|-------|----------|---------|
| MR-1 | كسر العرض أثناء تمرير brand للمستدعين | متوسط | خطوة-خطوة + اختبار لكل ملف |
| MR-2 | 1,816 نسخة unverified تجعل الكتالوج "غير قابل" في strict | مرتفع | trustMode legacy الافتراضي حتى CATALOG-3 |
| MR-3 | تشغيل `seed:catalog` يعدّل قرص العمل | منخفض | توثيق "ممنوع في الاكتشاف" + لم نُشغّله |
| MR-4 | خلط brand في getVariantsForModel عند غياب brand | منخفض (متوافق) | معامل brand إلزامي في المستدعين الجدد |
| MR-5 | اعتماد تصفح الكاسكيد الجديد على loader بدون alias | منخفض | loader يوفر series/models مباشرة |

---

## 10. ما لا يُنفَّذ في CATALOG-2

- ❌ لا Migration فعلي (لا تشغيل `seed:catalog`, لا كتابة store, لا حذف).
- ❌ لا حذف `phone-database.ts` أو JSON أو `.catalog-store` أو `catalog-audit`.
- ❌ لا إضافة A16 4/128 أو آلاف الموديلات (مؤجلة إلى CATALOG-3).
- ❌ لا تغيير Inventory/price-memory/device-ledger (مؤجل إلى CATALOG-5).
- ❌ لا Commit.

---

## 11. القرار المطلوب

اعتماد **CATALOG-2 SSOT Migration Plan** والسماح بتنفيذ **الخطوات S1–S5 فقط** (بلا S6 الأرشفة)، ثم STOP بعد S5 للسماح بمراجعة مستقلة قبل أي أرشفة أو قبل CATALOG-3.

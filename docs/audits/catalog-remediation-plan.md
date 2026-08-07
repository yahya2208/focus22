# خطة معمارية المعالجة واكتساب بيانات الكتالوج — Catalog Remediation Architecture & Data Acquisition Plan

> التاريخ: 7 أغسطس 2026
> النطاق: **قراءة وتحليل فقط (Phase 0). لا تعديل JSON، لا إضافة موديلات، لا Migration، لا Commit.**
> مخرجات هذه المرحلة: هذا التقرير فقط — يتوقف التنفيذ هنا بانتظار موافقة صاحب القرار.
> يعتمد على: `docs/audits/phone-catalog-discovery-audit.md` (التدقيق المعتمد).

---

## 0. ملخص تنفيذي

المشكلة ليست "نقص موديلات" بل **هندسة مصدر البيانات**: وجود مصدرين متنافسين للحقيقة (JSON الجديد 18/866 مقابل `phone-database.ts → seeder → .catalog-store` 47/3004)، وهويات نسخ نصية غير مستقرة (`variant: "6/128"`)، وبحث بالاسم فقط يخلط الشركات (Vivo X50 تعرض نسخ Honor X50).

الهدف: بناء **FOCUS Catalog** كأساس موثوق قابل للتوسع، على 6 مراحل (CATALOG-1…6)، لكل مرحلة بوابة موافقة. البيانات تُملأ عبر **خط أنابيب اكتساب وتحقق** وليس إدخالاً يدوياً لآلاف الهواتف.

**مبدأ حاكم**: المصادر الخارجية (الرسمية + GSMArena + ثانوية) مصادر **اكتشاف وتحقق فقط**، ليست مصادر تشغيل؛ التطبيق لا يتصل بها في وقت التشغيل أبداً (Offline-First). `FOCUS Catalog` هو **SSOT النهائي**.

---

## 1. تحليل البنية الحالية (Current Architecture Analysis)

### 1.1 المسارات المتضاربة

```
المسار النشط (SSOT المقصود):
  src/catalog/brands/*.json (18 شركة / 866 موديل / 1,816 نسخة)
    → loader.ts (فهارس 4 + getVariantsByName)
    → catalog-service.ts (searchCatalog / resolveModel)
    → phone-variants.ts (getVariantsForModel)
    → واجهات: CascadeSelector / AddInventoryModal / Showroom

المسار القديم/الميت (مصدر منافس):
  src/data/phone-database.ts (deprecated, 47 شركة / 3,000+ موديل)
    → database/schema.ts (TABLES catalog_*_v1)
    → database/seeder.ts (يكتب .catalog-store/ بأسماء *v1)
    → database/golden-audit.ts (يكتب catalog-audit/)
    → database/verify-catalog.ts (يتحقق من المتجر القديم)

المخزون (التشغيل):
  localStorage فقط (inventory-service.ts: catalog_inventory, *_movements_v2, inventory_timeline_v3)
  Supabase: 00014_inventory_tables.sql = DRAFT غير منفَّذ
```

### 1.2 العيوب الهيكلية المؤكدة

| # | العيب | الدليل |
|---|-------|--------|
| D1 | مصدران متنافسان | `seeder.ts` يستورد `phone-database.ts` القديم ويكتب متجر 47/3004 (29/7) بينما النشط JSON 18/866 |
| D2 | هوية نسخة نصية فقط | `InventoryRecord.variant: "6/128"` نص؛ `00014` أيضاً `variant TEXT` بلا FK |
| D3 | بحث بالاسم دون الشركة | `ensureVariantsByName()` أول-علامة-تفوز → Vivo X50/X60/X70 تعرض نسخ Honor |
| D4 | أصول قديمة مرجعية | `docs/catalog-audit.md`، `catalog-coverage.md`، `.catalog-store/`، `catalog-audit/` تصف 47/3036 |
| D5 | لا هوية UUID للموديل | `modelId = "Brand Model"` نصياً، إعادة تسمية تكسر الربط مع المخزون و`price_memory_v1` |
| D6 | إدخال محصور بالكتالوج | `AddInventoryModal.tsx:101` `VariantSelector` بلا `showAll` ولا `onModelNotFound` |
| D7 | لا تحقق زمن الإدخال | `variant-verification.ts`/`catalog-quality.ts` فحص خارجي (اختبارات)، لا حاجز زمن إدخال |
| D8 | لا أثر مصدر لكل نسخة | لا `source`/`verification_status` في أي تمثيل حالي |

### 1.3 ملاحظة تصميم (Offline-First)

معمارية الكتالوج موثقة في `docs/architecture/06-catalog-os.md` كـ **offline-first**: 18 ملف JSON تُحمَّل محلياً. الخطة تحافظ على هذا: خط أنابيب الاستحواذ خارجي (Build-time)، والنتيجة ملفات JSON، والتشغيل لا يتصل بالشبكة أبداً.

---

## 2. تحديد SSOT (SSOT Decision)

### 2.1 القرار

```
FOCUS Catalog (src/catalog/brands/*.json) = SSOT النهائي لكل من:
  - الشركات (Brand)
  - الموديلات (Model)
  - النسخ (Variant: ram/storage/modelCode/region)
  - الأسماء المستعارة (Aliases)

InventoryService (localStorage) = SSOT للكميات المخزنية فقط (عقد مستقل).
```

### 2.2 إعادة توحيد المسارات — identify → migrate → verify → archive

| المصدر | المصير |
|--------|--------|
| `src/catalog/brands/*.json` | يبقى — SSOT، يُوسَّع بالنموذج الجديد (قسم 3) |
| `src/data/phone-database.ts` | migate → بياناتها (47/3004) تُقارن وتُدمج عند الحاجة عبر خط الأنابيب → **archive** (إزالة الاستيراد) |
| `seeder.ts` / `golden-audit.ts` / `verify-catalog.ts` / `schema.ts` | migrate → يعيد توجيه استهلاكه إلى JSON الجديد → `verify` | **archive** للمتجر القديم |
| `.catalog-store/` + `catalog-audit/` | archive (حذف أو نقل خارج المصدر) |
| `docs/catalog-audit.md` + `docs/catalog-coverage.md` | archive → تستبدل بتقارير جديدة من SSOT |
| localStorage | يبقى للكميات؛ `variant` يتحول من نص إلى `variantId` بعد CATALOG-4/5 |

> القاعدة: **لا حذف مباشر قبل identify → migrate → verify → archive**، لكن كل انتقال داخل بوابة مرحلة مستقلة.

---

## 3. نموذج Model/Variant المعياري (Canonical Data Model)

### 3.1 الشكل الهرمي

```
Brand { id, name, aliases[], status: 'active'|'merged'|'retired' }
 └── Model {
       id (slug مستقر، مثال "samsung-galaxy-a16"),
       brandId,
       name ("Galaxy A16"),
       series,
       releaseYear,
       modelNumbers[] ("SM-A165F"),
       status,
       variants: Variant[]
     }
       └── Variant {
             id (hash مستقر من brandId+modelId+ram+storage+region),
             modelId,
             ram ("4GB"), storage ("128GB"),
             modelCode ("SM-A165F/DS"),
             region[] ("DZ", "MA", "EU", ...),   // اختياري
             metadata {},                          // اختياري (net/color)
             source: "samsung.com | gsmarena | kimovil | ...",
             verificationStatus: 'verified'|'official'|'unverified'|'rejected',
             firstSeen, lastVerified
           }
 Aliases { id, modelId?, brandId?, value, kind }
```

### 3.2 إلغاء الهوية النصية الوحيدة

- `variant: "6/128"` تبقى **قيمة عرض** مشتقة (computed) وليست هوية.
- الهوية = `variantId` (hash مستقر). لا وجود لسجل بلا `variantId` صالح بعد CATALOG-5.
- يُحظر دمج نسخ بين شركتين: المفتاح الفريد هو `(brandId, modelId, ram, storage, region)`.

### 3.3 مبادئ التكامل

1. لا تُخترع تركيبة غير موثقة: **لا تُدرج نسخة إلا إذا وثّقها مصدر**.
2. كل نسخة تحمل `source` + `verificationStatus` → نعرف لماذا أُضيفت.
3. تمييز Model عن Variant هيكلياً: الموديل كيان، والنسخة تابعة له بمعرفات مستقلة.

---

## 4. مصادر البيانات (Data Sources)

### 4.1 التسلسل الهرمي (قرارك المعتمد)

| المستوى | المصدر | الدور | الاستخدام |
|---------|--------|-------|-----------|
| **أساسي** | المصادر الرسمية للشركات (Samsung.com, Apple.com, Xiaomi.com, Huawei… صفحات spec الرسمية) | مرجع أساسي للنسخ الموثقة | توثيق نسخ وmodelCode |
| **مرجعي** | GSMArena | المرجع الأكبر لتغطية الموديلات/النسخ العالمية | اكتشاف الموديلات ونسخها |
| **تحقق ثانوي** | Kimovil / PhoneArena / موزّعو السوق الجزائري | تحقق متقاطع عند الالتباس أو الاختلاف الإقليمي | حسم 50% من الحالات، تأكيد regional |

### 4.2 قيود الاستخدام

- **لا تُستخدم أي من هذه المصادر كمدخل تشغيل مباشر للمستخدم** — كلها Build-time/دورية.
- الالتزام بشروط الاستخدام (ToS)؛ يُفضَّل الحصول على بيانات رقمية، أو مخرجات scrapers قانونية، أو datasets مفتوحة (مثل Kaggle) للاكتشاف الأولي فقط.
- `source` يُخزَّن لكل نسخة → إعادة تحقق ممكنة لاحقاً.

### 4.3 خط اكتساب البيانات (Data Acquisition Pipeline)

```
اكتشاف (Discovery)      → إصدارات رسمية + GSMArena per-brand + ثانوي
توحيد (Normalize)       → اسم/series/modelNumbers/ram/storage (ramToSize, storageToSize)
ربط الموديلات (Matching)→ brand + modelNumber (SM-A165F) + name normalized
تحقق (Verification)     → 2 مصدر مستقل على الأقل، أو مصدر رسمي واحد
توليد ملفات JSON        → brandId/modelId/variantId + source + verificationStatus
تحقق تلقائي (Validate)  → pnpm verify:catalog (قسم 7)
تسمية (Release)         → داخل SSOT فقط بعد اجتياز البوابة
```

---

## 5. طريقة التحقق (Verification Method)

### 5.1 حالات التحقق

| الحالة | المعيار | القرار |
|--------|---------|--------|
| `verified` | مصدران مستقلان متطابقان (مثل GSMArena + Kimovil) | تُعرض للاختيار |
| `official` | صفحة spec رسمية واحدة للشركة | تُعرض |
| `unverified` | مصدر واحد غير رسمي | تُعرض بعلامة "تحت المراجعة"، تُمنع من البيع/الشراء حتى التأكيد |
| `rejected` | تعارض/تركيبة غير موثقة | لا تُدرج أصلاً أو تُحذف |

### 5.2 قواعد حسم

- الموديل بلا أي نسخة موثقة → لا يُعرض للاختيار قبل CATALOG-3، وبعدها يُعرض بـ "غير موثق".
- اختلاف إقليمي (4/128 غير متوفر في EU لكنه في DZ) → `region[]` يسمح بالنسخة مع التقييد.
- **حظر مطلق**: تركيبة RAM/Storage تخمينية، ودمج نسخ بين شركتين، وتكرار `(brand, model, ram, storage)`.

---

## 6. خطة التنفيذ المرحلية (Phased Plan) — لكل مرحلة بوابة موافقة

### Phase CATALOG-1 — Canonical Catalog Architecture
- تحديد النموذج (قسم 3) في `src/catalog/types.ts` + `database/schema.ts` (تحديث الأنواع فقط، بلا بيانات جديدة).
- إدخال `id` مستقر للموديل و`variantId` للنسخة، وأعمدة `source`/`verificationStatus`/`region`.
- **خرج المرحلة**: أنواع معيارية + نموذج توثيق (JSON schema). **بوابة**: موافقة على النموذج قبل أي ترحيل.

### Phase CATALOG-2 — SSOT Migration
- `identify → migrate → verify → archive` لكل مصدر منافس (قسم 2.2).
- إيقاف `seeder.ts` عن توليد متجر 47/3004؛ إعادة توجيهه إلى JSON؛ حذف/أرشفة `.catalog-store`, `catalog-audit`, `phone-database.ts`, الوثائق القديمة.
- **خرج المرحلة**: مصدر واحد رسمي، و`pnpm seed:catalog`/`verify:catalog` تستهلك SSOT فقط. **بوابة**: تقرير "لا أثر لمصدر قديم".

### Phase CATALOG-3 — Complete Model Discovery
- تشغيل خط الأنابيب (قسم 4.3) على كل الشركات: الموديلات القديمة والجديدة، ونسخها الموثقة، و`model_code`، و`source`، و`verificationStatus`.
- إضافة الشركات الناقصة (Itel, Alcatel, LG, Lava, TCL, HTC…) من قائمة الـ 47 القديمة بعد التحقق.
- لا إدخال يدوي لأي نسخة بدون مصدر.
- **خرج المرحلة**: كتالوج كامل موثّق لكل شركة/موديل/نسخة. **بوابة**: تقرير تغطية + أثر التحقق لكل نسخة.

### Phase CATALOG-4 — Variant Integrity
- منع نهائي: جهاز 4/128 → يُجبر على 6/128 (مثل A16).
- النظام: يعرض النسخ الموثقة فقط، يمنع النسخ غير الموثقة، لا يخلط الشركات (حل X50)، لا تخمين، يدعم نسخاً متعددة لنفس الموديل، يميّز Model عن Variant.
- `getVariantsForModel(brand, model)` → بحث بالهوية المركّبة وليس بالاسم فقط.
- **خرج المرحلة**: نموذج التحقق + إصلاح D3 + اختبارات X50. **بوابة**: تشغيل اختبارات التكامل (قسم 7).

### Phase CATALOG-5 — Inventory UX
- بعد اكتمال البيانات فقط: تعديل شاشة إدخال الهاتف.
- القاعدة: **المستخدم لا يدخل شيئاً؛ يختار من الكتالوج فقط**.
- إن لم توجد النسخة الحقيقية: تظهر حالة **"Variant غير موجود في الكتالوج"** وتدخل العملية **مسار مراجعة/إضافة Catalog** (اقتراح إضافة ببيانات المصدر) بدل تسجيل بيانات كاذبة.
- `InventoryRecord` تتحول إلى `variantId` (مع قراءة متوافقة للقديم).
- **بوابة**: قبول UX + اختبارات مسار "غير موجود".

### Phase CATALOG-6 — Integrity Audit + منع العودة
- قواعد تشغيلية آلية (قسم 7) في CI: كل Model لBrand صحيح، كل Variant لModel صحيح، لا duplicate، لا RAM/Storage وهمية، لا X50 Honor لـ Vivo، لا Model بلا Variant، لا Variant بلا Model، لا بيانات قديمة تتغلب على SSOT، Seeder يستخدم SSOT، Inventory يستخدم SSOT.
- **بوابة**: تقرير الامتثال النهائي + تفعيل الحواجز في CI.

> **قيد صارم لكل المراحل**: لا تُضاف A16 4/128 أو آلاف الموديلات يدوياً قبل اكتمال CATALOG-1..2. البنية أولاً، ثم البيانات.

---

## 7. اختبارات القبول (Acceptance Tests)

آلية: تمديد `src/services/variant-verification.ts` + `src/database/verify-catalog.ts`، وتشغيلها عبر `pnpm verify:catalog` كبوابة CI.

| المعرف | الاختبار | يمنع |
|--------|----------|------|
| AT-1 | كل Model له Brand صحيح (FK موجود) | orphans |
| AT-2 | كل Variant له Model صحيح | orphans |
| AT-3 | لا duplicate `(brand, model, ram, storage)` | نسخ مكررة |
| AT-4 | RAM/Storage من مجموعات مسموحة (أو كسرية موثقة) | تركيبات وهمية |
| AT-5 | لا تظهر نسخ Honor لـ Vivo X50/X60/X70 (بحث بالهوية المركّبة) | D3 |
| AT-6 | لا Model بلا Variant | موديلات فارغة |
| AT-7 | لا Variant بلا Model | نسخ يتيمة |
| AT-8 | `seeder` يُخرج == SSOT (لا متجر 47/3004) | D1 |
| AT-9 | `inventory` يقرأ `variantId` صالحاً من SSOT | D2/D6 |
| AT-10 | كل نسخة تحمل `source` + `verificationStatus` غير فارغين | D8 |
| AT-11 | نقطة مرجعية حقيقية (قائمة موثقة: A16 4/128/6/128/8/256…) — تُفعَّل بعد CATALOG-3 | رجوع أخطاء النسخ |
| AT-12 | لا يتغير SSOT إلا عبر خط الأنابيب (diff نظيف) | إدخال يدوي عشوائي |

---

## 8. تقدير المخاطر (Risk Register)

| # | الخطر | الاحتمال | الأثر | التخفيف |
|---|-------|----------|-------|---------|
| RK-1 | عدم دقة بيانات المصادر الخارجية | متوسط | نسخ خاطئة | قاعدة 2 مصدر + `verificationStatus` |
| RK-2 | ترخيص/ToS لمصادر خارجية | منخفض | تعطيل الاكتشاف | مصادر رسمية + datasets قانونية |
| RK-3 | كسر المخزون القائم أثناء هجرة `variant`→`variantId` | متوسط | فقدان/ربط خاطئ | قراءة متوافقة (back-compat) + أرشفة قبل الترحيل |
| RK-4 | تضخم يدوي قبل البنية | مرتفع (ممنوع) | إعادة الأزمة | بوابات مراحل + AT-12 |
| RK-5 | الحجم: آلاف النسخ بلا تنظيم | متوسط | بطء/تعقيد | خط أنابيب + توليد ملفات مهيكلة |
| RK-6 | اختلاف إقليمي غير موثق | متوسط | نسخ ناقصة في الجزائر | `region[]` + تحقق من الموزّعين المحليين |
| RK-7 | تغيّر الـ SSOT مستقبلاً | منخفض | فوضى ثانية | هذا التقرير يثبّت القرار (قسم 2) |

---

## 9. التوصيات النهائية

1. اعتماد `FOCUS Catalog` كـ SSOT وحيد و`InventoryService` كمصدر كميات مستقل (قسم 2).
2. اعتماد النموذج المعياري (قسم 3) قبل أي إضافة بيانات.
3. المصادر: **رسمية + GSMArena + ثانوية للتحقق فقط** — لا مصادر تشغيل (قرارك المعتمد).
4. عدم إضافة A16 4/128 أو أي موديل/نسخة يدوياً قبل اكتمال CATALOG-1 وCATALOG-2.
5. البدء بـ CATALOG-1 (نموذج الأنواع) كمرحلة تنفيذ تالية — **تنتظر موافقتك المنفصلة**.

---

> **STOP — هذه مرحلة قراءة وتحليل فقط. لا تعديل JSON، لا إضافة موديلات، لا Migration، لا Commit.**
> الخطوة التالية تتطلب قرارك: الموافقة على الشروع في **CATALOG-1** أو تعديل أي قسم.

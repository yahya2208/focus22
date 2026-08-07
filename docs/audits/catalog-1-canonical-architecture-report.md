# CATALOG-1 — Canonical Catalog Architecture — تقرير التنفيذ

> التاريخ: 7 أغسطس 2026
> المرحلة: CATALOG-1 من `docs/audits/catalog-remediation-plan.md`
> الحالة: **مكتمل — بانتظار موافقة صاحب القرار قبل CATALOG-2**
> الالتزامات المطبّقة: ✅ لا تعديل JSON · ✅ لا إضافة A16 4/128 · ✅ لا آلاف موديلات · ✅ لا Migration · ✅ لا تغيير Inventory · ✅ لا Commit

---

## 1. الهدف

إثبات التصميم المعماري الذي يجعل الحالات الأربع التالية **مستحيلة هيكلياً**:

| # | الحالة المستحيلة |
|---|------------------|
| IM-1 | Samsung A16 4/128 → النظام يعرض 6/128 |
| IM-2 | Vivo X50 → النظام يعرض نسخ Honor X50 |
| IM-3 | موديل موجود بلا نسخ صحيحة |
| IM-4 | نسخة موجودة بلا معرفة مصدرها |

مع تضمين **4 ضوابط إلزامية** صادرة عن صاحب القرار (Provenance، الهوية الإقليمية، قاعدة تعارض المصادر، حقوق الاستخدام).

---

## 2. البنية المعيارية المعتمدة

```
FOCUS Catalog
│
├── Brand        { brandId, name, aliases[] }
│   └── Model    { modelId, brandId, name, series?, releaseYear?, modelNumbers[] }
│       └── Variant
│           ├── variantId (hash مستقر: brandId|modelId|ram|storage|region)
│           ├── ram / storage
│           ├── modelCode (إلزامي عند توافره)
│           ├── region[] (جزء من الهوية)
│           ├── provenance[] (source, url?, verifiedAt, verifiedBy, status)
│           ├── verificationStatus (verified|official|unverified|rejected)
│           └── conflict (none|review|resolved)
│
└── Inventory
    └── references Variant (variantId)   ← تُنفَّذ في CATALOG-5، لم تُلمَس الآن
```

**قرار**: `variant: "6/128"` تبقى قيمة عرض مشتقة، والهوية = `variantId`. لا وجود لسجل بلا `variantId`.

---

## 3. التنفيذ (Implementation)

| الملف | المحتوى |
|-------|---------|
| `src/catalog/canonical.ts` | الوحدة المعيارية (Standalone — لا تستورد الـ JSON القديم، لا تغيّر أي كود قائم) |
| `src/__tests__/catalog-canonical.test.ts` | 20 اختباراً يثبتون الاستحالات + الضوابط |

### واجهة الوحدة الرئيسية
- **الهوية**: `brandIdFor`, `modelIdFor`, `variantIdFor(brandId, modelId, ram, storage, region)` — hash FNV-1a مستقر، `regionKeyOf` مرتّبة. **المنطقة جزء من الهوية.**
- **الإنشاء المحمي**: `createVariant(input)` يرفض أي نسخة بلا `provenance` أو بتركيبة RAM/Storage خارج المجموعات المسموحة (`ALLOWED_RAM`/`ALLOWED_STORAGE`).
- **البحث بالهوية المركّبة**: `getVariantsForModelByIdentity(brandId, modelId)` — يُقيَّد بعلامة+موديل دقيقين، فلا يمكن خلط الشركات.
- **قاعدة التعارض**: `classifyConflicts(catalog)` + `getConflictByModel`.
- **الحل بدون إكراه**: `resolveVariantSelection(brandId, modelId, ram, storage, region)` → اتحاد مُصَنَّف:
  - `matched` (نسخة verified/official) — تعيد نفس (ram/storage) المطلوبة حصراً.
  - `variant-not-found` — **لا تعيد أبداً نسخة بديلة.**
  - `conflict-review` — لا خيار تلقائي، تُحال للمراجعة.
- **الاختيارية**: `isModelSelectable(brandId, modelId)` — false إذا لا توجد نسخة verified/official أو يوجد تعارض.
- **التكامل**: `validateCanonicalCatalog(catalog)` → قائمة مخالفات بـ 9 أكواد.
- **حقوق البيانات**: ثابت `CATALOG_STORAGE_POLICY` (قسم 4.4).

---

## 4. الضوابط الأربعة الإلزامية — تجسيدها

### 4.1 Provenance لكل نسخة (المطلب 1)
كل `CanonicalVariant` يحمل `provenance[]` (مصفوفة وليست حقلاً واحداً — أي مصدر/تحقق/مُتحقِّق قد يتعدد):
```
source        ← مصدر المعلومة (samsung.com / gsmarena.com / distributor-dz …)
url?          ← رابط/مرجع المصدر
verifiedAt    ← تاريخ التحقق
verifiedBy    ← من قام بالتحقق
status        ← حالة التحقق (verified/official/unverified/rejected)
```
- `createVariant` **يرفض** إنشاء نسخة بدون provenance.
- `validateCanonicalCatalog` يرمي `variant-without-provenance` و`invalid-provenance` عند النقص.
- أثبت الاختباران: الإنشاء بدون provenance يرمي خطأ، والكتالوج المخترق يُعلَّم.

### 4.2 الهوية الإقليمية (المطلب 2)
- `modelCode` حقل اختياري لكن **إلزامي التواجد عندما يكون معروفاً** (تفرضه CATALOG-3 عند الاستحواذ).
- `region[]` **جزء فعلي من هوية النسخة**: `variantId` يتغير بتغير المنطقة، ونفس (RAM, Storage) في منطقتين = نسختان مختلفتان لا تُدمجان.
- الاختبار: `4GB/128GB` في `DZ` مقابل `MA` → `variantId` مختلفان، والبحث بالمنطقة يعيد النسخة الصحيحة فقط.

### 4.3 قاعدة تعارض المصادر (المطلب 3)
**السيناريو المرجعي**: الشركة الرسمية تقول 4/128 · GSMArena تعرض 6/128 فقط · موزع محلي يعرض 4/128.

قاعدة `classifyConflicts` (لكل موديل، لكل مجموعة مناطق):
- نجمّع المواصفات حسب المنطقة مع **مجموعات المصادر** لكل مواصفة.
- **تعارض review** يظهر عندما توجد ≥2 مواصفة مختلفة في نفس المنطقة **بلا مصدر واحد مشترك يغطيها كلها** (أي المصادر لا تتفق على قائمة النسخ).
- **لا اختيار تلقائي إطلاقاً**: أي مواصفة ضمن مجموعة متعارضة ترد بـ `conflict-review`، وكل المرشحين (بـ provenance كامل) يُعرضون للمراجعة البشرية.
- القائمة المتماسكة (عدة نسخ لموديل واحد كلها موثقة من نفس المصدر الرسمي، مثل S25 12/128 + 12/256) **ليست** تعارضاً.

الاختبارات: السيناريو المرجعي → `conflict-review` لكلٍ من 4/128 و6/128؛ نموذج متعدد النسخ موثق رسمياً → `matched` بلا تعارض.

### 4.4 حقوق واستخدام بيانات المصادر (المطلب 4)
مجسَّد كسياسة تصميم في `CATALOG_STORAGE_POLICY`:
```ts
{ storableFacts: [...], provenanceOnly: true, referenceOnlySources: true }
```
- **ما يُخزَّن داخل FOCUS**: حقائق مهيكلة فقط (brand/model/variant/ram/storage/modelCode/region) + **إشارات provenance** (اسم المصدر، الرابط، تاريخ ومُتحقِّق التحقق).
- **ما يُستخدم كمرجع فقط**: محتوى صفحات المصادر — **لا يُنسَخ** إلى قاعدة FOCUS.
- "حفظ provenance بدلاً من نسخ الصفحات" = قاعدة التصميم؛ الصفحة لا تدخل قاعدة البيانات، ويُحفظ مسار العودة إليها فقط.
- المصادر الخارجية (رسمية + GSMArena + ثانوية) تبقى **اكتشاف/تحقق فقط، ليست تشغيلاً**.

---

## 5. إثبات استحالة الحالات الأربع (Evidence)

| الحالة | آلية المنع الهيكلية | الاختبار |
|--------|---------------------|----------|
| IM-1 إكراه نسخة خاطئة | `resolveVariantSelection` يعيد `variant-not-found` عند طلب 4/128 غير الموجودة؛ الـ `matched` يعيد نفس (ram, storage) المطلوبة حصراً | "requesting 4/128 returns variant-not-found, never a different variant" + "documented 4/128 becomes selectable only after provenance" |
| IM-2 خلط الشركات | البحث مقيد بـ `(brandId, modelId)`؛ `variantId` يحمل brandId؛ `getVariantByIdentity(vivo, 12/512)` → undefined | مجموعة اختبارات Vivo/Honor X50 |
| IM-3 موديل بلا نسخ صحيحة | `isModelSelectable` false عند صفر نسخ أو نسخ unverified/rejected فقط؛ `validateCanonicalCatalog` يرمي `model-without-variants`/`model-without-valid-variants` | اختباران: موديل فارغ + موديل بلا نسخ موثقة |
| IM-4 نسخة بلا مصدر | `createVariant` يرفض بلا provenance؛ المدقق يرمي `variant-without-provenance`/`invalid-provenance` | اختباران: إنشاء + فحص كتالوج |

---

## 6. نتائج الاختبارات

| المجموعة | النتيجة |
|----------|---------|
| `src/__tests__/catalog-canonical.test.ts` | **20/20 ✅** |
| المجموعة الكاملة للمشروع | **111 ملفاً / 1083 اختباراً ✅** |
| `tsc --noEmit` | **0 أخطاء ✅** |

---

## 7. ما لم يُغيَّر (التزامات صريحة)

- ❌ لا تعديل لأي `src/catalog/brands/*.json`.
- ❌ لا إضافة Galaxy A16 4/128 (ستدخل فقط عبر Discovery/Verification في CATALOG-3).
- ❌ لا تغيير في `inventory-service.ts` / `InventoryRecord` (بقي `variantId` تصميمياً في المخطط فقط).
- ❌ لا Migration، لا Supabase، لا واجهات.
- ❌ لا Commit (كل التغييرات في مجلد العمل).

---

## 8. تقدير المخاطر بعد CATALOG-1

| # | الخطر | الحالة |
|---|-------|--------|
| RK-1 | إكراه نسخة خاطئة | **مغلقة هيكلياً** (resolveVariantSelection) |
| RK-2 | خلط نسخ الشركات | **مغلقة هيكلياً** (بحث مركّب بـ brandId) |
| RK-3 | موديل بلا نسخ صحيحة | **مغلقة** (isModelSelectable + المدقق) |
| RK-4 | نسخة بلا مصدر | **مغلقة** (createVariant + المدقق) |
| RK-5 | نزاع مصادر بلا معالجة | **مغلقة** (conflict-review، لا خيار تلقائي) |
| RK-6 | بيانات قديمة تتفوق على SSOT | مفتوحة — تُعالج في **CATALOG-2** |
| RK-7 | نقص بيانات/تعارض إقليمي | مفتوحة — تُعالج في **CATALOG-3** |

---

## 9. اختبارات القبول للمرحلة

| المعرف | المعيار | الحالة |
|--------|---------|--------|
| AC-1 | كل Variant يحمل provenance كامل | ✅ AT عبر createVariant/validate |
| AC-2 | region جزء من الهوية، لا دمج إقليمي | ✅ variantIdFor + اختبار DZ/MA |
| AC-3 | تعارض المصادر → conflict-review بلا اختيار تلقائي | ✅ سيناريو رسمي+GSMArena+موزع |
| AC-4 | لا إكراه على نسخة بديلة | ✅ A16 4/128 → variant-not-found |
| AC-5 | لا خلط نسخ بين الشركات | ✅ Vivo/Honor X50 |
| AC-6 | لا موديل بلا نسخ صحيحة | ✅ isModelSelectable |
| AC-7 | لا نسخة بلا مصدر | ✅ createVariant throw |
| AC-8 | حفظ الحقائق + provenance فقط (لا نسخ محتوى) | ✅ CATALOG_STORAGE_POLICY |
| AC-9 | سلامة المجموعة الكاملة | ✅ 1083/1083 |

---

## 10. الخطوة التالية — **STOP**

CATALOG-1 مكتمل. لا يُبدأ CATALOG-2 (SSOT Migration) **حتى موافقتك الصريحة**.

القرار المطلوب: **اعتماد CATALOG-1 (نعم/لا + ملاحظات)** ثم السماح بالانتقال إلى CATALOG-2، أو طلب تعديل في التصميم.

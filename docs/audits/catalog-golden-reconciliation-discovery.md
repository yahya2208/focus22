# Golden Catalog Reconciliation — READ-ONLY DISCOVERY Report

| البند | القيمة |
|---|---|
| Phase | **CATALOG-GC-R1 — Golden Catalog Reconciliation (Discovery Only)** |
| الحالة | ✅ **COMPLETE — READ-ONLY. No DB change.** |
| التاريخ | 2026-08-13 |
| القرار | لا APPLY، لا seed، لا أي mutation حتى مراجعة هذا التقرير وموافقة المالك |

---

## 1) Discovery status

اكتمل الاكتشاف. تم تحديد المصدرين، وإثبات الهوية بالخوارزمية المعيارية نفسها المعتمدة في Gate 05، وتصنيف كل طراز من طرازات Golden البالغة 3,004 تصنيفًا واحدًا حتميًا، مع إغلاق حسابي كامل (المجموع = 3,004).

## 2) Golden source (المصدر الذهبي)

| البند | القيمة |
|---|---|
| الملف | `.catalog-store/catalog_models_v1.json` (gitignored، خرج `seeder.ts` بتاريخ 2026-07-29 من `phone-catalog.ts` القديم) |
| الحجم | **3,004 طرازًا** · 47 علامة · 49 نسخة عامة · 9,915 alias |
| الحقول | `id, brandId, brandName, seriesId, seriesName, name, normalized, aliases, variantCount, createdAt, updatedAt` |
| ملاحظة | `catalog-audit/catalog-audit-full.json` (47/3,036) هو أرشيف فحص قديم آخر — **لم يُستخدم** كمرجع؛ المرجع المعتمد هو الـ store نفسه (3,004) |

## 3) Runtime source (مصدر التشغيل)

| البند | القيمة |
|---|---|
| الملف/الجدول | `src/catalog/brands/*.json` (18 ملفًا) → `public.catalog_models` في Supabase (تمت البذرته عبر GATE 2) |
| الحجم | **866 طرازًا** · 18 علامة · 1,816 نسخة |
| الدليل | Gate 05 أثبت 866/866 (الهوية SQL == TS)، و`02-catalog-seed-runtime.sql` يعلن "model ids = modelIdFor + MODEL_ID_OVERRIDES" — أي أن هوية الـ JSON مطابقة تمامًا لهوية قاعدة البيانات |

## 4) Identity method (طريقة الهوية — لا خوارزمية ثانية)

أُعيد استخدام التطبيق المعتمد حرفيًا (المستورد مباشرةً من `src/catalog/canonical.ts` + `src/catalog/canonical-adapter.ts`):

```
brandIdFor(name) = slugify(name)
modelIdFor(brandId, model) = `${brandId}-${slugify(model)}`
resolveModelId(brandId, model) = MODEL_ID_OVERRIDES ?? modelIdFor
slugify = toLowerCase → NFKD → [^a-z0-9]+ → '-' → trim dashes → || 'unknown'
```

MODEL_ID_OVERRIDES = حِزم `Redmi Note 13/14/15/16 Pro+`. المطابقة تمت **بـ canonical_id فقط** (Golden → Runtime).

## 5) Exact reconciliation table

| Golden (3,004) | العدد |
|---|---:|
| **MATCHED** (canonical_id موجود حرفيًا في Runtime) | **615** |
| **الفجوة** (Golden غير موجود في Runtime) | **2,389** |
| — SAFE_TO_SEED (علامة في النطاق، هوية سليمة، cid فريد، غير موجود) | 1,285 |
| — OUT_OF_SCOPE (علامة خارج الـ 18 النشطة) | 1,029 |
| — DUPLICATE (نفس canonical_id تكرر داخل Golden) | 55 |
| — NEEDS_REVIEW (التباس عبر العلامات / صيغة اسمية بديلة) | 17 |
| — INVALID_OR_INCOMPLETE (Placeholders) | 3 |
| — COLLISION (cid مُملوك لموديل Runtime مختلف) | 0 |
| — IDENTITY_MISMATCH (نفس الاسم نصيًا وهوية مختلفة) | 0 |
| **الإغلاق الحسابي** | 615+1,285+1,029+55+17+3 = **3,004** ✅ |

**Runtime (866):**
- في Golden (مطابق): **615**
- **Runtime-only** (لا مقابل Golden): **251** — في معظمها إضافات حديثة (iPhone 17/18، Pixel 10/11، ROG 9/10/11، Zenfone 12/13…) تثبت أن Golden v2026.07 أقدم من Runtime الحالي
- موديلات Runtime بنفس brand+name في Golden لكن cid مختلف: **0**

## 6) Classification breakdown (تفصيل)

- **SAFE_TO_SEED (1,285)** — مرشحون نظيفو الهوية من 17 علامة نشطة (كل الـ 18 النشطة ما عدا **Nothing** المطابقة 100%)، أبرزها: Samsung 203، Xiaomi 169، Vivo 156، Oppo 144، Realme 118، Huawei 105، Motorola 62، Tecno 61، Nokia 58، Infinix 55، OnePlus 39، Asus 34. **هذا لا يعني "يجب بذرها"** — إنه تصنيف هوية فقط؛ قرار البذر تجاري ويخضع لموافقة المالك.
- **OUT_OF_SCOPE (1,029)** — من 29 علامة غير نشطة: LG 86، Lenovo 65، Ulefone 64، Oukitel 56، Blackview 48، HTC 47، Panasonic 47، Itel 46، Doogee 43… (لا يمكن بذرها دون قرار توسيع النطاق).
- **DUPLICATE (55)** — 35 منها داخل العلامات النشطة، معظمها تصادم "+" المفقود في الـ slug (مثل `Mate 40 Pro` مقابل `Mate 40 Pro+` ← كلاهما `huawei-mate-40-pro`) — وهي بالضبط فئة مشكلة MODEL_ID_OVERRIDES؛ تحتاج دمجًا/override، لا بذرًا.
- **NEEDS_REVIEW (17)** — التباس أسماء عبر العلامات: `Nokia C21/C30/C31` مقابل `Realme C21/…`، `Nokia X10/X20/X30` مقابل `Honor`، `Vivo X6/X7/X9/X20/X30` مقابل `Honor`، `Realme X7/X50 Pro` مقابل `Honor/Vivo`، `Huawei "Honor 20"` مقابل علامة Honor، وأخطاء فصل اسمية `Galaxy Z Flip7/Fold7` (بدون مسافة) مقابل `Galaxy Z Flip 7/Fold 7` في Runtime (cid مختلف: `galaxy-z-flip7` ≠ `galaxy-z-flip-7`) — تحتاج قرارًا/override قبل أي بذر.
- **INVALID_OR_INCOMPLETE (3)** — سجلات `Generic/Unknown` (Android Tablet، Keypad Phone، Unknown Device) — غير صالحة إطلاقًا.
- **COLLISION = 0** — لا يوجد Golden mapts إلى cid يملكه Runtime بموديل مختلف الاسم.
- **IDENTITY_MISMATCH = 0** — لا تعارض هوية نصي-إلى-cid داخل نفس العلامة.

## 7) Coverage calculation (إثبات)

```
Golden          3,004  (مصدر: .catalog-store/catalog_models_v1.json)
Runtime           866  (مصدر: src/catalog/brands/*.json == DB catalog_models)
Matched           615
Missing(فجوة)   2,389  = SAFE_TO_SEED 1,285 + OUT_OF_SCOPE 1,029 + DUPLICATE 55 + NEEDS_REVIEW 17 + INVALID 3
Runtime-only      251  (615 + 251 = 866 ✓)
```

⚠️ **3004−866=2,138 غير صحيح كفجوة**: الفجوة الفعلية بالهوية المعيارية = **2,389** (لأن 251 من طرازات Runtime ليست في Golden أصلًا، فالتقاطع 615 فقط). وهذا يؤكد مبدأ المرحلة: لا "أضف 2,138".

## 8) Runtime-only anomalies

- 251 طرازًا بلا مقابل Golden (الحديثة 2025–2026) — دليل قدم Golden، وليست شذوذًا.
- 0 تعارض هوية (brand+name موجود في Golden لكن cid مختلف).
- عيّنة أبرزها: Xiaomi 70، Samsung 32، Nokia 30، Honor 17، Apple 13.

## 9) Files created / modified

| الملف | النوع |
|---|---|
| `scripts/catalog-golden-reconcile.ts` | جديد — محرك المطابقة (قراءة محلية فقط، يعيد استخدام الهوية المعيارية) |
| `supabase/catalog-central/10-catalog-reconcile-baselines-readonly.sql` | جديد — SELECT-only: خطوط الأساس + تصدير Runtime (الجزء B) |
| `docs/audits/catalog-golden-reconciliation-discovery.md` | هذا التقرير |
| `catalog-audit/golden-reconcile-evidence.json` | أدلة كاملة (3,004 صفًا + التصنيف) — gitignored |
| `catalog-audit/golden-reconcile-gap.csv` | صفوف الفجوة (2,389) — gitignored |
| `docs/audits/catalog-gate-05-create-model-rpc-report.md` | أُنشئ سابقًا (Gate 05) |

**لم تُعدَّل أي ملفات موجودة.**

## 10) DB changes

**NONE — READ-ONLY.** لم يُنفَّذ أي SQL على قاعدة البيانات في هذه المرحلة. `10-catalog-reconcile-baselines-readonly.sql` جاهز للتشغيل (SELECT-only) لتأكيد الخطوط الأساسية قبل قبول التقرير.

## 11) Git status

- Modified: `00-catalog-preflight.sql`، `02-catalog-seed-runtime.sql`، `04-catalog-gate1-verify.sql` (من مرحلة Gate 05 السابقة، لم تُعمَّد)
- Untracked: ملفات `05`–`10` في `catalog-central/`، `docs/audits/catalog-gate-05-create-model-rpc-report.md`، `scripts/catalog-golden-reconcile.ts`
- لا commits أُجريت (لا عمم تلقائيًا).

## 12) Recommended next gate

**GATE GC-R2 — Owner review of the 1,285 SAFE_TO_SEED candidates** (قائمة كاملة في evidence)، مع قرارات معلقة:
- نطاق العلامات: هل تُبذَر 17 علامة النشطة فقط، وتُعلن الـ 29 خارج النطاق رسميًا؟
- معالجة الـ 55 DUPLICATE (override/دمج) والـ 17 NEEDS_REVIEW (override/رفض) قبل أي بذر.
- تجاهل الـ 3 INVALID نهائيًا.
- تحديث Golden (استيعاب الـ 251 الحديثة) أو إعلان Runtime هو المرجع الوحيد.

**STOP — مرحلة الاكتشاف انتهت. لا seeding، لا apply، لا mutation إلى قاعدة البيانات إلا بقرار صريح من المالك بعد مراجعة هذا التقرير.**

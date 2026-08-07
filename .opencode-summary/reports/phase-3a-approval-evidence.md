# Phase 3A — تقرير الأدلة للاعتماد الشرطي (Conditional Approval)

**المرحلة:** 3A — سلامة التنقل، صفر خروج داخلي، قاعدة مسار موحدة (v5.1)
**الكوميت:** `da7ce5f` feat(nav): Phase 3A (الفرق الوحيد عن `a376ae9` = Phase 2)
**التاريخ:** 2026-08-07
**الحالة:** أدلة الأصناف الثمانية جاهزة + قسم «السبب الجذري ومنع التكرار» — بانتظار اعتمادك

---

## 1. الدليل 1 — عدم إعادة التحميل (بديل Network Log / Performance Timeline)

أُجريت القياسات على نسختي الإنتاج عبر `vite preview` محلياً (نفس البلد Base `/focus22/`):
- Phase 2 (a376ae9) → `http://localhost:4173/focus22`
- الحالي (da7ce5f) → `http://localhost:4180/focus22`

| القياس | Phase 2 | الحالي |
|---|---|---|
| `navigationEntries` أثناء التحميل الأول | **1** | **1** |
| `navigationEntries` أثناء deep-link boot | **1** | **1** |
| `navigationEntries` home→showroom→back | **1** | **1** |
| Document requests إضافية أثناء التنقل الداخلي | **0** | **0** |
| frameNavigations إضافية أثناء التنقل الداخلي | **0** | **0** |
| Lazy chunks أثناء التنقل (التحميل الكسول فقط) | — | 3 (chunk-*.js) |

> `navigationEntries` بقي **1 في كل السيناريوهات** (4 تشغيلات لكل نسخة، كلها 1) — أي **صفر إعادة تحميل**. التنقل الداخلي يجلب أجزاء lazy-chunk فقط، بلا أي طلب Document أو إطار جديد.

تتبع Hash أثناء الإقلاع (تطوير، CDP): `"" → #/home → #/landing?source=qr&campaign=test-campaign` — بلا أي frame navigation أو Document request أو Script request إضافي أثناء الإقلاع، وشاشة Landing ظهرت بـ «Start Assessment».

## 2. الدليل 2 — جرد location / history

`window.location(=/href/assign/replace)` + `history.pushState/replaceState` في كود الإنتاج:

| البند | Phase 2 (a376ae9) | الحالي (HEAD) |
|---|---|---|
| إجمالي الاستدعاءات في كود الإنتاج | 7 | 7 |

**المتبقي (الستة في التنقل — 4) وتبريرها:**
- `BackProvider.tsx` ×2 (`history.pushState`) + `store/navigation.tsx` ×2 (`replaceState/pushState`) = **مرآة URL الخاصة بالتطبيق نفسه** (hash-targeted، لا تخرج من التطبيق أبداً). هذا هو تصميم Phase 2 المحافظ عليه.
- `src/core/qr/share.ts` ×1 = تحويل البريد (`mailto:`) — خروج حقيقي مقصود.
- `src/services/whatsapp-service.ts` ×1 = `window.location.href` **فقط كبديل** عندما يُحجب `window.open` (خروج حقيقي).

**المُزال في 3A:** `window.location.href` في `StickerScanHandler.tsx` → استُبدل بـ SPA `REPLACE`.

**باقي `location.*`:** **0** من `location.assign(/location.replace(`؛ قراءات `location.*` المتبقية هي تحليل hash/search للـ deep-links فقط + حارس مرآة hash.

## 3. الدليل 3 — مخرجات فحص الوصول الفعلية (scripts-3a/reachability-report.ts)

```
Routes: 37
Reachable: 37
Orphans: 0
Dead Ends: 0
isEdgeComplete: true
Total inbound edges: 82
Distinct edge sources: 37
```
شاشات Deep-link only (متاحة من الرابط لكن لا تُدخل من الرسم البياني الداخلي — مقصود بالتصميم): `game-intro`، `landing`، `sticker-scan`.

## 4. الدليل 4 — تتبع Console الكامل للـ deep-link

- **إقلاع QR:** الـ hash تسلسل `"" → #/home → #/landing?source=qr&campaign=test-campaign`، ثم رُسمت Landing. (الحالي) — بينما Phase 2 كان يصل إلى `#/game-intro` (تغيير متوقع في v5.1).
- **إقلاع repair-tracking:** `#/repair-tracking?code=R-42` → الحقل مُعبّأ مسبقاً `R-42`، hash محفوظ، `navigationEntries=1`، `input=R-42`.
- **ملاحظة صادقة:** كتابة `location.hash` المباشرة من جهة خارجية **تُعاد تصفيتها بواسطة مرآة التطبيق** (التطبيق يملك الـ URL) — لذلك ليست طريقة اختبار صحيحة للتنقل الداخلي؛ التنقل المختبر هو بالكليكات الفعلية وبـ `history.back()` كما فعلناه.

## 5. الدليل 5 — أمان ErrorBoundary

**الاختبار كشف خللين حقيقيين كامنين (وهذا مقصود من سياسة الأدلة):**

1. **حلقة إعادة المحاولة بالـ hash القديم:** `setState({hasError:false})` + `RESET` للمزوّد غير ذرّيين في React 19؛ الطفل يعيد الرمي قبل رسم `home`. والأخطر: بعد إعادة التركيب، `InitialRoute` يعيد قراءة الـ hash القديم (مثلاً `#/game-intro?…`) فيتنقل مجدداً إلى شاشة الرمي (حلقة عبر عمليات إعادة التركيب).
   **الإصلاح:** معالج `componentDidMount` في `ErrorBoundary.tsx` يطبّع الـ URL إلى `#/home` عبر `history.replaceState({screen:'home'},'', '#/home')` **قبل** مسح `hasError` — فتقلب إعادة التركيب إلى home نظيف.
2. **مفاتيح i18n خام في شاشة الخطأ:** `ErrorBoundary` فوق `TranslationProvider` في `App.tsx`، فكان `useTranslation` يقع على السياق الافتراضي → `error.reload`/`error.unexpected` خاماً في الإنتاج.
   **الإصلاح:** `ErrorFallback` أصبح ذاتي المحتوى: `getSettings().language` + `t()` مباشرة من `src/i18n`.

**اختبارات الحماية (4):** تعافٍ بشاشة home جديدة + **ضبط واحد بالضبط** للـ reset + URL=`#/home`؛ دورة خطأ ثانية = ضبط واحد بالضبط لكل دورة (لا double-fire)؛ بقاء `focus_settings` في localStorage؛ إطلاق `location.reload` الأخير مرة واحدة بالضبط.

## 6. الدليل 6 — عدم ازدواج إشارات الخروج (Analytics)

**اختبارات (4):** `openWhatsApp` يصدر **بالضبط** `[exit_attempt, exit_confirmed]`؛ الحدث التجاري يضيف **حدثاً واحداً بالضبط** (الإجمالي 3)؛ خروجان = 4 أحداث (لا دمج)؛ التنقل الداخلي داخل SPA يصدر **صفر** أحداث خروج. (ملف `exit-telemetry.test.tsx`).

## 7. الدليل 7 — المحاسبة الكاملة لاختبارات 3A

| نوع | العدد | التفصيل |
|---|---|---|
| اختبارات مضافة | **+28** | route-params 7، reachability 6، error-reset 4، phase3-exits 3، base-path 6، RepairQR 2 |
| ملفات معدّلة | 1 | `App.test.tsx` (8+/4−) لتوافق v5.1 §1.3 |
| اختبارات محذوفة | 1 | اختبار قديم في `App.test.tsx` استُبدل بمسار الـ QR الجديد |
| skips | **0** | (28 إصابة grep كانت سطوراً توثيقية/تعليقات فقط) |

**السويت الكامل: 1002/1002 في 100 ملف** (كان 994). Group التنقل/التطبيق/الأنوية: 106/106 في 16 ملف. `pnpm typecheck` OK، `pnpm lint` 0 أخطاء (15 تحذير تصميم موجودة مسبقاً في ErrorFallback).

## 8. الدليل 8 — الأداء قبل/بعد

**الحزمة (القياس الحاسم — بناء إنتاجي فعلي):**

| البند | Phase 2 (a376ae9) | الحالي (da7ce5f) | الفرق |
|---|---|---|---|
| الإدخال `index-*.js` | 394,757 B (385.5 kB) | 401,132 B (391.7 kB) | **+6,375 B (+1.61%)** |
| إجمالي JS (كل الأجزاء) | 1,684,788 B (1645.3 kB) | 1,706,379 B (1666.4 kB) | **+21,591 B (+1.28%)** |
| عدد الأجزاء | 61 | 62 | +1 (`AdBanner`) |
| `index.html` (transfer) | 3,858 B | 4,466 B | +608 B (قائمة modulepreload نمت) |

الزيادة مصادرها: محلّل route-params، بيانات reachability الوصفية، إصلاح ErrorBoundary، base-path — **بلا أي تبعية جديدة**، والشارات `react-vendor`/`supabase-vendor` **مطابقة حرفياً** بين النسختين.

**الوقت (خادم محلي، وسطية 3 تشغيلات — قيم متقلبة بنطاق متداخل):**

| القياس | Phase 2 | الحالي | ملاحظة |
|---|---|---|---|
| First-load dcl | 228 ms | 275 ms | النطاقات: 169–246 مقابل 163–422 → **متداخلة (ضجيج)** |
| First-load load | 229 ms | 276 ms | نفسه |
| Deep-link dcl | 150 ms | 228 ms | ضجيج موزّع |
| home→showroom | 26 ms | **21 ms** | الحالي أسرع قليلاً |
| navigationEntries | 1 | 1 | لا إعادة تحميل في النسختين |

**الخلاصة:** لا تراجع أداء ذو دلالة؛ الفارق الزمني ضمن الضجيج، والفرق الحتمي هو +1.6% فقط في حجم الإدخال.

---

## 9. السبب الجذري ومنع التكرار (Root Cause & Regression Prevention) — قسم إلزامي

| السؤال | الإجابة |
|---|---|
| **كيف اكتُشفت المشكلة؟** | بكتابة اختبارات أمان ErrorBoundary كجزء من تمرين الأدلة: كشف اختبار الـ reset اليدوي أن الشاشة الرامية تُعاد الدخول إليها بعد إعادة التركيب بسبب قراءة hash قديم؛ وكشف الفحص اليدوي لشاشة الخطأ مفاتيح i18n الخام في الإنتاج. |
| **ما السبب الجذري؟** | (1) إعادة اشتقاق المسار الأول من `location.hash` عند إعادة التركيب — الـ URL كمرجع حقيقة يعيد الدخول إلى الشاشة الرامية عبر حدود إعادة التركيب؛ (2) وضع `ErrorBoundary` فوق `TranslationProvider` يجعل `useTranslation` يسقط على السياق الافتراضي؛ (3) `setState` الحدودي + `RESET` المزوّد غير ذرّيين في React 19. |
| **لماذا سمح الهيكل القديم بذلك؟** | لم تكن هناك اختبارات تعافٍ من الخطأ على الإطلاق؛ لم تكن هناك ثوابت تتحقق من الـ URL بعد reset؛ و`ErrorFallback` كان يستخدم hook لا يعي ترتيب شجرة المزوّدات. |
| **لماذا لا يمكن أن يعود؟** | اختبارات `error-boundary-reset.test.tsx` تفرض: URL=`#/home`، **ضبط reset واحد بالضبط لكل دورة**، بقاء التخزين، وإطلاق reload الأخير مرة واحدة بالضبط — أي إعادة حلقة أو ازدواج أو تسريب مفاتيح يفشل السويت فوراً. |
| **ما الاختبارات الحارسة؟** | `error-boundary-reset.test.tsx` (4) + `exit-telemetry.test.tsx` (4) + reachability (6، فحص بياني حتمي) + `navigation-url-mirror`/`base-path` (حارس ملكية التطبيق للـ URL). |
| **كيف يُكتشف التكرار تلقائياً؟** | السويت الكامل (1002 اختبار) هو البوابة؛ اختبارات الـ reset تفرض عدّادات دقيقة للاستدعاءات فتفشل فوراً عند أي تراجع. |
| **دليل ما بعد الإصدار؟** | تتبعات CDP (لا إعادة تحميل، boot hash sequence، deep-links تعمل) + 1002/1002 + بناء إنتاجي ناجح — كلها أعلاه. |

---

## 10. الخلاصة

أُجريت بنود الأدلة الثمانية جميعها بقياسات فعلية (بناء إنتاجي + CDP + اختبارات). اكتُشفت وأُصلحت خلال التمرين مشكلتان حقيقيتان كامنتان (حلقة الـ hash القديم، ومفاتيح i18n الخام)، مع 8 اختبارات حارسة جديدة. Phase 3A تبقى **اعتماد شرطي معلّق** إلى أن توقّع على الأدلة، ثم تبدأ Phase 3B (v5.1 §16.1/§16.2/§16.3) مع قسم «السبب الجذري ومنع التكرار» في كل تقرير قادم.

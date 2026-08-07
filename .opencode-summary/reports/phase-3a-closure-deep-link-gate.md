# Phase 3A — تقرير الإغلاق (Deep-Link Acceptance Gate)

**الحالة:** تم تنفيذ اختبار القبول الحقيقي للـ Deep Link من نقطة دخول خارجية — **3/3 PASS**
**الكوميت المُختبر:** `da7ce5f` + تغييرات دورة الأدلة غير الملتزمة في شجرة العمل (انظر §7)
**التاريخ:** 2026-08-07
**المرحلة التالية:** **متوقفة تماماً** — لا تبدأ Phase 3B إلا بموافقتك الصريحة بعد مراجعة هذا التقرير

---

## 1. اختبار القبول الجديد — دخول خارجي حقيقي (وليس `location.hash = ...`)

السكربت: `%TEMP%\opencode\deep-link-acceptance.mjs` (CDP + متصفح حقيقي، إنتاج مبني على `localhost:4180`).
كل سيناريو: **تبويب `about:blank` → `Page.navigate` إلى رابط عميق كامل (دخول خارجي) → إقلاع → تفسير route+params → الشاشة → Refresh → Browser Back**.

| المعيار (Acceptance Criterion) | S1 | S2 | S3 |
|---|---|---|---|
| فتح URL خارجي → إقلاع التطبيق | ✅ | ✅ | ✅ |
| تفسير route + params | ✅ `source=qr, campaign, ref` | ✅ `campaign=launch-week` | ✅ `code=R-42` |
| الشاشة الصحيحة تظهر | ✅ Landing (nav + body) | ✅ Landing | ✅ RepairTracking (input=`R-42`) |
| Refresh → نفس الشاشة + نفس المعاملات | ✅ hash مطابق، `input=R-42` بعدها | — (يُغطى بـ S1/S3) | ✅ hash مطابق + `input=R-42` |
| Browser Back → Back Matrix | ✅ `#/home` (قاعدة الـ single-entry) | ✅ `#/landing` (pop داخل التطبيق) | ✅ `#/home` (قاعدة الـ single-entry) |
| لا Document Reload غير متوقع | ✅ type يبقى `reload` بعد refresh، صفر أثناء Back | ✅ type يبقى `navigate` | ✅ type يبقى `reload` |
| لا frameNavigated غير متوقع | ✅ 1 إقلاع + 1 refresh فقط | ✅ 1 فقط | ✅ 1 إقلاع + 1 refresh فقط |
| URL Mirror لا يمحو المعاملات | ✅ boot+refresh يبقيانها كلها | ✅ | ✅ |
| `navigationEntries` ضمن السلوك المتوقع | ✅ | ✅ | ✅ |

**النتيجة النهائية (إعادة تشغيل على بناء جديد):**
- S1: `#/landing?source=qr&campaign=test-campaign&ref=ref-42` → refresh مطابق → back=`#/home` — **PASS**
- S2: `#/landing?campaign=launch-week` → Start→consent→back=`#/landing` (لا reload) — **PASS**
- S3: `#/repair-tracking?code=R-42` → refresh مطابق + `input=R-42` → back=`#/home` — **PASS**
- **failures = 0**

## 2. ملاحظات صادقة (ليست فشلاً، وليست تعديلات أُجريت)

1. **`?referrer=` / `?language=` / `?location=` (معاملات الحملة) تُحلل للتحليلات عند الإقلاع لكنها لا تُمرَّر إلى hash الـ landing** — قائمة params في `App.tsx` (InitialRoute REPLACE) تمرر `source`/`campaign`/`ref` فقط. هذه معاملة مُثبّتة وليست محواً من المرآة.
2. **عند الـ pop داخل التطبيق (consent→landing) تُمسح routeParams لكل شاشة** وفق دلالة `BACK` المُثبّتة في `route-params.test.ts:37`؛ لذلك يعود الـ URL إلى `#/landing` دون `?campaign=`. مسار الإقلاع والـ Refresh يحفظان المعاملات كاملة.
3. **قاعدة الـ Back للـ deep link البارد:** الدخول المباشر لشاشة واحدة → Back يصل `#/home` (موثّقة في `back-dispatcher.ts:73`: "Cold-loaded single-entry deep link ... back lands on home"). مصفوفة الـ repair-tracking (`repair-home`) تنطبق على مسار الـ in-app فقط.
4. **`campaign_id` / `placement_id` (معرفات قاعدة البيانات):** موجودة فقط في مسار `/c/{shortCode}?p={placement}` (بحث Supabase في `InitialRoute`) — لا يمكن التحقق محلياً دون short code مزروع في القاعدة. المكافئ على مستوى URL (campaign/source/ref) مُتحقق بالكامل.

## 3. هل كشف الاختبار خللاً حقيقياً؟

**لا.** لم تُجرَ أي تعديلات على Phase 3A. كل ما ظهر هو معاملات موثّقة/مُثبّتة مسبقاً في الاختبارات، والمسار نفسه (external boot → params → refresh → back → no reload) سليم.

## 4. إعادة التحقق النهائية (الحالة الحالية لشجرة العمل)

| البوابة | النتيجة |
|---|---|
| `vitest` (سويت كامل) | ✅ **1002/1002 في 100 ملف** (إعادة تشغيل كاملة) |
| `tsc --noEmit` | ✅ clean |
| `eslint` | ✅ **0 أخطاء** (6700 تحذيرات قائمة — نفس ما قبل) |
| `vite build` | ✅ `✓ built` (إعادة بناء ناجحة) |
| Reachability | ✅ Routes 37 / Reachable 37 / **Orphans 0** / **Dead Ends 0** / `isEdgeComplete=true` / 82 حافة من 37 مصدراً |

## 5. السبب الجذري ومنع التكرار (قسم إلزامي) — بند Deep-Link Evidence

| السؤال | الإجابة |
|---|---|
| **كيف كانت مشكلة الدليل السابق؟** | «اختبار» التنقل الداخلي استخدم كتابة `location.hash = ...` مباشرة من الكونسول؛ التطبيق يملك الـ URL فتُعاد تصفية الكتابة وتُرجع الـ hash إلى الحالة المعروفة — فكان المشهد غير صالح كدليل (وليس عيباً في التطبيق). |
| **ما السبب الجذري؟** | الـ URL-ميرور (BackProvider + mirror effect) يعيد تنسيق أي hash دخيل لا يعكس حالة الـ reducer؛ أي مدخل URL غير مشروع يُعاد امتصاصه — لذلك لا يمكن محاكاة دخول حقيقي إلا عبر تنقل متصفح فعلي من خارج التطبيق. |
| **لماذا سمح الهيكل القديم بذلك؟** | لم يكن هناك اختبار قبول متصفحي لمسار الدخول الخارجي؛ أدلة الـ no-reload اعتمدت على التلاعب المباشر بالـ hash. |
| **لماذا لا يمكن أن يعود؟** | اختبار القبول الجديد `deep-link-acceptance.mjs` محدد بمتعامل دخول خارجي فعلي فقط (تبويب `about:blank` + `Page.navigate`)، ويفرض: المعاملات محفوظة عند الإقلاع والـ refresh، نفس الشاشة بعد refresh، back وفق المصفوفة، صفر reload غير متوقع (عبر `navigation.type`)، وصفر frameNavigated غير متوقع. |
| **ما الاختبارات الحارسة؟** | اختبار القبول المتصفحي + `route-params.test.ts` (7) + `navigation-url-mirror.test.tsx` + `reachability.test.ts` (6) + `error-boundary-reset.test.tsx` (4) + `exit-telemetry.test.tsx` (4). |
| **كيف يُكتشف التكرار تلقائياً؟** | السويت الكامل (1002) + تشغيل السكربت المتصفحي كخطوة قبل الإغلاق؛ أي كسر في مسار الدخول/الـ refresh/الـ back يفشل فوراً. |
| **دليل ما بعد الإصدار؟** | `deep-link-acceptance-final.json` (3/3 PASS على بناء جديد) + إعادة التحقق §4. |

## 6. الحكم

- **Deep-Link Evidence: CLOSED** ✅ (اختبار قبول حقيقي من نقطة دخول خارجية، 3/3 PASS، بلا تعديلات على 3A).
- **Phase 3A: APPROVED / CLOSED** — معلّقاً على مراجعتك لهذا التقرير.
- **توقف تام.** لا تبدأ Phase 3B — Phone Details + Showroom UX + WhatsApp Flow — إلا بعد **موافقتك الصريحة** في دورة جديدة، مع بقاء قاعدة: مرحلة واحدة → تقرير → موافقة → المرحلة التالية، وحماية M1/M2 كما هي.

## 7. ملاحظة التزام شجرة العمل

بعد كوميت `da7ce5f` (أساس 3A) توجد تغييرات دورة الأدلة **غير ملتزمة** في شجرة العمل (منها: إصلاحا `ErrorBoundary.tsx`، `App.tsx`، `index.html`، `whatsapp-service`، اختبارات `error-boundary-reset`/`exit-telemetry`/`setup.ts`…). كل البوابات أعلاه شُغّلت على هذه الحالة. **لم ألتزم شيئاً دون أمرك** — أخبرني إن أردت التزامها كجزء من إغلاق 3A.

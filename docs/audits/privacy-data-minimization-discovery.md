# FOCUS — Privacy & Legal Exposure Minimization: Discovery Report

**التاريخ:** 2026-08-07
**الفرع:** `main` — آخر commit: `63c58ac` (S3)
**نوع الوثيقة:** Discovery → Risk Inventory → Data Minimization Plan → APPROVAL
**حالة العمل:** `STATUS: DISCOVERY COMPLETE + FINAL APPROVAL (FOCUS DATA MINIMIZATION + GAME RETENTION) — NO CODE/DATABASE/DELETION/MIGRATION/COMMIT YET`

---

## ⚠️ DECISION LOG — FINAL APPROVAL (2026-08-07) — يُثبَّت ولا يُعاد تفسيره

**المصدر:** قرار المالك النهائي "FINAL APPROVAL — FOCUS DATA MINIMIZATION + GAME RETENTION".

| # | القرار | القيمة المثبتة |
|---|---|---|
| D1 | **GAME** | **KEEP** — اللعبة تبقى ميزة جذب/ترفيه (engagement hook): الهدف التجاري جذب المستخدم ثم توجيهه لعرض الهواتف والعروض وWhatsApp. ممنوع حذف Game UI أو Game Engine أو مسار تشغيل اللعبة إلا إذا كان ضرورياً تقنياً لإزالة التخزين/التتبع. |
| D2 | **GAME PERSONAL DATA** | **DELETE** — إزالة/إيقاف: هوية المستخدم المجهولة الدائمة (للعبة فقط)، sessions الشخصية، devices/fingerprinting، calibrations المخزنة، reaction history، focus/fatigue/consistency history، telemetry التفصيلية، click/screen/back tracking، analytics المرتبطة بالمستخدم، QR attribution المرتبط بالمستخدم، research/BI المبني عليها، أي user_id يربط نتيجة اللعبة بشخص، أي بيانات جهاز لا يحتاجها التشغيل اللحظي. اللعبة تعمل **محلياً/لحظياً بلا ملف دائم للاعب**. |
| D3 | **ANONYMOUS TOP-10 LEADERBOARD** | **KEEP AS MINIMAL DATA FEATURE** — أفضل 10 نتائج فقط، بلا Players/Profiles. يُسمح فقط: score/best_time، rank، game_version (إن لزم للعدالة)، created_at (إن لزم فنياً). ممنوع: name/email/phone/user_id/IP/fingerprint/user-agent/GPS/advertising ID/cookies/history/behavioral profile/أي معرف يعيد ربط النتيجة بشخص. خارج Top-10 لا يُخزَّن؛ خارج Top-10 يُحذف نهائياً. سياسة retention صريحة (إدخال/إخراج/تغيير version/reset) — §7 أدناه. |
| D4 | **ADS** | **KEEP** — إعلانات صاحب المنصة جزء من المنتج التجاري. ممنوع حذفها افتراضياً. المطلوب فقط: لا جمع بيانات شخصية عن الزائر إلا بضرورة مصرّح بها. Ads content ≠ user tracking. |
| D5 | **INVENTORY** | **KEEP** — مخزون البائع وأسعاره وبيانات إدارة التجارة (بيانات صاحب المنصة) تبقى. |
| D6 | **CATALOG** | **KEEP** — Phone Catalog + Canonical S1–S3 + موديلات/نسخ/RAM/Storage/أسعار/صور/Showroom/تفاصيل/Similar/Favorites المحلية/WhatsApp handoff. |
| D7 | **S4** | **COMPLETE (موافق)** — استكمال S4 كجزء من Canonical Catalog/loader: يزيل الاعتماد غير الضروري على `catalog_*_v1`، يحافظ على Inventory/Ads/Showroom، لا موديلات يدوية، لا A16 4/128 يدوياً، لا CATALOG-3. بعد S4: STOP + acceptance report. |
| D8 | **CATALOG-3** | **DEFERRED** — لا Data Acquisition/آلاف الموديلات/A16 4/128 قبل اعتماد مستقل. |
| D9 | **REPAIR / CUSTOMER / BUSINESS-PERSONAL** | **DELETE / REASSESS** عبر بوابة مستقلة لكل جدول/مفتاح (KEEP/DELETE/REASSESS مع سبب) — لا حذف عشوائي. |
| D10 | **DATA MINIMIZATION RULE** | **قاعدة رسمية دائمة:** FOCUS يجمع/يخزن فقط ما ثبت أنه ضروري لأحد: (A) تشغيل الميزة المطلوبة، (B) تحسين البيع والتجارة، (C) إدارة المنتجات/المخزون/الإعلانات، (D) أمن وتشغيل النظام بالحد الأدنى. **أي شيء آخر = DELETE / DO NOT COLLECT.** |
| D11 | **NO SILENT COLLECTION** | ممنوع إضافة analytics/telemetry/tracking/fingerprinting/persistent identifiers/behavioral profiling جانبياً (مكتبة/hook/service) دون إدراجها في Data Inventory؛ أي collector جديد يتطلب purpose/fields/retention/storage/access/deletion قبل اعتماده. |
| D12 | **ANTI-CHEAT** | لا user tracking لمنع الغش؛ أقل آلية ممكنة، غير مربوطة بهوية، تمر بمراجعة Data Minimization، لا fingerprint دائم. |
| D13 | **LEGAL BOUNDARY** | الخطة ليست بديلاً عن مراجعة قانونية؛ كل بند `LEGAL REVIEW REQUIRED`/`UNKNOWN` يبقى كذلك. لا يُكتب أن FOCUS أصبحت "متوافقة قانونياً" لمجرد نجاح اختبارات تقنية — يُكتب فقط: *"Technical data minimization implemented; legal validation remains required where marked."* |

> **أثر التعديل على هذا التقرير:** الأقسام G/H/I/J/K/Q/S/T أدناه كانت تُصنّف اللعبة والبيانات معاً كمرشح للإزالة. **يُعدَّل الفهم الآن**: اللعبة نفسها KEEP؛ **بياناتها الشخصية/التعقّب** DELETE. البنود المتعارضة تُقرأ في ضوء D1–D13.

---

## A. Executive Summary

FOCUS اليوم ليست منصة "تصفح → WhatsApp" فقط. هي منصة تتضمن:

1. **لعبة معرفية (Focus Game)** تجمع قياسات تفاعلية كاملة (زمن رد الفعل عبر 7 جولات، درجة تركيز، تصنيف، تعب، ثبات) مع **معايرة الجهاز** و**بصمة جهاز كاملة**، وترسلها إلى Supabase في جداول `sessions` / `devices` / `calibrations`.
2. **خط Telemetry ضخم** (~70 نوع حدث) يرسل إلى جدول `analytics_events` (مع `user_id`, `session_id`, `device_id`, `campaign_id`, `user_agent`).
3. **Auth تلقائي للزائر**: `signInAnonymously()` عند أول زيارة → هوية دائمة (`user_id`) لكل زائر.
4. **QR/Campaigns tracking** (مسح QR، حملات، أحالة، مصدر/إحالة).
5. **بيانات بيعية/صيانة/عملاء** داخل المتجر: مخزون بأسعار، ذاكرة عملاء (اسم، مشتريات، واتساب)، نظام إصلاحات ببيانات شخصية حساسة (اسم، هاتف، عنوان، GPS، صور)، سجل أجهزة IMEI، ذاكرة أسعار.
6. **لا يوجد** سلة شراء / دفع / تقسيط / فاتورة / شحن — **تأكيد سلبي** (انظر §N).

**النتيجة:** سطح البيانات الحالي أكبر بكثير من المطلوب لنموذج "عرض هاتف → WhatsApp". معظم مخاطر التعرض القانوني والتنظيمي لا تأتي من عرض الهواتف نفسه، بل من: **بصمة الجهاز، الهوية الضمنية، اللعبة والقياسات المعرفية، التتبع السلوكي، ونظام الصيانة/العملاء المرتبط بنشاط تجاري فعلي**.

**المبدأ المعتمد:** لا يوجد "جمع الآن ثم نقرر لاحقاً". أي عنصر لا تحتاجه FOCUS لعرض الهاتف أو تحويل المستخدم إلى WhatsApp يجب ألا يُجمع أو يُحفظ.

**تنبيه قانوني (لا يُختصر):** حذف البيانات **ليس** إعفاءً من المسؤولية. القانون الجزائري 18-07 (معدّل بـ25-11) يُلزم المسؤول عن المعالجة بالتزامات قائمة بذاتها (إعلام، تسجيل لدى ANPDP، موافقة، إشعار بالاختراق خلال 5 أيام، سجل معالجة، وربما مندوب حماية بيانات) — هذه التزامات تبقى حتى بعد التقليل. أُحصي أدناه كل بند يحتاج `LEGAL REVIEW REQUIRED`.

---

## B. Target Product (النموذج المستهدف)

```
المستخدم → FOCUS → تصفح الهواتف → اختيار هاتف → مشاهدة صور/مواصفات/سعر/حالة → زر WhatsApp → wa.me → WhatsApp
```

- FOCUS لا تنفذ بيعاً ولا دفعاً ولا تقسيطاً داخلها.
- التفاوض/الشراء يتم خارج FOCUS (عبر WhatsApp).
- الحد الأدنى من البيانات: بيانات المنتج المعروضة + وجهة WhatsApp فقط.
- الزائر **لا يحتاج حساباً** للتصفح.

---

## C. Legal / Regulatory Research

> منهجية: لكل نظام، تقدير Applicability مع السبب والمصدر. أي تفسير يتجاوز إثبات النص/المصدر يُوسم `LEGAL REVIEW REQUIRED`. ما لا يمكن إثباته من النص الرسمي يُوسم `UNKNOWN` (وليس SAFE).

### C1. الجزائر

| النظام | Applicability | السبب والمصدر |
|---|---|---|
| **قانون 18-07 لحماية المعطيات ذات الطابع الشخصي** (10/06/2018) المعدّل والمتمّم بـ **القانون 25-11** (24/07/2025) | **Applicable** | يطبَّق على أي معالجة لمعطيات أشخاص طبيعيين على التراب الجزائري، ويشمل (وفق مفسرين: DLA Piper، CookieYes، SavvyCompliance) الشركات الأجنبية التي تعالج بيانات أشخاص في الجزائر. يُنشئ ANPDP (تأسست عملياً 2023، وبدأت تفتيشاً ميدانياً للقطاع الخاص 2024). المصادر: anpdp.dz، دليل DLA Piper، CookieYes، ConsentStack. |
| **الموافقة الصريحة** (مبدأ القانون 18-07) | **Applicable** | المادة 7 (وفق تلخيص CookieYes/ConsentStack): المعالجة تتطلب موافقة صريحة مسبقة مبنية على معلومات. FOCUS تجمع اليوم بصمة/تتبع/قياسات **بدون أي آلية موافقة مفعّلة** (`qr/consent.ts` موجود لكنه غير موصول). |
| **التسجيل/الترخيص المسبق لدى ANPDP** | **Probably applicable** | المعالجات تُصرَّح/تُسجَّل قبل الشروع فيها، والعالية الخطورة تتطلب ترخيصاً مسبقاً. هل يشمل عرض الهواتف + التتبع الحالي؟ **LEGAL REVIEW REQUIRED**. |
| **إشعار الاختراق 5 أيام** (25-11) | **Applicable** (إن وُجدت بيانات) | إخطار ANPDP خلال 5 أيام من العلم بالاختراق، مع إخطار المتضررين عند الخطورة العالية. |
| **سجل أنشطة المعالجة + DPIA + مندوب حماية البيانات (DPO)** (25-11) | **Potentially applicable** | مطلوب للمعالجات عالية الخطورة (التنميط المنهجي، بيانات حساسة واسعة النطاق، نقل عبر الحدود). بصمة الجهاز + القياسات المعرفية + الربط بهوية دائمة قد ترقى إلى "تنميط". **LEGAL REVIEW REQUIRED**. |
| **النقل عبر الحدود** (25-11) | **Probably applicable** | بيانات الزوار تُرسل إلى Supabase (خوادم خارج الجزائر). قواعد النقل عبر الحدود "أوضحت" بالتعديل 2025. **LEGAL REVIEW REQUIRED**. |
| **قانون التجارة الإلكترونية 18-05** (10/05/2018) | **Potentially applicable** | يفرض إفصاحات قبل الصفقة (NIF، العنوان، الوصف، السعر الشامل، شروط الإرجاع) لـ"التاجر الإلكتروني". FOCUS وسيط/عرض لا يبيع مباشرة، لكنها تُدار على الأرجح من تاجر وتعرض أسعاراً. **LEGAL REVIEW REQUIRED**. |
| **قانون حماية المستهلك 09-03** (25/02/2009) معدّل بـ18-09 (2018) + مرسوم 13-378 (إعلام المستهلك) | **Applicable** | منع الإعلان/الممارسات المضللة (المادة 17 في القراءات المتاحة)، الحق في معلومات صحيحة ودقيقة (السعر، المنشأ، الخصائص). عرض بيانات منتج غير موثوقة (مثل Samsung A16 4/128 غير الموجودة في الكتالوج) هو خطر مباشر هنا. |
| **قانون 09-04 جرائم تكنولوجيا المعلومات** (05/08/2009) | **Probably not applicable** (بشكل مباشر) | يستهدف الجرائم؛ لكن سوء معالجة بيانات الزوار قد يتقاطع معه عبر مبادئ الحماية. |
| **قانون الاتصالات 2000-03 / 18-04 + سلطة ARPCE** | **Potentially applicable / UNKNOWN** | التحويل إلى WhatsApp يتم عبر خدمة طرف ثالث (المستخدم يملك الحساب). هل يلزم FOCUS أي تصريح اتصالات؟ وضع خدمات OTT/VoIP في الجزائر غير مثبت من مصدر رسمي في هذا البحث. **LEGAL REVIEW REQUIRED — UNKNOWN**. |
| **العقوبات الجزائية الجزائرية** (بيانات) | — | غرامات 20,000 – 1,000,000 دج وعقوبات حبسية (2 أشهر – 5 سنوات) وفق مفسرين (ConsentStack، CookieYes، AlgeriaTech). **تحقق من النص الرسمي** — المصادر الثانوية فقط. |

### C2. دولياً

| النظام | Applicability | السبب |
|---|---|---|
| **GDPR (EU)** | **Probably not applicable / Potentially** | يسري على معالجة بيانات أشخاص في الاتحاد الأوروبي أو عبر شركة EU. مستخدمو FOCUS الأساسيون في الجزائر. إذا زار أشخاص من الاتحاد الأوروبي أو نُقلت بياناتهم دولياً، قد ينشأ التزام. **LEGAL REVIEW REQUIRED**. |
| **ePrivacy / cookies (EU)** | **Probably not applicable** | يخص المستخدمين الأوروبيين. FOCUS لا تستخدم cookies إطلاقاً (لا `document.cookie`). |
| **قواعد حماية المستهلك الرقمية الدولية** | **Probably not applicable** | بدون عملاء خارج الجزائر، الاحتمال منخفض؛ يبقى مفتوحاً إن استهدف التطبيق أسواقاً أخرى. |

### C3. الصور والمحتوى والأسماء التجارية

- FOCUS تعرض ماركات وأسماء تجارية (Samsung, Apple, Xiaomi, Vivo…) وصور أجهزة. استخدام الاسم للوصف العام في سوق الهواتف ممارسة شائعة، لكن **حقوق الصور** (مصدر الصور، تراخيصها، ملكية شعارات/صور رسمية) **لم تُفحص بعد في الكود**. → **LEGAL REVIEW REQUIRED** (قسم O).

### C4. خلاصة عدم اليقين القانوني

- المصادر القانونية الموثوقة المتاحة: نصوص على WIPO Lex / JORADP / anpdp.dz / africadataprotection.org (مؤشرات رسمية موثقة أعلاه). النصوص التطبيقية والتفاصيل الدقيقة (إجراءات التسجيل، عتبات DPIA، قوائم النقل عبر الحدود) تحتاج تأكيداً من **محامٍ جزائري** قبل أي قرار تنفيذي.

---

## D. Complete Data Inventory

> المصطلح: أين يُخزَّن — `LS`=localStorage، `SS`=Supabase، `MEM`=ذاكرة فقط، `EXT`=خارجي.

### D1. localStorage — الجدول الكامل (مفاتيح مكتوبة فعلياً)

| المفتاح | المحتوى | المصدر (ملف) |
|---|---|---|
| `focus_calibration_profile` | refreshRate, displayLagMs, inputLagMs, confidence, platform, timestamp | `src/core/calibration/silent.ts` |
| `focus_calibration_cache` | {profile, deviceId, browserName, expiresAt} | `src/core/calibration-cache/index.ts` |
| `focus_achievements` | {achievementId: {unlockedAt}} — 18 إنجازاً | `src/core/gamification/achievements.ts` |
| `focus_daily_challenge`, `focus_daily_completed` | حالة التحدي اليومي | `src/core/gamification/daily-challenge.ts` |
| `focus_settings` | theme, reducedMotion, highContrast, language | `src/core/config/settings.ts` |
| `focus_theme` | الثيم | `src/design-system/use-theme.tsx` |
| `focus_sessions`, `focus_sessions_v2` | **غير مكتوبة في الإنتاج** (اختبارات/بنية مستقبلية فقط) | `src/core/storage/repository/index.ts`، `src/core/repository/local-storage.ts` |
| `showroom_view_counts` | عدادات مشاهدة لكل سجل (500 حد، مرة/جلسة) | `src/hooks/useViewCounter.ts` |
| `catalog_favorites`, `catalog_most_used` | {brand,model} / {brand,model,count} (50 حد) | `src/components/catalog/CatalogCascadeTypes.tsx` |
| `catalog_inventory` | سجلات مخزون **بأسعار شراء/بيع ومدينة** | `src/services/inventory-service.ts` |
| `catalog_inventory_transactions` (500) | معاملات شراء/بيع | `src/services/inventory-service.ts` |
| `catalog_inventory_movements_v2` (2000) | سجل حركات المخزون | `src/services/inventory-service.ts` |
| `inventory_timeline_v3` (5000) | أحداث زمنية | `src/services/inventory-service.ts` |
| `pricing_records` | سجلات أسعار شراء/بيع | `src/services/pricing-intelligence.ts` |
| `device_ledger_v1`, `device_ledger_sequence` | سجل أصول لكل IMEI (أسعار، ربح، IMEI، serial) | `src/services/device-ledger.ts` |
| `price_memory_v1` (10000) | خط زمني للأسعار لكل موديل (شراء/بيع/استبدال، ربح، هامش) | `src/services/price-memory.ts` |
| `popularity_events` (5000), `popularity_scores` | أحداث بحث/اختيار/شراء/واتساب + نتائج شعبية | `src/services/popularity-engine.ts` |
| `customer_memory_sessions`, `customer_memory_events` (1000) | زيارات العملاء: **اسم، مشتريات، إرسالات واتساب** | `src/services/customer-memory.ts` |
| `sticker_scans`, `sticker_serial_counter` | مسح ملصقات **مع ip, userAgent, referrer** | `src/services/sticker/sticker-database.ts` |
| `repair_requests`(_v1), `repair_quotes`, `repair_timeline`, `repair_courier_jobs`, `repair_notifications`, `repair_photos`, `repair_status_history`, `repair_audit_log` | **مجال الإصلاح الكامل: اسم، هاتف، عنوان، GPS، صور، سجل** | `src/services/repair/repair-types.ts` |
| `bi_*` (7 مفاتيح) | AI feedback, مخزون sandbox, إشعارات, قواعد, عروض, موظفون, أسعار صرف | `src/business-intelligence/actions/*` |
| `bi_branch_data` | تحليلات فرع | `src/business-intelligence/api.ts` |
| `catalog_brands_v1` … `catalog_changelog_v1` | الكتالوج المزروع (أعمدة S4/S5) | `src/database/schema.ts` |
| `price_memory_v1` | خط أسعار | `src/services/price-memory.ts` |

> **لا يُستخدم في FOCUS:** sessionStorage (لا شيء)، cookies (`document.cookie` لا شيء)، IndexedDB (لا شيء).

### D2. Supabase — الجداول والكتابة

| الجدول | الكاتب (من الكود) | المحتوى | ملاحظات |
|---|---|---|---|
| `users` | Auth (Supabase) | role, is_anonymous, display_name, last_login_at | no frontend role-write |
| `sessions` | `PersistenceProvider.tsx` | قياسات كاملة + نتائج علمية JSONB (raw_rts, corrected_rts, consistency, fatigue, focus_score, grade) + device_id + campaign_id | RLS: auth.uid()=user_id |
| `devices` | `PersistenceProvider.tsx` | بصمة كاملة: browser/os/screen/pixel_ratio/refresh_rate/cpu_cores/memory_gb/language/timezone/user_agent | |
| `calibrations` | `PersistenceProvider.tsx` | معايرة الجهاز (refresh_rate, lags, confidence, platform, browser) | |
| `analytics_events` | telemetry `data-service.ts` | ~70 نوع حدث + user_id/session_id/device_id/campaign_id/user_agent | |
| `repair_*` (9 جداول) | `repair-data-service` | PII كاملة: اسم، هاتف، عنوان، lat/long، روابط خرائط، صور (data-URL) | `photo_paths` بدون bucket حقيقي |
| `qr_codes`, `campaigns`, `placements`, `placement_history` | `data-service` | QR/حملات/مواضع + counter (RPC `increment_qr_counter`, `lookup_scan_context`) | |
| `surveys` | قراءة فقط (research console) | age/gender/country/education/sleep/coffee/exercise | لا كاتب في src |
| `ads`, `system_settings`, `audit_log`, `job_assignments` | إدارة/BI | إعلانات، إعدادات، سجل | |
| `inventory_items/images/movements` | **DRAFT لم يُنفَّذ** | مسودة مخزون SQL | المخزون الحقيقي في localStorage |
| `calibrations`, `devices`, `surveys`, `sessions`, `analytics_events` | **لا يوجد CREATE في migrations** | بُنيت live عبر SQL editor | `verify-live-schema.sql` يشهد بعدم قابلية إعادة البناء من الصفر |

**RPCs مستدعاة:** `increment_qr_counter`, `lookup_campaign_by_short_code(_v2)`, `lookup_scan_context`, `has_super_admin`.

### D3. بيانات خارجية/بنية تحتية

| العنصر | الحالة |
|---|---|
| مزوّد Supabase (خوادم خارج الجزائر) | البيانات الشخصية والتقنية تُرسل إليه. قواعد النقل عبر الحدود → **LEGAL REVIEW REQUIRED** |
| GitHub Pages (استضافة) | SPA ثابت. سجلات IP/طلب عند المزوّد: **غير مثبتة من الكود** → **UNKNOWN**، تحتاج مراجعة مزوّد (GitHub). |
| SDKs تحليل خارجية | **لا يوجد** أي SDK خارجي (package.json خالٍ، index.html خالٍ). |
| env | `.env` غير متعقَّب؛ المتغيرات: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_SUPABASE_PROJECT_ID` (من GitHub vars). لا يوجد service role key في الكود. |
| سجل ملاحظات | عنوان مشروع Supabase الحقيقي مذكور في `supabase/security-hardening/phase1/README.md` + ملفات `.log` متعقَّبة (cur-build.log…). ليست أسراراً، لكن ينصح بإزالتها من سطح الإنتاج. |

---

## E. Collection Map (من أين تأتي البيانات وإلى أين تذهب)

| المسار | البيانات | الوجهة |
|---|---|---|
| فتح التطبيق | guest auth تلقائي → user_id دائم | Supabase `auth.users` |
| كل Mount | بصمة الجهاز الكاملة | Supabase `devices` + LS `focus_calibration_cache` |
| تصفح الشاشات | screen_view, back_pressed, nav | Supabase `analytics_events` |
| لعبة التركيز | RTs/نتائج/معايرة | Supabase `sessions`/`calibrations` + LS `focus_*` |
| مسح QR / روابط حملة | campaign_id, placement_id, ?p=, ref= | Supabase `analytics_events` + LS |
| ضغطة واتساب | template_selected/clicked/sent/exit_attempt (target='whatsapp') | Supabase `analytics_events` |
| متجر/بائع | مخزون/أسعار/عملاء/إصلاحات | localStorage + Supabase `repair_*` |
| مشاركة | wa.me / t.me / x / fb / mailto | خارجي (رابط فقط) |

---

## F. Storage Map

- **Frontend (المتصفح):** localStorage وحدها (لا sessionStorage/cookies/IndexedDB). — القائمة الكاملة في D1.
- **Backend:** Supabase (جداول D2). الاستضافة: GitHub Pages.
- **Third parties:** لا تحليلات خارجية، فقط wa.me/WhatsApp (رابط) وخدمة Supabase. مشاركة عبر links فقط.

---

## G. Game Analysis — KEEP (retention) + Personal Data DELETE

> **وفق القرار D1/D2**: اللعبة تبقى كـ engagement hook. يُفصل هنا **اللعبة (KEEP)** عن **بياناتها الشخصية (DELETE)**.

### G1. اللعبة نفسها — KEEP (لا حذف)

| المكوّن | الحالة |
|---|---|
| Game UI + شاشات اللعبة (GameScreen/Countdown/Results/History/Achievements/Intro/Library…) | **KEEP** |
| Game Engine (`src/core/engine/*`: reaction/consistency/fatigue/scoring) | **KEEP** — ضروري لتشغيل اللعبة |
| مسار تشغيل اللعبة (store/navigation START_SESSION/SET_RESULTS، مؤقتات، جولات) | **KEEP** |
| الذاكرة اللحظية للنتيجة أثناء اللعب (in-memory) | **KEEP** (لا تُستمر إلى ملف دائم) |
| حساب "أنت الآن في المركز #X" للنتيجة الحالية | **KEEP** (من Top-10 المجهول) |

### G2. بيانات اللعبة الشخصية/التعقّب — DELETE

| المكوّن | الحالة | ملاحظة التنفيذ (في مرحلة لاحقة) |
|---|---|---|
| جلسات اللعبة → Supabase `sessions` | **DELETE** | إيقاف كتابة PersistenceProvider للجلسات |
| بصمة الجهاز → `devices` | **DELETE** | إيقاف `collectDeviceProfile`/insert |
| المعايرة المخزنة → `calibrations` + LS `focus_calibration_*` | **DELETE** | قد تُحسب لحظياً فقط |
| reaction/focus/fatigue/consistency history (سجل النتائج) | **DELETE** | لا سجل زمني للاعب |
| `focus_sessions`/`focus_sessions_v2` (غير مكتوبة أصلاً) | **DELETE/لا شيء** | لم تُكتب في الإنتاج |
| guest identity لربط النتيجة بشخص | **DELETE** | اللعبة بلا user_id |
| AI Coach (`src/ai/coach/`) | **REASSESS** | تحليل سلوكي؛ خارج النموذج المصرّح |
| Research Console + Research API + `surveys` | **REASSESS/DELETE** | مبنية على البيانات المحذوفة (D2) |
| سجلات اللعبة التاريخية في Git | **تبقى** (التاريخ لا يُمسح) | غير إنتاجية |

### G3. Anonymous Top-10 Leaderboard — KEEP (قرار D3)

- يُخزَّن فقط: `score` (أو best_time)، `rank` مشتق، `game_version` إن لزم للعدالة، `created_at` إن لزم فنياً.
- بلا: name/email/phone/user_id/IP/fingerprint/UA/GPS/advertising ID/cookies/attempt history/behavioral profile.
- خارج Top-10: **لا يُخزَّن**. خارجة من Top-10: **تُحذف نهائياً** (سياسة retention §7).
- يعرض النتيجة الحالية: "أنت الآن في المركز #X".

---

## H. Analytics / Telemetry Decommission Analysis

| العنصر | الوجهة | الحاجة في FOCUS الجديدة | الإجراء المقترح |
|---|---|---|---|
| ~70 نوع حدث (`analytics_events`) | Supabase | **غالباً لا** | تقليل إلى الصفر أو إلى حد أدنى (مثلاً خطأ فادح واحد) |
| فُرش telemetry (5s/5 أو 30s/20، beacon قبل الإغلاق) | Supabase | لا | إيقاف |
| `exit_attempt/exit_confirmed` للتتبع | Supabase | لا | إزالة (يمكن التحويل المباشر) |
| screen_view/back/click | Supabase | لا | إزالة |
| `sendBeacon` / fetch keepalive | Supabase | لا | إزالة |

**الخلاصة:** FOCUS لا تحتاج Analytics في نموذج "عرض→واتساب". كل حدث بلا استخدام تجاري مبرَّر هو مرشح `REMOVE`. أي استثناء (مثلاً إحصاءات مجهولة للعرض) يجب أن يُقرَّر صراحة بفئة B مع مبرر.

---

## I. QR / Campaign Decommission Analysis

| العنصر | Required by showroom? | Personal data? | Tracking? | Can be removed? |
|---|---|---|---|---|
| `qr_codes` / `qr_scanned` + `increment_qr_counter` | **NO** | YES (ربط بجلسة/جهاز) | YES | YES |
| `campaigns` / `campaign_detected` / `campaign_id` | **NO** | YES | YES | YES |
| `placements` / `placement_history` | **NO** | YES | YES | YES |
| معلمات `?p=`, `?ref=`, `campaign`, `source`, `referrer`, `ref` | **NO** | YES | YES | YES |
| `sticker_scans` (ip, userAgent, referrer) | **NO** | YES | YES | YES |

**اقتراح:** إزالة مسار QR/الحملات من إنتاج FOCUS. أي بقاء له يضيف تتبعاً دون أي ضرورة للعرض.

---

## J. Auth Analysis

| السؤال | الجواب |
|---|---|
| هل يحتاج الزائر حساباً للتصفح؟ | **لا** (تصفح اللعبة/المعرض مفتوح) |
| ماذا يحدث اليوم؟ | `signInAnonymously()` تلقائياً عند كل فتح → هوية Supabase دائمة لكل زائر |
| هل يمكن جعل التصفح بلا حساب؟ | **نعم** — إزالة auth الضمني للزوار |
| Guest IDs؟ | `user_id` دائم لكل ضيف (منشأ في Supabase) |
| Customer profiles؟ | `users` (display_name, role) + `customer_memory_*` (اسم/مشتريات) |
| بيانات تسجيل؟ | RegisterScreen: email + displayName + password؛ **email يُسجَّل حرفياً في أحداث analytics** |
| Admin/Researcher | `users.role` (guest/user/researcher/admin/super_admin). يجب فصل بيانات الإدارة عن بيانات الزوار. |

---

## K. Device / Fingerprinting Analysis

تُجمع **في كل فتح تطبيق** عبر `src/core/device/index.ts` وتُرسل إلى `devices`:
`browser, os, platform, screenWidth/Height, pixelRatio, refreshRate, touchSupport, pointerType, cpuCores, memoryGB, language, timezone, userAgent`.

- **مُعرف دائم** مرتبط بـ `user_id` — بصمة متعقِّبة.
- **القاعدة:** لا يجمع أي telemetry للجهاز في FOCUS الجديدة إلا بضرورة تشغيلية مباشرة موثقة. **هذه البصمة مرشح أول للحذف.**

---

## L. Cookies / Local Storage Analysis

- لا Cookies، لا sessionStorage، لا IndexedDB.
- localStorage غني (D1). بعد التقليل، المتوقع أن تبقى مفاتيح **وظيفية فقط**: تفضيلات ثيم/لغة إن رغب المستخدم، وبيانات سلة المتجر (المخزون) للمستخدم البائع إن أُبقي نموذج الإدارة المحلي، ومفاتيح كتالوج عند لزومها لـS4/S5.

---

## M. WhatsApp Analysis

- كل التحويلات إلى رقم ثابت `+213556254007` عبر `wa.me`.
- القالب يحوي: brand, model, variant, condition, code, **price (دج), city, رابط deep-link**.
- مسار الإصلاح يرسل: رقم العميل، الوصف، رابط خرائط، رمز الإصلاح.
- **تُتتبَّع خطوات النقر** (template_selected → clicked → sent/exit_confirmed/exit_attempt/fallback_shown/message_copied).
- **المسار المفضل:** `FOCUS → wa.me → WhatsApp` **مباشر**، بدون التقاط/تخزين/تتبع النقر.

> الملاحظة: رسالة الواتساب تحتوي بيانات تجارية (سعر/مدينة) — محتوى الرسالة هو قرار تجاري، لكن لا يجب تخزين نصوص محادثات.

---

## N. Commerce / Payment / Installment Verification

**نتيجة الفحص (سلبي — بثقة عالية):** بحث شامل في `src/ supabase/ scripts/ scripts-3a/ .github/ docs/` عن `cart|checkout|stripe|paypal|installment|financ|invoice|refund|shipping|wallet|payment|CIB|CCP|baridi|sadad|edahabia|dinar|carte`:

- **لا يوجد** سلة، إتمام شراء، بوابة دفع، تقسيط، فاتورة، شحن، استرداد، محفظة، أو بيانات دفع مخزنة.
- كل التطابقات كلمات مركّبة غير دالة (`purchase` = سبب حركة مخزون فيزيائي، `checkout` = GitHub Action، `stripe` = نمط تصميم).

**خلاصة:** النموذج "بيع داخل FOCUS" غائب أصلاً، بما يتوافق مع الهدف. يجب **البقاء** غائباً.

---

## O. Images / IP / Content Rights

- FOCUS تعرض صور هواتف وأسماء/شعارات علامات (Samsung, Apple, Xiaomi, Vivo, Honor…) ومواصفات وأسعار.
- **لم تُفحص في هذا الاكتشاف:** مصدر الصور الفعلي، ترخيص كل صورة، ملكية الشعارات، صور رسمية/طرف ثالث.
- القاعدة: وجود صورة على الإنترنت **لا يعني** حرية الاستخدام.

→ **LEGAL REVIEW REQUIRED**: مراجعة حقوق كل صورة/شعار، واعتماد مصادر مرخصة (صور رسمية بترخيص، أو صور مُلتقطة، أو مصادر مفتوحة مرخّصة).

---

## P. Catalog Status

| العمل | الحالة |
|---|---|
| CATALOG-1 / S1 | **completed** |
| CATALOG-2 / S2 | **completed** |
| CATALOG-2 / S3 | **completed** |
| CATALOG-2 / S4 | **COMPLETE (approved — P2 من خطة الخصوصية):** استكمال AT-24 خضراء ثم STOP + acceptance report |
| CATALOG-2 / S5 | **pending** |
| CATALOG-2 / S6 | **pending** |
| CATALOG-3 | **pending** |

**P1 — Samsung A16 4/128:** غير موجودة في الكتالوج. **لا يجوز** حلّ المشكلة بتركيبة مخمَّنة (6/128→4/128) أو أي تخمين RAM/Storage. المشكلة تبقى مفتوحة حتى إثبات رسمي موثّق.

**P2 — حالة S4 الملموسة (معتمدة الآن للاستكمال في P2 — قرار E-13):** يوجد عمل غير ملتزم في شجرة العمل (main، قبل `63c58ac`):
- `M src/components/catalog/CatalogCascadeSelector.tsx` (استبدال `catalog_brands_v1`/`catalog_models_v1` بـ loader، وتصحيح off-by-one في تدفق الخطوات)
- `M src/components/catalog/CatalogCascadeTypes.tsx` (حذف fallback `catalog_models_v1` في `getStockForModel`)
- `?? src/__tests__/s4-browse-catalog-source-gate.test.tsx` (بوابة AT-24 — كانت 2/3 حمراء بسبب التصفح المكسور، و1/3 خضراء)

هذه التعديلات **في شجرة العمل فقط ولم تُشغَّل البوابة بعدها** (AT-24 غير مثبتة خضراء بعد التطبيق). **القرار E-13: COMPLETE — تُستكمل في P2** (تشغيل AT-24، إصلاح ما يلزم، حفظ Inventory/Ads/Showroom وS1–S3، ثم STOP + acceptance report). بلا موديلات يدوية، بلا A16 4/128، وبلا CATALOG-3.

---

## Q. Supabase Decommission Candidates

| الجدول | الحساسية | المرشح |
|---|---|---|
| `devices` | عالية (بصمة + user_id) | **حذف/إيقاف** |
| `sessions` | عالية (قياسات معرفية) | **حذف/إيقاف** |
| `calibrations` | عالية | **حذف/إيقاف** |
| `analytics_events` | عالية (تتبع + UA + campaign) | **حذف/إيقاف** |
| `qr_codes`/`campaigns`/`placements`/`placement_history` | متوسطة (تتبع) | **حذف/إيقاف** |
| `surveys` | حساسة (صحة/نمط حياة) | **حذف/إيقاف** |
| `repair_*` | **حرجة (اسم/هاتف/عنوان/GPS/صور)** | **REASSESS (E-9)** — بوابة مستقلة لكل جدول/مفتاح مع سبب (حذف/إبقاء/تحويل) |
| `users` | عالية | تقليص الزائر الضمني؛ إبقاء admin فقط إذا لزم |
| `ads` | إعلانات صاحب المنصة | **KEEP (E-4)** — لا حذف افتراضي؛ شرط عدم تتبع الزائر |
| `system_settings` / `audit_log` / `job_assignments` | إدارية | إعادة تقييم |
| `inventory_items/...` (DRAFT) | — | لا يُنفَّذ أبداً — يُبقى أو يُزال من السجل |

**ملاحظة أمنية (بند 22):** RLS مفعّل على الجداول ومُحكَّم (phase1/phase2). بعد التقليل تبقى RLS، المنع من الوصول غير المصرح لما يبقى. `has_super_admin` استثناء عام موثَّق — يُراجع.

---

## R. Risk Register

| # | الخطر | الخطورة |
|---|---|---|
| R1 | بصمة جهاز + هوية زائر دائمة بدون موافقة | **CRITICAL** |
| R2 | قياسات معرفية (زمن رد فعل/تركيز) مرتبطة بهوية، بدون أساس قانوني | **CRITICAL** |
| R3 | تتبع سلوكي شامل (analytics ~70 حدث) | **HIGH** |
| R4 | نظام إصلاحات ببيانات شخصية حساسة (اسم/هاتف/عنوان/GPS/صور) | **HIGH** |
| R5 | تخزين بيانات خارج الجزائر (Supabase) بلا تقييم نقل عبر الحدود | **HIGH** |
| R6 | email حرفي في أحداث analytics | **HIGH** |
| R7 | بيانات تجارية حساسة في localStorage (أسعار، ذاكرة عملاء، IMEI) | **MEDIUM** |
| R8 | عرض بيانات منتج غير موثوقة (A16 4/128) كإعلان مضلل | **HIGH** (قانون المستهلك) |
| R9 | حقوق صور/شعارات غير موثقة | **MEDIUM** |
| R10 | مخزون/أسعار/عملاء على جهاز المتصفح بلا حماية | **MEDIUM** |
| R11 | سجلات/روابط إعدادات مكشوفة في السجل | **LOW** |
| R12 | محتوى رسالة الواتساب يضم سعر/مدينة (قرار تجاري، قد يعدّ تجارة إلكترونية) | **MEDIUM** |

---

## S. Proposed Future Architecture (مُحدَّثة وفق القرارات D1–D13)

```
SPA ثابت (GitHub Pages)
  ├── تجاري (الهدف الأساسي):
  │     Catalog JSON → UI (هاتف: صور/مواصفات/سعر/حالة)  ← SSOT (S1–S3)
  │     Inventory (localStorage) + Ads + Showroom/ProductDetails/Similar
  │     تحويل: زر WhatsApp → wa.me (رابط مباشر، لا تتبع)
  ├── Game كـ engagement hook (محلي/لحظي):
  │     Game UI + Engine (KEEP) — بلا persistent identity، بلا sessions/devices/calibrations
  │     Anonymous Top-10 Leaderboard (بيانات الحد الأدنى فقط، §G3)
  ├── مخزن العرض: localStorage فقط (تفضيلات + مخزون بائع + إعلانات صاحب المنصة)
  └── Auth: لا ضيف زائر، لا تصفح مرتبط بهوية؛ Admin فقط (إن لزم) معزول
لا: research, analytics/telemetry, QR attribution, repair/customer PII,
    devices/calibrations/sessions/surveys كمخزن دائم، AI coach، e-commerce
```

**مبدأ حاكم (D10):** `FOCUS may collect/store only data demonstrably necessary for: (A) running a required feature, (B) improving sales/trade, (C) managing products/inventory/ads, (D) system security/operations at minimum. Anything else is DELETE / DO NOT COLLECT.`

---

## T. Deletion / Decommission Plan (مقترح — تنفيذه في مراحل P3–P9 بعد موافقات المراحل)

> وفق القرارات D1–D13. التسلسل التفصيلي (P0–P11) في `privacy-data-minimization-decommission-plan.md` §20. هنا التوجيه العام:

1. **إيقاف الكتابة** قبل أي حذف: تعطيل guest-auth الضمني، telemetry، PersistenceProvider (sessions/devices/calibrations)، QR attribution. **اللعبة نفسها تبقى تعمل محلياً** (KEEP).
2. **حذف جداول Supabase** بترتيب الخطورة (sessions, devices, calibrations, analytics_events, repair_*, qr/campaigns, surveys) عبر Decommission: لكل جدول توثيق writers/readers/RLS/triggers/RPC/migrations ثم إيقاف وصول الكود ثم إسقاط البيانات بعد **إثبات صفر كتابة**.
3. **تنظيف localStorage**: المفاتيح غير الضرورية تُمسح من الكود (إزالة الكتابة) ثم إزالة البيانات المخزنة. مفاتيح اللعبة لحظية فقط.
4. **Anonymous Top-10 Leaderboard**: يُنفَّذ بـ minimal data + سياسة retention (§G3/§7) — مرحلة مستقلة P8.
5. **فصل الإدارة عن الزوار**: admin/researcher معزول تماماً؛ research يختفي مع مصادره.
6. **مراجعة حقوق المحتوى** (§O) وقرار مصادر الصور — قانونية.
7. **S4**: استكمال (P2) → STOP + acceptance report.
8. **إزالة المفاتيح الخارجية من السجل** (project URL، ملفات .log) إن أُقرَّ.
9. **Ads/Inventory/Catalog/WhatsApp**: لا تُمسَّ (KEEP). أي خطوة تؤثر عليها ⇒ **HARD STOP**.

---

## U. Items Requiring Legal Counsel (`LEGAL REVIEW REQUIRED`)

1. نطاق تطبيق قانون 18-07/25-11 على FOCUS كناشر عرض + مدير متجر، والتزامات التسجيل لدى ANPDP.
2. هل بصمة الجهاز + هوية الزائر الضمنية + القياسات المعرفية ترقى إلى "تنميط" وتستلزم DPIA/ترخيص مسبق.
3. شروط النقل عبر الحدود لبيانات الزوار (Supabase خارج الجزائر).
4. تصنيف FOCUS قانونياً: إعلان/وساطة/تجارة إلكترونية بموجب 18-05 — وما الإفصاحات المطلوبة إن أُعتبرت تجارة.
5. التزامات ARPCE/الترخيص إن وُجدت لخدمة تحوّل المستخدمين إلى WhatsApp.
6. ملكية/ترخيص صور الهواتف والشعارات والعلامات التجارية المعروضة.
7. مسؤولية المحتوى عن أخطاء البيانات (A16 4/128) بموجب 09-03/18-05.
8. أثر بيانات "الصحة/السلوك المعرفي" (زمن رد الفعل) إن اعتُبرت حساسة بموجب التعديل 2025.
9. حفظ بيانات الإصلاحات (عناوين، GPS، صور) والاحتفاظ بها.
10. النصوص الجزائرية التطبيقية لقوانين 18-07/25-11/18-05/09-03 — تأكيد من النص الرسمي (JORADP/anpdp.dz).

---

## V. Items Requiring Owner Approval — ✅ RESOLVED (2026-08-07)

| القرار | النتيجة المعتمدة | مرجع |
|---|---|---|
| النموذج المستهدف (تصفح→واتساب فقط) | ✅ اعتمد + Game كـ engagement hook | D1/D6 |
| اللعبة | ✅ **KEEP** (لا حذف UI/Engine/مسار التشغيل) | D1 |
| بيانات اللعبة الشخصية (sessions/devices/calibrations/history/telemetry/QR attribution/user_id) | ✅ **DELETE/إيقاف** | D2 |
| Anonymous Top-10 Leaderboard | ✅ **KEEP** كبيانات حد أدنى | D3 |
| Analytics/telemetry | ✅ حذف/إيقاف (ماعدا اللازم تشغيلياً وبعد إدراجه بالـ Inventory) | D2/D10/D11 |
| QR attribution المرتبط بالمستخدم | ✅ إزالة | D2 |
| نظام الإصلاحات/العملاء (PII) | ⏳ **DELETE/REASSESS** بوابة مستقلة لكل جدول/مفتاح | D9 |
| المخزون/الأسعار/ذاكرة العملاء في localStorage | ✅ Inventory **KEEP**؛ customer-memory/device-ledger **REASSESS** | D5/D9 |
| Ads | ✅ **KEEP** (بدون تتبع زائر) | D4 |
| S4 | ✅ **COMPLETE** (استكمال) | D7 |
| صور/شعارات (تعاقد/مصادر) | ⏳ مراجعة حقوق (§O) — قانونية | D13 |
| الاستشارة القانونية قبل أي حذف | ⏳ مطلوبة — لا يُكتب "متوافق قانونياً" | D13 |

---

## Existing Work — Preserve / Pause / Reassess (مُحدَّثة)

| العمل | القرار |
|---|---|
| Phase 3A | محفوظ ومغلق |
| Phase 3B | محفوظ ومغلق |
| CATALOG-1 / S1 | محفوظ |
| CATALOG-2 / S2 | محفوظ |
| CATALOG-2 / S3 | محفوظ |
| CATALOG-2 / S4 | ✅ **COMPLETE — موافق عليه** (استكمال AT-24 → خضراء → STOP + acceptance report) |
| CATALOG-2 / S5 | Pending |
| CATALOG-2 / S6 | Pending |
| CATALOG-3 | **DEFERRED** (لا Data Acquisition قبل اعتماد مستقل) |
| Game UI / Engine / Run-path | **KEEP** (engagement hook) |
| Game personal data (sessions/devices/calibrations/history/telemetry/QR attribution) | **DELETE/إيقاف** |
| Anonymous Top-10 Leaderboard | **KEEP** (بيانات حد أدنى §G3) |
| Analytics | **Reassess → DELETE** |
| QR tracking | **DELETE** (attribution المرتبط بالمستخدم) |
| Payment / Installment | **Must remain absent** (موجود أصلاً) |

---

## OPEN WORK REGISTER — DO NOT FORGET (مُحدَّثة بعد القرارات D1–D13)

> لا وسم ✅ على أي بند لم يُنفَّذ.

- [ ] Privacy/Data Minimization Reset — Discovery (مكتملة: هذه الوثيقة + decommission-plan)
- [x] **قرارات المالك النهائية (2026-08-07) — مثبتة في DECISION LOG (D1–D13)**
- [x] P0 freeze + snapshot (شجرة العمل مجمّدة؛ لا Commits)
- [x] P1 documents updated (هذه الوثيقة + decommission-plan)
- [ ] **P2 — S4 استكمال** (AT-24 خضراء → STOP + acceptance report)
- [ ] P3 — إيقاف collectors/writes غير الضرورية
- [ ] P4 — إزالة بيانات اللعبة الشخصية (مع بقاء اللعبة نفسها)
- [ ] P5 — إزالة analytics/telemetry/QR tracking
- [ ] P6 — Reassess repair/customer data (بوابة D9 لكل جدول/مفتاح)
- [ ] P7 — Preservation: Ads + Inventory + Catalog (KEEP — لا تمس)
- [ ] P8 — Anonymous Top-10 Leaderboard (minimal data + retention)
- [ ] P9 — Database cleanup/drop بعد إثبات صفر كتابة
- [ ] P10 — Full verification (gates + typecheck + lint + build + suite)
- [ ] P11 — Independent review report
- [ ] Research Console decommission (مرتبط بـ P4/P5)
- [ ] QR attribution إزالة (P5)
- [ ] Device telemetry removal (بصمة الجهاز) (P4)
- [ ] Supabase RLS cleanup على ما يبقى
- [ ] RPC cleanup (`lookup_scan_context`, `lookup_campaign_by_short_code(_v2)`, `increment_qr_counter`…)
- [ ] Trigger cleanup
- [ ] Storage bucket cleanup (حسب مصير Ads/Inventory — قرار)
- [ ] Payment/order/installment verification (نتيجة سلبية مؤكدة — تُحافظ)
- [ ] WhatsApp-only flow verification (بلا تتبع)
- [ ] Image/content rights review (قانوني)
- [ ] إزالة عنوان المشروع/ملفات .log من السجل (قرار)
- [ ] Catalog S5
- [ ] Catalog S6
- [ ] CATALOG-3 (**DEFERRED** — بانتظار اعتماد مستقل)
- [ ] Samsung A16 4/128 verification (لا تخمين)
- [ ] Final legal review where required (§U/D13)

---

## Approval Gate

```
STATUS: DISCOVERY COMPLETE + FINAL APPROVAL RECEIVED (2026-08-07)
DECISIONS LOCKED: GAME=KEEP · GAME PERSONAL DATA=DELETE · TOP-10=KEEP(minimal)
                   ADS=KEEP · INVENTORY=KEEP · CATALOG=KEEP · S4=COMPLETE · CATALOG-3=DEFERRED

EXECUTION: NOT STARTED (P0 freeze done, P1 documents updated)
NO CODE CHANGES YET · NO DATABASE CHANGES · NO DELETIONS · NO MIGRATIONS · NO COMMITS
NEXT: P2 = S4 → then P3…P11 each with its own acceptance gate (see decommission-plan §20)
```

### الإجابات المباشرة على أسئلتك (مُحدَّثة وفق القرارات D1–D13)

| السؤال | الجواب |
|---|---|
| ماذا يجب حذفه؟ | بيانات اللعبة الشخصية (sessions/devices/calibrations/history/telemetry/QR attribution/user_id)، analytics/telemetry، QR tracking، بيانات إصلاحات/عملاء PII (بعد بوابة D9)، ذاكرة العملاء، device-ledger/IMEI |
| ماذا يجب إبقاؤه؟ | اللعبة نفسها (UI/Engine/مسار تشغيل) كـ engagement hook، Anonymous Top-10، بيانات المنتج (ماركة/موديل/نسخة/سعر/حالة/صور)، مخزون البائع، Ads، WhatsApp handoff، admin منفصل، بيانات إدارة صاحب المنصة |
| ماذا يجب إيقافه؟ | كتابة الجداول الشخصية (sessions/devices/calibrations/analytics) أولاً، ثم خدمات research/BI/telemetry المرتبطة، ثم حذف البيانات بعد إثبات صفر كتابة |
| ماذا يحتاج مراجعة قانونية؟ | §U بالكامل + D13 — لا يُكتب "متوافق قانونياً" إلا بعد المراجعة |
| ماذا يحتاج قراراً تجارياً؟ | بقاء ذاكرة العملاء/device-ledger/نظام الإصلاحات (D9)، محتوى رسالة الواتساب |
| ما الذي يمكن تنفيذه بأمان؟ | (بعد موافقات المراحل) S4 استكمال → إيقاف الكتابة → إزالة التتبع → حذف البيانات بالترتيب §20 في خطة الـ decommission — كل مرحلة بوابة قبول مستقلة |
| ما الذي يجب ألا يلمسه المطور؟ | كتالوج JSON (لا تركيبات مخمَّنة)، المدفوعات/التقسيط (تبقى غائبة)، Git history، اللعبة (لا حذف)، Ads/Inventory/Catalog/WhatsApp (لا تعطيل) |
| ترتيب التنفيذ المقترح | P0–P11 (انظر decommission-plan §20) |
| Acceptance Gates لكل مرحلة | كل مرحلة ببوابة: لا كتابة جديدة → لا وصول → حذف → تحقق |
| تقدير المخاطر لكل تغيير | §R |
| Hard Stop | أي أثر على Ads/Inventory/Catalog/WhatsApp/Admin/M1/M2/S1–S3 ⇒ توقف فوراً بلا workaround/بلا bypass، قدّم evidence وانتظر القرار |

---

### ملاحظة حول شجرة العمل (P0 freeze — snapshot)

`git status` الحالي (قبل أي إجراء تنفيذي):
- `M src/components/catalog/CatalogCascadeSelector.tsx` — **تعديل S4 (معتمد للاستكمال في P2)**
- `M src/components/catalog/CatalogCascadeTypes.tsx` — **تعديل S4**
- `?? src/__tests__/s4-browse-catalog-source-gate.test.tsx` — **بوابة S4 (AT-24)**
- `?? docs/audits/privacy-data-minimization-discovery.md` — هذه الوثيقة
- `?? docs/audits/privacy-data-minimization-decommission-plan.md` — خطة الـ decommission

لم أُعدّ أي ملف بعد هذا القرار. P2 (S4) يبدأ فقط بأمر صريح بعد تثبيت هذه الوثائق.

# P5 RED VERIFICATION — TELEMETRY & QR REMOVAL (DISCOVERY + GATES)

المعتمد: المالك (P5 — APPROVED, RED DISCOVERY/GATES ONLY) | الحالة: **RED — READY FOR OWNER SCOPE REVIEW** | تاريخ التحقق: 2026-08-08

---

## A — Baseline

- HEAD: `eedcf926ad16380ede755bb799341f6ba082bb8c` (`feat(privacy): complete P4 game personal-data minimization`)
- الفرع: `main` | `git status -sb`: `## main...origin/main` — نظيف (untracked فقط: تقارير + بوابات P4/P5)
- بوابة P5 الجديدة: `src/__tests__/privacy/p5-telemetry-qr-removal-gate.test.ts` (untracked، **لم يُمسّ أي production code**)

## B — Scope (المطلوب: إزالة Analytics/Telemetry/QR بالكامل من الكود)

P5 = حذف البنية التحتية للتتبع/التحليلات (telemetry service + analytics events/tracker)، إزالة كل استدعاءات `track()` من الكود، إزالة QR campaign/attribution من شجرة التشغيل (START_QR_FLOW + attribution state + qr writers)، مع الحفاظ الكامل على الميزات المحمية (Repair/WhatsApp/Showroom/Game engine/…).

## C — RED DISCOVERY (الجرد الكامل)

### C.1 البنية التحتية للتتبع (تُحذف بالكامل)
| الملف | الوظيفة |
|---|---|
| `src/core/telemetry/index.ts` | TelemetryService + createTelemetryService + global (getGlobalTelemetry/resetGlobalTelemetry) |
| `src/core/analytics/events.ts` | EventTypes (~70 حدثاً) + AnalyticsEventType |
| `src/core/analytics/tracker.ts` | 13 track* helper (trackRoundStarted/trackLampAppeared/…/trackCalibrationCompleted) |
| `src/core/index.ts` (أسطر 92-95) | re-export telemetry |

### C.2 QR infrastructure
| الملف | التصنيف |
|---|---|
| `src/core/qr/campaign.ts` | كاتب `analytics_events` + `qr_codes` (attribution) — **إزالة** |
| `src/core/qr/referral.ts` | كاتب `analytics_events` (referral) — **إزالة** |
| `src/core/qr/deeplink.ts` | parseDeepLink + createLandingSession (attribution) — **إزالة** |
| `src/core/qr/consent.ts` | سجلات موافقة بمعرّف مستخدم (in-memory) — **إزالة** |
| `src/core/qr/share.ts` | مشاركة (wa.me/t.me/… — ميزة وليس تتبع) — **قرار المالك (D4)** |
| `src/core/qr/generate.ts` | توليد صورة QR عبر `qrcode` (يستخدمه sticker-engine + ShareScreen) — **قرار المالك (D2/D4)** |
| `src/core/index.ts` (أسطر 97-126) | re-export كل وحدات qr |

### C.3 استدعاءات track() في production (27 ملفاً — تُستأصل الاستدعاءات، تُحفظ الميزة)
```
src/store/navigation.tsx                      (emitNavigationAnalytics: navigation_push/replace/pop/screen_view + initial)
src/core/navigation/back-dispatcher.ts        (back_pressed/back_blocked)
src/core/navigation/BackProvider.tsx          (track wiring)
src/core/auth/AuthProvider.tsx                (setUserId — سياق التتبع)
src/hooks/useSmartWhatsApp.ts                 (whatsapp_sent/exit_* /whatsapp_fallback_shown/whatsapp_message_copied)
src/services/whatsapp-service.ts              (exit_* /whatsapp_template_selected/whatsapp_clicked)
src/services/whatsapp-message.ts              (whatsapp_clicked)
src/services/repair/repair-engine.ts          (repair_requested/quote_* /courier_assigned + generic)
src/screens/landing/LandingScreen.tsx         (campaign_detected/landing_loaded/game_started)
src/screens/home/HomeScreen.tsx               (game_started/phone_service_opened)
src/screens/message/PreGameMessageScreen.tsx  (game_intro_shown)
src/screens/consent/ConsentScreen.tsx         (consent_granted/consent_withdrawn)
src/screens/register/RegisterScreen.tsx       (register_cta_clicked/auth_registered/registration_completed)
src/screens/share/ShareScreen.tsx             (qr_generated/share_clicked)
src/screens/calibration/CalibrationScreen.tsx (tracker: calibration_started/completed)
src/screens/auth/LoginScreen.tsx              (tracker: login)
src/screens/game/GameScreen.tsx               (tracker: round/lamp/miss — round-level، لم يمسها P4)
src/screens/phone-services/CustomerPhoneFlow.tsx (tracker: device/trade/buy/sell/exchange)
src/components/showroom/ShowroomControls.tsx  (showroom_filter_changed/sort_changed)
src/components/showroom/ProductImageGallery.tsx (phone_gallery_swipe/phone_image_zoom)
src/components/showroom/PhoneShowroom.tsx     (phone_card_clicked)
src/screens/showroom/ProductDetailsScreen.tsx (phone_details_opened/closed)
src/research-console/pages/health/AnalyticsHealth.tsx  (قراءات analytics_events — Research)
```
> ملاحظة: ملفات i18n (ar/en/fr/tr) سقطت في الفحص كناتج إيجابي كاذب (`'live.eventTypes'`) — لا تستخدم telemetry، خارج النطاق.

### C.4 وصول analytics_events / qr_codes (كتّاب وقُرّاء)
| الملف | النوع |
|---|---|
| `src/core/supabase/data-service.ts` | كاتب+قارئ: trackEvent/getEvents/countQrScans/getQrScansByCampaign/Campaigns CRUD/QRCode CRUD/placements/lookupScanContext/AnalyticsEvent+Campaign+QRCode interfaces |
| `src/core/qr/referral.ts` + `campaign.ts` | كتّاب analytics_events/qr_codes |
| `src/core/research/api-supabase.ts` | قارئ analytics_events + qr_codes (Research) |
| `src/business-intelligence/api.ts` | قارئ analytics_events (BI) |
| research-console pages (LiveDashboard/AnalyticsHealth/Campaign*/Journey*/ConversionIntelligence/FunnelComparator/BusinessInsights/AcquisitionDashboard) | قرّاء analytics_events/qr_codes (Research/BI) |

### C.5 استهلاك مكتبة `qrcode`
- `src/components/repair/RepairQR.tsx` — **KEEP (Repair محمية، library تبقى)**
- `src/core/qr/generate.ts` — يُحذف مع QR إلا إذا بقي sticker يحتاجها
- research-console campaign pages (QRDesigner/PlacementsTab/CampaignWizard/CampaignDetailView) — Research، قرار المالك

### C.6 اختبارات تتأثر (تُكيَّف/تُحذف ضمن P5)
- telemetry: `src/__tests__/telemetry/telemetry.test.ts` (حذف)
- navigation: `navigation-telemetry.test.tsx` (حذف/تحويل)، `exit-telemetry.test.tsx`، `phase3-exits.test.tsx`، `error-boundary-reset.test.tsx`، `back-provider.test.tsx`، `navigation-reducer.test.ts`، `route-params.test.ts`، `App.test.tsx` (START_QR_FLOW)
- showroom: 5 ملفات (إزالة mock telemetry)
- whatsapp: `phone-action-whatsapp.test.ts` (إزالة mock)
- s3: `s3-cross-brand-ui-forwarding.test.tsx`
- qr: `src/__tests__/qr/*` (6 ملفات — حذف)
- privacy: `p3-stop-write-gate.test.ts` (PG-04 يستورد telemetry — إعادة صياغة لافتراض الغياب)
- KEEP: `RepairQR.test.tsx`، `session/lifecycle.test.ts` (تعليق فقط)

## D — RED GATES RESULTS

```
Test Files  1 failed (1)
Tests       7 failed (7) | 5 passed (5)   (12)
Duration    0.19s
```

## E — PASS/FAIL لكل PG

| PG | التعريف | النتيجة | الدليل |
|---|---|---|---|
| **PG-51** | telemetry service removed (`core/telemetry` غير موجود) | **FAIL (RED)** | `src/core/telemetry/index.ts` موجود (142 سطراً، enable/createDisabledTelemetry) |
| **PG-52** | analytics events/tracker removed | **FAIL (RED)** | `events.ts` (121 سطراً) + `tracker.ts` موجودان |
| **PG-53** | صفر استدعاءات telemetry في production | **FAIL (RED)** | 27 ملفاً + ~50 استدعاء track/import |
| **PG-54** | لا START_QR_FLOW ولا isQrFlow/campaignId/placementId | **FAIL (RED)** | `navigation.tsx:96,224,284` + AppState سطور 77-79 |
| **PG-55** | core/qr campaign/referral/deeplink/consent محذوفة | **FAIL (RED)** | 4 ملفات موجودة |
| **PG-56** | data-service بلا analytics_events/qr_codes/campaigns | **FAIL (RED)** | ~30 موضعاً (trackEvent:200، countQrScans:266، lookupScanContext:532، QRCode:157…) |
| **PG-57** | ShareScreen بلا QR generation/tracking | **FAIL (RED)** | `ShareScreen.tsx:23,25,41` (generateQRDataUrl + qr_generated + share_clicked) |
| **PG-58** | KEEP: RepairQR + qrcode library | **PASS (GREEN)** | `RepairQR.tsx` يستورد `qrcode` ويستدعي toDataURL |
| **PG-59** | KEEP: WhatsApp handoff المباشر | **PASS (GREEN)** | `useSmartWhatsApp.ts` → buildWhatsAppUrl + window.location.href |
| **PG-60** | KEEP: game engine + session in-memory | **PASS (GREEN)** | engine/* موجودة؛ session/service بلا user_id |
| **PG-61** | KEEP: catalog/inventory/ads/showroom/whatsapp دون تعديل | **PASS (GREEN)** | git diff HEAD = صفر (لا تغييرات P5 بعد) |

**خلاصة:** بوابات الإزالة السبعة **RED صحيحة** (التتبع/QR ما زالت في الكود كما هو متوقع)؛ بوابات الحماية الخمس **GREEN** (نطاق P5 متوافق مع KEEP surfaces).

## F — التغيرات المقترحة في P5 (عند التنفيذ بعد اعتماد النطاق)

```
حذف:   src/core/telemetry/index.ts
       src/core/analytics/events.ts
       src/core/analytics/tracker.ts
       src/core/qr/campaign.ts, referral.ts, deeplink.ts, consent.ts          (قرار D2/D4 على generate.ts + share.ts)
       src/__tests__/telemetry/telemetry.test.ts
       src/__tests__/qr/*.test.ts (6)
تعديل: 27 ملف production (إزالة استدعاءات track/import فقط — الميزة تُحفظ)
       src/store/navigation.tsx  (START_QR_FLOW + isQrFlow/campaignId/placementId + emitNavigationAnalytics)
       src/core/index.ts         (إزالة re-exports telemetry + qr)
       src/screens/landing/LandingScreen.tsx  (إزالة deeplink attribution)
       src/screens/share/ShareScreen.tsx      (إزالة QR، بقاء أزرار المشاركة — قرار D4)
       src/core/supabase/data-service.ts      (إزالة analytics/qr/campaign surface)
       اختبارات C.6
```

## G — قرارات المالك المطلوبة قبل التنفيذ

- **D1 — Research/BI readers:** صفحات/دوال قراءة `analytics_events`/`qr_codes` في `business-intelligence/api.ts` + `core/research/api-supabase.ts` + صفحات research-console (LiveDashboard/AnalyticsHealth/Campaigns*/Journey*/Conversion/Funnel/BusinessInsights) هي **Research/BI محمية**. خياران: (أ) إزالتها مع P5 (يكسر حاجز "لا تلمس Research/BI")، أو (ب) تأجيلها إلى P6 REASSESS مع إبقاء الدوال القارئة (يبقي PG-56 أحمر جزئياً). **التوصية: (أ) الإزالة الكاملة بما أن هدف P5 هو إزالة التحليلات بالكامل، مع توثيق إعادة التقييم.**
- **D2 — Sticker QR:** `sticker-engine.ts` يستخدم `generateQRDataUrl`. Sticker ليس في القائمة المحمية. خياران: (أ) إزالة QR من sticker أيضاً (حذف generate.ts)، أو (ب) إبقاء `core/qr/generate.ts` + `qrcode` لميزة sticker (يبقي جزءاً من QR). **التوصية: (أ) — sticker QR هو QR أيضاً ضمن "إزالة QR بالكامل".**
- **D3 — WhatsApp/Showroom/Repair telemetry calls:** نزع استدعاءات track فقط من ملفات محمية (whatsapp-service/whatsapp-message/useSmartWhatsApp/repair-engine/showroom components/ProductDetailsScreen) دون لمس منطق الميزة — نفس نمط P4 المسموح. **التوصية: نعم، النزع كامل.**
- **D4 — share.ts (مشاركة) وgenerate.ts:** ShareScreen يحتفظ بأزرار المشاركة (ميزة) مع حذف QR-generation؟ أم حذف الشاشة كلها؟ **التوصية: إبقاء المشاركة (wa.me/t.me/mailto) وحذف QR فقط.**
- **D5 — consent.ts:** **التوصية: حذف (سجلات userId غير مستخدمة إنتاجياً).**

## H — محمي ولا يُمَس في P5

- Game engine + gameplay (`core/engine/*`, `core/scientific/*`)، شاشات اللعبة (إلا استدعاءات track)
- Ads / Inventory / Catalog SSOT / Showroom / Similar / WhatsApp المباشر / Theme/Language (منطق الميزة محفوظ)
- Repair/Customer (ميزة كاملة + RepairQR + مكتبة `qrcode`)
- AI Coach / users / system_settings / audit_log / job_assignments
- `package.json`: مكتبة `qrcode` تبقى (يستخدمها RepairQR) — تُزال فقط إذا قررت D2 إزالة كل QR بما فيه Repair (غير موصى به)

## I — SQL / Migration / DB

| الفعل | الحالة |
|---|---|
| SQL / Migration / DROP / ALTER / DELETE على قاعدة البيانات | **NO** |
| P5 = code-level فقط (إزالة كتابات/قراءات analytics من الكود دون لمس الجداول) | مؤكد |

---

## الختام

RED DISCOVERY اكتملت: جرد كامل للبنية التحتية (telemetry/analytics/qr) + 27 ملفاً يحوي استدعاءات track + وصول analytics_events/qr_codes + 27 ملف اختبار متأثر. بوابة P5: **7 RED (PG-51..57) / 5 GREEN (PG-58..61)**. النطاق المقترح متوافق مع KEEP surfaces، لكنه يتطلب قرارات المالك D1–D5 (خصوصاً D1: Research/BI readers). لم يُعدّل أي production code، لا SQL، لا commit، لا push.

**HARD STOP — READY FOR OWNER SCOPE REVIEW (D1–D5)**

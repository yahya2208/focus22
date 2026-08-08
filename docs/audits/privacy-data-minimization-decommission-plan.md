# FOCUS — Privacy & Data Minimization: Decommission Architecture Plan (P0/P1/P2)

**التاريخ:** 2026-08-07
**الفرع:** `main` — آخر commit: `63c58ac` (S3)
**نوع الوثيقة:** Discovery (P0) → Decommission Architecture Plan (P1) → Acceptance Gates Design (P2) → APPROVAL (STOP)
**حالة العمل:** `STATUS: DISCOVERY + PLAN COMPLETE + FINAL APPROVAL (2026-08-07) — P0 done (freeze), P1 documents updated — NO CODE/DATABASE/DELETION/MIGRATION/COMMIT`

> يعتمد على: `docs/audits/privacy-data-minimization-discovery.md` (Baseline Discovery Report).
> التزامات هذه المرحلة: ✅ لا تعديل كود · ✅ لا حذف · ✅ لا Migration · ✅ لا تشغيل أوامر seed · ✅ لا Commit · ✅ لا Push.
> مخرجات هذه المرحلة: **تحديث الوثائق فقط (P1)**. أي تنفيذ يبدأ فقط بأمر صريح مرحلةً مرحلة، وكل مرحلة ببوابة قبول مستقلة.

---

## ⚠️ DECISION LOG — FINAL APPROVAL (2026-08-07) — يُثبَّت ولا يُعاد تفسيره

> **نسخة مكررة للمرجعية الكاملة:** القرارات الأصلية (D1–D13) في `privacy-data-minimization-discovery.md` §DECISION LOG. هنا الملخص المعملي الموجَّه للتنفيذ:

| # | البند | القرار المثبت | أثر التنفيذ |
|---|---|---|---|
| E-1 | **GAME** | **KEEP** | لا حذف لـ Game UI/Engine/مسار التشغيل؛ تُستخدم كـ engagement hook. حذفها مسموح فقط إن كان ضرورياً تقنياً لإزالة التخزين/التتبع |
| E-2 | **GAME PERSONAL DATA** | **DELETE** | إيقاف/إزالة: guest identity للعبة، sessions، devices/fingerprinting، calibrations المخزنة، reaction history، focus/fatigue/consistency history، telemetry، click/screen/back tracking، analytics المرتبطة بالمستخدم، QR attribution المرتبط بالمستخدم، research/BI، أي user_id يربط النتيجة بشخص، بيانات جهاز غير ضرورية للتشغيل اللحظي |
| E-3 | **ANONYMOUS TOP-10 LEADERBOARD** | **KEEP (minimal)** | score/best_time + rank + game_version (إن لزم) + created_at (إن لزم فنياً) فقط. بلا name/email/phone/user_id/IP/fingerprint/UA/GPS/advertising ID/cookies/history/behavioral profile. خارج Top-10 لا يُخزَّن؛ الخارجة تُحذف نهائياً |
| E-4 | **ADS** | **KEEP** | لا حذف افتراضي؛ التأكد فقط من عدم جمع بيانات شخصية عن الزائر. Ads content ≠ user tracking |
| E-5 | **INVENTORY** | **KEEP** | بيانات صاحب المنصة (مخزون/أسعار/إدارة تجارة) تبقى |
| E-6 | **CATALOG** | **KEEP** | Catalog + S1–S3 + موديلات/نسخ/أسعار/صور/Showroom/Similar/Favorites محلية/WhatsApp handoff |
| E-7 | **S4** | **COMPLETE (APPROVED)** | P2: استكمال AT-24 خضراء على أساس Canonical/loader، بلا موديلات يدوية، بلا A16 4/128، يحافظ على Inventory/Ads/Showroom. ثم STOP + acceptance report |
| E-8 | **CATALOG-3** | **DEFERRED** | لا Data Acquisition قبل اعتماد مستقل |
| E-9 | **REPAIR/CUSTOMER PII** | **DELETE/REASSESS** | بوابة مستقلة لكل جدول/مفتاح مع سبب (KEEP/DELETE/REASSESS) |
| E-10 | **DATA MINIMIZATION RULE** | **معتمدة رسمياً** | (A) تشغيل ميزة، (B) تحسين بيع/تجارة، (C) إدارة منتجات/مخزون/إعلانات، (D) أمن/تشغيل بحد أدنى. غير ذلك DELETE/DO NOT COLLECT |
| E-11 | **NO SILENT COLLECTION** | ممنوع | أي collector جديد يُدرج في Data Inventory أولاً (purpose/fields/retention/storage/access/deletion) |
| E-12 | **ANTI-CHEAT** | بلا tracking | أقل آلية، غير مربوطة بهوية، تمر بمراجعة Data Minimization، لا fingerprint دائم |
| E-13 | **LEGAL** | لا ادعاء توافق | تبقى `LEGAL REVIEW REQUIRED`/`UNKNOWN` كما هي؛ يُكتب فقط "Technical data minimization implemented; legal validation remains required where marked." |

> **ملاحظة تطبيقية حرجة:** الجداول/الخدمات أدناه التي كانت مُصنَّفة "DELETE" بوصفها لعبة **تُعاد قراءتها الآن**: حذف **بيانات** اللعبة (sessions/devices/calibrations/analytics/QR attribution) لا يعني حذف **اللعبة**. الأقسام 3/4/10/11/12/13/14 تُقرأ في ضوء E-1…E-13.

---

## 0. ملخص تنفيذي

- **النموذج المستهدف (المعتمد 2026-08-07):** زائر → تصفح هواتف (بيانات منتج) → زر WhatsApp → `wa.me` مباشر، **مع اللعبة كـ engagement hook (محلية/لحظية، بلا بيانات شخصية)** و**Anonymous Top-10 Leaderboard (بيانات حد أدنى)**.
- **اللعبة KEEP (E-1):** Game UI + Engine + مسار التشغيل تبقى. **بيانات اللعبة الشخصية DELETE (E-2):** sessions/devices/calibrations/history/telemetry/QR attribution/user_id تُزال.
- **Commercial core KEEP (E-4/E-5/E-6):** Catalog + S1–S3 + Inventory + Ads + Showroom + WhatsApp. لا حذف افتراضي للإعلانات.
- **DELETE/REASSESS (E-9):** بيانات إصلاحات/عملاء PII عبر بوابة مستقلة لكل جدول/مفتاح — لا حذف عشوائي.
- **S4 = COMPLETE (E-7)** و**CATALOG-3 = DEFERRED (E-8)**.
- **قاعدة الحسم (E-10):** `FOCUS may collect/store only data demonstrably necessary for (A) running a required feature, (B) improving sales/trade, (C) managing products/inventory/ads, (D) system security/operations at minimum. Anything else is DELETE / DO NOT COLLECT.`
- **لا يوجد التزام في هذه الوثيقة بأي تنفيذ.** القرارات أدناه مثبتة لكن التنفيذ **مرحلة بمرحلة** (P2–P11) وبوابة قبول لكل مرحلة، ويبدأ فقط بأمر صريح.
- **التنبيه القانوني ثابت (E-13):** الخطة ليست بديلاً عن مراجعة قانونية؛ تبقى `LEGAL REVIEW REQUIRED`/`UNKNOWN` كما هي. لا يُكتب "متوافق قانونياً"؛ يُكتب فقط: "Technical data minimization implemented; legal validation remains required where marked."

---

## 1. النموذج المستهدف (Target Architecture) — المعتمد (E-1…E-13)

```
SPA ثابت (GitHub Pages)
  ├── تجاري (الأساس):
  │     Catalog JSON (src/catalog/brands/*.json → loader) → UI
  │       (ماركة/موديل/نسخة/سعر/حالة/صور)  ← SSOT (S1–S3)
  │     Inventory (localStorage للبائع) + Ads (بلا تتبع زائر) + Showroom/Similar
  │     تحويل: زر WhatsApp → wa.me (رابط مباشر، لا تتبع، لا تخزين)
  ├── Game (engagement hook — محلي/لحظي):
  │     Game UI + Engine + مسار التشغيل (KEEP)
  │     بلا persistent identity · بلا sessions/devices/calibrations مخزنة
  │     Anonymous Top-10 Leaderboard (score/rank/game_version/created_at-إن لزم)
  ├── مخزن محلي (localStorage): تفضيلات عرض + مخزون بائع + بيانات إدارة صاحب المنصة
  └── Admin معزول: لا guest auth، لا role عام؛ إن لزم إدارة، حساب محدد بمعزل.
لا: research, analytics/telemetry, QR attribution, repair/customer PII,
    devices/calibrations/sessions/surveys كمخزن دائم, AI coach, e-commerce (يبقى غائباً)
```

---

## 2. مصفوفة التصنيف الكاملة (Classification Matrix) — حتى مستوى المكوّن/المفتاح/الجدول/RPC

> الأعمدة العشرة المطلوبة: `Data/Feature` · `Where collected` · `Where stored` · `Why exists` · `Needed for sales?` · `Personal?` · `Sensitive?` · `Legal risk` · `Keep/Delete/Transform` · `Evidence`.

### 2.1 بيانات الزائر/التعقيد (الجهاز، الهوية، اللعبة، التتبع)

| Data/Feature | Where collected | Where stored | Why exists | Needed for sales? | Personal? | Sensitive? | Legal risk | Keep/Delete/Transform | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Guest auth تلقائي (`signInAnonymously`) → `user_id` دائم | `src/core/auth/AuthProvider.tsx:48` + `src/core/auth/index.ts` | Supabase `auth.users` | "هوية الجلسة" قديمة لربط اللعبة/التتبع | **NO** | **YES** (معرّف دائم مرتبط بجهاز/سلوك) | NO | مرتفع (هوية ضمنية بلا موافقة؛ تنميط) | **DELETE** (إزالة الإنشاء التلقائي؛ اللعبة/التصفح بلا user_id) | grep `signInAsGuest`/`signInAnonymously` |
| بصمة الجهاز الكاملة | `src/core/device/index.ts` (يُستدعى في `PersistenceProvider` و`silent.ts` و`calibration-cache`) | Supabase `devices` + LS `focus_calibration_cache` | قياسات اللعبة/المعايرة | **NO** | **YES** | NO (لكنها أداة تعقّب) | مرتفع جداً (Fingerprinting + ربط بهوية) | **DELETE** (اللعبة تبقى تعمل بدون بصمة دائمة) | `collectDeviceProfile()` + insert `devices` في `PersistenceProvider.tsx:282-305` |
| قياسات معرفية (RTs/درجات/تعب/ثبات) | `src/core/engine/*` + `src/core/session/service.ts` → أحداث session | Supabase `sessions` (JSONB `measurements`/`scientific_results`) + LS | بحث علمي سابق | **NO** | **YES** (إن رُبطت بـ user/device) | **YES** (بيانات سلوكية/معرفية) | حرج (قياسات مرتبطة بهوية، قد ترقى لحساسة + تنميط) | **DELETE التخزين الدائم** (الحساب لحظي أثناء اللعب فقط) | upsert في `PersistenceProvider.tsx:91-122` |
| المعايرة | `src/core/calibration/silent.ts` + `runSilentCalibration()` في `App.tsx:224` | Supabase `calibrations` + LS `focus_calibration_profile`/`focus_calibration_cache` | تعويض زمن الشاشة للعبة | **NO** | **YES** (device-linked) | NO | مرتفع (إحداثيات أداء الجهاز) | **DELETE التخزين الدائم** (تُحسب لحظياً عند الحاجة) | insert في `PersistenceProvider.tsx:333-348` |
| ~70 نوع حدث telemetry/analytics | `src/core/analytics/*` + `src/core/telemetry/*` + `src/core/events/index.ts` + `data-service.ts` | Supabase `analytics_events` (user/session/device/campaign_id/UA) | لوحات M1/M2/Research | **NO** | **YES** | NO | مرتفع (تتبع سلوكي شامل) | **DELETE** | `app_opened` في `App.tsx:318-322` + `setupSessionTelemetry()` |
| **اللعبة نفسها: Game UI/Engine/مسار التشغيل** | `src/core/engine/*` (reaction/consistency/fatigue/scoring) + شاشات اللعبة + store/navigation | ذاكرة لحظية (KEEP) | engagement hook (E-1) | **YES** (جذب ثم توجيه للعرض/WhatsApp) | **NO** (بدون user_id) | NO | منخفض | **KEEP** | القرار E-1 |
| **Anonymous Top-10 Leaderboard** | جديد (P8) | تخزين حد أدنى (score/rank/game_version) | engagement (E-3) | **YES** | **NO** (مجهول بالتصميم) | NO | منخفض | **KEEP (minimal)** | القرار E-3 + §7 retention |
| `focus_achievements` / `focus_daily_challenge` / `focus_daily_completed` | `src/core/gamification/*` | LS | لعبة | محلي مجهول | **NO** | NO | منخفض | **REASSESS** (إن كانت محلية مجهولة بلا هوية، قد تبقى كجزء من اللعبة) | مفتاحا LS |
| `focus_sessions` / `focus_sessions_v2` | بنية مستقبلية | LS | لم تُكتب في الإنتاج | **NO** | NO | NO | منخفض | **DELETE** (لا تنظيف مطلوب) | غير مكتوبة |
| `focus_settings` / `focus_theme` | `src/core/config/settings.ts` + `use-theme.tsx` | LS | تفضيلات المستخدم | عرض فقط | **NO** (تفضيل محلي) | NO | منخفض | **KEEP** (وظيفي، إن بقي UI يقرأه) | — |
| AI Coach (تحليل/توصيات/تقرير) | `src/ai/coach/*` + `src/screens/coach/CoachScreen.tsx` | ذاكرة + يقرأ sessions | تغذية راجعة معرفية | **NO** | **YES** | YES | مرتفع (تحليل سلوكي) | **DELETE/REASSESS** (خارج النموذج المصرّح E-2) | استهلاك sessions |

### 2.2 QR / حملات / ملصقات (M1/M2 data layer)

| Data/Feature | Where collected | Where stored | Why exists | Needed for sales? | Personal? | Sensitive? | Legal risk | Keep/Delete/Transform | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| مسح QR `qr_scanned` + معاملات URL `?p=` `?ref=` `campaign` `source` `referrer` | `App.tsx:135-199` + `src/core/qr/*` | `analytics_events` + LS | حملات M1 | **NO** | **YES** (ربط جلسة/جهاز) | NO | مرتفع (تتبع) | **DELETE** | `lookupScanContext` + `START_QR_FLOW` |
| `qr_codes` / `campaigns` / `placements` / `placement_history` + `placement_id` على sessions/analytics | migrations 00016/00017/00018 + RPCs | Supabase | حملات M1 | **NO** | **YES** | NO | مرتفع (تتبع) | **DELETE** | جداول M1 |
| `sticker_scans` (ip/userAgent/referrer) + `sticker_serial_counter` | `src/services/sticker/sticker-database.ts` + `StickerStudio`/`StickerScanHandler` | LS + `sticker-analytics.ts` | ملصقات تسويقية | **NO** | **YES** (IP/UA/referrer) | NO | مرتفع | **DELETE** | مفاتيح LS + `sticker_scans` |

### 2.3 بيانات البائع/المتجر (localStorage + إدارة)

| Data/Feature | Where collected | Where stored | Why exists | Needed for sales? | Personal? | Sensitive? | Legal risk | Keep/Delete/Transform | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| مخزون (كميات/أجهزة/مدينة) `catalog_inventory` + حركات/معاملات `catalog_inventory_movements_v2`/`catalog_inventory_transactions`/`inventory_timeline_v3` | `src/services/inventory-service.ts` + `inventory-seed.ts` (seed عند الإقلاع `main.tsx:17`) | LS | عرض سلة البائع | **YES** (بيانات منتج البائع) | **NO** (بيانات تجارية محلية) | NO | متوسط (سرية تجارية) | **KEEP** (E-5) | — |
| أسعار شراء/بيع `pricing_records` / `price_memory_v1` | `src/services/pricing-intelligence.ts` + `price-memory.ts` | LS | ذاكرة أسعار | تجارية | NO | NO | متوسط | **KEEP** (E-5) | مفتاحا LS |
| سجل أجهزة/IMEI `device_ledger_v1`/`device_ledger_sequence` | `src/services/device-ledger.ts` | LS | تتبع أصول | تجارية | **YES** (IMEI قابل لربط الجهاز) | YES | مرتفع | **REASSESS** (E-9 — بوابة مستقلة) | مفتاحا LS |
| ذاكرة عملاء `customer_memory_sessions`/`customer_memory_events` (اسم، مشتريات، واتساب) | `src/services/customer-memory.ts` | LS | CRM محلي | تجارية | **YES** (اسم/نشاط) | YES | مرتفع (بيانات عملاء) | **REASSESS** (E-9 — بوابة مستقلة) | مفتاحا LS |
| نظام إصلاحات `repair_*` (9 مفاتيح) + `repair_*` (9 جداول) + PII (اسم/هاتف/عنوان/GPS/صور data-URL) | `src/services/repair/*` + `src/components/repair/*` + `repair-data-service.ts` | LS + Supabase `repair_*` | خدمة إصلاح | **NO** (خارج عرض الهواتف) | **YES** | **YES** (عنوان/GPS/صور) | **حرج** | **REASSESS** (E-9 — بوابة مستقلة لكل جدول/مفتاح مع سبب) | مفاتيح LS + جداول 00001/00005/00006 |
| `bi_*` (7 مفاتيح) + `bi_branch_data` + BI Center | `src/business-intelligence/*` | LS | لوحات إدارة | تجارية | جزئياً (StaffPerformance) | جزئياً | متوسط | **REASSESS** (E-9 — بوابة مستقلة) | مفاتيح LS |
| إعلانات `ads` + حقول `ads-images` + `AdBanner` | migrations 00015 + `src/components/ads/*` | Supabase + bucket | إعلانات صاحب المنصة (منتج تجاري) | **YES** (E-4) | **NO** (شرط: لا تتبع زائر) | NO | منخفض | **KEEP** (E-4 — لا حذف افتراضي؛ فقط ضمان عدم تتبع الزائر) | جدول/bucket 00015 |
| مخزون DRAFT `inventory_items`/`inventory_images`/`inventory_movements` (00014) | migration 00014 (DRAFT) | Supabase | مسودة | لا | NO | NO | منخفض | **REASSESS** (E-9 — بوابة مستقلة؛ لم يُنفَّذ أصلاً) | غير منفَّذ |

### 2.4 البحث/العرض/الكتالوج (SSOT — KEEP)

| Data/Feature | Where collected | Where stored | Why exists | Needed for sales? | Personal? | Sensitive? | Legal risk | Keep/Delete/Transform | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| كتالوج JSON (18 علامة/866 موديل/1,816 نسخة) | build-time (files) | `src/catalog/brands/*.json` | SSOT العرض | **YES** | NO | NO | متوسط (دقة بيانات المنتج — قانون المستهلك R8) | **KEEP** (SSOT) | `loader.ts` |
| مخزون العرض + محرر الكاسكيد `CatalogCascadeSelector`/`Types` + `showroom_view_counts` | UI | LS | العرض | **YES** | NO | NO | منخفض | **KEEP** (functionality) | — |
| `catalog_*_v1` (أعمدة S4/S5) | `src/database/schema.ts` | LS | قديم/زرع | NO | NO | NO | منخفض | **DELETE** (مع مصير S4 §17) | أعمدة schema |
| WhatsApp: قالب رسالة (سعر/مدينة/deep-link) | `whatsapp-service.ts`/`whatsapp-message.ts` | لا تخزين (رابط) | تحويل | **YES** | **NO** (لا يُخزَّن) | NO | متوسط (محتوى الرسالة قرار تجاري R12) | **KEEP** (مباشر بلا تتبع) | إزالة tracking من النقر |
| `phone-database.ts` + `.catalog-store` + `catalog-audit/` | قديم | FS/LS | مصدر قديم (47/3004) | NO | NO | NO | منخفض | **ARCHIVE** (بعد إثبات صفر مستهلك — عبر S6) | `grep phone-database` |

### 2.5 Admin / Research (فصل صارم)

| Data/Feature | Where collected | Where stored | Why exists | Needed for sales? | Personal? | Sensitive? | Legal risk | Keep/Delete/Transform | Evidence |
|---|---|---|---|---|---|---|---|---|---|
| Research Console + Research API + `surveys` | `src/research-console/*` + `src/core/research/*` + `src/screens/research/*` | Supabase `surveys` + يقرأ sessions/dashboards | دور researcher | **NO** | **YES** | YES (صحة/نمط حياة) | مرتفع | **DELETE/STOP** | — |
| Admin/roles (`users.role`, `has_super_admin`, `is_admin`, `app_role`, RPCs) | hardening phase1/2 + `AdminSetupScreen` | Supabase | إدارة | ربما | **YES** | YES | مرتفع إن عُومل بلا عزل | **KEEP فقط إن لزم مع عزل** (قرار §V-8) | — |
| `system_settings`/`audit_log`/`job_assignments` (00009) | migration 00009 | Supabase | عقد إدارة | لا | جزئياً | جزئياً | متوسط | **REASSESS** (لم تُطبَّق live — قرار §V-8) | غير منفَّذ live |
| `ads`/`ads-images` | 00015 | Supabase | إعلانات | لا | NO | NO | منخفض | **KEEP (E-4)** — بلا تتبع زائر | — |

---

## 3. Feature Decommission Matrix

| الميزة | الملفات/الوجهات الرئيسية | تصنيف P1 (مُحدَّث E-1…E-13) | ملاحظة |
|---|---|---|---|
| Guest auth الضمني | `src/core/auth/*`, `AuthProvider.tsx` | **DELETE** (وقف الإنشاء التلقائي) | اللعبة/التصفح بلا user_id |
| بصمة الجهاز | `src/core/device/*`, `PersistenceProvider` | **DELETE التخزين الدائم** | اللعبة تبقى تعمل بلا بصمة محفوظة |
| **اللعبة نفسها (UI/Engine/مسار التشغيل)** | `src/core/engine/*`, `src/core/scientific/*`, `src/core/measurement/*`, `src/screens/{game,game-intro,countdown,results,history,achievements,library}/*`, `store/navigation` | **KEEP (E-1)** | engagement hook — لا حذف |
| **حساب النتائج اللحظي (RTs/درجات)** | `src/core/engine/*` (خلال اللعب فقط) | **KEEP (لحظي)** | لا يُخزَّن دائم |
| جلسات/معايرة مخزنة | `src/core/session/*`, `src/core/calibration*`, `PersistenceProvider` | **DELETE التخزين** | بلا sessions/devices/calibrations دائمة |
| Telemetry/Analytics | `src/core/analytics/*`, `src/core/telemetry/*`, `src/core/events/index.ts`, `data-service.ts` (جزء events) | **DELETE (E-3)** | صفر تتبع؛ بلا أحداث شخصية |
| QR attribution | `src/core/qr/*`, `src/core/supabase/data-service.ts` (lookupScanContext) | **DELETE** | لا ربط نتيجة/جلسة بحملة |
| Repair | `src/services/repair/*`, `src/components/repair/*`, `src/screens/repair/*`, `src/screens/phone-services/*`, `repair-data-service.ts`, migrations 00001/00005/00006 | **REASSESS (E-9)** | بوابة مستقلة لكل جدول/مفتاح مع سبب |
| Research Console | `src/research-console/*`, `src/core/research/*`, `src/core/obs/*`, `src/screens/research/*` | **REASSESS/DELETE** | مبنية على البيانات المحذوفة |
| BI Center | `src/business-intelligence/*` | **REASSESS (E-9)** | بوابة مستقلة |
| AI Coach | `src/ai/coach/*`, `src/screens/coach/*` | **DELETE/REASSESS** | خارج النموذج المصرّح |
| Ads | `src/components/ads/*`, `src/services/ads-service.ts`, `ads`/bucket | **KEEP (E-4)** | لا حذف افتراضي؛ ضمان عدم تتبع الزائر |
| مشاركة (share) | `src/screens/share/*`, `src/core/qr/share.ts` | **REASSESS** | إن أُبقي، بلا تتبع |
| المخزون/الأسعار (بائع) | `src/services/inventory-service.ts`, `price-memory.ts`, `pricing-intelligence.ts`, `inventory-seed.ts` | **KEEP (E-5)** | بيانات إدارة التجارة |
| ذاكرة العملاء/device-ledger/IMEI | `src/services/customer-memory.ts`, `device-ledger.ts`, `popularity-engine.ts` | **REASSESS (E-9)** | بوابة مستقلة |
| WhatsApp | `whatsapp-service.ts`, `whatsapp-message.ts`, `ProductActionBar` | **KEEP (بلا تتبع)** | مباشر |
| Anonymous Top-10 Leaderboard | جديد (P8) | **KEEP (minimal — E-3)** | score/rank/game_version فقط |
| عرض الكتالوج/الكاسكيد/Showroom | `src/components/catalog/*`, `src/components/showroom/*`, `src/screens/showroom/*`, `src/screens/home/*`, `src/screens/inventory/*`, `src/screens/landing/*`, `src/services/{catalog-service,alias-engine,brand-rules,catalog-quality,variant-verification}.ts` | **KEEP (E-6)** | — |
| Database CLI (seed/verify/audit) | `src/database/{seeder,schema,seed-catalog,verify-catalog,golden-audit}.ts` | **REASSESS** (S5) | لاحقاً مع مصير S5/CATALOG-3 |
| Admin | `src/screens/auth/*`, `ProtectedRoute` | **KEEP فقط مع عزل / REASSESS** | لا guest؛ admin محدد إن لزم |

---

## 4. Database Impact Map (Supabase)

> جدول `users` قائم live (auth)؛ جداول M1 و repair_* و contract و ads و inventory موجودة في migrations لكن بعضها **غير مطبَّق live** (verify-live-schema + phase2 README). لكل عنصر: الكاتب/القارئ (من الكود)، RLS، triggers، RPCs، migration المصدر، تصنيف P1.
> **تصنيفات الجداول هنا تخصّ البيانات/التخزين (E-2) لا اللعبة نفسها (E-1).** حذف `sessions/devices/calibrations/analytics_events` لا يحذف اللعبة.

| الجدول | Writer (كود) | Reader | RLS/policies | Triggers | RPC ذي صلة | Migration | تصنيف P1 |
|---|---|---|---|---|---|---|---|
| `sessions` | `PersistenceProvider.tsx` (+ beacon/fetch) | Research/BI | owner + researcher (phase1) | `on_auth_*` (auth.users) + update_updated_at (live) | — | live-only (00003/00010 تعديل) | **DELETE** (بيانات لعبة شخصية — E-2) |
| `devices` | `PersistenceProvider.tsx:282` | Research/BI | owner + researcher | live | — | live-only | **DELETE** (بصمة — E-2) |
| `calibrations` | `PersistenceProvider.tsx:333` | Research/BI | owner + researcher | live | — | live-only | **DELETE** (معايرة مخزنة — E-2) |
| `analytics_events` | telemetry/data-service + `App.tsx` | Research/BI + M1/M2 dashboards | owner + researcher + insert-gated (phase1/08) | live | — | live-only (00004/00010 فهارس) | **DELETE** (telemetry — E-2) |
| `surveys` | لا كاتب في src | Research Console | owner + researcher | live | — | live-only | **DELETE** (مبنية على البيانات المحذوفة) |
| `qr_codes` | `data-service.ts` (increment counter) | M1 UI | admins manage (phase2) | — | `increment_qr_counter` | live-only (أعمدة M1) | **DELETE** (QR attribution — E-2) |
| `campaigns` | `data-service.ts` (seed via RPC) | M1 UI | admins manage | — | `lookup_campaign_by_short_code(_v2)` | live-only | **DELETE** (QR attribution — E-2) |
| `placements` | `data-service.ts` | M1 UI | public read active + staff | `trg_placements_updated_at` | `lookup_scan_context` | 00016 | **DELETE** (QR attribution — E-2) |
| `placement_history` | `data-service.ts` | M1 UI | staff | — | — | 00016 | **DELETE** (QR attribution — E-2) |
| `users` | Auth (+ handle_new_user trigger) | Auth/ProtectedRoute/Admin | own-row + researcher + admin-update | `on_auth_user_created`/`on_auth_user_login` | `has_super_admin`, `app_role`, `is_admin` | 00002 (+phase1/phase2/phase-c) | **TRANSFORM** (إزالة الضيف؛ عزل admin؛ أو DELETE إذا لا إدارة) |
| `repair_*` (9 جداول) | `repair-data-service.ts` | Repair UI | anyone/authenticated (00005/00006) | — | — | 00001/00005/00006 | **REASSESS (E-9)** — بوابة مستقلة لكل جدول مع سبب |
| `ads` | (لا كاتب في src) | AdBanner | public read + staff | `trg_ads_updated_at` | — | 00015 | **KEEP (E-4)** — لا حذف افتراضي؛ شرط: لا تتبع زائر |
| `system_settings`/`audit_log`/`job_assignments` | (لا كاتب) | Admin/BI | public/admins/own | updated_at triggers | — | 00009 | **REASSESS** (غير مطبَّق live) |
| `inventory_items`/`images`/`movements` (DRAFT) | (لا كاتب) | — | staff | inventory triggers + RPC `inventory_management_list` | `inventory_management_list` | 00014 | **REASSESS (E-9)** (غير منفَّذ) |
| `auth.users` | Supabase Auth (signInAnonymously) | — | — | on_auth_* | — | Supabase-managed | **TRANSFORM** (إنهاء إنشاء الضيف) |

**Buckets:** `ads-images` (00015) — **KEEP** مع جدول `ads` (E-4)؛ `inventory-images` (00014) — يتبع مصير DRAFT (REASSESS).

**RLS:** تُبقي RLS بعد التقليل على ما يبقى (مبدأ 22 من التوجيه). حذف الجداول يشمل سياساتها تلقائياً عبر DROP TABLE CASCADE؛ أي إبقاء لـ `users`/admin يتطلب إعادة حوكمة (phase2/phase-c أُنجزت بالفعل).

---

## 5. Third-Party Data Map

| الطرف | البيانات المرسلة | الغرض | الحالة في النموذج المستهدف |
|---|---|---|---|
| Supabase (خوادم خارج الجزائر) | guest user_id، بصمة، قياسات، أحداث، بيانات repair، QR/حملات | تخزين/تتبع | **إزالة الجداول الشخصية/التتبّع**؛ تبقى فقط ما هو ضروري لـ Admin/Ads/Inventory إن أُقرّ — تقييم نقل عبر الحدود → **LEGAL REVIEW** |
| GitHub Pages (استضافة) | طلبات SPA (سجلات IP/طلب عند المزوّد — غير مثبتة من الكود) | استضافة | **UNKNOWN** — مراجعة مزوّد؛ لا يتغير شيء من كود FOCUS |
| WhatsApp (wa.me) | رابط فقط + محتوى رسالة (سعر/مدينة — يكتبه المستخدم) | تحويل | **KEEP مباشر** — FOCUS لا تخزّن نص المحادثة |
| SDKs تحليلية | — | — | **لا يوجد** (تأكيد سلبي) — يبقى غائباً |

> **Game/Leaderboard (E-1/E-3):** اللعبة تعمل محلياً/لحظياً بلا أي طرف ثالث. Leaderboard Top-10 يُخزَّن وفق E-3 (score/rank/game_version) بلا PII — موقعه النهائي (localStorage مقابل Supabase) يُقرَّر في P8 بعد مراجعة Data Minimization.

---

## 6. Legal-Risk Register (موجز — المرجع الكامل: Discovery §C/§R/§U)

| # | البند | الحالة |
|---|---|---|
| L1 | تطبيق 18-07/25-11 على FOCUS كناشر عرض/مدير متجر + تسجيل ANPDP | `LEGAL REVIEW REQUIRED` |
| L2 | بصمة/هوية ضمنية/قياسات معرفية = تنميط → DPIA/ترخيص مسبق | `LEGAL REVIEW REQUIRED` |
| L3 | نقل عبر الحدود لبيانات الزوار (Supabase) | `LEGAL REVIEW REQUIRED` |
| L4 | تصنيف FOCUS: إعلان/وساطة/تجارة بموجب 18-05 + الإفصاحات | `LEGAL REVIEW REQUIRED` |
| L5 | التزامات ARPCE لخدمة تحويل WhatsApp | `UNKNOWN — LEGAL REVIEW REQUIRED` |
| L6 | حقوق صور/شعارات/علامات | `LEGAL REVIEW REQUIRED` |
| L7 | مسؤولية دقة بيانات المنتج (A16 4/128) بموجب 09-03/18-05 | `HIGH — لا تخمين` |
| L8 | أثر "السلوك المعرفي" كبيانات حساسة بموجب تعديل 2025 | `LEGAL REVIEW REQUIRED` |
| L9 | حفظ بيانات الإصلاحات (عنوان/GPS/صور) والاحتفاظ بها | `LEGAL REVIEW REQUIRED` (بالتوازي مع قرار §V-5) |
| L10 | النصوص التطبيقية من JORADP/anpdp.dz قبل أي إطلاق | `REQUIRED` |
| L11 | التزامات مستقلة تبقى حتى بعد التقليل (إعلام/موافقة/سجل/إشعار 5 أيام/ربما DPO) | `REQUIRED — لا تُختصر` |

---

## 7. Retention Matrix (مُحدَّثة وفق E-1…E-13)

| البيانات | الاحتفاظ الحالي | المقترح | الطريقة |
|---|---|---|---|
| `sessions`/`devices`/`calibrations`/`analytics_events` | غير محدود | **حذف نهائي (DROP)** | إيقاف الكتابة → إسقاط الجداول |
| `repair_*` | غير محدود | **حذف نهائي أو سياسة محدودة بعد الاستشارة** (E-9 — بوابة مستقلة) | قرار E-9 |
| QR/حملات/ملصقات | غير محدود | **حذف نهائي** | إيقاف → DROP |
| **Anonymous Top-10 Leaderboard (E-3)** | جديد | **Retention صريح محدود:** (1) دخول نتيجة جديدة → تُدرج وترتب حسب score؛ (2) خروج نتيجة من Top-10 → **حذف نهائي فوراً** (بلا أرشفة)؛ (3) تغيير game_version → إعادة ضبط أو فصل قوائم لكل version (قرار في P8)؛ (4) reset → مسح كامل. **لا يتحول إلى archive تاريخي.** | سياسة في كود P8 + اختبارات PG-22…PG-26 |
| مخزون/أسعار بائع (LS) | بقاء غير محدود في المتصفح | **KEEP (E-5)** | — |
| `focus_*` (لعبة محلية مجهولة) | — | **REASSESS (E-9)** — أي مفتاح بلا هوية شخصية قد يبقى مع اللعبة؛ أي تاريخ نتائج شخصي يُحذف | قرار E-9 |
| تفضيلات (ثيم/لغة) | غير محدود | **KEEP** | — |
| سجلات Git التاريخية | دائم | **لا تُمسح** | — |

> **قاعدة Leaderboard (من E-3):** النتيجة خارج Top-10 لا تُخزَّن أصلاً؛ النتيجة الخارجة من Top-10 تُحذف نهائياً؛ لا اسم/email/phone/user_id/IP/fingerprint/UA/GPS/advertising ID/cookies/history/behavioral profile في أي وقت.

---

## 8. Deletion Plan (مُحدَّثة وفق E-1…E-13 — تُنفَّذ مراحل P3–P9 بعد موافقات المراحل)

> القاعدة الذهبية: **إيقاف الكتابة أولاً، ثم إيقاف الوصول، ثم حذف البيانات، ثم التحقق** — أبداً العكس. كل خطوة تحمل معرف بوابة.
> **اللعبة نفسها لا تُحذف (E-1)** — تُحذف فقط بياناتها الشخصية/التخزين الدائم.

1. **W1 — إيقاف الكتابة (stop-write):** تعطيل `signInAsGuest` التلقائي (`AuthProvider.tsx:48`)، إزالة `PersistenceProvider` من شجرة `App.tsx:331`، إزالة `setupSessionTelemetry()` و`telemetry.track('app_opened')` من `App.tsx`/`main.tsx`، إزالة QR deep-link branch في `InitialRoute`. **لا تُمس مسارات اللعبة.**
2. **W2 — تجريد واجهات البيانات (لا شاشات اللعبة):** إزالة مسارات الشاشات غير المصرّح بها (coach/research/repair/stickers/register/login/admin/phone-services — حسب القرارات) من `App.tsx` + `store/navigation` + القائمة الرئيسية. **شاشات اللعبة (game/intro/countdown/results/history/achievements) تبقى.**
3. **W3 — إزالة خدمات البيانات الشخصية:** تعطيل/إزالة `src/core/{session,device,calibration,calibration-cache,telemetry,analytics,events,qr,research,obs}` والكتابة في `data-service.ts`/`PersistenceProvider`، و`src/core/scientific/validation` فقط حيث يُقرأ منه تخزين. **`src/core/engine/*` (حساب اللعبة) و`src/core/scientific/constants.ts` (ثوابت) و`src/core/gamification` (محلي مجهول — حسب E-9) تبقى أو تُراجع.** كل تعطيل يُثبَت ببوابة صفر كتابة (grep).
4. **D1 — حذف البيانات (Supabase):** بعد إثبات صفر كتابة/قراءة من الكود، `DROP TABLE ... CASCADE` للجداول الشخصية/التتبع (قسم 12) عبر **migrations Decommission** (قسم 14) وليس SQL يدوياً عشوائياً.
5. **D2 — RPC/trigger/function cleanup:** حذف RPCs/triggers الخاصة بالجداول المحذوفة (قسم 13) وإعادة تقييم دوال auth/admin على ما يبقى.
6. **D3 — تنظيف localStorage:** إزالة الكتابة من الكود ثم إزالة المفاتيح الشخصية/التتبع (تُقرَّر القائمة في P4/P5).
7. **P8 — Anonymous Top-10 Leaderboard:** تنفيذ بمخزّن حد أدنى (E-3) + سياسة retention (§7) + البوابة "النتيجة خارج Top-10 لا تُخزَّن" + عرض "أنت الآن في المركز #X".
8. **A1 — أرشفة/حذف الأصول القديمة:** `.catalog-store`, `catalog-audit/`, `phone-database.ts`, الوثائق القديمة (بعد إثبات صفر مستهلك) — مرتبط بمصير S5/S6 §17.
9. **Verify:** تشغيل acceptance gates (قسم 9) + `typecheck` + `lint` + `build` + اختبارات المجموعة.

> **مهم:** التنفيذ الفعلي لا يبدأ قبل أمر صريح بمرحلة، وكل مرحلة (P3→…→P11) بموافقة منفصلة وبوابة قبول. HARD STOP: أي أثر على Ads/Inventory/Catalog/WhatsApp/Admin/M1/M2/S1–S3 ⇒ توقف فوراً بلا workaround، قدّم evidence وانتظر القرار.

---

## 9. Acceptance Gates (تصميم P2 — تُنشأ كاختبارات في مراحل التنفيذ؛ كل بوابة تُكتب حمراء قبل تنفيذ مرحلتها ثم خضراء بعدها)

> القاعدة: كل اختبار يُكتب **قبل** التنفيذ ويكون **أحمر** (يثبت المشكلة الحالية)، ثم يُصبح **أخضر** بعد التنفيذ. تشمل بوابات الأمان (15 من أمر الموافقة) + بوابات الـ HARD STOP.

### 9A. بوابات إزالة البيانات/التعقّب (لا تمس اللعبة)

| المعرف | الاسم | يثبت | يكتب قبل |
|---|---|---|---|
| PG-01 | `no-guest-signin-created` | `signInAsGuest` لا يُستدعى تلقائياً عند الإقلاع (grep صفر استدعاء في App/AuthProvider) | P3 |
| PG-02 | `no-persistence-provider-write` | لا استدعاء `from('sessions'|'devices'|'calibrations')` يصل للكتابة في الكود | P3/P4 |
| PG-03 | `no-device-fingerprint-stored` | صفر كتابة `collectDeviceProfile` في تخزين دائم (لا devices/calibrations/telemetry) | P4 |
| PG-04 | `no-game-telemetry` | صفر `telemetry.track(`/`setupSessionTelemetry()` في مسار اللعبة/التطبيق | P5 |
| PG-05 | `no-qr-tracking` | صفر استدعاء `lookupScanContext`/`START_QR_FLOW`/`hasCampaign`/`increment_qr_counter` في الكود | P5 |
| PG-10 | `localstorage-keys-pruned` | مفاتيح التتبع/الشخصية لا تُكتب (mock localStorage وفحص setItem/removeItem) | P4/P5 |
| PG-11 | `supabase-no-write-clients` | لا عميل Supabase يتصل بجداول محذوفة (grep على `from('...')` للجداول المحذوفة) | P9 |
| PG-18 | `zero-dead-table-refs` | grep عبر src على أسماء الجداول المحذوفة = صفر | P9 |
| PG-19 | `retention-probe-ok` | لا جدول محذوف يعود في `verify-live-schema` بعد migrations | P9 |
| PG-20 | `commit-freeze` | لا Commit/Push أثناء التنفيذ إلا بأمر صريح | دائم |
| PG-27 | `no-hidden-collectors` | لا analytics/telemetry/fingerprinting/persistent identifiers/behavioral profiling مضاف حديثاً بلا إدراج في Data Inventory (فحص git diff + grep على collector keywords) | كل مرحلة |
| PG-28 | `no-ecommerce-surface` (سلبي مستمر) | صفر cart/checkout/payment/installment في src/ (يبقى أخضر دائماً) | دائم |

### 9B. بوابات اللعبة — KEEP (لا حذف)

| المعرف | الاسم | يثبت | يكتب قبل |
|---|---|---|---|
| PG-30 | `game-runs` | اللعبة تعمل (اختبار مسار سعيد: intro → countdown → game → results) | P4/P10 |
| PG-31 | `game-engine-present` | `src/core/engine/*` و`src/core/scientific/constants.ts` باقيان وغير مستوردين للتخزين | P4 |
| PG-32 | `no-game-persistent-identity` | اللعبة لا تنشئ persistent player identity (لا user_id/guest في مسار اللعبة) | P4 |
| PG-33 | `no-game-session-stored` | لا حفظ game session شخصية (sessions/devices/calibrations) بعد اللعب | P4 |
| PG-34 | `game-local-only` | نتيجة اللعبة تُحسب لحظياً ولا تُخزَّن خارج Top-10 (E-3) | P4 |

### 9C. بوابات Anonymous Top-10 Leaderboard (E-3)

| المعرف | الاسم | يثبت | يكتب قبل |
|---|---|---|---|
| PG-40 | `top10-works` | الدخول للـ Top-10 يخزّن ويُظهر "أنت الآن في المركز #X" | P8 |
| PG-41 | `top10-no-pii` | لا name/email/phone/user_id/IP/fingerprint/UA/GPS/advertising ID/cookies في تخزين الـ leaderboard | P8 |
| PG-42 | `top10-no-userid` | صفر `user_id`/معرّف ربط بالشخص في سجل leaderboard | P8 |
| PG-43 | `top10-outside-not-stored` | النتيجة خارج Top-10 لا تُخزَّن إطلاقاً | P8 |
| PG-44 | `top10-evicted-deleted` | النتيجة الخارجة من Top-10 تُحذف نهائياً (لا archive) | P8 |
| PG-45 | `top10-retention-policy` | سياسة §7 مطبَّقة: دخول/إخراج/version-change/reset | P8 |
| PG-46 | `top10-minimal-fields` | الحقول المخزنة ⊆ {score/best_time, rank, game_version, created_at-إن لزم} | P8 |

### 9D. بوابات الحفاظ (Commercial Core + S1–S4)

| المعرف | الاسم | يثبت | يكتب قبل |
|---|---|---|---|
| PG-13 | `whatsapp-direct-route` | زر WhatsApp ينشئ `wa.me` مباشر بدون حدث tracking قبل التنقل | كل مرحلة |
| PG-14 | `catalog-ssot-intact` | `loader` + `getAllBrands/Series/Models` يعملان؛ صفر `catalog_*_v1` في مسار التصفح | P2/W2 |
| PG-15 | `browse-to-whatsapp-ok` | تصفح: home → cascade → تفاصيل → زر WhatsApp → wa.me (مسار سعيد أخضر) | كل مرحلة |
| PG-50 | `ads-work` | Ads تعمل (AdBanner يعرض إعلانات صاحب المنصة) — لا تعطيل | كل مرحلة |
| PG-51 | `inventory-works` | Inventory يعمل (عرض/إدخال/تحرير مخزون البائع) | كل مرحلة |
| PG-52 | `catalog-works` | Catalog يعمل (S1–S3: canonical + D3 fix) — لا تراجع | كل مرحلة |
| PG-53 | `no-orphan-writes` | لا كتابات يتيمة (صفر عميل يكتب جدولاً محذوفاً/مهجوراً) | P9/P10 |
| PG-54 | `no-dead-routes` | لا مسارات ميتة (كل route معرف تشير لمكوّن موجود وقابل للاستيراد) | كل مرحلة |
| PG-55 | `s1-s3-no-regression` | AT-20…AT-23 + R1–R6 خضراء (لا تراجع على S1/S2/S3) | P2/P10 |
| PG-56 | `s4-acceptance-pass` | AT-24 خضراء (تصفح الكاسكيد بلا `catalog_*_v1`) | P2 |
| PG-16 | `typecheck-lint-build-pass` | `tsc --noEmit` + `eslint src/` + `vite build` خضراء | بعد كل مرحلة |
| PG-17 | `full-suite-pass` | مجموعة الاختبارات الكاملة خضراء | بعد كل مرحلة |
| PG-57 | `hardstop-not-triggered` | لا مرحلة توقفت بسبب HARD STOP بلا قرار (لا workaround/baypass) | كل مرحلة |

---

## 10. الملفات التي ستتغير (Files to Change) — قائمة مقترحة (مُحدَّثة وفق E-1…E-13)

| الملف | التغيير |
|---|---|
| `src/App.tsx` | إزالة التهيئة الشخصية (guest auth/telemetry/persistence/QR)، إزالة مسارات الشاشات المرفوضة فقط (coach/research/repair/stickers/register/login/admin/phone-services حسب القرارات)، **مسارات اللعبة (game/intro/countdown/results/history/achievements) تبقى** |
| `src/main.tsx` | إزالة `ensureInventorySeeded` أو تعديله حسب قرار E-5 (Inventory KEEP) |
| `src/store/navigation.tsx` | إزالة مفاتيح الشاشات المرفوضة + إجراءات START_QR_FLOW/SET_CALIBRATION؛ **إبقاء مفاتيح اللعبة** |
| `src/components/layout/AppShell.tsx` + `HomeMenu.tsx` | إزالة روابط research/repair/stickers/admin؛ **إبقاء روابط اللعبة** |
| `src/core/supabase/client.ts` | مراجعة إعدادات auth (persistSession/autoRefresh/detectSessionInUrl) بعد إزالة الضيف |
| `src/core/auth/index.ts` + `AuthProvider.tsx` | إزالة/تعطيل `signInAsGuest` التلقائي؛ فصل admin (E-8) |
| `src/services/whatsapp-service.ts` | إزالة أية تتبع قبل التوجيه (مسار مباشر) |
| `src/components/showroom/ProductActionBar.tsx` (+ ShowroomControls) | ربط wa.me مباشر بلا أحداث |
| `src/core/supabase/data-service.ts` | إزالة كتابة analytics/QR/repair/sessions؛ إبقاء قراءة admin + ما هو ضروري لـ Ads/Inventory إن أُقرّ |
| `src/core/telemetry/*` + `src/core/analytics/*` | **DELETE** (E-3: صفر تتبع) — تُستبدل بواجهة مصغرة إن لزم أمنياً (D12) |
| `src/components/catalog/CatalogCascadeSelector.tsx` + `CatalogCascadeTypes.tsx` | **P2: استكمال S4** (موافقة E-13) — جعل AT-24 خضراء ثم الالتزام |
| `src/database/{seeder,schema,verify-catalog,golden-audit}.ts` | إعادة توجيه نحو SSOT (S5) — لاحقاً |
| `.github/workflows/deploy.yml` | لا تغيير متوقع (SPA ثابت)؛ يُراجع env |
| `.env.example`/README | تحديث المتغيرات المطلوبة فقط إن تغيّرت |

## 11. الملفات التي ستُحذف (Files to Delete) — قائمة مقترحة (مُحدَّثة وفق E-1…E-13)

> **KEEP قاطع:** `src/core/engine/*`, `src/core/scientific/constants.ts`, `src/screens/{game,game-intro,countdown,results,history,achievements}/*`, `src/components/game/*`, `src/components/ads/*` (E-1/E-2: اللعبة والإعلانات تُبقى).

| المجموعة | الملفات |
|---|---|
| بيانات اللعبة الشخصية (E-2) | الكتابة في `src/core/session/*`, `src/core/device/*`, `src/core/calibration/*`, `src/core/calibration-cache/*` (يُحوَّل التخزين إلى لحظي/محلي بلا هوية — لا حذف ملفات الحساب بل إزالة إصرارها) |
| التتبع | `src/core/telemetry/*`, `src/core/analytics/*`, `src/core/events/*`, `src/core/obs/*` |
| QR/حملات/ملصقات | `src/core/qr/*`, `src/screens/stickers/*`, `src/components/stickers/*`, `src/services/sticker/*`, `src/screens/phone-services/*` (جزئياً) |
| Research/BI | `src/research-console/*`, `src/core/research/*`, `src/screens/research/*`, `src/business-intelligence/*`, `src/ai/coach/*`, `src/screens/coach/*` |
| Repair (E-9 REASSESS) | `src/services/repair/*`, `src/components/repair/*`, `src/screens/repair/*`, `src/core/supabase/repair-data-service.ts` — **قرار منفصل لكل جدول/مفتاح** |
| قديمة (بعد إثبات صفر مستهلك) | `src/data/phone-database.ts`, `.catalog-store/`, `catalog-audit/` (أو أرشفة) — مرتبط بمصير S5/S6 |

## 12. الجداول (Tables) — حالة كل جدول وفق E-1…E-13 (لا حذف قبل بوابات المراحل)

| الجدول | المصير | السبب (E) |
|---|---|---|
| `analytics_events`, `sessions`, `devices`, `calibrations`, `surveys` | **DROP** | بيانات لعبة/معرفية/تتبع (E-2/E-3) |
| `placement_history`, `placements`, `campaigns`, `qr_codes` | **DROP** | QR/حملات — تتبع (E-4) |
| `repair_requests`, `repair_quotes`, `repair_timeline`, `repair_courier_jobs`, `repair_notifications`, `repair_photos`, `repair_status_history`, `repair_audit_log` | **REASSESS (E-9)** | بوابة مستقلة لكل جدول/مفتاح (بيانات حرجة: عنوان/GPS/صور) |
| `ads`, `ads-*` | **KEEP (E-2)** | إعلانات صاحب المنصة — Commercial Core |
| `inventory_items`, `inventory_images`, `inventory_movements` | **KEEP (E-5)** | مخزون البائع — Commercial Core |
| `users` + `system_settings`/`audit_log`/`job_assignments` (contract 00009) | **REASSESS (E-8/E-10)** | قرار قانوني أولاً (مصير auth/admin/contract) |

> **E-9 status (2026-08-08):** **OPEN — REASSESSMENT ONLY.** Registered in `docs/audits/e9-repair-reassessment.md`. No DROP/RESTORE/MIGRATE and no code/data deletion authorized here. Independent of CR-00005 (closed as `NON-APPLICABLE / NEVER_DEPLOYED` — `docs/audits/p6-security-cr-00005-rls.md`).

يُحذف عبر `DROP TABLE ... CASCADE` في migrations Decommission فقط بعد إثبات صفر كتابة/قراءة من الكود.

## 13. RPCs/Triggers (وظائف/مشغلات) — حالة كل منها وفق E-1…E-13

| النوع | الاسم | الحالة |
|---|---|---|
| RPC | `lookup_scan_context(text,text)` | **DELETE** (QR) |
| RPC | `lookup_campaign_by_short_code(text)` + `_v2` | **DELETE** (QR) |
| RPC | `increment_qr_counter(uuid,text)` | **DELETE** (QR) |
| RPC | `inventory_management_list()` | **REASSESS** (Inventory KEEP — يُراجع فقط إن بقي الاستخدام) |
| Function/Guard | `has_super_admin()`, `app_role()`, `is_admin()`, `admin_promote_user(uuid,text)`, `bootstrap_super_admin(uuid)`, `handle_new_user()` | **REASSESS** (تبقى إن بقي admin/auth — E-8) |
| Trigger | `on_auth_user_created`, `on_auth_user_login` (على auth.users) | تتبع مصير auth (REASSESS — E-8) |
| Trigger | `trg_placements_updated_at`, `trg_qr_*` | **DELETE** (مع جداولها) |
| Trigger | `trg_ads_updated_at` | **KEEP** (Ads) |
| Trigger | `trg_inventory_items_updated_at`, `trg_inventory_items_audit` | **KEEP** (Inventory) |
| Trigger | `trg_system_settings_updated_at`, `trg_job_assignments_updated_at` + `update_updated_at()` | تتبع قرار contract (E-10) |
| Buckets | `inventory-images`, `ads-images` | **KEEP** (Inventory/Ads) |
| Realtime | `supabase_realtime` (inventory_items, inventory_images, ads) | **REASSESS** — يُقرَّر مع Inventory/Ads

## 14. Migrations المقترحة (Decommission) — تنشأ فقط في مرحلة التنفيذ بعد موافقة المراحل

| الاسم المقترح | المحتوى |
|---|---|
| `00019_decommission_tracking_game_data.sql` | DROP CASCADE: analytics_events, sessions, devices, calibrations, surveys (بيانات اللعبة الشخصية/التتبع — E-2) + فهارس ذات الصلة |
| `00020_decommission_qr_campaigns.sql` | DROP CASCADE: placement_history, placements, campaigns, qr_codes + RPCs `lookup_scan_context`, `lookup_campaign_by_short_code(_v2)`, `increment_qr_counter` (E-4) |
| `00021_repair_reassess.sql` | (حسب قرار E-9) DROP CASCADE لجداول repair_* المعتمدة أو إبقاء/تعديل — بوابة مستقلة |
| `00022_inventory_ads_keep.sql` | (E-5/E-2) **لا DROP** — مراجعة policies/audit دون حذف الجداول (أو إضافة مسارات مهاجرة إن لزم) |
| `00023_decommission_contract_or_keep.sql` | (حسب قرار E-10) DROP system_settings/audit_log/job_assignments أو إبقاء |
| `00024_users_minimization.sql` | (حسب قرار E-8) تعديل handle_new_user/إزالة policies الضيف أو DROP users؛ تفريغ auth.users الزائفة — **قرار قانوني أولاً** |
| `00025_top10_leaderboard.sql` | (P8) إن أُقر تخزين Supabase: جدول Top-10 بحد أدنى من الحقول (score/best_time/game_version/rank) بلا user_id — أو قرار localStorage بديلاً |
| ملاحظة | كل migration **قابلة للتراجع** عبر migration rollback أو احتياطي؛ تُنفَّذ واحدة واحدة ببوابة قبول |
| ملاحظة | `00008` يوثّق "لا يمكن إعادة البناء من migrations" — بعد الحذف، مطلوب snapshot/backup قبل أي DROP (نسخة منفصلة) وفق قرار المستخدم |

## 15. تأثير الخطة على M1/M2

- **M1** = "Campaigns & QR Intelligence — data layer" (migrations 00016–00018: placements/placement_history/أعمدة الإحالة/`lookup_scan_context`) — المصدر: ترويسات migrations. **الخطة تحذف سطح بيانات M1 بالكامل** (جداول + RPCs + معاملات URL + أحداث `qr_scanned`). M1 بلا قيمة لعرض الهواتف/تحويل WhatsApp → تصنيف `DELETE`. المرجع: §12/§13/§14.
- **M2** = اللوحات والإحالة (retentionD30/calibrationConfidence/returningUsers/referralSuccess/فانل) المبنية على بيانات M1 + telemetry + sessions — **تُحذف تلقائياً** باختفاء مصادرها (sessions/analytics_events/placements). أي لوحة Research/BI قرأت هذه البيانات تنتمي لقسم 11.
- **لا يوجد انحدار مرجو:** لا شاشة عرض/تحويل تعتمد على M1/M2 في النموذج المستهدف (التحقق: PG-05, PG-18).
- **الحماية المسجلة:** تم الإبقاء على أعمال M1/M2 محفوظة في Git history والتصميم docs (لا حذف للتاريخ) — فقط إزالة سطح الإنتاج.

## 16. تأثير الخطة على Catalog S1–S3

- **S1/S2/S3** (canonical adapter، fix D3، تمرير brand) — **محفوظة وغير متأثرة**: النموذج المستهدف يعتمد على `src/catalog/*` (JSON→loader→UI) كـ SSOT. لا تغيير في مصدر البيانات.
- **ملاحظة:** `CatalogCascadeTypes.tsx` (ملف S3 المعتمد) يحوي أيضاً كود كتالوج قديم (fallback `catalog_models_v1`، مفاتيح favorites/most_used) — أي تعديل عليه بعد قرار S4 يجب ألا يمس عمل S1–S3 المعتمد.
- فئة "قديمة" (`phone-database.ts`/`.catalog-store`/`catalog-audit`) تُعالج في S6 (أرشفة) وليس في خطة الخصوصية — مرتبطة بمصير S5/S6 §17.

## 17. مصير S4 (والمرتبط به S5/S6/CATALOG-3)

- **S4 الحالة الملموسة:** تعديلات غير ملتزمة في شجرة العمل: `M src/components/catalog/CatalogCascadeSelector.tsx`, `M src/components/catalog/CatalogCascadeTypes.tsx`, `?? src/__tests__/s4-browse-catalog-source-gate.test.tsx`. بوابة AT-24 **غير خضراء** بعد (كانت 2/3 حمراء قبل التنفيذ بسبب التصفح المكسور، ثم طُبِّقت التعديلات ولم تُعَد البوابة).
- **قرار المالك (E-13):** **COMPLETE — مُعتمدة للاستكمال كمرحلة P2.** تُشغَّل AT-24 بعد التعديلات، تُعالج الإخفاقات (التصفح/البراند عبر canonical loader بلا `catalog_*_v1`)، مع الحفاظ على Inventory/Ads/Showroom وبدون تراجع S1–S3، ثم **STOP + acceptance report** (قبل أي مرحلة تالية). لا موديلات يدوية، لا A16 4/128 في S4.
- **S5/S6/CATALOG-3:** تبقى `PENDING`/مسجلة في `catalog-remediation-plan.md` و`catalog-2-ssot-migration-plan.md`. S5/S6/CATALOG-3 **لا يُنفَّذان ضمن خطة الخصوصية** إلا بأمر منفصل.
- **قيد ثابت:** لا حل لـ Samsung A16 4/128 بتركيبة مخمَّنة (لا تخمين RAM/Storage) — تبقى مفتوحة حتى إثبات موثّق (P1 في Discovery).

## 18. مصير CATALOG-3 (ودورية البيانات)

- **CATALOG-3** (Complete Model Discovery) — **DEFERRED (E-12)** ويُسجَّل كذلك في `catalog-remediation-plan.md`. لا اكتساب بيانات جديدة أثناء خطة الخصوصية.
- لا إضافة موديلات/نسخ، لا إدخال يدوي، لا تشغيل خط أنابيب خارجي — إلا بعد موافقة منفصلة.
- يبقى شرط "كل نسخة تحمل source + verificationStatus" (قسم 5 remediation) مطبقاً في النموذج المعياري (CATALOG-1).

## 19. Git Status (الحالي — فوري)

```
On branch main — HEAD 63c58ac (S3)
 M src/components/catalog/CatalogCascadeSelector.tsx      ← S4 (معتمد للاستكمال في P2)
 M src/components/catalog/CatalogCascadeTypes.tsx          ← S4 (معتمد للاستكمال في P2)
 ?? src/__tests__/s4-browse-catalog-source-gate.test.tsx   ← بوابة S4 (P2)
 ?? docs/audits/privacy-data-minimization-discovery.md     ← Discovery Report (مُحدَّثة بقرارات D1–D13)
 ?? docs/audits/privacy-data-minimization-decommission-plan.md ← هذه الوثيقة (خطة P0/P1 + قرارات E-1…E-13)
```

- لا تغيير إضافي عن ذلك. لا Commit ولا Push.

## 20. خطة Commits المقترحة (تُنفَّذ فقط بعد أمر صريح لكل مرحلة — مرحلة بمرحلة)

| # | المرحلة | المحتوى | الالتزام |
|---|---|---|---|
| 1 | P0/P1 | توثيق (Discovery + Plan + قرارات) | `docs(privacy): discovery + decommission plan + decision log (P0/P1)` |
| 2 | P2 | S4 استكمال | `feat(catalog): complete S4 browse via canonical loader (AT-24 green)` |
| 3 | P3 | stop-write (guest auth/telemetry/persistence/QR init) | `feat(privacy): stop guest-auth, telemetry, persistence, qr init` |
| 4 | P4 | remove game personal data (sessions/devices/calibrations) | `refactor(privacy): remove game personal data storage` |
| 5 | P5 | remove analytics/telemetry/QR surfaces | `refactor(privacy): remove analytics, telemetry, qr attribution` |
| 6 | P6 | repair/customer reassess | `refactor(privacy): repair/customer data per E-9 decision` |
| 7 | P7 | preserve Ads+Inventory+Catalog (معالجة أي أثر) | `feat(privacy): keep ads/inventory/catalog intact (P7)` |
| 8 | P8 | Anonymous Top-10 Leaderboard | `feat(privacy): anonymous top-10 leaderboard (minimal data)` |
| 9 | P9 | D1/D2/D3 (drop tables/functions/localStorage) | `feat(db): decommission migrations 00019–00024 after zero-write proof` |
| 10 | P10 | Full verification | `chore(privacy): acceptance gates green (P10)` |
| 11 | P11 | Independent review report | `docs(privacy): independent review report (P11)` |

> **قواعد ملزمة (من أمر الموافقة):** لا commit يحتوي أكثر من مرحلة واحدة؛ لا يجمع privacy deletion + S4 + db drops + leaderboard في commit واحد؛ لا amend لإخفاء؛ لا force-push؛ لا commit قبل أمر صريح بمرحلة؛ لا Push قبل تقرير المرحلة وموافقة المستخدم.

---

## Approval Gate (V) — مُحدَّثة وفق قرارات المالك النهائية (D1–D13 / E-1…E-13)

```
STATUS: DISCOVERY + PLAN COMPLETE + FINAL APPROVAL

P0 done (freeze + git state verified)  ✔
P1 done (both docs updated with decision log)  ✔
P2 (S4 complete) — APPROVED, waiting for go-ahead
P3…P11 — NOT started, each requires per-stage approval

NO CODE CHANGES beyond P0/P1 docs
NO DATABASE CHANGES
NO DELETIONS
NO MIGRATIONS
NO COMMITS
NO PUSH

WAITING FOR PER-STAGE GO / NEXT ORDER
```

| # | القرار | النتيجة |
|---|---|---|
| V-1 | النموذج المستهدف | **RESOLVED (E-1):** Commercial Showroom + Ads + Inventory + Catalog + WhatsApp + Game (engagement) + Anonymous Top-10؛ بلا تتبع/تنميط/قاعدة بيانات زوار دائمة |
| V-2 | اللعبة وبياناتها | **RESOLVED (E-1/E-2):** اللعبة **KEEP**؛ بيانات اللعبة الشخصية (sessions/devices/calibrations/telemetry/QR) **DELETE** |
| V-3 | analytics/telemetry | **RESOLVED (E-3):** **DELETE** (صفر تتبع)؛ الـ Top-10 مجهول ببيانات حد أدنى فقط |
| V-4 | QR/الحملات/الملصقات (M1/M2) | **RESOLVED (E-4):** **DELETE** (M1 data layer يُحذف بالكامل) |
| V-5 | نظام الإصلاحات | **RESOLVED (E-9):** **REASSESS** — بوابة مستقلة لكل جدول/مفتاح مع سبب؛ لا حذف عشوائي |
| V-6 | BI/Research | **RESOLVED (E-4):** تُحذف لوحات/خدمات Research/BI لاختفاء مصادرها؛ Ads **KEEP** (E-2) |
| V-7 | مخزون/أسعار/ذاكرة بائع localStorage | **RESOLVED (E-5):** Inventory **KEEP** |
| V-8 | Auth/Admin (الضيف، عزل admin، users) | **RESOLVED (E-8):** إزالة الضيف؛ عزل admin؛ مصير users **قرار قانوني أولاً** (REASSESS) |
| V-9 | مصير S4 | **RESOLVED (E-13):** **COMPLETE — استكمال كـ P2** (AT-24 خضراء ثم STOP + تقرير) |
| V-10 | contract tables (00009) | **REASSESS (E-10):** قرار منفصل بعد مراجعة |
| V-11 | حقوق الصور/الشعارات | `LEGAL REVIEW REQUIRED` — تبقى (E-13: لا ادعاء توافق) |
| V-12 | بدء التنفيذ | **منظّم كـ P0–P11 (E-13):** التنفيذ يبدأ مرحلةً بمرحلة؛ P0/P1 اكتملتا؛ كل مرحلة تالية ببوابة قبول مستقلة وCommit مستقل؛ HARD STOP عند أي أثر على Commercial Core/WhatsApp/Admin/M1/M2/S1–S3 |
| V-13 | أمن Anti-cheat | **RESOLVED (D12):** بلا user tracking، أقل آلية، يمر بمراجعة Data Minimization |
| V-14 | القانون | **RESOLVED (D13):** لا ادعاء توافق؛ تُكتب فقط "Technical data minimization implemented; legal validation remains required where marked" — مراجعة قانونية إلزامية لكل بند L1–L11 |

---

## Open Work Register (محدّث وفق P0–P11) — لا وسم ✅ إلا بعد التنفيذ الفعلي

### بوابات المالك
- [x] Discovery + Plan + قرارات المالك (D1–D13/E-1…E-13) موثّقة
- [ ] الاستشارة القانونية (إلزامية لكل بند L1–L11 — لا ادعاء توافق) — §U/L
- [ ] موافقة على **كل مرحلة** على حدة (P3…P11) قبل بدئها

### P0 — Freeze + Snapshot
- [x] تأكيد git state (HEAD 63c58ac، 2 ملفات S4 + بوابة + وثيقتان)
- [ ] نسخة snapshot فعلية (أرشيف ملفات) إن طُلب ضمن P0

### P1 — Documentation Gate
- [x] `discovery.md`: DECISION LOG D1–D13 + G1/G2/G3 + S + V + T + Open Work Register
- [x] `decommission-plan.md`: DECISION LOG E-1…E-13 + §5/§7/§8/§9/§10–§14/§17–§20 + Approval Gate + Open Work Register

### P2 — S4 COMPLETE (معتمد)
- [ ] تشغيل AT-24 بعد تعديلات S4 (حمراء حالياً — إثبات ثم إصلاح) — PG-56
- [ ] معالجة إخفاقات التصفح/البراند بلا `catalog_*_v1` — PG-14
- [ ] Inventory/Ads/Showroom + S1–S3 بلا تراجع — PG-50/51/52/55
- [ ] STOP + acceptance report (لا مرحلة تالية قبل موافقة)

### P3–P7 — إزالة البيانات الشخصية/التتبع (مراحل بموافقة منفصلة)
- [ ] P3 stop collectors (guest auth/telemetry/persistence/QR init) — PG-01/02/05
- [ ] P4 remove game personal data (sessions/devices/calibrations) — PG-03/30…34
- [ ] P5 remove analytics/telemetry/QR surfaces — PG-04/05/27
- [ ] P6 repair/customer REASSESS — بوابة مستقلة (E-9)
- [ ] P7 preserve Ads+Inventory+Catalog — PG-50/51/52

### P8 — Anonymous Top-10 Leaderboard (بعد موافقة معمارية)
- [ ] مخزّن حد أدنى + سياسة retention (§7) — PG-40…46
- [ ] "النتيجة خارج Top-10 لا تُخزَّن" + الحذف عند الخروج — PG-43/44

### P9 — Database Decommission (بعد إثبات صفر كتابة)
- [ ] migrations 00019–00024 بعد snapshot/backup — PG-11/18/19
- [ ] D2 (RPCs/triggers) + D3 (localStorage keys)

### P10/P11 — Verify + Independent Review
- [ ] بوابات 9A/9C/9D كاملة + typecheck + lint + build + full suite — PG-16/17
- [ ] تقرير مراجعة مستقل — P11

### بند دائم
- [ ] Privacy negative tests (PG-28) تُبقي e-commerce غائباً
- [ ] S5 · S6 · CATALOG-3 (تظل PENDING حتى أوامر منفصلة) — E-12
- [ ] A16 4/128 verification (لا تخمين)
- [ ] إزالة عنوان المشروع/ملفات .log من السجل (قرار)
- [ ] PG-27 (no hidden collectors) يُفحص في كل مرحلة

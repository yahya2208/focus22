# FOCUS — Privacy Execution Gate (Discovery / Pre-Execution)

**التاريخ:** 2026-08-07
**الفرع:** `main` — HEAD `ffa2d27` (S4 ✅ committed + pushed)
**المرجع:** `privacy-data-minimization-discovery.md` (قرارات D1–D13) + `privacy-data-minimization-decommission-plan.md` (خطة P0–P11، بوابات PG-*)
**الحالة:** `PRE-EXECUTION GATE — DOCUMENTATION ONLY`
**القيود:** لا حذف · لا تعديل كود · لا Migration · لا DROP · لا Commit · لا Push

```
STATUS: PRIVACY PATH — PRE-EXECUTION GATE READY
CATALOG-3: PAUSED (غير ملموس)
S4: ffa2d27 committed ✅
NEXT: موافقة المالك على المرحلة التنفيذية الأولى (P3) فقط
```

---

## 1. القرارات المثبتة (Locked — لا يُعاد تفسيرها)

| # | البند | القرار | الملخص التنفيذي |
|---|---|---|---|
| E-1 | GAME | **KEEP** | Engagement hook؛ لا حذف للعبة/المحرك/الشاشات |
| E-2 | GAME PERSONAL DATA | **DELETE/STOP** | sessions · devices/bصمة · calibrations · reaction/fatigue history · telemetry · click/screen/back tracking · QR attribution · research/BI · أي user_id يربط النتيجة بشخص |
| E-3 | ANONYMOUS TOP-10 | **KEEP (minimal)** | score/best_time + rank + game_version فقط؛ خارج Top-10 لا يُخزَّن؛ بلا PII |
| E-4 | ADS | **KEEP** | بلا تتبع زائر؛ Ad content ≠ user tracking |
| E-5 | INVENTORY | **KEEP** | بيانات صاحب المنصة (مخزون/أسعار/إدارة تجارة) |
| E-6 | CATALOG | **KEEP** | Catalog + S1–S4 + Showroom + WhatsApp handoff |
| E-9 | REPAIR/CUSTOMER PII | **REASSESS** | بوابة مستقلة لكل جدول/مفتاح مع سبب |
| E-10 | MINIMIZATION RULE | **معتمدة** | (A) تشغيل ميزة · (B) تحسين بيع/تجارة · (C) إدارة منتجات/مخزون/إعلانات · (D) أمن/تشغيل بحد أدنى. غير ذلك DELETE |
| E-13 | LEGAL | لا ادعاء توافق | `LEGAL REVIEW REQUIRED`/`UNKNOWN` تبقى؛ يُكتب فقط "Technical data minimization implemented; legal validation remains required where marked." |

**HARD STOP (دائم):** أي أثر على Ads/Inventory/Catalog/WhatsApp/Admin/M1/M2/S1–S3 أثناء التنفيذ ⇒ توقف فوراً بلا workaround، قدّم evidence وانتظر القرار.

---

## 2. جرد الكتّاب/القرّاء (Writer/Reader Inventory) — بناءً على فحص الكود الفعلي

### 2A. Guest Auth (E-2 — يُوقف الإنشاء التلقائي)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/core/auth/AuthProvider.tsx:48` | `service.signInAsGuest().catch(() => {})` — تسجيل دخول ضيف تلقائي عند الإقلاع | **STOP (P3)** |
| `src/core/auth/index.ts:110-111` | `supa.auth.signInAnonymously()` — إنشاء user_id دائم | **STOP (P3)** |
| `src/screens/auth/LoginScreen.tsx:61` | زر ضيف صريح في شاشة الدخول | **REASSESS** (حسب مصير Auth/Admin — قرار E-8) |

### 2B. بصمة الجهاز + الجلسات + المعايرة (E-2 — تُحذف كتاباتها)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/core/device/index.ts:126` | `collectDeviceProfile()` — بناء ملف الجهاز الكامل | **STOP (P3)** |
| `src/core/supabase/PersistenceProvider.tsx:4,269,273-283` | يجمع البصمة ويكتب `devices` | **STOP (P3)** |
| `src/core/supabase/PersistenceProvider.tsx:43,91,133,208,222,241,255,382,414` | كتابة/قراءة `sessions` (measurements/scientific_results) | **STOP (P3)** |
| `src/core/supabase/PersistenceProvider.tsx:323-348` | كتابة `calibrations` | **STOP (P3)** |
| `src/App.tsx:224` | `runSilentCalibration().then(...)` → `SET_CALIBRATION` | **STOP (P3)** |
| `src/screens/game-intro/GameIntroScreen.tsx:18` | `runSilentCalibration()` | **STOP (P3)** |
| `src/core/calibration/silent.ts:30` | `runSilentCalibration()` | **STOP (P3)** (الوظيفة تُبقى محلياً لحظياً بلا تخزين دائم) |
| `src/store/navigation.tsx:92,190` | `SET_CALIBRATION` action/reducer | **STOP (P3)** |

### 2C. Telemetry / Analytics (E-3 — صفر تتبع)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/App.tsx:319-320` | `telemetry.track('app_opened')` + `setupSessionTelemetry()` | **STOP (P3)** |
| `src/App.tsx:157,182` | `telemetry.track('qr_scanned', ...)` | **STOP (P3)** |
| `src/core/telemetry/index.ts:170,176,184` | `setupSessionTelemetry()`, `game_started`, `game_completed` | **STOP (P3)** |
| `src/core/navigation/back-dispatcher.ts:37,45,53` | `back_pressed`/`back_blocked` tracking | **STOP (P3)** |
| `src/hooks/useSmartWhatsApp.ts:56,57,75,80,119` | `whatsapp_sent`/`exit_*`/`whatsapp_*` tracking | **STOP (P3)** — WhatsApp نفسه يبقى مباشراً بلا أحداث |
| `src/screens/consent/ConsentScreen.tsx:15,20` | `consent_granted`/`consent_withdrawn` | **STOP (P3)** |
| `src/screens/countdown/CountdownScreen.tsx:17` | `game_started` | **STOP (P3)** |
| `src/screens/game/GameScreen.tsx:267,321` | `game_completed`/`game_abandoned` | **STOP (P3)** |
| `src/screens/game-intro/GameIntroScreen.tsx:16` | `game_intro_shown` | **STOP (P3)** |
| `src/screens/home/HomeScreen.tsx:210,219` | `game_started`/`phone_service_opened` | **STOP (P3)** |
| `src/screens/landing/LandingScreen.tsx:22,24,93` | `campaign_detected`/`landing_loaded`/`game_started` | **STOP (P3)** |
| `src/screens/message/PreGameMessageScreen.tsx:24` | `game_intro_shown` | **STOP (P3)** |
| `src/screens/register/RegisterScreen.tsx:34,39,40,58` | `register_*`/`auth_registered` | **STOP (P3)** (مع مصير Auth) |
| `src/screens/results/ResultsScreen.tsx:119,178` | `results_viewed`/`game_started` | **STOP (P3)** |

### 2D. QR / حملات / ملصقات (E-4 — إزالة attribution)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/App.tsx:146,157,165,176-198` | InitialRoute: deep-link QR → `lookupScanContext` + `qr_scanned` + `START_QR_FLOW` | **STOP (P3)** |
| `src/core/qr/campaign.ts:103,135,167,197,203,211,213,218` | `campaigns`/`qr_codes` RPCs + `increment_qr_counter` + قراءة `analytics_events` | **STOP (P3)** |
| `src/core/qr/referral.ts:142,152,166` | إدراج `analytics_events` للإحالات | **STOP (P3)** |
| `src/core/supabase/data-service.ts:298,345,370,380,387,423,432,451,477,495,505,550,564,587,600,607,623,631,643,653` | `campaigns`/`qr_codes`/`placements`/`placement_history` قراءة/كتابة | **STOP (P3)** |
| `src/core/supabase/data-service.ts:532` | `lookupScanContext` | **STOP (P3)** |
| `src/store/navigation.tsx:96,224,284` | `START_QR_FLOW` action/reducer | **STOP (P3)** |
| `src/services/sticker/sticker-database.ts` | `sticker_scans`/`sticker_serial_counter` (IP/UA/referrer) | **STOP (P3)** |

### 2E. Repair / Customer / Device-Ledger (E-9 — REASSESS ببوابة مستقلة)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/core/supabase/repair-data-service.ts:96-259` | كتابة/قراءة `repair_requests/quotes/timeline/courier_jobs/notifications/photos` | **REASSESS (P6)** — لا يُلمس في P3 |
| `src/services/repair/repair-database.ts` + `repair-types.ts:243-261` | LS: `repair_requests`/`repair_quotes`/`repair_photos` + legacy `repair_*_v1` | **REASSESS (P6)** |
| `src/services/customer-memory.ts:3-4,38-62` | LS: `customer_memory_sessions`/`customer_memory_events` (اسم/نشاط) | **REASSESS (P6)** |
| `src/services/device-ledger.ts:102-120,366-367` | LS: `device_ledger_v1`/`device_ledger_sequence` (IMEI) | **REASSESS (P6)** |

### 2F. Research / BI (E-2/E-4 — تُحذف باختفاء مصادرها)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/core/research/api-supabase.ts:263-758,927` | قراءة `sessions`/`devices`/`calibrations`/`analytics_events`/`surveys`/`qr_codes` | **STOP (P4/P5)** |
| `src/business-intelligence/api.ts:37-516` | قراءة `analytics_events`/`sessions`/`devices` | **STOP (P4/P5)** |
| `src/business-intelligence/*` | LS: `bi_branch_data` + `bi_*` (StaffPerformance...) | **REASSESS (P6)** |

### 2G. Gamification / Game localStorage (E-1/E-9 — محلي مجهول)

| الملف:السطر | الدور | الحكم |
|---|---|---|
| `src/core/gamification/achievements.ts:52,56,73` | LS: `focus_achievements` | **REASSESS (E-9)** — محلي مجهول؛ قد يبقى مع اللعبة |
| `src/core/gamification/daily-challenge.ts:14-15,70,78,103,106,108,117` | LS: `focus_daily_challenge`/`focus_daily_completed` | **REASSESS (E-9)** — محلي مجهول |
| `focus_sessions`/`focus_sessions_v2` | (بنية مستقبلية غير مكتوبة) | لا شيء مطلوب |
| `focus_settings`/`focus_theme` | تفضيلات العرض | **KEEP** |

---

## 3. خريطة DELETE vs KEEP (الماستر — يُعتمد عليها في كل مرحلة)

### يُوقف/يُحذف (Stop/Delete) — بيانات شخصية/تتبعية

| المجموعة | العناصر | البوابة/المرحلة |
|---|---|---|
| Guest auth الضمني | `AuthProvider.tsx:48`, `index.ts:110`, أعمدة `users` الضيف | P3 |
| بصمة/جلسات/معايرة | `PersistenceProvider` (sessions/devices/calibrations), `App.tsx:224`, `GameIntroScreen:18`, `SET_CALIBRATION` | P3/P4 |
| Telemetry/Analytics | `App.tsx:319-320`, كل `telemetry.track(...)` في §2C، `back-dispatcher` | P3 |
| QR attribution | InitialRoute deep-link, `core/qr/*`, `data-service` (campaigns/qr/placements), `START_QR_FLOW`, stickers | P3 |
| Research/BI | `core/research`, `research-console`, `business-intelligence` | P4/P5 |
| Leaderboard شخصي/قديم | أي سجل نتائج مرتبط بهوية | P4 (قبل P8) |

### يبقى (Keep) — Commercial Core + Game + Top-10

| المجموعة | العناصر | السبب |
|---|---|---|
| **اللعبة** | `src/core/engine/*`, `src/core/scientific/constants.ts`, شاشات game/intro/countdown/results/history/achievements | E-1 (engagement hook) |
| **Top-10 مجهول** | score/best_time/rank/game_version — بلا PII | E-3 (P8 لاحقاً) |
| **الإعلانات** | `ads` جدول + `ads-images` bucket + `ads-service` + `AdBanner` | E-4 — بلا تتبع زائر |
| **المخزون** | `catalog_inventory`, `catalog_inventory_movements_v2`, `catalog_inventory_transactions`, `price_memory_v1` | E-5 |
| **الكتالوج** | `src/catalog/*` JSON→loader، `catalog-service`, S1–S4 (committed) | E-6 |
| **WhatsApp** | `useSmartWhatsApp` (بلا أحداث)، `whatsapp-service`، `ProductActionBar` → wa.me مباشر | KEEP مباشر |
| **التفضيلات** | `focus_settings`/`focus_theme` | وظيفي محلي |
| **Admin (مفصول)** | Auth/roles/ProtectedRoute — عزل admin فقط إن لزم | E-8 |

### معلّق (REASSESS — بوابة مستقلة)

| المجموعة | العناصر | متى |
|---|---|---|
| Repair/customer/device-ledger/IMEI | جداول + مفاتيح LS (§2E) | P6 — قرار منفصل لكل جدول/مفتاح مع سبب |
| Gamification محلي | `focus_achievements`/`focus_daily_*` | P4 (يُقرَّر الإبقاء كجزء من اللعبة) |
| Auth/Admin/`users` | مصير الضيف + العزل | E-8 — قرار قانوني أولاً |
| contract tables (00009) | `system_settings`/`audit_log`/`job_assignments` | E-10 |

---

## 4. ترتيب الإيقاف (Stop-Order — حتى لا تعود البيانات للظهور)

> القاعدة الذهبية: **إيقاف الكتابة أولاً ← ثم إيقاف الوصول ← ثم حذف البيانات ← ثم التحقق.**

1. **P3 — Stop-Write (المرحلة التنفيذية الأولى المقترحة):**
   - تعطيل `signInAsGuest` التلقائي (`AuthProvider.tsx:48`).
   - إزالة `PersistenceProvider` من شجرة `App.tsx:331` → تتوقف كتابة sessions/devices/calibrations فوراً.
   - إزالة `setupSessionTelemetry()` + `telemetry.track('app_opened')` (`App.tsx:319-320`).
   - إزالة `runSilentCalibration()` dispatch (`App.tsx:224`).
   - إزالة فرع deep-link QR في `InitialRoute` (`App.tsx:135-199`).
   - إزالة استدعاءات `telemetry.track` في مسار اللعبة والواجهات (§2C).
   - **بوابات قبول تُكتب RED أولاً** ثم تُشغَّل (PG-01/02/04/05/27) + بوابات الحفاظ (PG-30/50/51/52/54/13/14/15).
2. **P4 — إزالة بيانات اللعبة الشخصية** (قراءات sessions/devices/calibrations في research/BI) — بوابات PG-03/30…34.
3. **P5 — إزالة أسطح analytics/telemetry/QR/repair-sticker** — بوابات PG-04/05/27.
4. **P6 — REASSESS repair/customer/device-ledger/BI** — بوابة مستقلة لكل جدول/مفتاح.
5. **P7 — Preservation check** (Ads/Inventory/Catalog/WhatsApp بلا أثر) — PG-50/51/52/13/15.
6. **P8 — Anonymous Top-10** (مخزّن حد أدنى + retention) — PG-40…46.
7. **P9 — DROP بعد إثبات صفر كتابة** (migrations 00019–00024 بعد snapshot/backup) — PG-11/18/19.
8. **P10/P11 — Verify + Independent Review** — PG-16/17/57.

---

## 5. بوابات القبول (Acceptance Gates) — تُكتب RED أولاً في كل مرحلة

> كل بوابة تُنشأ كاختبار (vitest + grep/AST) **قبل** تنفيذ مرحلتها وتُشغَّل **حمراء** لإثبات المشكلة، ثم **خضراء** بعد التنفيذ. (المرجع الكامل: decommission-plan §9.)

### مرحلة P3 (المقترح الأول)
- PG-01 `no-guest-signin-created` — لا استدعاء تلقائي لـ `signInAsGuest` عند الإقلاع.
- PG-02 `no-persistence-provider-write` — لا كتابة `sessions`/`devices`/`calibrations` من الكود.
- PG-04 `no-game-telemetry` — صفر `telemetry.track`/`setupSessionTelemetry` في التطبيق.
- PG-05 `no-qr-tracking` — صفر `lookupScanContext`/`START_QR_FLOW`/`hasCampaign`/`increment_qr_counter`.
- PG-27 `no-hidden-collectors` — لا collector جديد بلا إدراج في Data Inventory.
- **الحفاظ (Hard-Stop gates):** PG-30 `game-runs`, PG-50 `ads-work`, PG-51 `inventory-works`, PG-52 `catalog-works`, PG-54 `no-dead-routes`, PG-13 `whatsapp-direct-route`, PG-14 `catalog-ssot-intact`, PG-15 `browse-to-whatsapp-ok`, PG-16 `typecheck-lint-build-pass`, PG-17 `full-suite-pass`, PG-57 `hardstop-not-triggered`.

### مراحل لاحقة (تُكتب عند بدئها فقط)
- P4: PG-03/30/31/32/33/34 · P5: PG-04/05/27 · P6: بوابة REASSESS مستقلة · P8: PG-40…46 · P9: PG-11/18/19 · P10/P11: PG-16/17/53/57.

---

## 6. منهج التنفيذ (مطابق لمنهج الكتالوج)

```
بوابة RED ← تنفيذ محدود للمرحلة الواحدة ← أدلة ← مراجعة ← Commit مستقل ← Push ← STOP
```

- **مرحلة واحدة فقط** لكل أمر صريح.
- **Commit مستقل لكل مرحلة** (لا يخلط privacy مع أي شيء آخر؛ لا P3 مع S4 مع leaderboard مع drops).
- لا Push قبل تقرير المرحلة + موافقة المالك.
- بعد نجاح المرحلة الأولى (P3): تقرير + STOP + موافقة جديدة لـ P4.

---

## 7. git status الحالي (فوري)

```
On branch main — HEAD ffa2d27 (S4 ✅)
?? docs/audits/privacy-data-minimization-discovery.md
?? docs/audits/privacy-data-minimization-decommission-plan.md
?? docs/audits/p2-s4-acceptance-report.md
?? docs/audits/privacy-execution-gate.md   ← هذه الوثيقة (PRE-EXECUTION)
```

- لا تعديل كود، لا حذف، لا Migration. (وثائق P0/P1 تبقى غير ملتزمة — commitها قرار منفصل.)

---

## 8. القرار المطلوب من المالك

| # | القرار |
|---|---|
| G-1 | اعتماد هذه الخريطة (DELETE vs KEEP) كما هي |
| G-2 | اعتماد P3 (Stop-Write) كأول مرحلة تنفيذية، مع كتابة بواباتها RED أولاً وتنفيذ محدود ثم تقرير + STOP |
| G-3 | تأجيل P4…P11 كلها حتى تقارير/موافقات مستقلة |
| G-4 | تأجيل REASSESS (repair/customer/BI) وTop-10 وDROPs — لا تُلمس الآن |
| G-5 | أمر منفصل لاحقاً لـ Commit وثائق P0/P1 (اختياري) |

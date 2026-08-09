# P4 RED VERIFICATION — GAME PERSONAL-DATA MINIMIZATION

المعتمد: المالك | الحالة: **READY FOR OWNER APPROVAL** | تاريخ التحقق: 2026-08-08

---

## 1. HEAD

- Commit: `6ecbf3700afb0ec2d468ba295ff0081bea31cab2`
- Subject: `feat(privacy): P3 Stop-Write — no boot-time writes (no auto-guest, no telemetry sender, no QR/campaign attribution)`
- Branch: `main`
- Base: `origin/main` — **لا divergence** (P3 حُزم وسُلّم كاملاً).

## 2. Working Tree

- نظيف من التعديلات على كود الإنتاج — **لا يوجد أي تعديل production code في هذه الجولة**.
- Untracked فقط (لم تُلتزم ولم تُحذف):
  - `.opencode-summary/reports/scan-count-removal-100pct.md` (تاريخي)
  - `docs/audits/p4-game-personal-data-minimization-report.md` (جرد سابق)
  - `privacy_decommission_current_state_recovery_report.md` (تقرير الحالة)
  - `src/__tests__/privacy/p4-game-minimization-gate.test.ts` (بوابة P4 — موجودة مسبقاً، **لم تُعدَّل**)

## 3. RED Gates

**7/7 اختبارات بوابة P4 RED فاشلة** — كما هو متوقع ومطلوب لمرحلة P4 غير المنفذة.

`src/__tests__/privacy/p4-game-minimization-gate.test.ts`

```
Test Files  1 failed (1)
Tests       7 failed (7)
Duration    24.76s
```

الاختبارات الفاشلة (7): PG-03 ×2، PG-32 ×1، PG-33 ×2، PG-34 ×2.

## 4. PASS/FAIL لكل PG

| PG | التعريف | النتيجة | الدليل |
|---|---|---|---|
| **PG-03** | `no-device-fingerprint-stored` | **FAIL (RED)** | `PersistenceProvider.tsx:4` يستورد `collectDeviceProfile`؛ `:269` يستدعيه؛ `:273,:283` يكتبان `from('devices')` |
| **PG-32** | `no-game-persistent-identity` | **FAIL (RED)** | `PersistenceProvider.tsx:267` `ensureDeviceAndCalibration`؛ `:23,:30` `auth.getUser()` |
| **PG-33** | `no-game-session-stored` | **FAIL (RED)** | `from('sessions')` في 11 موضعاً (`:43,:91,:133,:208,:222,:241,:255,:382,:414`)؛ `/rest/v1/sessions` في `:152,:172` |
| **PG-34** | `game-local-only` (لا تخزين محلي للمعايرة) | **FAIL (RED)** | `silent.ts:24` `localStorage.setItem('focus_calibration_profile')`؛ `:22` `saveProfile`؛ `calibration-cache/index.ts` يكتب `focus_calibration_cache` |
| **PG-04** | `لا analytics_events للتتبع` — مستوى P3 | **PASS (GREEN)** | بوابة P3 `p3-stop-write-gate.test.ts:141-173` (معطّل افتراضياً، بلا مُرسِل) |
| **PG-04** | مستوى P4: إزالة track call-sites الخاصة باللعبة | **FAIL (RED)** | 6 مواضع متبقية: `GameScreen.tsx:267,321`، `CountdownScreen.tsx:17`، `GameIntroScreen.tsx:16`، `ResultsScreen.tsx:119,178` |
| **PG-10** | `localstorage-keys-pruned` | **FAIL (RED)** | `silent.ts:4` `focus_calibration_profile` مكتوب فعلياً؛ `calibration-cache/index.ts:26` `focus_calibration_cache` مكتوب فعلياً — لم تُقلَّص المفاتيح |
| **PG-30** | اللعبة تعمل بلا تخزين | **PASS (GREEN)** | بوابة P3 `:216-234` (جلسات في الذاكرة + engine) |
| **PG-31** | `game-engine-present` | **PASS (GREEN)** | `src/core/engine/{consistency,fatigue,reaction,scoring}.ts` موجودة + `src/core/scientific/constants.ts` |

**خلاصة:** بوابات P4 الصرّفة (PG-03/32/33/34 في ملف البوابة) **7/7 RED صحيحة ومتوقعة**؛ بوابات KEEP (PG-30/31) **GREEN**؛ PG-10 RED؛ PG-04 أحمر على مستوى P4 فقط.

## 5. Evidence (أدلة فعلية)

**PG-03 — كاتب بصمة الجهاز موجود في الكود:**
```
PersistenceProvider.tsx:4     import { collectDeviceProfile, type DeviceProfile } from '../device';
PersistenceProvider.tsx:269   const deviceProfile: DeviceProfile = collectDeviceProfile();
PersistenceProvider.tsx:273   .from('devices')   // insert { user_id, browser, browser_version, os, os_version,
                                                        //   platform, screen_width, height, pixel_ratio, refresh_rate,
                                                        //   touch_support, pointer_type, cpu_cores, memory_gb,
                                                        //   language, timezone, user_agent, collected_at }
PersistenceProvider.tsx:283   .from('devices')   // update
```

**PG-32 — هوية مطلوبة لبدء/إيقاف الجلسات:**
```
PersistenceProvider.tsx:23,30   const { data: { user } } = await client.auth.getUser();
PersistenceProvider.tsx:267     async function ensureDeviceAndCalibration(userId: string, ...)
PersistenceProvider.tsx:407,451 const { deviceId, calibrationId } = await ensureDeviceAndCalibration(userId, ...)
```

**PG-33 — كاتب جلسات فعلي في الكود (11 موضعاً):**
```
PersistenceProvider.tsx:43,91,133,208,222,241,255,382,414  .from('sessions').insert/.upsert/.update
PersistenceProvider.tsx:152,172  `/rest/v1/sessions?id=eq.${sessionId}`  (unload beacon REST)
```

**PG-34 — تخزين محلي مستمر للمعايرة:**
```
silent.ts:4    const STORAGE_KEY = 'focus_calibration_profile';
silent.ts:22   function saveProfile(...)   // localStorage.setItem
silent.ts:75   saveProfile(profile);
calibration-cache/index.ts:26  CALIBRATION_CACHE_KEY = 'focus_calibration_cache'
calibration-cache/index.ts     createCalibrationCache().set() → localStorage.setItem(...)
```

**PG-04 (P4) — track call-sites اللعبة باقية:**
```
GameScreen.tsx:267      telemetry.track('game_completed', ...)
GameScreen.tsx:321      getGlobalTelemetry().track('game_abandoned', ...)
CountdownScreen.tsx:17  getGlobalTelemetry().track('game_started', ...)
GameIntroScreen.tsx:16  getGlobalTelemetry().track('game_intro_shown')
ResultsScreen.tsx:119   getGlobalTelemetry().track('results_viewed', ...)
ResultsScreen.tsx:178   getGlobalTelemetry().track('game_started', ...)
```
> محايد: `telemetry/index.ts:122-128` — `createDisabledTelemetry()` بلا sendFn و `enabled: false`؛ لا يوجد أي مُرسِل شبكة (`fetch/sendBeacon/XHR` = صفر). أي `track()` يخرج فوراً عند السطر 64 بلا طابور. **لكن** بقاء call-sites هو ما تتطلّب بوابة P4 إزالته.

**PG-10 — مفاتيح localStorage غير مُقلَّصة:**
```
focus_calibration_profile  (silent.ts — كاتب فعلي)
focus_calibration_cache    (calibration-cache — كاتب فعلي عبر createCalibrationCache)
```

**PG-31 — محرك اللعبة محفوظ (KEEP):**
```
src/core/engine/consistency.ts
src/core/engine/fatigue.ts
src/core/engine/reaction.ts
src/core/engine/scoring.ts
src/core/scientific/constants.ts
```

## 6. ACTIVE writers (من الكود — ستزال في P4)

- `PersistenceProvider.tsx` → `devices` (بصمة كاملة) و`calibrations` و`sessions` (تتطلب `auth.getUser`).
- `silent.ts` → `localStorage['focus_calibration_profile']` (مُستدعى من `App.tsx:152` عند الإقلاع).
- `calibration-cache/index.ts` → `localStorage['focus_calibration_cache']` (عبر `createCalibrationCache`).
- شاشات اللعبة (6 مواضع) → استدعاءات `track('game_*')`.

## 7. DORMANT writers (معطَّلة منذ P3، لا تُكتب فعلياً من runtime)

- `PersistenceProvider.tsx` كاملاً — غير مركّب في `App.tsx` (بوابة P3: `PG-02` لا import ولا mount؛ محقق بـ `p3-stop-write-gate.test.ts:121-139`).
- الـ global telemetry — `enabled: false` بلا مُرسِل (`telemetry/index.ts:122-128`).
- `session-repository.ts` / `live-sessions.ts` / `data-service.ts` (`sessions` writers) — مسارات admin/research/BI، خارجة عن شجرة التشغيل، **REASSESS لا تحذف في P4**.

## 8. KEEP paths verified

- **Game engine + gameplay:** `core/engine/*` + `core/scientific/constants.ts` — موجودة، PG-31 GREEN.
- **جلسات اللعبة في الذاكرة:** `core/session/service.ts` — خالية من `user_id`/auth (grep = صفر نتائج)، PG-30 GREEN.
- **Ads / Inventory / Catalog SSOT / Showroom / WhatsApp / Theme:** محمية (بوابة P3 `PG-50/51/52/14/13/15/57` خضراء، لا تعديل هنا في P4).

## 9. Files that would be changed in P4

```
src/core/supabase/PersistenceProvider.tsx      (إزالة collectDeviceProfile / devices / calibrations / sessions / ensureDeviceAndCalibration)
src/core/calibration/silent.ts                 (localStorage → in-memory فقط؛ إزالة saveProfile)
src/core/calibration-cache/index.ts            (localStorage → createInMemoryCalibrationCache)
src/screens/game/GameScreen.tsx                (إزالة track game_completed / game_abandoned)
src/screens/countdown/CountdownScreen.tsx      (إزالة track game_started)
src/screens/game-intro/GameIntroScreen.tsx     (إزالة track game_intro_shown)
src/screens/results/ResultsScreen.tsx          (إزالة track results_viewed / game_started)
```

> تقدير مبدئي قائم على فحص البوابات، لا على تنفيذ فعلي — القائمة تُثبَّت نهائياً أثناء التنفيذ بعد موافقة المالك.

## 10. Files explicitly protected from change (P4 لا يمسها)

```
src/catalog/**                       (Catalog SSOT)
src/services/inventory-*             (المخزون)
src/services/ads-service.ts + src/components/ads/**   (الإعلانات)
src/components/showroom/**           (Showroom / Similar products)
src/services/whatsapp-*  + useSmartWhatsApp (WhatsApp المباشر)
Game engine + gameplay path: src/core/engine/**, src/core/scientific/**, شاشات اللعبة (إلا استدعاءات track وحدها)
Theme / Language / Preferences
src/core/supabase/session-repository.ts, live-sessions.ts, data-service.ts   (REASSESS — لا تحذف في P4)
```

## 11. SQL / Migration / DROP / Production code / Commit / Push

| الفعل | الحالة |
|---|---|
| SQL على قاعدة البيانات | **NO** |
| Migrations | **NO** |
| DROP (جداول / RPC / triggers) | **NO** |
| تعديل Production code | **NO** |
| Commit | **NO** |
| Push | **NO** |

---

## الختام

التحقق اكتمل عند `HEAD 6ecbf37`. بوابة P4 RED **صحيحة ومتوقعة بالكامل**: 7/7 فشل في اختبارات `p4-game-minimization-gate.test.ts` تثبت أن الجهاز/المعايرة/الجلسات/التخزين المحلي للمعايرة ما زالت مكتوبة في الكود (PG-03/32/33/34)، ومفاتيح localStorage غير مُقلَّصة (PG-10)، وtrack call-sites اللعبة باقية (PG-04 بمستوى P4) — بينما بوابات الحماية (PG-30/31) خضراء ومسارات KEEP سليمة. لا شيء مُعدَّل، لا شيء مُلتزم، لا شيء مُحذف.

**HARD STOP — P4 READY FOR OWNER APPROVAL**

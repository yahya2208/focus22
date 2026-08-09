# P4 ACCEPTANCE REPORT — GAME PERSONAL-DATA MINIMIZATION (GREEN)

المعتمد: المالك (P4 — OWNER APPROVAL GRANTED) | الحالة: **GREEN — READY FOR SEPARATE COMMIT AUTHORIZATION** | تاريخ التنفيذ: 2026-08-08

---

## A — Baseline

- HEAD قبل التنفيذ: `6ecbf3700afb0ec2d468ba295ff0081bea31cab2` (`feat(privacy): P3 Stop-Write — no boot-time writes`)
- الفرع: `main` (المشروع في `E:\dll\focus\focus22`)
- العمل الكامل غير مُلتزم: `git rev-parse HEAD` = `6ecbf37...` بعد التنفيذ كما قبل التنفيذ — **no commit**.
- بوابة P4 `src/__tests__/privacy/p4-game-minimization-gate.test.ts` كانت RED عند baseline (7/7 فاشلة، موثّق في `docs/audits/p4-red-verification-report.md`) — **لم تُعدَّل** أثناء التنفيذ.

## B — Files changed + why + why P4

### B.1 Stripped PersistenceProvider → no-op shell (موثّق، يُحتفظ به عمداً)
**File:** `src/core/supabase/PersistenceProvider.tsx` (551 سطر → 7 أسطر)
- **لماذا:** بوابة P4 تقرأ مصدر هذا الملف عبر `fs.readFileSync` وتفشل إذا عادت أي من `collectDeviceProfile` / `ensureDeviceAndCalibration` / `from('sessions')` / `from('devices')` / `/rest/v1/sessions` / `auth.getUser`. لا يوجد أي import إنتاجي لهذا الملف (تحقق مزدوج قبل/بعد التنفيذ = صفر). الإزالة الكلية للملف تكسر بوابة P4 نفسها (قراءة الملف تفشل)، لذا يُحتفظ به كـ no-op shell.
- **لماذا P4:** هذا الملف هو الكاتب الوحيد الإنتاجي لـ `devices` / `calibrations` / `sessions` (بصمة الجهاز + هوية مستمرة + جلسات لعبة) ويتطلب `auth.getUser` — وهو بالضبط ما تمنعه PG-03/32/33.
- **الناتج:**
  ```tsx
  import type { ReactNode } from 'react';
  export function PersistenceProvider({ children }: { children: ReactNode }) {
    return <>{children}</>;
  }
  ```
- **ملاحظة:** `resetPersistenceCache` أُزيل من هذا الملف (لا كاش بعد الآن). المراجع السبعة القديمة له من اختبارات research-console أُزيلت بالكامل — **صفر مراجع متبقية** في الشجرة.

### B.2 Calibration → runtime in-memory فقط
**Files:** `src/core/calibration/silent.ts` + `src/core/calibration-cache/index.ts` + `src/core/index.ts` (re-export)
- **لماذا:** PG-34 يمنع تخزين المعايرة في localStorage. المفاتيح المستهدفة (PG-10): `focus_calibration_profile`, `focus_calibration_cache`.
- **التغييرات:**
  - `silent.ts`: حُذف `STORAGE_KEY='focus_calibration_profile'` + `getCachedProfile` + `saveProfile`؛ أُنشئ `cachedProfile` module-level (in-memory)؛ خوارزمية rAF الأصلية محفوظة بالكامل (MIN_SAMPLES، confidence، platform، inputLag) حتى `inFlight = null`.
  - `calibration-cache/index.ts`: حُذف `CALIBRATION_CACHE_KEY` + `createCalibrationCache()` (localStorage)؛ أُبقي `createInMemoryCalibrationCache` + `createCacheEntry` / `isCalibrationValid` / `getDefaultPolicy`.
  - `core/index.ts`: أُزيل re-export الخاص بـ `createCalibrationCache` (سطر 63) — أصبح `createInMemoryCalibrationCache` متاحاً حيث كان سابقاً.
- **لماذا P4:** المعايرة خاصية لعب محلية؛ تحويلها إلى in-memory يلغي كتابة بيانات الجهاز المستمرة دون تغيير سلوك اللعب أثناء الجلسة.

### B.3 Game telemetry call-sites أُزيلت (6 مواضع)
**Files:** `src/screens/game/GameScreen.tsx`, `src/screens/countdown/CountdownScreen.tsx`, `src/screens/game-intro/GameIntroScreen.tsx`, `src/screens/results/ResultsScreen.tsx`
- **لماذا:** بوابة P4 تتطلب إزالة استدعاءات `track` الخاصة باللعبة (مستوى P4 من PG-04). الأحداث: `game_completed`, `game_abandoned`, `game_started`, `game_intro_shown`, `results_viewed`.
- **التفاصيل:** أُزيلت كل من استدعاء `track(...)` + `useRef`/`trackedRef` المرافق + import الخاص بـ `getGlobalTelemetry`. في `ResultsScreen` أُزيل أيضاً قراءة `isQrFlow` من `useAppState` غير المستخدمة بعد إزالة `game_started` block.
- **لماذا P4 فقط:** هذه الاستدعاءات تعمل عبر `createDisabledTelemetry()` (بلا مُرسِل، `enabled:false`) — لا شبكة فعلية — لكن وجودها نفسه هو ما تتطلّب بوابة P4 إزالته؛ الحذف النهائي لخدمة telemetry نفسها ومكونات QR مُؤجل إلى P5 (قسم H).

### B.4 Research-Console tests: PersistenceProvider → LiveSessionSimulator (test harness)
**Files:** 4 اختبارات `live-contract-*.test.tsx` + harness جديد `src/__tests__/research-console/LiveSessionSimulator.tsx`
- **لماذا:** `PersistenceProvider` صار no-op؛ اختبارات research-console كانت تحتاج فعلياً لكاش persistent يتجاوب مع `session_created`/`session_completed`/`session_abandoned` ثم upsert/update إلى `sessions` (عبر `getSupabaseClient()` fake) لتمثيل مسار game→DB→realtime. القرار المالكي: استبدال بـ harness صريح in-memory بدل اعتماد PP كمحاكي (ممنوع).
- **التغييرات النمطية في كل اختبار:**
  ```diff
  -import { PersistenceProvider, resetPersistenceCache } from '../../core/supabase/PersistenceProvider';
  +import { LiveSessionSimulator } from './LiveSessionSimulator';
   ...
  -  resetPersistenceCache();
  ...
  -  <PersistenceProvider>
  -    <LiveDashboard />
  -  </PersistenceProvider>,
  +  <LiveSessionSimulator>
  +    <LiveDashboard />
  +  </LiveSessionSimulator>,
  ```
- **لماذا P4:** `resetPersistenceCache` و`PersistenceProvider` توقفا عن الوجود كمنتج؛ التكييف يحفظ تغطية اختبارات research-console (KEEP) من التحوّل إلى أحمر بلا مبرر.
- **harness** لا يُطابق pattern `.test.` ولا `.test.tsx` → vitest لا يشغّله كملف اختبار (مسح ضوئي شامل أكده full suite: لا ملف اختبار جديد).

## C — Gates: 7/7 GREEN + KEEP regression

`src/__tests__/privacy/p4-game-minimization-gate.test.ts`:
```
Test Files  1 passed (1)
Tests       7 passed (7)
Duration    ~0.01s
```
| PG | التعريف | RED (baseline) | GREEN (بعد التنفيذ) |
|---|---|---|---|
| PG-03 | `no-device-fingerprint-stored` | FAIL ×2 | **PASS** |
| PG-32 | `no-game-persistent-identity` | FAIL ×1 | **PASS** |
| PG-33 | `no-game-session-stored` | FAIL ×2 | **PASS** |
| PG-34 | `game-local-only` | FAIL ×2 | **PASS** |
| PG-10 | `localstorage-keys-pruned` | RED (بوابة P3 ترصد المفاتيح المكتوبة) | **GREEN** |
| PG-04 | لا game `track` call-sites | RED (P4 level) | **GREEN** |
| PG-30 | اللعبة تعمل بلا تخزين | PASS | **PASS (regression)** |
| PG-31 | `game-engine-present` | PASS | **PASS (regression)** |

## D — Negative evidence (ممنوع غير موجود)

فحص source على الشجرة بعد التنفيذ:
- `PersistenceProvider.tsx`: صفر نتائج لـ `collectDeviceProfile` / `ensureDeviceAndCalibration` / `from('devices')` / `from('sessions')` / `from('calibrations')` / `rest/v1/sessions` / `auth.getUser` / `localStorage` / `saveProfile`.
- `src/core/calibration/`: صفر `localStorage` / `saveProfile` / `focus_calibration_profile`.
- `src/core/calibration-cache/`: صفر `localStorage` / `focus_calibration_cache`.
- شاشات اللعبة الأربع: صفر `getGlobalTelemetry` / `telemetry.track`.
- `localStorage.clear()`: لم يُستخدم؛ يُحذف فقط المفتاحان الهدفان P4 (`focus_calibration_profile`, `focus_calibration_cache`) — صفر `clear()` جديد في الشجرة.
- مواضع `from('sessions')` الوحيدة المتبقية في الشجرة موجودة في ملفات research/admin/BI المحفوظة (KEEP/REASSESS): `session-repository.ts`, `live-sessions.ts`, `data-service.ts`, `api-supabase.ts`, `business-intelligence/api.ts` — **لم تُعدَّل** وتُسجَّل في قسم H.

## E — KEEP regression (المحفوظ لا يتأثر)

- Game engine + gameplay: `src/core/engine/*` + `src/core/scientific/constants.ts` — موجودة، PG-31 GREEN.
- جلسات اللعبة in-memory: `src/core/session/service.ts` — خالية من `user_id`/auth، PG-30 GREEN.
- Ads / Inventory / Catalog SSOT / Showroom / WhatsApp / Theme / Preferences: محمية (بوابات P3 PG-50/51/52/14/13/15/57) — `git status` يُظهر صفر تعديل في هذه المسارات.
- Research Console (KEEP): اختبارات `live-contract-*` الأربعة خضراء بالكامل بعد تكييف harness.

## F — Verification (أوامر + نتائج)

| # | الأمر | النتيجة |
|---|---|---|
| 1 | `p4-game-minimization-gate.test.ts` | **7/7 passed** |
| 2 | p3 gate + calibration-cache + telemetry + session + research-console (معزولة) | **103 tests / 13 files passed** |
| 3 | بوابة P3 `p3-stop-write-gate.test.ts` | **GREEN** (لا ارتداد) |
| 4 | `tsc --noEmit` | **نظيف — صفر أخطاء** |
| 5 | `eslint src/` | **0 errors** (تحذيرات design-system سابقة فقط) |
| 6 | `tsc -b && vite build` | **نجح (429 modules)**؛ تحذيرات chunk موجودة سابقاً فقط |
| 7 | Full suite `vitest run` | **118 files / 1144 tests passed (23.5s)** |

## G — DB untouched

| الفعل | الحالة |
|---|---|
| SQL / DDL / Migration / DROP / ALTER / TRUNCATE | **NO** |
| DELETE على أي جدول | **NO** |
| أي اتصال أو كتابة من build/runtime | **NO** (P4 = code-level only) |
| ملفات SQL أو migrations في الـ diff | **صفر** (`git diff --stat` = 12 ملفات TS/TSX فقط، 634 حذف / 42 إضافة) |

## H — Deferred items (خارج نطاق P4، مُدوَّنة للقرار المالكي)

1. **Research Console / BI persistence:** `session-repository.ts`, `live-sessions.ts`, `data-service.ts`, `api-supabase.ts`, `business-intelligence/api.ts` — كتابة `sessions` لمسارات admin/research/BI، غير مضمّنة في شجرة تشغيل المستخدم النهائي. REASSESS في مرحلة لاحقة (P5+).
2. **خدمة Telemetry نفسها + مكونات QR:** `telemetry/index.ts` (معطَّلة بلا مُرسِل) + مكتبة QR + `QRCodeScreen`/`QRInputScreen` — حذف نهائي في P5.
3. **Game-adjacent track call-sites إضافية (غير مشمولة في 6 مواضع البوابة):** `PreGameMessageScreen.tsx:24` (`game_intro_shown`) و`LandingScreen.tsx:93` (`game_started`) — موثّقتان في بوابة P3 والمسح السابق؛ تُقيَّم في P5 (لا تغيير في P4).
4. **قرار commit/push:** العمل غير مُلتزم — بانتظار تفويض منفصل بعد مراجعة diffs (Section B.4). المرشحون للالتزام عند التفويض: ملفات الـ 12 المعدّلة + harness `LiveSessionSimulator.tsx`. **Untracked تُترك دون التزام (لم تُراجع لهذه الجولة):** `.opencode-summary/reports/scan-count-removal-100pct.md`, `docs/audits/p4-game-personal-data-minimization-report.md`, `docs/audits/p4-red-verification-report.md`, `privacy_decommission_current_state_recovery_report.md`, `src/__tests__/privacy/p4-game-minimization-gate.test.ts`.

---

## الختام

P4 منفّذ بالكامل: `PersistenceProvider` → no-op shell (يُحتفظ به لأن بوابة P4 تقرأه)، المعايرة runtime in-memory فقط، 6 game telemetry call-sites أُزيلت، واختبارات research-console مكيَّفة على harness صريح `LiveSessionSimulator`. بوابات P4 السبعة **GREEN (7/7)**، بوابات KEEP (PG-30/31) **GREEN**، بوابة P3 **لا ارتداد**، و**full suite = 118 files / 1144 tests passed**، مع `tsc --noEmit` نظيف و `eslint 0 errors` و build ناجح. **قاعدة البيانات غير ملموسة.** لا commit ولا push — بانتظار تفويض منفصل من المالك.

**HARD STOP — READY FOR SEPARATE COMMIT AUTHORIZATION**

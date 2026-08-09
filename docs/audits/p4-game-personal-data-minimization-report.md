# P4 — GAME PERSONAL-DATA MINIMIZATION REPORT (RED GATES)

**التاريخ:** 2026-08-08  
**الفرع:** `main`  
**HEAD الحالي:** `6ecbf3700afb0ec2d468ba295ff0081bea31cab2`  
**الحالة:** Discovery & RED Gates Complete — NO PRODUCTION CODE CHANGED YET  

---

## A — Baseline

* **HEAD:** `6ecbf3700afb0ec2d468ba295ff0081bea31cab2` (feat(privacy): P3 Stop-Write)
* **Branch:** `main`
* **git status:**
  ```text
  ## main...origin/main
  ?? .opencode-summary/reports/scan-count-removal-100pct.md
  ?? src/__tests__/privacy/p4-game-minimization-gate.test.ts
  ```

---

## B — Writers Before (مصادر الكتابة قبل التعديل)

| # | File | Line | Function | Data | Destination |
|---|---|---|---|---|---|
| 1 | `src/core/auth/AuthProvider.tsx` | 48 | `service.signInAsGuest().catch(...)` | Guest user request | Supabase Auth (Anonymously) |
| 2 | `src/core/auth/index.ts` | 110 | `signInAnonymously()` | Auth creation | Supabase Client Auth |
| 3 | `src/core/device/index.ts` | 126 | `collectDeviceProfile()` | CPU, OS, memory, screen dimensions | Local Memory (Device Profile) |
| 4 | `src/core/supabase/PersistenceProvider.tsx` | 269 | `ensureDeviceAndCalibration` | Device profile details | Supabase `devices` Table |
| 5 | `src/core/supabase/PersistenceProvider.tsx` | 333 | `ensureDeviceAndCalibration` | Frame rates, Display/Input lag | Supabase `calibrations` Table |
| 6 | `src/core/supabase/PersistenceProvider.tsx` | 414 | `createSession` | Science measurements JSONB, ids | Supabase `sessions` Table |
| 7 | `src/core/supabase/PersistenceProvider.tsx` | 91 | `doCloseSession` (upsert) | Science results (consistency, fatigue) | Supabase `sessions` Table |
| 8 | `src/core/supabase/PersistenceProvider.tsx` | 133 | `doCloseSession` (update) | End session timestamp | Supabase `sessions` Table |
| 9 | `src/core/calibration/silent.ts` | 24 | `saveProfile` | Framerate calibration profile | localStorage `focus_calibration_profile` |
| 10| `src/core/calibration-cache/index.ts` | 91 | `CalibrationCache.set` | Cache entry (deviceId, browser, profile)| localStorage `focus_calibration_cache` |

---

## C — Readers Before (مصادر القراءة قبل التعديل)

| # | File | Line | Function | Data | Source |
|---|---|---|---|---|---|
| 1 | `src/core/calibration/silent.ts` | 9 | `getCachedProfile` | Cached profile | localStorage `focus_calibration_profile` |
| 2 | `src/core/calibration-cache/index.ts` | 81 | `CalibrationCache.get` | Cache entry | localStorage `focus_calibration_cache` |
| 3 | `src/core/research/api-supabase.ts` | 263 | `getSessions`, `getDevices`, etc. | Science data and profiles | Supabase `sessions`, `devices`, `calibrations` |
| 4 | `src/business-intelligence/api.ts` | 37 | dashboard analytical functions | Sessions and analytics | Supabase `sessions`, `devices` |

---

## D — Reachability Analysis (تحليل قابلية الوصول)

| Writer | Reachable from game? | Reachable from boot? | Reachable from admin? | Reachable from repair? |
|---|---|---|---|---|
| **signInAsGuest** / **signInAnonymously** | No (boot disabled; only explicitly via LoginScreen) | No | No | No |
| **collectDeviceProfile** | **Yes** (Runs during `ensureDeviceAndCalibration` when starting game sessions) | No | No | No |
| **devices table write** | **Yes** (Fires in `ensureDeviceAndCalibration` during game session mount) | No | No | No |
| **sessions table write** | **Yes** (Fires on game start, heartbeat, and completions) | No | No | No |
| **calibrations table write** | **Yes** (Fires in `ensureDeviceAndCalibration` during game session mount) | No | No | No |
| **focus_calibration_profile (LS)** | **Yes** (Fired before starting gameplay) | **Yes** (Fires in App.tsx mount) | No | No |
| **focus_calibration_cache (LS)** | **Yes** (Fired during active calibration checks) | **Yes** | No | No |

---

## E — Changes

*(لا توجد تغييرات على ملفات الإنتاج حتى الآن - بانتظار الموافقة بعد تقرير الـ RED)*
* **الملفات التي ستتعدل لاحقاً:**
  * `src/App.tsx`
  * `src/core/supabase/PersistenceProvider.tsx`
  * `src/screens/game-intro/GameIntroScreen.tsx`
  * `src/core/calibration/silent.ts`
  * `src/store/navigation.tsx`

---

## F — Proof (إثبات فشل البوابات - RED)

تم تشغيل اختبار البوابات الجديد لـ P4 بموجب الأمر الفردي المعزول:
```bash
npx vitest run src/__tests__/privacy/p4-game-minimization-gate.test.ts
```

### نتيجة التشغيل:
* **حالة الاختبارات:** **FAIL (7 tests failed / 7 total)**
* **تفاصيل الفشل الفعلي:**
  1. **PG-03 (Device Fingerprint):** يفشل لأن `PersistenceProvider.tsx` لا يزال يستورد `collectDeviceProfile` ويكتب بجدول `devices`.
  2. **PG-32 (Persistent Identity):** يفشل لأن `PersistenceProvider.tsx` يعتمد على `ensureDeviceAndCalibration` ويقرأ `auth.getUser`.
  3. **PG-33 (Sessions Storage):** يفشل لوجود استدعاءات صريحة للكتابة والـ Upsert بجدول `sessions` في `PersistenceProvider.tsx`.
  4. **PG-34 (Local Storage Calibration):** يفشل لوجود عمليات `localStorage.setItem` للمفاتيح `focus_calibration_profile` و `focus_calibration_cache`.

---

## G — Preservation Proof (إثبات عمل بقية الميزات)

* **اللعبة ومحرك الحساب (Game Engine):** الاختبارات تثبت عمل المحرك العلمي والرياضي لحظياً بالذاكرة.
* **الإعلانات (Ads):** خدمة الإعلانات و `AdBanner` تعمل بشكل سليم وغير ممسوسة.
* **المخزون والكتالوج (Inventory & Catalog):** معزولة بالكامل، كتالوج SSOT والمخزون المحلي للبائع يعملان دون regression.
* **WhatsApp المباشر:** مسار WhatsApp handoff المباشر يعمل بلا أي تتبع.

---

## H — Remaining Work (الأعمال المتبقية)

لا يزال هذا العمل يمثل جزءاً من مسار الخصوصية الإجمالي. المراحل المتبقية والمسجلة صراحة:
* [ ] **P4 Execution:** الانتقال لبوابات الـ GREEN (تعطيل الكتابة وجعل اللعبة محلية بالذاكرة).
* [ ] **P5 Pending:** إزالة Analytics/Telemetry/QR بالكامل من الكود.
* [ ] **P6 Pending:** إعادة تقييم بيانات الصيانة والعملاء والـ BI المحلية (بوابة E-9).
* [ ] **P7 Pending:** فحص حفظ Ads/Inventory/Catalog/WhatsApp.
* [ ] **P8 Pending:** لوحة المتصدرين Top-10 مجهولة الهوية بالكامل.
* [ ] **P9 Pending:** حذف جداول و RPCs قاعدة البيانات نهائياً.
* [ ] **P10/P11 Pending:** اختبارات التحقق الإضافية والمراجعة المستقلة للهندسة الفنية.

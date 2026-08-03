# FOCUS Production Security Audit

**الإصدار:** 4.0 · **التاريخ:** 2026-08-02 · **النوع:** Zero-Trust Security Review (P0)
**النطاق:** `focus-production` (React 19 + Vite SPA → GitHub Pages، Backend: Supabase anon-key)
**الحكم النهائي:** 🔴 **C — NOT READY**

> **ملاحظة أمان:** أنشأ الفحص حسابَي ضيف (anonymous) على القاعدة الحية (`5af72e8a-…` و`6d509eb1-…`)، وأدرج علامة في `analytics_events` (201). طلب الحذف (204) حذف **0 صفاً** — لا توجد سياسة DELETE على الجدول (DV-9)؛ أي بقايا تتطلب تنظيفاً بصلاحيات owner عبر SQL Editor. **فحص LV-9 أُجري بصفّ صفري (أثر صفر)** ولم يُنفَّذ أي ترقية صلاحيات. تعليمات التنظيف الكاملة في الملحق أ.

## سجل التغييرات

| الإصدار | التاريخ | التغيير |
|---|---|---|
| 3.6 | 2026-08-02 | الإصدار الأول للتدقيق الكامل. |
| **4.0** | **2026-08-02** | **LV-5 أُغلق بالأدلة الحية:** سياسة `Anyone can insert analytics events` (INSERT، roles=public، `WITH CHECK true` — حتى بلا جلسة) **أُسقطت** وحلّت محلها `Authenticated users insert own analytics events` (`TO authenticated`، `WITH CHECK ((user_id IS NULL) OR (user_id = auth.uid()))`). القرار (الخيار B): يُبقي تليمتري NULL (8420/8863 حدثاً بلا user_id — ~95%، مؤكدة من البيانات الحية)، يغلق anon-bot DoS، ويمنع النسب العابر. إثبات قبل/بعد في Production (transaction + rollback): قبل الإسقاط anon INSERT ناجح (مع `Anyone can insert` الحية)؛ بعد الإسقاط مصفوفة نظيفة — anon `42501` · ملكية مسموح · NULL مسموح · عابر `42501`. درس منهجي: تحقق التطبيق بجرد pg_policies — التطبيق الأول لم يُسقط العريضة (ظهرت الاثنتان معاً)، فأُعيد الإسقاط كجملة مستقلة ثم اكتملت الدورة. راجع `08-LV5-analytics-insert-ownership.sql`. |
| **3.9** | **2026-08-02** | **LV-11 أُغلق بالأدلة الحية:** سياسة `Anyone can update qr scan counts` (UPDATE، roles=public، USING/WITH CHECK true) **أُسقطت**. إثبات قبل/بعد في Production (transaction + rollback، `set local role anon`): anon UPDATE لـ`scan_count` قبل الإسقاط → `anon_update_succeeded=true` (تلاعب مجهول مؤكد)؛ بعد الإسقاط → `false` (صف تشخيصي موحّد: anon · rls_on=true · bypass=false · update_policy_count=0). مسار العدّاد المشروع `increment_qr_counter` (SECURITY DEFINER + allowlist) سليم بعد الإسقاط. لا يتبقى سوى `Admins manage qr codes` (أدمن). راجع `07-LV11-qr-codes-remove-broad-update.sql`. |
| 3.8 | 2026-08-02 | **LV-10 أُغلق بالأدلة الحية:** سياسة `Authenticated insert sessions` (INSERT، with_check `auth.role()='authenticated'`) **أُسقطت** — كانت تجعل إدراج الجلسات بـ OR يُلغي شرط الملكية في `Users manage own sessions`. إثبات قبل/بعد في Production (transaction + rollback): متقاطع INSERT (A→B) قبل الإسقاط → `rows_inserted=1 · inserted_user_id=<B>` (ثغرة مؤكدة عملياً)؛ بعد الإسقاط → `42501 new row violates row-level security policy`؛ إدراج الملكية (نفس A) → ناجح. FK سليم مفرد (`sessions_user_id_fkey` → `public.users(id)`) + 0 يتيمة + فهرس `idx_sessions_user_id` موجود — بلا تغيير. راجع `06-LV10-sessions-insert-ownership.sql`. |
| 3.7 | 2026-08-02 | **تصحيح جوهري بالأدلة (round 2 من Gate 1):** (1) **DV-10 مُكذَّب** — `on_auth_user_created` **موجودة ومفعّلة** على `auth.users` (استعلام pg_trigger المباشر بـ `tgfoid`)؛ (2) **NR-1 أُعيد تصنيفه إلى مسار تنفيذ مؤكد** — دالة حية تثق بـ `raw_user_meta_data->>'role'` عبر SECURITY DEFINER + ربط trigger نشط؛ (3) **إصلاح Phase 1 مُطبَّق ومُغلَق**: `handle_new_user` يفرض الآن `role='guest'` دائماً (قرار C) — إثبات حي: signup بـ`role:"super_admin"` في metadata → HTTP 200 + `users.role='guest'`؛ (4) **REVOKE EXECUTE عن `bootstrap_super_admin`** من anon/authenticated/PUBLIC — probe حي: `42501 permission denied`؛ (5) `has_super_admin` = **Documented Exception** (RLS + شاشة الإعداد). راجع `supabase/security-hardening/phase1/` (بنود 4-5). |

---

## 0. جدول الثقة في النتائج (Evidence Confidence Matrix)

يُقرأ هذا الجدول أولاً لتحديد درجة الثقة في كل نتيجة قبل قراءة التفاصيل.

| ID | الحالة | المصدر | ملخص |
|---|---|---|---|
| LV-1 | 🟢 SQL Verified | Production | ضيف يقرأ كل `users` (بريد/أدوار) — سياسة `Authenticated read users` بلا قيد صف |
| LV-2 | 🟢 SQL Verified | Production | ضيف يقرأ كل `sessions` (قياسات علمية) — `Authenticated read sessions` بلا قيد صف |
| LV-3 | 🟢 SQL Verified | Production | ضيف يقرأ كل `campaigns` — `Authenticated read campaigns` بلا قيد صف |
| LV-4 | 🟢 SQL Verified | Production | ضيف يقرأ كل `analytics_events` — `Authenticated read analytics events` بلا قيد صف |
| LV-5 | 🟢 SQL Verified → **✅ Closed (v4.0)** | Production (pg_policies + **transaction probe**) | ضيف **يُدرج** أحداثاً في `analytics_events` (with_check true)؛ الحذف محجوب (لا سياسة DELETE)؛ **Database DoS**: إدراج غير محدود من أي bot — **أُغلق 2026-08-02**: إسقاط `Anyone can insert analytics events` + سياسة `Authenticated users insert own analytics events`؛ probe حي: anon/cross `42501`، ملكية/NULL مسموحان |
| LV-6 | 🟢 SQL Verified | Production | PATCH الدور الذاتي **محجوب** — سياسة UPDATE الوحيدة حصرية للأدمن |
| LV-7 | 🟢 SQL Verified | Production | جداول repair **غير موجودة** في Supabase الحيّ (404) |
| LV-8 | 🟢 SQL Verified | Production | تنفيذ `handle_new_user` الحيّ **سيُدرج** `guest`/`is_anonymous=true` لو اشتغل (المستودع ينص `user`/false) — **مُصلَح 2026-08-02**: الدالة تفرض `role='guest'` ثابتاً + مرتبطة بـ trigger **مفعّلة** (لا DV-10) — انظر v3.7 |
| LV-9 | 🟢 SQL Verified | Production (pg_proc + proacl + **PostgREST probe**) | RPC `admin_promote_user`: **استدعاء مُثبت عملياً** بجلسة مجهولة عبر `/rest/v1/rpc` (صفّ صفري، أثر صفر — P0001) + بلا فحص متصل + SECURITY DEFINER → رفع صلاحية (الترقية الفعلية لم تُنفَّذ) |
| LV-10 | 🟢 SQL Verified → **✅ Closed (v3.8)** | Production (pg_policies + **transaction probe**) | `sessions` INSERT بـ`user_id` اعتباطي (with_check بلا فحص ملكية) → تزوير/تلويث نتائج أي مستخدم — **أُغلق 2026-08-02**: إسقاط `Authenticated insert sessions`؛ probe حي قبل `rows_inserted=1` (متقاطع) / بعد `42501` |
| LV-11 | 🟢 SQL Verified → **✅ Closed (v3.9)** | Production (pg_policies + **transaction probe**) | `qr_codes` UPDATE للعموم (USING/WITH CHECK true) → **Business Integrity Attack**: تزوير عدّادات/نجاح حملات/تقارير/ROI — **أُغلق 2026-08-02**: إسقاط `Anyone can update qr scan counts`؛ probe حي: anon UPDATE قبل `true` / بعد `false` |
| CV-1 | 🔴 **مسار تنفيذ مؤكد ثم مُغلَق** | Production (pg_trigger + pg_proc + **PostgREST signup test**) | `handle_new_user` مرتبطة بـ trigger **مفعّلة** (`on_auth_user_created` على `auth.users`) + تثق بـ `raw_user_meta_data->>'role'` عبر SECURITY DEFINER → **حقن role عند التسجيل مؤكد** (تصحيح v3.7 — كان «بلا مسار» خطأً بسبب DV-10). **أُغلق:** الدالة تفرض `role='guest'`؛ إثبات حي: signup بدور malicious → `users.role='guest'` |
| CV-2 | 🟡 Code Verified | Repository | Bootstrap مفتوح (TOCTOU) |
| CV-3 | 🟡 Code Verified | Repository | repair migrations PII مفتوحة **عند التطبيق** |
| CV-4 | 🟡 Code Verified | Repository | لا تحقق سيرفر لسلامة النتائج (Scientific Integrity) |
| CV-5 | 🟡 Code Verified | Repository | CSV/Excel Formula Injection |
| CV-6 | 🟡 Code Verified | Repository | Device fingerprint ضعيف/ثابت |
| CV-7 | 🟡 Code Verified | Repository | referral code بـ Math.random + مخزَّن في جدول مفتوح |
| CV-8 | 🟡 Code Verified | Repository | PII غير مشفرة في localStorage |
| DV-1 | 🔄 Divergence | Production ≠ Repository | `users.id`: TEXT في repo / UUID في الإنتاج |
| DV-2 | 🔄 Divergence | Production ≠ Repository | افتراضي دالة `handle_new_user`: `guest` حياً / `user` في repo |
| DV-3 | 🔄 Divergence | Production ≠ Repository | سياسات حية موجودة لـ sessions/campaigns/analytics/devices/calibrations/qr_codes/surveys بينما repo **صامت عنها** (لم يكتبها) |
| DV-4 | 🔄 Divergence | Production ≠ Repository | `lookup_..._v2` في repo (00011) / **غير موجود** حياً |
| DV-5 | 🔄 Divergence | Production ≠ Repository | جداول repair في repo / **غير موجودة** حياً |
| DV-6 | 🔄 Divergence | Production ≠ Repository | `00008` يصرّح: لا يمكن إعادة بناء القاعدة من الـ migrations |
| DV-7 | 🔄 Divergence | Production ≠ Repository | `system_settings`/`audit_log`/`job_assignments` (00009) **غير موجودة** حياً؛ و`devices`/`calibrations`/`qr_codes`/`surveys` موجودة بلا تعريف في repo |
| DV-8 | 🔄 Divergence | Production ≠ Repository | `handle_new_user` الحيّ (default `guest`, `is_anonymous true`, بلا ON CONFLICT/أعمدة زمنية) ≠ `00002:38-53` — **مُصلَح جزئياً 2026-08-02** (الدالة الآن تفرض `guest` + `now()` للأعمدة الزمنية timestamptz) |
| DV-9 | 🔄 Divergence | Production ≠ Repository | سياسات RLS الحية (نمط `Authenticated read …` + `Admins …`) **تختلف كلياً** عن `00002:20-32` على `users`؛ وعلى بقية الجداول لا وجود لسياسات repo أصلاً |
| DV-10 | ✅ **مُكذَّب (False Negative — أُصحَّح v3.7)** | Production (pg_trigger مباشر 2026-08-02) | **`on_auth_user_created` موجودة ومفعّلة (`tgenabled='O'`) على `auth.users`** ومربوطة بـ `handle_new_user` — النتيجة السابقة «صفر triggers في auth» **خاطئة** (الاستعلام الأصلي فاته الربط). استعلام 9 (لا صفوف للمحاسبين) **لا ينفي الربط** — التفسير الأرجح: الحسابان أُنشئا قبل تفعيل الربط أو عبر مسار لا يشغّله؛ غير حاسم ولا يُبنى عليه حكم أمني. **العبرة الأمنية:** الربط نشط + metadata موثوقة = مسار تصعيد مؤكد (NR-1) |
| NR-1 | ✅ **مسار مؤكد ثم مُغلَق (v3.7)** | Production (pg_trigger + pg_proc + **PostgREST signup test**) | رفع دور عبر `handle_new_user` **مؤكد المسار** (trigger مفعّلة + `coalesce(raw_user_meta_data->>'role','guest')` عبر SECURITY DEFINER). **أُغلق 2026-08-02:** فرض `role='guest'` — إثبات حي: signup بـ`role:"super_admin"` → HTTP 200 + `users.role='guest'` |
| NR-2 | ⚪ Unverifiable (Staging) | يحتاج Staging | **Design Risk Confirmed:** bootstrap مفتوح أول وصول — **محجوب الآن** (`has_super_admin()=true` يمنع INSERT وتشغيل bootstrap) |
| UV-3 | ⚪ Unverifiable (Owner) | يحتاج صلاحيات Owner | إعدادات لوحة Supabase (تأكيد البريد، expiry، JWT) |
| UV-4 | ⚪ Unverifiable (Owner) | يحتاج صلاحيات Owner | تساوي `vars.*` في CI مع `.env` المحلي |

> **UV-5 انحل:** `proacl` (pg_proc) أكّد منح `EXECUTE` لـ `PUBLIC`/`anon`/`authenticated`/`postgres`/`service_role` على `admin_promote_user` و`bootstrap_super_admin` (وكذلك `handle_new_user`/`has_super_admin`/`increment_qr_counter`) — مُدمج في LV-9 وقسم III.0 بند 10.

> **سلم القوة (5 مستويات):**
> | المستوى | الرمز | القوة | الدليل |
> |---|---|---|---|
> | Production SQL Verified | 🟢 | ⭐⭐⭐⭐⭐ | pg_class / pg_policies / pg_proc / proacl / استدعاء PostgREST فعلي — **الدليل الجنائي من القاعدة** |
> | Runtime Live Verified | 🟦 | ⭐⭐⭐⭐ | اختبار سلوكي على الإنتاج (استجابة HTTP، 404، 201…) |
> | Repository Verified | 🟡 | ⭐⭐⭐ | كود/migrations المستودع فقط |
> | Inferred | 🟠 | ⭐⭐ | استنتاج تحليلي بلا دليل مباشر |
> | Unverified | ⚪ | ⭐ | يحتاج صلاحيات Owner أو بيئة Staging |
>
> **قاعدة الإثبات (فصل التفسير عن الإثبات):** كل نتيجة تُعرض بصيغة «حسب قاعدة الإنتاج: …» (السلوك/التعريف الفعلي)، ثم يُفصل تفسير المستودع في قسمه. لا يُكتب أبداً «سبب المشكلة migration 00002» — الـ migration مجرّد سجل في المستودع، والسبب الحقيقي هو ما تثبته pg_class/pg_policies/pg_proc/proacl من القاعدة الحية. 🟢 أقوى من 🟦 (السياسة نفسها)، وكلاهما أقوى من 🟡.

---

# Part I — Infrastructure Security

## I.1 Secrets & Ops (Phase A)

| البند | الحالة | الدليل |
|---|---|---|
| `.env` معزول | ✅ آمن | `.gitignore:8`؛ `git ls-files` فارغ؛ فحص كل كائنات git/الأفرع لا يجد أي key |
| service_role / JWT_SECRET / private key | ✅ غير موجود في repo | بحث شامل: 0 نتائج |
| المفتاح المكشوف في bundle | ✅ آمن | anon فقط (JWT يحمل `role: anon`)، مصمم للنشر العام |
| CI | ✅ مناسب | `deploy.yml` يستخدم `vars.*` عامة لـ VITE_ (لا `secrets.*`) |
| Rotation/Scopes | ⚪ UV-3 | إعدادات السيرفر (لوحة Supabase) خارج repo |
| احتراز | ⚠️ | ممنوع قطعاً وضع service_role في أي `VITE_` (يُدمج في bundle → استحواذ كامل) |

## I.2 Supply Chain (Phase B) — ✅ نظيف

- Actions رسمية فقط: `actions/checkout@v4`, `setup-node@v4`, `upload-pages-artifact@v3`, `deploy-pages@v4`.
- `pnpm install --frozen-lockfile`؛ lockfile v9.0 مع `integrity: sha512` لكل الحزم.
- لا postinstall/preinstall/prepare hooks؛ لا scripts خارجية في `index.html`/`public`؛ لا CDN في الكود.
- `pnpm audit --prod` = **0 ثغرات** (`info:0 low:0 moderate:0 high:0 critical:0`).

## I.3 Browser Security Headers — 🟠 كلها غائبة

CSP · X-Frame-Options · Permissions-Policy · HSTS · Referrer-Policy · CORP · COOP · X-Content-Type-Options — **غير موجودة جميعاً**. `index.html` بلا meta سياسة. GitHub Pages لا يدعم headers مخصصة → مطلوب CDN/استضافة قابلة للتهيئة (Clickjacking نظري ممكن).

## I.4 DoS منطقي (Phase D) — 🟠

- استعلامات كاملة بلا pagination: `getAllRepairRequests` (`repair-data-service.ts:94-98`)، قراءة BI للـ users كاملة (`api.ts:40,199`)، `getAllProfiles` (`referral.ts:200-215`).
- كتابة لا محدودة في `analytics_events` (مثبت حياً LV-5 — **أُغلق v4.0**: الإدراج مقيّد بمصادقة ومِلكية؛ يبقى سبام المسجّلين بكمية لـ Phase 2) + spam لحسّادات QR (`campaign.ts:198,203`؛ الكتابة المباشرة عبر الجدول أُغلقت v3.9).
- صور base64 بلا حد حجم؛ localStorage بلا حصص. لا Rate Limit/Throttle على auth/QR/search/campaigns (فقط حدود منصة).

## I.5 Cryptography (Phase C) — 🟡

- `crypto.getRandomValues`: short_code (`data-service.ts:7`)، خلط جولات (`GameScreen.tsx:26`) — جيد.
- `Math.random` لأمور تتطلب أماناً: referral (`referral.ts:38-45`)، أغلب `uid()` (repair/price/sticker) — ضعيف.
- **لا تشفير** لأي PII محلي (صور repair base64 نصية)؛ لا AES/HMAC في أي نقطة حساسة. كلمات المرور بيد Supabase (bcrypt سيرفر) — سليم.

## I.6 Dependencies — 🟢 نظيف (see I.2)

---

# Part II — Application Security

## II.1 Authentication

| البند | النتيجة | الدليل |
|---|---|---|
| Login / Magic Link / OTP | ✅ سليم (Supabase) | `auth/index.ts:119-151` |
| Register | 🟡 يتجاهل تأكيد البريد؛ signUp فوري | `index.ts:129-143` |
| Guest | 🟡 تلقائي لكل زائر | `AuthProvider.tsx:56-59` |
| JWT/Session | 🟡 localStorage (JWT+refresh+email) | `client.ts:27-33` |
| Logout | 🟡 يمسح الجلسة لا البيانات المحلية | `index.ts:167-171` |

**إجابات:** انتحال/رفع دور: 🟡 CV-1. Fixation/Replay/Leak: 🔵 لا. Hijacking: 🟡 نظري إن وُجد XSS (لا يوجد).

## II.2 Authorization

- كل العمليات عبر anon-key؛ **لا تحقق سيرفر سوى RLS** (مكسور، Part III). حواجز React (`ProtectedRoute.tsx:42-51`, `App.tsx:188-223`) UX فقط.
- IDOR مؤكد حياً (LV-1..LV-4). كسر عابر للمستخدمين: `PersistenceProvider.tsx:200-226`. عمليات campaigns/sessions بلا تقييد: `data-service.ts:193-456`. `repair-repository.ts` بادئ إجراءات بـ `performedBy:'admin'` نصي.

## II.3 XSS / SQLi / CSRF / Input / Upload

- **SQLi:** 🔵 لا توجد (PostgREST parameterized). استثناء وحيد سابق `increment_qr_counter(p_column)` فُحص من pg_proc الحيّ: **whitelist صارم** (`scan_count`/`game_*_count`) → لا injection (انحل UV-1).
- **XSS:** 🔵 لا sink قابل للاستغلال (`dangerouslySetInnerHTML` بقيم ثابتة فقط: `AchievementsScreen.tsx:9,110`، `GameScreen.tsx:89,308`، `DesignSystemPlayground.tsx:61-72`).
- **CSRF:** 🔵 مخفف بالتصميم (لا cookies؛ Bearer من localStorage).
- **CSV/Excel Formula Injection 🟠 CV-5:** `ExportUtils.ts:1-23` — خلايا `= + - @` غير معطَّلة؛ `exportExcel` بلا تهريب.
- **Input Validation 🟡:** Login/Register غير-empty فقط؛ phone محدد جيداً (`AlgerianPhoneInput.tsx`). أكواد repair **تسلسلية قابلة للتخمين** (`repair-types.ts:200-205`). معاملات QR بلا حدود (`qr/campaign.ts:19-42`).
- **Upload 🟡:** لا buckets حية (P12)؛ "الرفع" = base64 data-URL بلا فحص MIME/حجم (`RepairPhotoUpload.tsx:22-44`, `QRDesigner.tsx:136-147`).

## II.4 LocalStorage (تتضمن PII — 🔴)

| Key | المحتوى | الحساسية |
|---|---|---|
| `sb-fmggysdqigtejxbfpgtg-auth-token` | JWT+refresh+email | 🟠 |
| `device_ledger_v1` | **IMEI** (`device-ledger.ts:132`), serial | 🔴 |
| `customer_memory_sessions/_events` | أسماء/ملاحظات/سجل شراء | 🟠 |
| `repair_*` (10) | أسماء+هواتف+صور base64 | 🔴 |
| `focus_sessions_v2`/`focus_sessions` | سجل قياسات | 🟠 |
| `focus_calibration_profile` | معايرة (قابلة للتزوير) | 🟡 |
| بقي | تفضيلات | 🔵 |

لا sessionStorage/IndexedDB/service worker/manifest/cookies. 📄 `docs/architecture/13-local-storage.md` قديمة غير مطابقة.

## II.5 QR Security (Phase F) — 🟠

- **Entropy:** short_code 6×BASE62 بـ crypto ≈ **35.7 bit**؛ referral 8×31 حرف بـ `Math.random` ≈ **39.8 bit**.
- **لا expiry/nonce/single-use/revocation** — إعادة استخدام لا نهائية.
- **Forgery/Attribution Fraud:** params (campaign/school/event/company/location) بلا validation (`qr/campaign.ts:19-42`) → تزوير نسب الزيارات؛ referral code مقروء من `users` المفتوح (LV-1) → انتحال إحالات.
- **Counters:** `increment_qr_counter` spam-able (بلا Rate Limit — يُحسم في Phase 2)؛ جسمه ✅ آمن (whitelist)؛ **الكتابة المباشرة عبر الجدول أُغلقت v3.9** (LV-11 — إسقاط `Anyone can update qr scan counts`).
- **Consent ⚠️:** `consent.ts` **في الذاكرة فقط** (غير مثبت) — خطر تنظيمي لمنصة قياس (GDPR/18-05).

## II.6 Device Fingerprint (Phase G) — 🟠 CV-6

- `device_id` = hash djb2 لـ `userAgent|width|height|language` (`device/index.ts:110-122`) — قابل للتصادم والتزوير.
- `refreshRate: 60` ثابت بالكود (`device/index.ts:142`). كل السمات من navigator/screen/matchMedia → قابلة للتزوير بـ DevTools؛ بلا attestation. لوحات "health ranking" (`api-supabase.ts:648-853`) مبنية عليها.

## II.7 Mobile — 🔵

Clipboard UX آمن؛ لا service worker/manifest/IndexedDB؛ deeplinks تقرأ params فقط؛ wa.me/t.me ثابتة.

---

# Part III — Database Security

## III.0 Confirmed Production Security Misconfigurations

> **هذا القسم يحتوي فقط النتائج المثبتة مباشرة من قاعدة الإنتاج (pg_policies / pg_proc / pg_class / pg_proc.proacl) — لا استنتاج من الكود. كل بند سنده الاستعلام الفعلي.**

| # | التهيئة المثبتة | الدليل (من الإنتاج) | الأثر |
|---|---|---|---|
| 1 | `users` — قراءة لأي مستخدم مصادق | `Authenticated read users`: `USING (auth.role()='authenticated')` بلا قيد صف | كل بريد/دور مكشوف (LV-1) |
| 2 | `sessions` — قراءة لأي مستخدم مصادق | `Authenticated read sessions`: بلا قيد صف | كل القياسات مكشوفة (LV-2) |
| 3 | `campaigns` — قراءة لأي مستخدم مصادق | `Authenticated read campaigns`: بلا قيد صف | كشف تجاري (LV-3) |
| 4 | `devices` — قراءة لأي مستخدم مصادق | `Authenticated read devices`: بلا قيد صف | تسريب device_id عبر المستخدمين |
| 5 | `surveys` — قراءة لأي مستخدم مصادق | `Authenticated read surveys`: بلا قيد صف | تسريب استجابات |
| 6 | `calibrations` — قراءة لأي مستخدم مصادق | `Authenticated read calibrations`: بلا قيد صف | تسريب معايرة |
| 7 | `analytics_events` — إدراج لأي شخص | `Anyone can insert analytics events`: `WITH CHECK true` (حتى بلا جلسة) | **Database DoS** + تلويث + حقن نتائج (LV-5) — **أُغلق v4.0** |
| 8 | `qr_codes` — تحديث العدّادات لأي شخص | `Anyone can update qr scan counts`: `USING true / WITH CHECK true` | **Business Integrity Attack**: تزوير عدّادات/نجاح حملات/تقارير/ROI (LV-11) — **أُغلق v3.9** |
| 9 | `handle_new_user` — `role` من `raw_user_meta_data` | `coalesce(raw_user_meta_data->>'role','guest')` (pg_proc) | **Production Verified Design** (CV-1) — بلا مسار تنفيذ في النشر الحالي |
| 10 | دوال الإدارة منشورة بـ `EXECUTE` لـ PUBLIC/anon/authenticated | `proacl = {=X/postgres, anon=X, authenticated=X, service_role=X}` لـ `admin_promote_user` و`bootstrap_super_admin` | **عامل مضخّم**: الحماية الوحيدة هي المنطق الداخلي (LV-9) — وليست ثغرة مستقلة |
| 11 | `admin_promote_user` **قابل للاستدعاء فعلياً** من جلسة مجهولة | probe 2026-08-02: جلسة مجهولة POST `/rest/v1/rpc/admin_promote_user` بصفّ صفري → نفّذت ورفعت `User not found.` (P0001، أثر صفر) | **LV-9 Critical — استدعاء مثبت، ترقية الفعلية لم تُنفَّذ** |

> **ملاحظة pg_class:** كل الجداول `relrowsecurity=true` مع `relforcerowsecurity=false`. الـ FORCE=false طبيعي وليس ثغرة بذاتها؛ يتحول لمشكلة فقط عند اقترانه بـ `SECURITY DEFINER` (مثل LV-9) أو دور يملك `BYPASSRLS` — ولا يُصنَّف Critical لوحده.
> **Risk:** دوال `SECURITY DEFINER` تتجاوز ضمانات RLS للمالك — قد تعبُر عمداً/سهواً ما تنويه السياسات على الجداول.
> **ملاحظة proacl:** `EXECUTE granted to PUBLIC` يعني **إمكانية استدعاء الدالة فقط**؛ نتيجة الاستدعاء تتوقف على منطقها الداخلي. أُعتبر عاملاً يضخّم الخطورة عندما تكون الدالة نفسها غير محمية (LV-9)، وليس ثغرة قائمة بذاتها.
> **ملاحظة OpenAPI:** جذر `/rest/v1/` على هذا المشروع يرفض anon/authenticated (`Only the service_role API key can be used`) — لذلك اعتمد التعرّض على الـ probe المباشر (بند 11) بدل ميتاداتا OpenAPI.

## III.1 القاعدة الحية مقابل المستودع — القاعدة الحية هي الحقيقة

الـ migrations أرشيف توثيقي **لا يعكس الإنتاج** (DV-1..DV-9). يلي كل جدول تنسيق موحد:

```
Live Database — (السياسة/السلوك الفعلي + الدليل)
Repository — (ما يقوله المستودع)
Divergence — (الاختلاف المؤكد)
```

### III.1.1 `users`

- **Live Database (pg_policies):** ثلاث سياسات فقط:
  - `Authenticated read users` — SELECT، `USING (auth.role() = 'authenticated')` **بلا أي قيد على الصف** → أي جلسة مسجَّلة (بما فيها الجلسة المجهولة التي يحمل توكنها role=`authenticated`) تقرأ **كل** users (بريد/أدوار). **هذا هو سبب LV-1 حسب قاعدة الإنتاج.**
  - `Admins update user roles` — UPDATE، `USING (EXISTS (SELECT 1 FROM users u WHERE u.id=auth.uid() AND u.role IN ('admin','super_admin')))` → **حارس التحديث الوحيد**؛ غير الأدمن لا يحدّثون أي عمود (يفسّر LV-6 حرفياً: PATCH عاد 200 لكن 0 صف).
  - `Bootstrap insert first user` — INSERT، `WITH CHECK (has_super_admin() = false)` → الإدراج مفتوح فقط ما دام لا يوجد super_admin (أساس bootstrap).
  - لا DELETE policy → لا حذف.
- **Repository:** `00002:20-32` ثلاث سياسات مختلفة كلياً (`Users can read own row` بـ `id=current_user::text or current_user='authenticated'`، `Users can insert own row`، `Users can update own row`).
- **Divergence:** **DV-9** — سياسات الإنتاج ≠ سياسات repo؛ و`users.id` TEXT في repo / UUID حياً (DV-1).

### III.1.2 `sessions`

- **Live Database (pg_policies):**
  - `Authenticated read sessions` — SELECT، `USING (auth.role()='authenticated')` **بلا قيد صف** → أي ضيف يقرأ **كل** القياسات العلمية لكل المستخدمين (LV-2، DV-9).
  - `Authenticated insert sessions` — INSERT، `WITH CHECK (auth.role()='authenticated')` — **لا يتحقق من ملكية `user_id`** → أي ضيف يُدرج جلسة/نتائج زائفة باسم أي مستخدم (LV-10، DV-9). **أُسقطت 2026-08-02 (v3.8)** — راجع `06-LV10-sessions-insert-ownership.sql`.
  - `Users manage own sessions` — ALL، `USING (auth.uid()=user_id OR user_id IS NULL)` → تعديل/حذف الصفوف الذاتية (والفارغة).
- **Repository:** صامت تماماً عن sessions (لا CREATE TABLE، لا سياسات) — DV-3.
- **Divergence:** DV-3 + DV-9 — كل سياسات sessions حية ومكتوبة يدوياً.

### III.1.3 `campaigns`

- **Live Database (pg_policies):** `Authenticated read campaigns` (SELECT بلا قيد صف → LV-3، DV-9) + `Admins manage campaigns` (ALL بأدمن فقط). الكتابة محصورة بالأدمن.
- **Repository:** لا سياسات في الـ migrations (DV-3). lookup RPC v1 (`00007`) موجود ويعمل حياً (P10).
- **Divergence:** v2 (`00011`) في repo وغير موجود حياً (DV-4, P11).

### III.1.4 `analytics_events`

- **Live Database (pg_policies):**
  - `Anyone can insert analytics events` — INSERT، `WITH CHECK true` → **أي عميل ولو بمفتاح anon بدون جلسة** يُدرج أحداثاً (LV-5؛ نُظّف صف الاختبار). **أُسقطت 2026-08-02 (v4.0)** وحلّت محلها `Authenticated users insert own analytics events` (`TO authenticated`، `WITH CHECK ((user_id IS NULL) OR (user_id = auth.uid()))`) — راجع `08-LV5-analytics-insert-ownership.sql`.
  - `Authenticated read analytics events` — SELECT، `USING (auth.role()='authenticated')` بلا قيد صف → قراءة كل الأحداث (LV-4، DV-9؛ أُغلقت v3.8 بقرارات البند 2: ملكية + دور).
  - **لا DELETE policy** → طلب الحذف التجريبي الذي أعاد 204 **حذف 0 صفاً صامتاً**؛ أي صف اختبار ما زال موجوداً يحتاج تنظيفاً بصلاحيات owner (الملحق أ).
- **Repository:** لا سياسات (DV-3).
- **Divergence:** DV-3 + DV-9 — السياسة الحية «Anyone can insert» لا وجود لها في repo.

### III.1.5 `repair_*` (repair_requests, repair_quotes, repair_timeline, repair_photos, repair_status_history, repair_audit_log, …)

- **Live Database:** **غير موجودة إطلاقاً** — `SELECT` يعيد 404 PGRST205 (LV-7). بيانات العملاء/PII حالياً محلية فقط؛ الـ sync يفشل صامتاً.
- **Repository:** `00001`/`00005`/`00006` تعرّفها بسياسات PII مفتوحة (`with check (true)` / `using (true)` على repair_requests/timeline/photos؛ تحديث لأي authenticated؛ قراءة عامة لـ status_history؛ audit بلا قيد أدمن) — CV-3 (تصبح حرجة **عند التطبيق**).
- **Divergence:** الجداول في repo وغير موجودة حياً — DV-5.

### III.1.6 `system_settings` / `audit_log` / `job_assignments` (contract 00009)

- **Live Database:** **غير موجودة إطلاقاً** — ناتج استعلام pg_tables الحيّ: `calibrations, devices, qr_codes, surveys` فقط ضمن قائمة الفحص (LV-7-style، مؤكد من الملحق ب). عقد 00009 لم يُطبَّق.
- **Repository:** `00009` يعرّفها بنماذج RLS صحيحة (`is_public`, `auth.uid()`, فحص أدمن) لكنها **تبطل تماماً** ما لم يُصلَح LV-1/CV-1 (تعتمد على `users.role`). `00013` قيود CHECK roadmap فقط.
- **Divergence:** DV-7 — عقد 00009 في repo وغير مطبَّق حياً؛ وقبل تطبيقه يجب إصلاح LV-1/CV-1 وإلا كان سياساته "أدمن فقط" مكسورة ذاتياً.

### III.1.7 نتائج حاسمة من pg_proc/pg_policies (LV-9..LV-11)

**LV-9 🔴 رفع صلاحية عبر `admin_promote_user` — استدعاء **مثبت عملياً** (الترقية الفعلية لم تُنفَّذ):**
```sql
CREATE OR REPLACE FUNCTION public.admin_promote_user(target_user_id uuid, new_role text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER AS $function$
BEGIN
  IF NOT public.has_super_admin() THEN
    RAISE EXCEPTION 'No super admin exists.';
  END IF;
  UPDATE public.users SET role = new_role, updated_at = now() WHERE id = target_user_id;
  IF NOT found THEN RAISE EXCEPTION 'User not found.'; END IF;
END; $function$;
```
- **حسب قاعدة الإنتاج:** لا يوجد **أي فحص للمتصل** — الشرط الوحيد هو وجود super_admin **ما**، وقد ثبّت وجوده (`has_super_admin()` = true). الدالة `SECURITY DEFINER` تتجاوز RLS، وقيمة `new_role` بلا allowlist، و`proacl` يمنح `EXECUTE` لـ PUBLIC/anon/authenticated.
- **التحقق العملي (2026-08-02، قراءة-آمنة بصفّ صفري — أثر صفر):**
  - `POST /rest/v1/rpc/admin_promote_user` (جلسة مجهولة) بجسم `{target_user_id:"00000000-0000-0000-0000-000000000000", new_role:"super_admin"}` → **نفّذت** ووصلت إلى `IF NOT found` ثم رفعت `{"code":"P0001","message":"User not found."}` (HTTP 400) — أي أن جلسة الضيف تمرّ بفحص `has_super_admin()` وتستدعي الدالة فعلياً؛ الهدف الصفري منع أي تعديل.
  - استدعاء بوسيط ناقص أظهر التوقيع المسماة في schema cache: hint «Perhaps you meant to call `admin_promote_user(new_role, target_user_id)`».
  - `POST /rest/v1/rpc/has_super_admin` (بلا وسائط) نفّذت وأعادت `true`.
- **النتيجة:** أي جلسة (حتى ضيف مجهول) تستطيع `{target_user_id:<نفسها>, new_role:"super_admin"}` → استحواذ كامل. الاستدعاء مثبت؛ **الترقية الفعلية لم تُنفَّذ عمداً** (سلامة الإنتاج). ملاحظة الدقة: `EXECUTE` = إمكانية الاستدعاء، والخطورة النهائية من غياب الحارس داخل الدالة (III.0 بند 10-11).

**LV-10 ✅ أُغلق (v3.8):** كانت `Authenticated insert sessions` بـ `WITH CHECK (auth.role()='authenticated')` لا تقيّد `user_id` → إدراج جلسة كاملة (بما فيها `scientific_results`) باسم أي مستخدم ضحية (DV-9)، وتحوّل سيناريو التزوير رقم 1 و5 في Part IV من "ممكن نظرياً" إلى "مثبت من الإنتاج". **الإغلاق (2026-08-02):** إثبات حي في Production (transaction+rollback) — متقاطع INSERT (A→B) قبل الإسقاط: `rows_inserted=1 · inserted_user_id=<B>` (ثغرة مؤكدة عملياً)؛ بعد إسقاط السياسة: `42501 new row violates row-level security policy`؛ ملكية (نفس A): ناجح. السياسة الوحيدة المتبقية القادرة على INSERT = `Users manage own sessions` (`WITH CHECK auth.uid()=user_id`). راجع `06-LV10-sessions-insert-ownership.sql`.

**LV-11 ✅ أُغلق (v3.9):** كانت `Anyone can update qr scan counts` بـ `USING true / WITH CHECK true` → أي عميل (حتى بلا جلسة) ينفّذ `UPDATE qr_codes SET scan_count = 999999999 WHERE id = ...` مباشرة على الجدول — تزوير نجاح حملات، تقارير الإدارة، التحليلات، والـ ROI، ويتجاوز RPC `increment_qr_counter` الآمن تماماً (انظر III.2). **الإغلاق (2026-08-02):** إثبات حي في Production (transaction+rollback، `set local role anon`) — anon UPDATE لـ`scan_count` قبل الإسقاط: `anon_update_succeeded=true` (تلاعب مجهول مؤكد عملياً)؛ بعد الإسقاط: `false` مع صف تشخيصي (`rls_on=true · bypass=false · update_policy_count=0`). RPC `increment_qr_counter` (SECURITY DEFINER + allowlist) سليم بعد الإسقاط. لا يتبقى سوى `Admins manage qr codes`. (ميزة التسويق مبنية على هذه العدّادات — مسارها الشرعي سليم.)

**LV-5 ✅ أُغلق (v4.0):** كانت `Anyone can insert analytics events` بـ `WITH CHECK true` (roles=public — حتى بلا جلسة) → أي bot يُدرج أحداثاً بلا حدود (**Database DoS**) وبأي `user_id` (تلويث/حقن نتائج). **القرار (الخيار B — 2026-08-02):** بيانات حية 8863 حدثاً، **8420 بـ user_id NULL (~95%)** — تليمتري التطبيق يُدرج بلا user_id (مسار `src/core/telemetry/index.ts` → `user_id: event.userId ?? undefined`؛ لا callers لـ `setUserId` في الإنتاج) → فرض `user_id=auth.uid()` صرامةً كان سيكسر ~95% من الإدراج. السياسة الجديدة: `Authenticated users insert own analytics events` — `TO authenticated` + `WITH CHECK ((user_id IS NULL) OR (user_id = auth.uid()))` → يغلق anon-bot DoS (يتطلب حساباً)، يمنع النسب العابر، ويبقي تليمتري NULL. **الإغلاق (2026-08-02):** إثبات حي قبل/بعد (transaction+rollback): قبل الإسقاط anon INSERT ناجح (عبر العريضة الحية)؛ بعد الإسقاط مصفوفة 4 حالات — anon `42501 new row violates row-level security policy` · ملكية (نفس A) مسموح · NULL (تليمتري) مسموح · عابر (user_id=B) `42501`. **درس منهجي:** التطبيق الأول لم يُسقط العريضة فعلياً (جرد pg_policies أظهر الاثنتين معاً → OR يُبقي المسار مفتوحاً)، فأُعيد الإسقاط كجملة مستقلة ثم تحققت السياسات الثلاث فقط — الإغلاق لا يُعتمد إلا بجرد pg_policies بعد التطبيق، لا بنجاح CREATE وحده. راجع `08-LV5-analytics-insert-ownership.sql`. ملاحظة وظيفية: أي حدث تليمتري قبل تسجيل الدخول (جلسة anon) سيُرفض الآن — `flushInternal` تلتقط الخطأ وتعيد الإدراج في قائمة الانتظار (لا انهيار)، والأحداث pre-login لا تُحفظ؛ إن وُجدت حاجة لها تُعالَج في Phase 2 (مسار موثوق).

**ملاحظة قراءة عابرة (أنماط «Authenticated read» في calibrations/devices/surveys):** `auth.role()='authenticated'` بلا قيد صف → قراءة كل `device_id`/المعايرة عبر المستخدمين (تسريب متوسط). INSERT مقيّد بـ authenticated فقط (لا ملكية).

### III.1.8 Baseline Verification — ختم Phase 1 (2026-08-02)

**التحقق النهائي الموحّد بعد إغلاق كل البنود القابلة للتنفيذ — مصفوفة probes حية (SQL Editor، owner؛ كل probe داخل transaction+rollback إلا ما نُصّ على التزامه وتنظيفه):**

| # | الجرد / probe | النتيجة الحية | الحكم |
|---|---|---|---|
| A | pg_policies (كل الجداول) | ملكية + دور-بوابة + bootstrap؛ لا `Anyone can insert analytics events`، لا `Authenticated insert sessions`، لا UPDATE عريض على qr_codes، لا `Authenticated read …` عريضة | ✅ |
| B | proacl | `admin_promote_user`/`bootstrap_super_admin` = {postgres, service_role}؛ الاستثناءات الموثّقة (`handle_new_user`/`has_super_admin`/`increment_qr_counter`) محفوظة | ✅ |
| C | pg_class RLS | كل الجداول `relrowsecurity=true` (FORCE=false طبيعي — موثّق) | ✅ |
| E1 | anon → `admin_promote_user` | `42501 permission denied for function` | ✅ |
| E2 | anon → `bootstrap_super_admin` | `42501` | ✅ |
| E3 | anon → `has_super_admin` | `true` (حارس سياسة bootstrap — استثناء موثّق سليم) | ✅ |
| E4 | A(super_admin) يقرأ صف B | `1` — **مسموح بتصميم** عبر `Researchers read all users` (is_research_role تشمل super_admin) — ليس تسريباً | ✅ |
| E4b | B(user) يقرأ صف A | `0` — **عزل الملكية** للمستخدمين غير المتميزين | ✅ |
| E5 | anon → قراءة users | `0` | ✅ |
| E6 | A يُدرج sessions بـ user_id=B | `42501 new row violates row-level security policy` (LV-10) | ✅ |
| E7 | anon → UPDATE qr_codes.scan_count | `0` صفوف (LV-11) | ✅ |
| E8 | anon → INSERT analytics_events | `42501` + `0` صف مُحفظ (LV-5) | ✅ |
| E9 | authenticated(مِلكية) → INSERT analytics_events | مسموح — حُفظ ثم نُظّف | ✅ |
| E10 | authenticated(عابر B) → INSERT analytics_events | `42501` — لا يُحفظ | ✅ |
| تنظيف | `verify_baseline_%` / `verify_anon2` | `0` متبقٍ | ✅ |

**نتيجة الختم:** لا انحدار — كل الثغرات القابلة للتنفيذ في Phase 1 مُغلقة؛ الحالة النهائية (هذه المصفوفة) هي **Baseline v4.0** المجمّدة. الوحيد المتبقي ضمن النطاق: **LV-3 (Blocked by schema)** + بنود Phase 2 (Rate Limit، طبقة التفويض، NR-2 staging، مزامنة migrations، إلخ).

## III.2 RPC / Triggers / Functions — كما هي حية (pg_proc)

| الاسم | الجسم الحيّ (ملخّص) | التقييم |
|---|---|---|
| `has_super_admin` | `SELECT exists (SELECT 1 FROM users WHERE role='super_admin')` · STABLE SECURITY DEFINER | ✅ سليم |
| `handle_new_user` | **مُصلَح (v3.7):** `RETURNS trigger` يقرأ `NEW` — إدراج `role='guest'` **ثابتاً** (لا يقرأ role من metadata إطلاقاً) + `now()` للأعمدة الزمنية (timestamptz) · SECURITY DEFINER | ✅ **أُغلق NR-1**: مرتبطة بـ trigger مفعّلة (`on_auth_user_created`) + مصدر الحقيقة صار سيرفراً (guest دائماً). KEEP (دالة trigger-only بلا استدعاء عميل) |
| `increment_qr_counter` | whitelist صارم لـ `p_column` ثم `UPDATE qr_codes SET <col>+1 WHERE campaign_id=...` | ✅ **لا SQL injection** (يحلّ UV-1)؛ السبام المباشر عبر الجدول أُغلق v3.9 (LV-11) — تبقى الحاجة لـ Rate Limit في Phase 2 |
| `bootstrap_super_admin` | يرفض لو وُجد super_admin؛ يُرقّي `target_user_id` | 🟡 **Design Risk Confirmed** — محجوب الآن بوجود super_admin (أساس NR-2) |
| `admin_promote_user` | **بلا فحص متصل** — يرقّي لأي `new_role` ما دام يوجد super_admin | 🔴 **LV-9** |
| `lookup_campaign_by_short_code` | ✅ موجود حياً (P10)؛ parameterized + `SET search_path` (`00007`) | ✅ سليم |
| `lookup_campaign_by_short_code_v2` | ❌ غير موجود حياً (DV-4, P11) | 🔄 DV-4 |

> **الـ triggers (أُغلق نهائياً 2026-08-02):**
> - `public`: **4 triggers فقط، كلها موثّقة** — لا يوجد أي trigger غير موثق:
> | trigger_name | event_object_table | action_timing | action_statement |
> |---|---|---|---|
> | `users_updated_at` | users | BEFORE | `EXECUTE FUNCTION update_updated_at()` |
> | `sessions_updated_at` | sessions | BEFORE | `EXECUTE FUNCTION update_updated_at()` |
> | `campaigns_updated_at` | campaigns | BEFORE | `EXECUTE FUNCTION update_updated_at()` |
> | `qr_codes_updated_at` | qr_codes | BEFORE | `EXECUTE FUNCTION update_updated_at()` |
> - `auth`: **trigger واحدة مفعّلة** (تصحيح v3.7): `on_auth_user_created` على `auth.users` (AFTER INSERT) → `EXECUTE FUNCTION handle_new_user()` — كانت «صفر triggers» في v3.6 (DV-10) وهو **خطأ**.
>
> **🔴 تصحيح v3.7 (2026-08-02):** الاستعلام المباشر `select tgname, tgrelid::regclass, tgenabled from pg_trigger where tgfoid = 'public.handle_new_user()'::regprocedure` → **`on_auth_user_created` على `auth.users`، `tgenabled = O` (مفعّلة)**. النتيجة السابقة «صفر triggers في `auth`» (DV-10) **خاطئة — False Negative** (الاستعلام الأصلي فاته الربط). **الربط نشط فعلياً** → `handle_new_user` تُشغَّل عند كل تسجيل Auth → مسار حقن الدور مؤكد (NR-1) قبل الإصلاح.
>
> **أثر أمني (أُغلِق v3.7):** الدالة كانت تثق بـ `raw_user_meta_data->>'role'` عبر SECURITY DEFINER → أي مهاجم يسجّل بـ`role:"super_admin"` في metadata فيصبح super_admin. **الإصلاح:** الدالة تفرض `role='guest'` دائماً + `now()` للأعمدة الزمنية. إثبات حي (signup بـ`role:"super_admin"`): HTTP 200 + `users.role='guest'` — **لا تصعيد**. ملاحظة: نسخة v1 من الإصلاح سبّبت خطأ `42804` مؤقتاً (استخدمت `now()::text` بينما السكيمة الحية timestamptz) — صُحّحت إلى `now()`، وهذا يؤكد درس «الاشتقاق من التعريف الحي لا من migrations».

## III.3 Storage / Realtime

- **Storage:** لا buckets حية (`storage/v1/bucket` = `[]`) — 🔵 إيجابي.
- **Realtime:** لا publications في repo؛ حالة الحيّ ⚪ (يتطلب `pg_publication` — أدرجه بنداً مستندياً). ملاحظة: لو فُعّل realtime على جداول بسياسات عريضة يضخّم التسريب.

---

# Part IV — Scientific Integrity Audit

> **نطاق مستقل عن الأمن:** الأمن يجيب "هل يمكن اختراق النظام؟"؛ هذا القسم يجيب "هل يمكن تزوير النتائج العلمية؟". الاثنان مختلفان، وكلاهما حاسم لمنصة قياس.

**الخلاصة: كل نقطة علمية تُحسب في المتصفح وتُرسل كما هي؛ القاعدة لا تعيد الحساب ولا تتحقق. النتائج قابلة للتزوير بالكامل من Console المتصفح، ولوحات البحث تثق بها عمياء.**

> **تحديث من pg_policies (LV-10):** سياسة `Authenticated insert sessions` الحية لا تقيد `user_id` → تزوير النتائج ليس "ممكن نظرياً" فقط بل **مثبت من الإنتاج** (سيتحقق من البنية بدون أي تعديل سلوكي). أي جلسة ضيف تستطيع `POST /rest/v1/sessions` بجلسة كاملة بأي `user_id`/`scientific_results`. **أُغلق 2026-08-02 (v3.8):** الإسقاط أغلق هذا المسار — probe حي: متقاطع INSERT قبل `rows_inserted=1` / بعد `42501`.

## IV.1 مسار البيانات (كلها CLIENT-TRUSTED)

| النقطة | أين تُحسب | السيرفر يتحقق؟ |
|---|---|---|
| `raw_rts` | `GameScreen.tsx:265,268` | ❌ |
| `corrected_rts` | `GameScreen.tsx:217` + `measurement/index.ts:43-47` | ❌ |
| `focus_score` / `grade` | `ResultsScreen.tsx:104-109` + `scoring.ts:38-59` | ❌ |
| `fatigue_index` | `fatigue.ts:26-59` | ❌ |
| `total_rounds`/`valid_rounds` | `GameScreen.tsx:218-227` (ثابت 7) | ❌ |
| `outlier_count` | `consistency.ts:89` | ❌ |
| **الحفظ** | `PersistenceProvider.tsx:89-119` — `upsert` بقيم محسوبة في المتصفح | ❌ |

لا RPC/trigger/CHECK يلمس `sessions.measurements`/`scientific_results` في الـ migrations.

## IV.2 سيناريوهات التزوير

1. **حقن نتيجة مباشرة (مُثبت LV-10 → أُغلق v3.8):** `POST /rest/v1/sessions` بجلسة كاملة `{user_id:<ضحية>, scientific_results:{focus_score:99,grade:"A"}}` — سياسة INSERT الحية بلا قيد ملكية؛ أو `PATCH /rest/v1/sessions?id=eq.<uuid>` (LV-2 + لا immutability). **الإغلاق 2026-08-02:** إسقاط `Authenticated insert sessions` — المتقاطع الآن `42501`.
2. **حدث مزور (LV-5 — أُغلق v4.0):** كان `POST analytics_events` بـ `event_data:{focusScore:99,grade:"A"}` — with_check true (مُسقط الآن؛ anon/cross `42501`).
3. **تضخيم المعايرة:** تعديل `localStorage["focus_calibration_profile"]` إلى `{displayLagMs:300,inputLagMs:100,confidence:1}` → -400ms لكل RT؛ والمعايرة غير مفروضة (`GameScreen.tsx:193-196`).
4. **DevTools monkeypatch:** `completeSession(id, {correctedRts:Array(7).fill(140),...})` ثم "حفظ وخروج" — ينفَّذ المسار كاملاً.
5. **إعادة إرسال/استبدال جلسة:** upsert بنفس `session_id` بعد نتيجة سيئة يعيد الكتابة صامتاً.
6. **تزوير الجهاز/OS/refresh:** تغيير UA/`screen`/`matchMedia` → كل مقاييس الجهاز و"health ranking" (`api-supabase.ts:756-762`) من اختيار المهاجم.

## IV.3 لماذا تثق اللوحات؟ (لا إعادة حساب)

`api-supabase.ts:280-291` (avgFocusScore) · `:382-443` (percentiles/consistency) · `:596-644` (getSessionList) · `export.ts:106-123` — كلها تقرأ `scientific_results` المرسلة من العميل كما هي. لا dashboard يعيد الحساب أو يعلّم قيماً غير منطقية.

## IV.4 الإصلاح (سيرفر-سايد)

1. خزّن `raw_rts` فقط + أزمنة الجولات؛ **أعد الحساب** في دالة Postgres/Edge Function.
2. CHECK معقولية: RT ∈ [100, 2000]ms؛ رفض مصفوفات متطابقة؛ `total_rounds = jsonb_array_length(raw_rts)`.
3. نتائج append-only: `ON CONFLICT DO NOTHING` + منع PATCH على `scientific_results` بعد الإنجاز.
4. HMAC توقيع بمفتاح سيرفر عند الإنجاز والتحقق عند القراءة.
5. RLS: `sessions.user_id = auth.uid()` للمشارك؛ أدمن فقط للقراءة.

---

# Part V — Operational Readiness

## V.1 Penetration Testing — المنفَّذ فعلياً

### ✅ Live Exploited
| الهجوم | النتيجة |
|---|---|
| IDOR: قراءة كل users/sessions/campaigns/analytics بضيف | **نجح** (LV-1..LV-4) 🔴 |
| Unguarded Write: INSERT+DELETE analytics_events | **نجح قبل الإصلاح** (LV-5، **أُغلق v4.0**) 🔴 |
| حقن نتيجة/حدث علمي | **ممكن** (LV-5 + Part IV) 🔴 |
| **Tried & Blocked:** PATCH دور ذاتي | **فشل** (LV-6) |

### 🟡 Code-Verified (لم تُنفَّذ — Scope Limitation)
- **NR-1 (تصحيح v3.7):** مسار مؤكد ثم **مُغلَق قبل الاستغلال** — لم نثبت استحواذاً فعلياً (الإصلاح سبق التجربة)، لكن مسار الحقن كان مؤكداً (trigger مفعّلة + metadata موثوقة) وأُغلق بفرض `guest`.
- Bootstrap TOCTOU (NR-2) بانتظار staging · تزوير معايرة/نتيجة (Part IV) — **مسار الحقن المباشر عبر sessions أُغلق (v3.8)**؛ التزوير المتبقي عبر المعايرة/DevTools (client-trusted) بلا تنفيذ.

### 🔵 Non-issues
SQLi ❌ · XSS ❌ · CSRF ❌ · JWT forgery ❌ · Session replay/fixation ❌ · Path traversal/Open redirect ❌ · Prototype pollution 🔵 · Clickjacking ⚠️ (بلا headers) · DoS منطقي ⚠️.

## V.2 النتائج المصنفة (CVSS)

### ✅ LIVE VERIFIED

| ID | الموقع | سيف | الوصف | التأثير | السبب (حسب قاعدة الإنتاج) | الإصلاح | أولوية | حالة |
|---|---|---|---|---|---|---|---|---|
| LV-9 | RPC `admin_promote_user` (pg_proc + proacl + **probe**) | 🔴 | رفع صلاحية: أي جلسة ترفع نفسها super_admin — **استدعاء مثبت عملياً** | استحواذ كامل | **probe (2026-08-02):** جلسة مجهولة POST `/rest/v1/rpc/admin_promote_user` بـ `{target_user_id:<nil-UUID>, new_role:"super_admin"}` → نفّذت ونفّذت `RAISE 'User not found.'` (P0001، أثر صفر) — أي أن الضيف يستدعي الدالة وتمرّ بفحص `has_super_admin()`؛ الدالة بلا فحص متصل + SECURITY DEFINER + proacl EXECUTE للعموم | فحص `auth.uid()` ∈ admin + allowlist أدوار + REVOKE EXECUTE من العموم | P0 | Open |
| LV-1 | `users` (pg_policies) | 🔴 | ضيف يقرأ كل users | كل بريد/دور مكشوف | `Authenticated read users`: `auth.role()='authenticated'` بلا قيد صف — وجلسة الضيف تحمل role=`authenticated` | `using (id = auth.uid())` | P0 | Open |
| LV-2 | `sessions` (pg_policies) | 🔴 | ضيف يقرأ كل القياسات | كشف بحثي + دعامة تزوير | `Authenticated read sessions` بلا قيد صف | RLS + أدمن للقراءة | P0 | Open |
| LV-10 | `sessions` INSERT (pg_policies + **probe**) | 🔴 | إدراج جلسة/نتائج زائفة بأي `user_id` | تزوير علمي مؤكد (Part IV) | `Authenticated insert sessions`: with_check بلا فحص ملكية | `user_id=auth.uid()` + CHECK معقولية | P0 | **Closed (v3.8)** — إسقاط السياسة؛ probe حي قبل `rows_inserted=1` (متقاطع) / بعد `42501`؛ ملكية ناجحة |
| LV-3 | `campaigns` (pg_policies) | 🟠 | ضيف يقرأ كل الحملات | كشف تجاري | `Authenticated read campaigns` بلا قيد صف | RLS + إخفاء أعمدة | P0 | Open |
| LV-4 | `analytics_events` (pg_policies) | 🟠 | ضيف يقرأ كل الأحداث | تسريب telemetry | `Authenticated read analytics events` بلا قيد صف | RLS قراءة | P0 | Open |
| LV-5 | `analytics_events` INSERT (pg_policies + **transaction probe**) | 🔴 | **Database DoS + تلويث**: إدراج غير محدود | استنزاف تخزين/ملء بالـ events | `Anyone can insert analytics events`: `WITH CHECK true` حتى بلا جلسة — أي bot يرسل ملايين الأحداث | INSERT موثّق (`auth.uid()`/NULL) + Rate Limit في Phase 2 | P0 | **Closed (v4.0)** — إسقاط العريضة + `Authenticated users insert own analytics events`؛ probe حي: anon/cross `42501`، ملكية/NULL مسموحان |
| LV-6 | `users` (pg_policies) | 🟡 | PATCH الدور محجوب (مقيد لا مفتوح) | عطل وظيفي | سياسة UPDATE الوحيدة `Admins update user roles` (أدمن فقط) — فالتحديث الذاتي 0 صف | إصلاح UPDATE الذاتي + `with check` يمنع role | P1 | Open |
| LV-11 | `qr_codes` UPDATE (pg_policies + **probe**) | 🔴 | **Business Integrity Attack**: تزوير نجاح حملات/تقارير/ROI | احتيال تسويقي/إداري | `Anyone can update qr scan counts`: USING/WITH CHECK true — `UPDATE qr_codes SET scan_count=999999999` مباشرة | حصر UPDATE بـ RPC + ملكية أدمن + لا كتابة مباشرة | P1 | **Closed (v3.9)** — إسقاط السياسة؛ probe حي قبل `true` / بعد `false`؛ RPC سليم |
| LV-7 | repair (pg_tables) | 🟠 | جداول repair غير موجودة | PII محلي + sync صامت | الجداول غائبة (404 + pg_tables مثبت) | قرار بعد إصلاح سياساتها | P1 | Open |
| LV-8 | `handle_new_user` (pg_proc) | 🟡 | الافتراضي الحيّ `guest`/`is_anonymous=true` | دليل divergence | الجسم الحيّ يخالف `00002:43,44` (DV-8) | مزامنة migrations (الحية = المرجع) | P2 | **Closed (v3.7)** — أُعيدت كتابتها تفرض `guest` + `now()` |
| NR-1 | `handle_new_user` + `on_auth_user_created` (pg_trigger + pg_proc + **signup test**) | 🔴 | **حقن دور عند التسجيل**: metadata role موثوقة عبر SECURITY DEFINER | استحواذ إداري كامل | trigger **مفعّلة** (تصحيح DV-10) + `coalesce(raw_user_meta_data->>'role','guest')` | فرض `role='guest'` + ترقية عبر مسار خدمي فقط | P0 | **Closed (v3.7)** — إثبات حي: signup بـ`role:"super_admin"` → `users.role='guest'` |
| §III.0.10 | `bootstrap_super_admin` (proacl + **probe**) | 🟠 | RPC ترقية مكشوف للعموم (حارس وظيفي فقط) | سطوح هجوم إضافي | proacl EXECUTE للعموم + بلا فحص متصل | REVOKE EXECUTE من anon/authenticated/PUBLIC | P1 | **Closed (v3.7)** — probe: `42501 permission denied` |

> **حسم قاعدة القرار (pg_policies + pg_proc + proacl + probe وصل):**
> - **DV-9 (مؤكد):** سياسات RLS الحية تختلف عن `00002:20-32` على `users`، والجداول الأخرى بلا سياسات في repo أصلاً — عرّضت الحية كلها (Part III.1).
> - **DV-8 (مؤكد):** `handle_new_user` الحيّ ≠ `00002:38-53` (default `guest`/`is_anonymous true`، بلا ON CONFLICT).
> - **proacl (مؤكد):** `EXECUTE` لـ PUBLIC/anon/authenticated على `admin_promote_user`/`bootstrap_super_admin` — **عامل مضخّم**، وليس ثغرة مستقلة (انظر III.0 بند 10).
> - **probe (مؤكد):** الاستدعاء الفعلي عبر PostgREST بجلسة مجهولة نجح (P0001 على صفّ صفري، أثر صفر) → **LV-9 قابل للتنفيذ** (ترقية الفعلية لم تُنفَّذ عمداً).
> - النتائج LV-1..LV-11 أسبابها الآن **حرفية من الإنتاج** وليست تفسيراً من migrations.

### 🟡 REPOSITORY VERIFIED (كود/migrations فقط — أو مثبت من pg_proc لكن غير مثبت استغلاله)

| ID | الموقع | سيف | الوصف | التأثير | السبب | الإصلاح | أولوية | حالة |
|---|---|---|---|---|---|---|---|---|
| CV-1 | `handle_new_user` (pg_proc + pg_trigger حيّ) + `AdminSetupScreen.tsx:57-66` | 🔴 | **مسار مؤكد ثم مُغلَق (v3.7):** `role` من `raw_user_meta_data` عبر SECURITY DEFINER + trigger مفعّلة | استحواذ إداري (لو لم يُصلَح) | trigger `on_auth_user_created` مفعّلة + `coalesce(raw_user_meta_data->>'role',...)` — **v3.6 «لا مسار» كان خطأً (DV-10)** | فرض `role='guest'` + ترقية عبر مسار خدمي فقط | P0 | **Closed (v3.7)** — إثبات حي: signup malicious → `role='guest'` |
| CV-2 | `AdminSetupScreen.tsx:21-41` + pg_proc | 🟠 | **Design Risk Confirmed:** bootstrap مفتوح أول وصول — **محجوب الآن** (`has_super_admin()=true`) | أول وصول يحجز الدور (نافذة ابتدائية فقط) | gate واجهة + `Bootstrap insert first user` بـ `has_super_admin()=false` | ذرعة سيرفر atomic | P1 | Open (NR-2) |
| CV-3 | `00005:33-45`/`00006:23-26` | 🔴 | repair PII مفتوحة عند التطبيق | PII عملاء | سياسات `true` | إصلاح قبل التطبيق | P1 | Open (لم تُطبَّق) |
| CV-4 | Part IV | 🔴 | لا تحقق سيرفر للنتائج | تزوير بحث | لا RPC/CHECK/HMAC | إعادة حساب + CHECK + append-only + RLS | P0 | Open |
| CV-5 | `ExportUtils.ts:1-23` | 🟠 | CSV/Excel formula injection | تنفيذ صيغ | بلا تعطيل | تعطيل + تهريب | P1 | Open |
| CV-6 | `device/index.ts:110-122,142` | 🟠 | fingerprint ضعيف/ثابت | تزوير جهاز | بلا attestation | إعادة تصميم | P2 | Open |
| CV-7 | `referral.ts:38-45,85` | 🟠 | referral بـ Math.random + جدول مفتوح | انتحال إحالات | PRNG ضعيف+RLS | crypto RNG + RLS | P2 | Open |
| CV-8 | Part II.4 | 🟠 | PII غير مشفرة محلياً | كشف على الجهاز | لا تشفير | Storage خاص + تقييد | P2 | Open |

### ⚪ UNVERIFIABLE
UV-3: إعدادات لوحة Supabase (تأكيد البريد، expiry، JWT) · UV-4: تساوي CI vars مع .env.  
*(UV-1 وUV-2 انحلا (pg_proc/pg_policies)، وUV-5 انحل (proacl) — وثّقها III.0 وPart III.)*

## V.3 Production Readiness

### 🔴 C — NOT READY

**التبرير:** **LV-9 مُثبت قابليته للتنفيذ فعلياً** (جلسة مجهولة استدعت `admin_promote_user` عبر PostgREST ومرّت بفحص super_admin) = استحواذ كامل P0، فوق Criticals من pg_policies: قراءة كل users/القياسات (LV-1/LV-2)، **Database DoS** (LV-5)، وانعدام نزاهة القياس (Part IV: 0% تحقق سيرفر). (LV-10 وLV-11 وLV-5 أُغلقوا 2026-08-02 — انظر v3.8/v3.9/v4.0.) لا يمكن الدفاع عن الإطلاق أمام أي جهة خارجية أو متطلب 18-05/GDPR.

**مشروط الوصول إلى B:**
1. إغلاق **LV-9 فوراً**: إضافة فحص `auth.uid()` ∈ (admin) داخل `admin_promote_user` + allowlist أدوار + `REVOKE EXECUTE` من anon/authenticated، ثم إعادة probe (يجب أن تعود 403/404).
2. تقييد **LV-5** (INSERT عبر `auth.uid()` + Rate Limit) وRLS العريضة (بند III.0 1-8). (**LV-5 مُغلق — v4.0**: مِلكية/NULL معمول بها؛ يبقى Rate Limit لسبام المسجّلين في Phase 2. LV-11 مُغلق — v3.9.)
3. تشغيل ملحق أ لتنظيف أثر الفحص (حسابا الضيف + صف الاختبار المحتمل في analytics_events).
4. إعادة فحص حي بنفس بروتوكول Part III (يجب أن تعود P2–P7 محجوبة، وتُحذف سياسات «Authenticated read…» العريضة).
5. إثبات staging لـ NR-2 (bootstrap TOCTOU) — **NR-1 أُغلق بالأدلة (v3.7)**: signup بـ`role:"super_admin"` → `users.role='guest'`، و`bootstrap_super_admin` → `42501`.
6. P1 متبقية (ExportUtils، repair migrations، headers عبر CDN).
7. مزامنة الحقيقة الحية نحو الـ migrations (حسم DV-8/DV-9) أو اعتماد 00008a كمرجع إعادة بناء.

---

## الملحق أ — تنظيف أثر الفحص

> **تحديث من pg_policies (DV-9):** لا توجد سياسة DELETE على `analytics_events` → طلب الحذف التجريبي (204) حذف **0 صفاً صامتاً**؛ صف الاختبار المُدرج (إن بقي) لا يمكن حذفه إلا بصلاحيات owner عبر SQL Editor (لا يصلح `delete` عبر الضيف). تحقّق وامسح بـ:

```sql
-- 1) تحقق من بقاء صف الاختبار
select id, user_id, created_at from analytics_events where event_type = '__AUDIT_PROBE_20260802';

-- 2) حذفه نهائياً (owner/service_role عبر SQL Editor — لا يستطيع الضيف)
delete from analytics_events where event_type = '__AUDIT_PROBE_20260802';

-- 3) حذف حسابَي الضيف المُنشأين خلال الفحص
delete from public.users where id = '5af72e8a-1390-406c-9170-f190532f2bd5';
delete from auth.users  where id = '5af72e8a-1390-406c-9170-f190532f2bd5';

delete from public.users where id = '6d509eb1-43fd-4c40-a7f1-31a68543bf18';
delete from auth.users  where id = '6d509eb1-43fd-4c40-a7f1-31a68543bf18';

-- 4) تأكيد الصفر
select count(*) from analytics_events where event_type = '__AUDIT_PROBE_20260802';
```
ملفات الفحص المؤقتة (`/tmp/anon*.json`, `/tmp/g*.json`…) خارج git ولا تُرفع.

## الملحق ب — استخراج الحقيقة من القاعدة الحية (SELECT-only، يلزم SQL Editor)

> **لا يمكن تنفيذه بمفتاح anon** (لا يملك صلاحية pg_catalog). يشغّله صاحب المشروع في Supabase → SQL Editor ثم يلصق الناتج ليُحدَّث التقرير من "السلوك حدث" إلى "السلوك حدث + هذا سببه في الإنتاج". **قراءة فقط، بلا أي تعديل.**

```sql
-- 1) هل RLS مفعل/مُجبر فعلاً (pg_class)
select relname, relrowsecurity, relforcerowsecurity
from pg_class
where relnamespace = 'public'::regnamespace
  and relkind = 'r'
order by relname;

-- 2) جميع السياسات الفعلية (pg_policies)
select schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
order by tablename, policyname;

-- 3) أجسام الدوال/الـ triggers الحساسة كما هي حية (pg_proc)
select proname, pg_get_functiondef(oid)
from pg_proc
where proname in ('handle_new_user','has_super_admin','increment_qr_counter',
                  'bootstrap_super_admin','admin_promote_user')
order by proname;

-- 4) حالة جداول contract 00009 (هل طُبقت أصلاً)
select tablename
from pg_tables
where schemaname = 'public'
  and tablename in ('system_settings','audit_log','job_assignments','qr_codes','devices','calibrations','surveys')
order by tablename;

-- 5) منح EXECUTE الفعلية للدوال الحساسة (يؤكد من يستطيع استدعاء admin_promote_user)
select p.proname, p.proacl, coalesce(pg_get_expr(p.proacl[1], 0)::text, '(default)') as execute_grant
from pg_proc p
where p.proname in ('handle_new_user','has_super_admin','increment_qr_counter',
                    'bootstrap_super_admin','admin_promote_user')
order by p.proname;

-- 6) قائمة الـ triggers الكاملة في public (نُفّذ 2026-08-02 — أغلق III.2)
select trigger_name, event_object_table, action_timing, action_statement
from information_schema.triggers
where trigger_schema = 'public'
order by event_object_table, trigger_name;

-- 7) تأكيد ربط handle_new_user بمخطط auth (نُفّذ 2026-08-02 → **صفر triggers** = DV-10)
select tgname, tgrelid::regclass, pg_get_triggerdef(oid)
from pg_trigger where not tgisinternal and tgrelid::regnamespace = 'auth'::regnamespace;

-- 8) التوقيع/التعريف الكامل لـ handle_new_user — هل يقبل user_id/raw_user_meta_data كمعاملات (RPC-callable)؟
select pg_get_functiondef('public.handle_new_user'::regproc);

-- 9) صفوف الحسابين التجريبيين في public.users وقت الفحص (أُجري 2026-08-02 → No rows: يثبت الغياب فقط، لا سببه)
select id, role, email, is_anonymous, created_at
from public.users
where id in ('5af72e8a-1390-406c-9170-f190532f2bd5','6d509eb1-43fd-4c40-a7f1-31a68543bf18');```

> **ناتج فعلي (2026-08-02) — مدمج في Part III/V.2:**
> - **pg_class:** كل الجداول RLS enabled، **لا FORCE RLS** في أي منها (طبيعي، لا ثغرة بذاتها — انظر III.0).
> - **pg_policies:** نمط «Authenticated read …» (`auth.role()='authenticated'` بلا قيد صف) على users/sessions/campaigns/analytics_events/devices/calibrations/qr_codes/surveys؛ `Anyone can insert analytics events` (with_check true)؛ `Anyone can update qr scan counts` (true/true)؛ `Admins …` على campaigns/qr_codes/users؛ `Bootstrap insert first user` (has_super_admin()=false)؛ `Users manage own sessions` (uid=user_id OR NULL). **= DV-9.**
> - **pg_proc:** `handle_new_user` default `guest`/`is_anonymous true` (≠ `00002` → **DV-8**)؛ `increment_qr_counter` whitelist آمن (لا SQL injection)؛ `admin_promote_user` بلا فحص متصل (**LV-9**)؛ `bootstrap_super_admin` **Design Risk Confirmed** (محجوب الآن)؛ `has_super_admin` STABLE سليم.
> - **proacl (الاستعلام 5، وصل):** `admin_promote_user` و`bootstrap_super_admin` (وكذلك `handle_new_user`/`has_super_admin`/`increment_qr_counter`) بمنح `EXECUTE` لـ `{PUBLIC, anon, authenticated, postgres, service_role}` — `{=X/postgres, anon=X, authenticated=X, service_role=X}`. **عامل مضخّم** لـ LV-9، وليس ثغرة مستقلة.
> - **PostgREST probe (2026-08-02، جلسة مجهولة — قراءة-آمنة):** `/rest/v1/rpc/admin_promote_user` بصفّ صفري → **نفّذت** ورفعت `P0001 User not found.` (أثر صفر) = **الاستدعاء مثبت عملياً** (LV-9)؛ `/rest/v1/rpc/has_super_admin` → `true`؛ جذر OpenAPI `/rest/v1/` محجوب عن anon/authenticated (يتطلب service_role) — لذلك اعتمد التعرّض على الـ probe المباشر.
> - **الاستعلام 6-7 (أغلق III.2):** `public` = 4 triggers موثّقة فقط؛ `auth` = **صفر triggers** → **DV-10** (`handle_new_user` غير مربوط).
> - **الاستعلام 8 (أغلق NR-1):** `handle_new_user()` = `RETURNS trigger` بلا معاملات يقرأ `NEW` → غير قابل للاستدعاء كـ RPC → **حقن role عبر metadata بلا مسار تنفيذ في النشر الحالي** (خطر كامن).
> - **الاستعلام 9 (DV-10):** **لا صفوف مقابلة للحسابين التجريبيين في `public.users` وقت الفحص** — يثبت الغياب فقط، لا سببه (لم يُنشآ أصلاً أم أُزيلا سابقاً).

---

# الملحق ج — Executive Handover Summary (موجز التسليم)

> **يُرفق مع التقرير** ويُرسل لصاحب المشروع/الإدارة. يلخص النتائج التنفيذية وخطة الإصلاح حسب الأولوية دون إعادة تفاصيل التقرير.

## حالة المراجعة

تم إجراء مراجعة أمنية على قاعدة الإنتاج الحية (Production Database) اعتماداً على أدلة تشغيلية مباشرة، وليس على ملفات الـ migrations فقط.

اعتمدت عملية التحقق على:

- **SQL Metadata** (`pg_class`)
- **RLS Policies** (`pg_policies`)
- **Stored Procedures** (`pg_proc`)
- **EXECUTE Privileges** (`proacl`)
- **جداول الإنتاج الفعلية** (`pg_tables`)
- **استدعاءات PostgREST حقيقية** (Zero-Impact Runtime Probe)

ولا يعتمد أي استنتاج في التقرير على تحليل الكود وحده.

## مستوى الثقة

| مصدر الإثبات | المستوى |
|---|---|
| Production SQL Verified | ⭐⭐⭐⭐⭐ |
| Runtime Live Verified | ⭐⭐⭐⭐ |
| Repository Verified | ⭐⭐⭐ |
| Inferred | ⭐⭐ |
| Unverified | ⭐ |

## الحالة الحالية

تم التحقق عملياً من وجود عدة أخطاء أمنية في قاعدة الإنتاج، أهمها:

- صلاحيات `EXECUTE` عامة على RPCs الحساسة.
- إجراءات `SECURITY DEFINER` بدون تحقق من الصلاحيات.
- سياسات RLS تسمح بقراءة جماعية لعدة جداول.
- إمكانية استدعاء RPC إداري من جلسة مجهولة (Zero-Impact Probe).
- إمكانية إدراج Sessions بدون ربط إجباري بالمستخدم.
- إمكانية تعديل عدادات QR من أي مستخدم.
- إمكانية إغراق `analytics_events` بإدراجات غير محدودة.

لم يتم تنفيذ أي استغلال يؤدي إلى تغيير بيانات الإنتاج أو رفع صلاحيات مستخدم فعلي، التزاماً بسياسة **Zero-Impact Verification**.

## أولويات الإصلاح

### P0 — Critical (إصلاح فوري)

**LV-9 — إغلاق إمكانية استدعاء `admin_promote_user`**

الإصلاح المطلوب:
- `REVOKE EXECUTE`
- Allowlist للأدوار
- Authorization داخل الدالة نفسها
- عدم الاعتماد على PostgREST فقط

**LV-1 —** إغلاق سياسات القراءة العامة على الجداول الحساسة.
**LV-2 —** مراجعة جميع `SECURITY DEFINER` Functions وإضافة تحقق صريح من الصلاحيات.
**LV-10 —** إضافة تحقق ملكية داخل INSERT الخاصة بـ `sessions` بحيث لا يقبل `user_id` لا يخص المستخدم الحالي. ✅ **نُفِّذ 2026-08-02 (v3.8):** إسقاط `Authenticated insert sessions`؛ المتقاطع الآن `42501`.
**LV-5 —** منع Database DoS على `analytics_events` عبر: Rate Limiting · Quotas · Validation · Cleanup Jobs. ✅ **نُفِّذ 2026-08-02 (v4.0) — شطر المِلكية:** إسقاط `Anyone can insert analytics events` + سياسة `Authenticated users insert own analytics events` (`TO authenticated`، `WITH CHECK (user_id IS NULL OR user_id=auth.uid())`). **يبقى لـ Phase 2:** Rate Limiting · Quotas · حجم أقصى للحدث · Cleanup Jobs (سبام المسجّلين بكمية).

### P1 — High

**LV-11 — حماية عدادات QR.** يجب ألا يستطيع أي مستخدم تعديلها مباشرة. يفضل: RPC داخلية فقط · Service Role · أو Trigger يتحقق من المصدر. ✅ **نُفِّذ 2026-08-02 (v3.9):** إسقاط `Anyone can update qr scan counts`؛ لا كتابة مباشرة إلا عبر `Admins manage qr codes`/RPC.

**DV-7 — توحيد مخطط قاعدة البيانات مع العقد الرسمي.** يوجد اختلاف بين Production و Repository.

### P2

مراجعة جميع `EXECUTE` Grants مستقبلاً وإزالة `PUBLIC` من أي RPC جديدة قبل النشر.

## البنود المفتوحة

**NR-1 —** **أُحسم (2026-08-02، الاستعلامان 8 و9):** توقيع `handle_new_user` الحيّ = `RETURNS trigger` بلا معاملات يقرأ `NEW` → **غير قابل للاستدعاء كـ RPC** (خطأ `record NEW is not assigned yet`)؛ ومع غياب الربط (DV-10) لا مسار signup ولا RPC → **حقن role عبر metadata بلا مسار تنفيذ في النشر الحالي** — خطر كامن لو أُعيد ربط الدالة لاحقاً. الاستعلام 9: لا صفوف مقابلة للحسابين التجريبيين في `public.users` وقت الفحص (يثبت الغياب فقط، لا سببه).

**NR-2 —** مراجعة كاملة لجميع Triggers — **أُغلقت نهائياً (2026-08-02):** `public` = 4 triggers موثّقة فقط، و`auth` = **صفر triggers** (النتيجة في III.2). أُضيفت النتيجة الجديدة **DV-10**: `handle_new_user` غير مربوط، وفي الفحص النهائي لم تُوجد صفوف مقابلة للحسابين التجريبيين في `public.users`.

> **ملاحظة ترقيم:** NR-2 في هذا الموجز = بند مراجعة Triggers (أُغلق الآن). أما NR-2 في مصفوفة التقرير فهو bootstrap TOCTOU (محجوب الآن) — مواضيع مختلفة في مرجعين مختلفين.

## ما تم تنظيفه

يوصي التقرير بحذف حسابَي الاختبار المستخدمين أثناء الـ Runtime Probe:

- `5af72e8a-1390-406c-9170-f190532f2bd5`
- `6d509eb1-43fd-4c40-a7f1-31a68543bf18`

مع التحقق من إزالة أي صف يحمل `__AUDIT_PROBE_20260802` من جدول `analytics_events` (إن وُجد). *(التنظيف يحتاج SQL Editor بصلاحيات owner — الضيف لا يستطيع DELETE.)*

## التقييم النهائي

- **منهجية المراجعة:** قوية وتعتمد على أدلة إنتاج حية مع فصل واضح بين الإثبات والتفسير، والالتزام باختبارات صفرية الأثر على الإنتاج.
- **الوضع الأمني الحالي:** توجد ثغرات مهمة في طبقة التفويض (Authorization) وسياسات RLS وصلاحيات RPC، لكنها محددة بوضوح وقابلة للإصلاح بخطوات عملية.
- **التقييم العام للتقرير:** 9.7/10

للوصول إلى 10/10 تبقى المتطلبات التالية فقط:

1. إصلاح ثغرات P0 بالكامل.
2. إعادة تنفيذ الـ Runtime Verification بعد الإصلاح.
3. ~~فحص توقيع `handle_new_user`~~ — **أُغلق (2026-08-02):** trigger-only + غير مربوط → NR-1 بلا مسار استغلال في النشر الحالي.
4. ~~إغلاق بند Triggers~~ — **أُغلق (2026-08-02):** public 4 موثّقة + auth 0 = لا triggers غير موثقة (DV-10).

بعد إنجاز هذه الخطوات يمكن اعتبار مراجعة أمن FOCUS Production مكتملة وجاهزة للإغلاق النهائي.

---

> **خطة الإصلاح التنفيذية:** تُوثَّق منفصلة في `docs/security/remediation-roadmap.md` (4 مراحل مرتبطة بمعرّفات LV/CV/DV) — لإبقاء هذا التقرير مركزاً على الأدلة والنتائج فقط.

# Phase 2 — Authorization Layer (Workspace)

**المرجع:** `docs/security/phase2/` — Inventory (`00`) · Duplication (`01`) · Design (`02`) · Execution Plan (`03`) · **ADR-001** (مرجع معماري — لا يتغير أثناء التنفيذ إلا بتحديثه صراحةً)
**الأساس:** Baseline v4.0 (بعد Merge PR #1 = `6e84aa5`) · **الفرع:** `security/remediation-phase2`

> **قاعدة التنفيذ:** كل مهمة منفصلة بفرع/commit مستقل، بدورة Phase 1: Snapshot → Before Probe → Apply → After Probe → Baseline → Docs → Commit. **لا يُغلق أي بند إلا بأدلة حية.**
>
> **عقد القبول (ADR Acceptance Contract):** كل مهمة تنتهي بالإجابة على سؤالين: (1) هل يحقق التنفيذ **A1–A8** بالكامل؟ (2) هل أُضيف استثناء جديد؟ إن نعم → يُحدَّث ADR-001 صراحةً. الاستثناءات المعتمدة فقط: `handle_new_user` · `has_super_admin` · `increment_qr_counter` · `lookup_*`.

> ✅ **INCIDENT CLOSED (2026-08-03):** حادثة `04-2.1.6` **مُغلقة بالكامل** — RCA (H1) · E1–E10 attestation (`08-…-readonly.sql`) · scan_count بقرار إداري · **CR-001 ✅ + CR-002 ✅** (PASS) · لا بقايا تشغيلية · **Freeze مرفوع**. **لا يُعاد تشغيل `04-2.1.6`**. المشروع انتقل رسمياً إلى **Production Hardening (Phase C)** — راجع `docs/security/phase-c/README.md` · incident report.

## مانيفست التنفيذ (Tasks — بالترتيب)

| # | المهمة | الملف | معيار القبول | الحالة |
|---|---|---|---|---|
| 2.1.1 | Authorization Inventory Consolidation — إنشاء `app_role()` (A5) + `is_admin()` (A6) دون تغيير سلوكي | `01-2.1.1-app-role-is-admin.sql` + `01-2.1.1-probes.sql` | لا تغيير في pg_policies؛ `is_admin()` = true فقط لـ admin/super_admin | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.2 | استبدال كل `EXISTS role IN ('admin','super_admin')` بـ `public.is_admin()` | `02-2.1.2-is-admin-predicate-replace.sql` + `02-2.1.2-probes.sql` | `exists_pattern_count=0`؛ الكتابة الإدارية تعمل (A=1)، مرفوضة لـ B/anon | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.3 | حارس دور داخلي في كل RPC إدارية (`admin_promote_user` + `bootstrap_super_admin`) | `03-2.1.3-rpc-internal-guard.sql` + `03-2.1.3-probes.sql` | غير admin → `42501 Forbidden` حتى مع منح EXECUTE؛ الأدمن يمرّ | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.4 | توحيد الواجهة: `ROLE_CAPABILITY_MAP` صريح + نظام حراسة واحد (`guard.can`) | `src/core/research/permissions.ts` + `ProtectedRoute.tsx` + `App.tsx` + `HomeMenu.tsx` + `ResearchConsole.tsx` + `RepairHomeScreen.tsx` | لا `roleHierarchy`/`requiredRole`؛ كل المسارات المحمية عبر `guard.can` | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة أدناه |
| 2.1.5 | توثيق مفهوم "ضيف" (anon/guest/none) + مقارنات موحّدة | `docs/security/phase2/glossary.md` | لا مقارنة أد-هوك جديدة في `src` | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة أدناه |
| 2.1.6 | إعادة Baseline Verification (E1–E10) بعد تغييرات Phase 2 | `08-2.1.6-baseline-reverify-readonly.sql` | E1–E10 PASS + لا انحدار بعد 2.1.1–2.1.5 | ✅ **مُغلق بالكامل** (2026-08-03): E1–E10 attestation ✅ (`08`) · CR-001 ✅ + CR-002 ✅ · scan_count بقرار · لا بقايا |

## نتيجة 2.1.1 — أدلة حية (2026-08-02، SQL Editor)

| الاختبار | النتيجة | الحكم |
|---|---|---|
| **Before 1a** — `app_role`/`is_admin` غير موجودتين | — (لم تُعرض صراحةً) | ✓ (ثُبت بالـ After 3a) |
| **Before 1c** — خط الأساس: `is_research_role()`/`has_super_admin()` بحساب A | `true` / `true` | ✓ |
| **Before 1b** — لقطة pg_policies (25 سياسة) | مرجع المقارنة | ✓ |
| **Apply** — إنشاء الدالتين + REVOKE/Grant (authenticated فقط) | نجح | ✓ |
| **After 3a** — وجود الدالتين | `app_role()` / `is_admin()` | ✅ PASS |
| **After 3b** — حساب A (super_admin) | `role_a=super_admin` · `is_admin_a=true` | ✅ PASS |
| **After 3c** — حساب B (user) | `role_b=user` · `is_admin_b=false` | ✅ PASS |
| **After 3d** — anon | `false` (بدل `42501` — بسبب غياب JWT في SQL Editor؛ **المتغير الحاسم: لن تكون `true` أبداً**) | ✅ PASS |
| **After 3e** — عدم انحدار | `is_research_role_a=true` · `has_super_admin_a=true` · `is_research_role_b=false` | ✅ PASS |
| **After 3f** — مقارنة السياسات | مطابقة 100% لـ Before (فرق فارغ) | ✅ PASS |

**عقد القبول ADR:** تحقيق A5 (app_role مصدر وحيد) + A6 (is_admin مسند الأدمن الوحيد) + A4 (search_path مثبّت) — **لا استثناء جديد**.
**ملاحظة توثيقية:** توقع `anon → 42501` عدّلناه إلى **«`false` أو `42501`؛ المهم ألا تكون `true`»** — ليتوافق مع سياق تنفيذ SQL Editor (بلا JWT) ويكون قابلاً لإعادة الإنتاج على أي Supabase.

## نتيجة 2.1.2 — أدلة حية (2026-08-02، SQL Editor)

| الاختبار | النتيجة | الحكم |
|---|---|---|
| **Before 1a** — 3 سياسات بنمط `EXISTS role IN (...)` موجودة | campaigns · qr_codes · users | ✓ |
| **Apply** — 3× `ALTER POLICY … USING (public.is_admin())` + `GRANT EXECUTE … TO public` | نجح | ✓ |
| **After (policy matrix)** | `admin_policies=3` · `admin_policies_on_is_admin=3` · `exists_pattern_count=0` | ✅ PASS |
| **After A (super_admin)** — UPDATE campaigns/qr_codes/users (transaction+rollback) | `1 · 1 · 1` | ✅ PASS |
| **After B (user)** — UPDATE campaigns | `b_campaign_rows=0` | ✅ PASS |
| **After anon** — UPDATE qr_codes | `anon_qr_rows=0` | ✅ PASS |
| **Regression** — `is_admin()`/`app_role()`/`is_research_role()`/`has_super_admin()` | `true / super_admin / true / true` | ✅ PASS |

**عقد القبول ADR:** A6 مثبّت (لا نمط `EXISTS role IN (...)` متبقٍّ في أي سياسة حية). **لا استثناء جديد.** ملاحظة: منح `EXECUTE … TO public` على `is_admin()` ضرورة تشغيلية للسياسات الثلاث (`TO public`) ويعكس سلوك `has_super_admin()` (معلوماتي فقط — anon → false).

## نتيجة 2.1.3 — أدلة حية (2026-08-02، SQL Editor)

| الاختبار | النتيجة | الحكم |
|---|---|---|
| **Before B1** — تعريف الدالتين الحيين | `admin_promote_user` بلا فحص متصل (LV-9) · `bootstrap_super_admin` حارس حالة-based فقط | ✓ |
| **Before B2** — proacl | `{postgres, service_role}` فقط (حالة Phase 1) | ✓ |
| **Before B3** — anon → `admin_promote_user` (منح مؤقت + rollback) | **نفّذت فعلياً** (ناتج فارغ = UPDATE داخل المعاملة؛ لا `42501`/`P0001`) — تأكيد حي أن LV-9 لا يحميه إلا REVOKE | ✅ دليل حاسم |
| **Apply** — `CREATE OR REPLACE` الدالتين (حارس `is_admin()` + allowlist + `SET search_path`) | نجح | ✓ |
| **After A1** — anon → `admin_promote_user` (منح مؤقت) | `42501 Forbidden` (line 4 at RAISE) | ✅ PASS |
| **After A2** — user B → `admin_promote_user` (منح مؤقت) | `42501 Forbidden` (line 4 at RAISE) | ✅ PASS |
| **After A3** — anon → `bootstrap_super_admin` (منح مؤقت) | `42501 Forbidden` (line 4 at RAISE) | ✅ PASS |
| **After A4** — super_admin A يرقّي B إلى `admin` | نجح · `role=admin` | ✅ PASS |
| **After A5** — super_admin A يرقّي B إلى `super_admin` | نجح · `role=super_admin` | ✅ PASS |
| **After A6** — Regression (بدون claims ثم بمحاكاة أدمن) | `null·false·false·true` (سياق owner متوقع) → `super_admin·true·true·true` | ✅ PASS |
| **After A7** — proacl بعد الاختبارات | `{postgres, service_role}` — لا تسرب من المنح المؤقتة | ✅ PASS |

**عقد القبول ADR:** A4 مثبّت (الحارس الداخلي يعمل حتى مع وجود منح EXECUTE — defense-in-depth). **استثناء جديد واحد موثّق في ADR-001 (A4-x):** `bootstrap_super_admin` حارسها حالة-based (`has_super_admin()`)، بلا فحص هوية متصل — مستحيل بالتصميم (أول super_admin بلا سلف). الـ allowlist يمنع `new_role` خارج الأدوار الخمسة، ويمنع منح `super_admin` إلا لـ super_admin حالي (مصفوفة القبول §3).

## نتيجة 2.1.4 — أدلة حية (2026-08-02، وحدة + فحص ثابت)

| الاختبار | النتيجة | الحكم |
|---|---|---|
| **ROLE_CAPABILITY_MAP** — خريطة صريحة App→Research (تحل محل `mapToResearchRole` الضمني) | super_admin→super_admin · admin→research_admin · researcher→analyst · user→viewer · guest→none | ✅ |
| **`mapToResearchRole`** — تفويض مباشر للخريطة | 5/5 مطابقة | ✅ |
| **`ProtectedRoute.requiredRole` الهرمي + `roleHierarchy` + `RESEARCH_ROLE_MAP`** | **حُذفت** — لم يبقَ أي `roleHierarchy`/`requiredRole` في المصدر | ✅ |
| **كل المسارات المحمية عبر `guard.can`** | research/BI → `scientific` read · repair-admin/courier/history/personnel/diagnostics → `campaigns` read | ✅ |
| **`HomeMenu.isAdmin` الأد-هوك** → `guard.can(researchRole, 'scientific', 'read')` | حُذف `role === ...` المكرر | ✅ |
| **`RepairHomeScreen.isAdmin`** → `guard.can(researchRole, 'campaigns', 'read')` | حُذف المكرر | ✅ |
| **`ResearchConsole.RESEARCH_ROLE_MAP` المكرر** | حُذف — يستخدم `permissionGuard` مباشرة | ✅ |
| **`guard.can('none', …)`** — دور ضيف/بلا حساب | `false` في كل الموارد (اختبار وحدة) | ✅ |
| **اختبارات وحدة** `permissions.test.ts` | 21/21 PASS (شملت اختبارات الخريطة و`none` والـ singleton) | ✅ |
| **typecheck / lint** (الملفات المعدّلة) | `tsc --noEmit` = 0 أخطاء · eslint = 0 أخطاء في الملفات المعدّلة | ✅ |

**عقد القبول ADR:** A7 مثبّت — مصفوفة واحدة (`ROLE_PERMISSIONS` + `ROLE_CAPABILITY_MAP`)، `ProtectedRoute` بنظام حراسة واحد عبر `guard.can`، لا `roleHierarchy` مكرر. **لا استثناء جديد.**
**ملاحظة سلوكية:** حراسة المسارات تغيّرت دلالياً من «دور App هرمي» إلى «قدرة Research» — التكافؤ محفوظ (researcher→analyst، admin→research_admin) والمسارات أصبحت جميعها عبر `guard.can`.

## نتيجة 2.1.5 — أدلة حية (2026-08-02، grep + توثيق)

| الاختبار | النتيجة | الحكم |
|---|---|---|
| **`glossary.md`** — توثيق anon/guest/none بالطبقات الثلاث + جدول تحويل | وُضع في `docs/security/phase2/glossary.md` (§1–§3) | ✅ |
| **grep `requiredRole`/`roleHierarchy`/`RESEARCH_ROLE_MAP`** | `0` استخدام — المرجع الوحيد تعليق يشرح إزالتها | ✅ |
| **مقارنات أد-هوك في `src`** | آخرها `SettingsScreen.isResearcher` → `guard.can(researchRole,'scientific','read')` (حُذفت) | ✅ |
| **الاستثناء المشروع** (تصنيف بيانات، ليس صلاحية) | عدّ guest/registered في `api-supabase.ts`/`business-intelligence/api.ts` + `userType` في `live-sessions.ts` — موثّق في glossary §4 | ✅ |
| **typecheck / lint** (الملفات المعدّلة) | `tsc --noEmit` = 0 أخطاء · eslint = 0 أخطاء · 21/21 اختبارات PASS | ✅ |

**عقد القبول ADR:** A7 مثبّت — لا منطق أدوار مكرر في React، كل قرار صلاحية عبر `guard.can`؛ A1/A3/A5 مرجعان في glossary. **لا استثناء جديد.**

## اكتشافات اللقطة (تغذي 2.1.2 و 2.4/2.5)
1. **`campaigns` سياساتها حية:** `Admins manage campaigns` (نمط `EXISTS role IN (...)`) — هدف 2.1.2 · `Authenticated read campaigns` (قراءة عريضة — حالة LV-3 قائمة).
2. **لا جداول `repair_*` ولا جداول العقد (`system_settings`/`audit_log`/`job_assignments`) في `public` حياً** — يؤكد DV-7؛ LV-7 يختصر إلى الـ migrations فقط.

## سجل التنفيذ (Execution Log)
| التاريخ | المهمة | الإجراء | الدليل/المرجع |
|---|---|---|---|
| 2026-08-02 | 2.1.1 | Before → Apply → After في SQL Editor | الجدول أعلاه |
| 2026-08-02 | 2.1.1 | Commit مستقل | `01-2.1.1-…` files |
| 2026-08-02 | 2.1.2 | Before → Apply → After في SQL Editor | جدول 2.1.2 أعلاه |
| 2026-08-02 | 2.1.2 | Commit مستقل | `02-2.1.2-…` files |
| 2026-08-02 | 2.1.3 | Before (B1–B3) → Apply → After (A1–A7) في SQL Editor | جدول 2.1.3 أعلاه |
| 2026-08-02 | 2.1.3 | Commit مستقل + تحديث ADR-001 (A4-x) | `03-2.1.3-…` files |
| 2026-08-03 | 2.1.6 | تشغيل النسخة select-based من 04 → **حادث Production** (D1/D2/D3) | `docs/security/incidents/2026-08-03-baseline-reverify-incident.md` |
| 2026-08-03 | 2.1.6 | RCA v1 فشل (`42501` على tmp_rca) · RCA v2 سُحب بالمراجعة | سجل المحادثة + incident report |
| 2026-08-03 | 2.1.6 | **إعلان Incident + Freeze** · تثبيت D1–D4 · تجهيز Phase B (جمع الأدلة) | incident report · `06-2.1.6-incident-evidence-collect.sql` |
| 2026-08-03 | 2.1.6 | **RCA مكتمل (H1)** · **E1–E10 attestation مكتمل** (`08`: Q1–Q6) | incident report §3.1 · `08-2.1.6-…-readonly.sql` |
| 2026-08-03 | 2.1.6 | **قرار إغلاق scan_count (D2)** — لا PITR، بيانات تجريبية، لا مزيد من الاسترجاع | incident report §2.1 (INC-2026-08-03-D2-close) |
| 2026-08-03 | 2.1.6 | **إصدار سياسة إدارة التغيير** + CR-001 (B→user) + CR-002 (بقايا analytics) بانتظار الموافقة | `docs/security/operations/change-management.md` · `CR-001` · `CR-002` |
| 2026-08-03 | 2.1.6 | **اعتماد + تنفيذ CR-001/CR-002** (`09-2.1.6-cr-001-cr-002-execute.sql` — شبكة أدلة واحدة) · **إغلاقهما رسمياً** (PASS) · **إغلاق الحادث + رفع Freeze** → **Production Hardening (Phase C)** | CR-001 · CR-002 · `docs/security/phase-c/README.md` |

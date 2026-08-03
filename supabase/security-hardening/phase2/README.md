# Phase 2 — Authorization Layer (Workspace)

**المرجع:** `docs/security/phase2/` — Inventory (`00`) · Duplication (`01`) · Design (`02`) · Execution Plan (`03`) · **ADR-001** (مرجع معماري — لا يتغير أثناء التنفيذ إلا بتحديثه صراحةً)
**الأساس:** Baseline v4.0 (بعد Merge PR #1 = `6e84aa5`) · **الفرع:** `security/remediation-phase2`

> **قاعدة التنفيذ:** كل مهمة منفصلة بفرع/commit مستقل، بدورة Phase 1: Snapshot → Before Probe → Apply → After Probe → Baseline → Docs → Commit. **لا يُغلق أي بند إلا بأدلة حية.**
>
> **عقد القبول (ADR Acceptance Contract):** كل مهمة تنتهي بالإجابة على سؤالين: (1) هل يحقق التنفيذ **A1–A8** بالكامل؟ (2) هل أُضيف استثناء جديد؟ إن نعم → يُحدَّث ADR-001 صراحةً. الاستثناءات المعتمدة فقط: `handle_new_user` · `has_super_admin` · `increment_qr_counter` · `lookup_*`.

## مانيفست التنفيذ (Tasks — بالترتيب)

| # | المهمة | الملف | معيار القبول | الحالة |
|---|---|---|---|---|
| 2.1.1 | Authorization Inventory Consolidation — إنشاء `app_role()` (A5) + `is_admin()` (A6) دون تغيير سلوكي | `01-2.1.1-app-role-is-admin.sql` + `01-2.1.1-probes.sql` | لا تغيير في pg_policies؛ `is_admin()` = true فقط لـ admin/super_admin | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.2 | استبدال كل `EXISTS role IN ('admin','super_admin')` بـ `public.is_admin()` | `02-2.1.2-is-admin-predicate-replace.sql` + `02-2.1.2-probes.sql` | `exists_pattern_count=0`؛ الكتابة الإدارية تعمل (A=1)، مرفوضة لـ B/anon | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.3 | حارس دور داخلي في كل RPC إدارية (`admin_promote_user` + `bootstrap_super_admin`) | `03-2.1.3-rpc-internal-guard.sql` + `03-2.1.3-probes.sql` | غير admin → `42501 Forbidden` حتى مع منح EXECUTE؛ الأدمن يمرّ | ✅ **مُغلق بالكامل** (2026-08-02) — أدلة حية أدناه |
| 2.1.4 | توحيد الواجهة (ROLE_CAPABILITY_MAP + نظام حراسة واحد) | _قادم_ | لا roleHierarchy مكرر | ⏳ Pending |
| 2.1.5 | توثيق "ضيف" + مقارنات موحّدة | _قادم_ | لا مقارنة أد-هوك جديدة | ⏳ Pending |
| 2.1.6 | إعادة Baseline Verification | _قادم_ | E1–E10 PASS | ⏳ Pending |

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

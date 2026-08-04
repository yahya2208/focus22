# Phase 2 — جرد الصلاحيات الكامل (Permissions Inventory)

**المرجع:** Baseline v4.0 · التقرير `docs/security/production-security-audit.md` (v4.0) · الخطة `docs/security/remediation-roadmap.md` (v2.3)
**النطاق:** `supabase/migrations/` + `supabase/verify-live-schema.sql` + `supabase/security-hardening/phase1/` + `src/` + `scripts/` + `docs/security/`
**المنهجية:** بحث قراءة-فقط عبر المستودع + التحقق من الوثائق الحية (audit v4.0). **لا توجد تعديلات.**

---

## 1) دوال RPC (Functions)

### 1.1 معرَّفة في المستودع

| الدالة | الملف:الأسطر | SECURITY | EXECUTE |
|---|---|---|---|
| `handle_new_user()` | M2:35-56 (أصل) · **H4:24-45 (النسخة الحية المعتمدة)** | **SECURITY DEFINER** (trigger) | لا GRANT/REVOKE في repo · حيّاً `{=X/postgres, anon, authenticated, service_role}` — **Documented Exception** (trigger-only) |
| `lookup_campaign_by_short_code(TEXT)` | M7:32-48 | **SECURITY DEFINER** · STABLE · `SET search_path=public` | M7:50 REVOKE ALL FROM PUBLIC · M7:53-54 GRANT anon+authenticated |
| `lookup_campaign_by_short_code_v2(TEXT)` | M11:44-90 | **SECURITY DEFINER** · STABLE · `SET search_path=public` | M11:92 REVOKE ALL FROM PUBLIC · M11:94-95 GRANT anon+authenticated |
| `update_updated_at()` | M8:97-105 **و** M9:28-36 (مكررة) | invoker (لا DEFINER) | لا GRANT/REVOKE |
| `is_research_role()` | H2:28-40 | **SECURITY DEFINER** · STABLE · `SET search_path=public` | H2:42 GRANT authenticated فقط |

### 1.2 دوال حيّة في Production، غير معرَّفة في أي migration

| الدالة | SECURITY | الحالة بعد Phase 1 |
|---|---|---|
| `admin_promote_user(uuid, text)` | **SECURITY DEFINER** · بلا فحص هوية المتصل (LV-9) | ✅ **REVOKE** عن PUBLIC/anon/authenticated (H1) — proacl الآن `{postgres, service_role}` |
| `bootstrap_super_admin(uuid)` | **SECURITY DEFINER** | ✅ **REVOKE** (H5) — probe: `42501` |
| `has_super_admin()` | **SECURITY DEFINER** · STABLE | **Documented Exception** — EXECUTE محفوظ (حارس سياسة bootstrap + `AdminSetupScreen.tsx:26`) |
| `increment_qr_counter(...)` | **SECURITY DEFINER** · allowlist أعمدة صارم | **Documented Exception** — مسار الكتابة الشرعي للعدّادات |

### 1.3 غير موجودة
- `is_super_admin()` / `can_manage_users()` / `authorize()` / `guard()`: **غير موجودة** (بند Phase 2).

---

## 2) سياسات RLS — حسب الجدول

### 2.1 `users`
| السياسة | CMD | USING / WITH CHECK | الحالة |
|---|---|---|---|
| "Users read own row" (M2) | SELECT | `id = current_user::text OR current_user='authenticated'` | 🔴 نمط قديم عريض — **حيّاً غير موجودة** (DV-9) |
| "Users insert own row" (M2) | INSERT | `id = current_user::text` | 🔴 لا يطابق (text≠uuid) |
| "Users update own row" (M2) | UPDATE | `id = current_user::text` | 🔴 لا يطابق |
| "Users read own profile" (H2) | SELECT | TO authenticated · `id = auth.uid()` | ✅ |
| "Researchers read all users" (H2) | SELECT | TO authenticated · `public.is_research_role()` | ✅ |
| "Bootstrap insert first user" (حية) | INSERT | `has_super_admin() = false` | متبقية (حارس bootstrap) |
| "Admins update user roles" (حية) | UPDATE | `EXISTS users.role IN ('admin','super_admin')` | متبقية — **حارس أدمن بدون دالة موحّدة** |

### 2.2 `sessions`
| السياسة | CMD | الحالة |
|---|---|---|
| "Authenticated read sessions" (حية) | SELECT | 🔴 **أُسقطت** H2:66 (LV-2) |
| "Authenticated insert sessions" (حية) | INSERT | 🔴 **أُسقطت** H6:26 (LV-10) |
| "Users read own sessions" (H2) | SELECT · `auth.uid()=user_id` | ✅ |
| "Users manage own sessions" (H2) | ALL · USING/CHECK `auth.uid()=user_id` | ✅ (فقدت `user_id IS NULL`) |
| "Researchers read all sessions" (H2) | SELECT · `is_research_role()` | ✅ |

### 2.3 `analytics_events`
| السياسة | CMD | الحالة |
|---|---|---|
| "Authenticated read analytics events" (حية) | SELECT | 🔴 **أُسقطت** H2:91 (LV-4) |
| "Anyone can insert analytics events" (حية) | INSERT · `true` | 🔴 **أُسقطت** H8:31 (LV-5) |
| "Users read own analytics events" (H2) | SELECT · `auth.uid()=user_id` | ✅ |
| "Researchers read all analytics events" (H2) | SELECT · `is_research_role()` | ✅ |
| "Authenticated users insert own analytics events" (H8) | INSERT · `(user_id IS NULL) OR (user_id=auth.uid())` | ✅ |

### 2.4 `devices` / `calibrations` / `surveys` (نمط موحّد)
كل جدول: أُسقطت "Authenticated read …" وأُنشئت "Users read own …" (`auth.uid()=user_id`) + "Researchers read all …" (`is_research_role()`).

### 2.5 `qr_codes` (حية)
| السياسة | الحالة |
|---|---|
| "Anyone can update qr scan counts" (UPDATE · `true`) | 🔴 **أُسقطت** H7:25 (LV-11) |
| "Admins manage qr codes" (ALL) | متبقية — `EXISTS users.role IN ('admin','super_admin')` |
| "Authenticated read qr codes" (SELECT) | متبقية |

### 2.6 جداول Repair OS (M5/M6 — **خارج نطاق Phase 1**)
| الجدول | نمط خطير |
|---|---|
| `repair_requests` | "Anyone can insert" (`true`) · "Anyone can read" (`true`) · "Authenticated can update" |
| `repair_quotes` | "Anyone can read" (`true`) |
| `repair_timeline` | "Anyone can read/insert" (`true`) |
| `repair_photos` | "Anyone can insert" (`true`) |
| `repair_status_history` | "Anyone can read" (`true`) |
| `repair_courier_jobs` / `repair_notifications` / `repair_audit_log` | `auth.role()='authenticated'` فقط (بلا قيد صف) |

> ⚠️ بقيت **قابلة للكتابة مجهولاً** (`true`) — لم يُمسّها hardening. قرارها بند **LV-7** (Phase 2).

### 2.7 جداول العقد (M9 — **غير مطبَّقة حيّاً** DV-7)
`system_settings` / `audit_log` / `job_assignments` — سياسات `Admins …` كلها عبر نمط `EXISTS users.role IN ('admin','super_admin')` **المكرر ثلاث مرات**.

---

## 3) نموذج الأدوار (ثلاثة أنظمة موازية — نقطة تصميم جوهرية)

| النظام | القيم | المكان | الاستخدام |
|---|---|---|---|
| **App roles** (`AuthUser['role']`) | `guest \| user \| researcher \| admin \| super_admin` | `users.role` (قيمة صف) · `user_metadata.role` (JWT) | منطق الواجهة + سياسات RLS |
| **Research roles** (`ResearchRole`) | `super_admin \| research_admin \| analyst \| viewer \| none` | `src/core/auth/AuthProvider.tsx:5` | بوابة Research Console + مصفوفة `permissions.ts` |
| **Postgres auth roles** | `anon \| authenticated \| service_role` | جلسة | ربط RLS (`auth.uid()`/`auth.role()`) |

**الربط الحالي (فقداني):** `mapToResearchRole` (AuthProvider.tsx:27-36): `super_admin→super_admin` · `admin→research_admin` · `researcher→analyst` · `user→viewer` · `guest→none`.
**على مستوى SQL:** `is_research_role()` = `role IN ('researcher','admin','super_admin')` — **محدّد مسبقاً وقاس** (لا researcher مخصص بدون بحث كامل).

---

## 4) أدوات الصلاحيات الموجودة

| الأداة | النوع | الاستخدامات |
|---|---|---|
| `is_research_role()` | SECURITY DEFINER | 6 سياسات RLS (users/sessions/analytics/devices/calibrations/surveys) |
| `has_super_admin()` | SECURITY DEFINER | سياسة bootstrap + AdminSetupScreen RPC |
| `EXISTS role IN ('admin','super_admin')` | **نص مكرر داخل السياسات** | qr_codes الحية + 3 سياسات M9 + "Admins update user roles" |
| `createPermissionGuard()` | TS (Client) | `ProtectedRoute` (requiredResource) |
| `ProtectedRoute.requiredRole` | TS هرمي | حراسة مسارات بأدوار App |
| `HomeMenu.tsx:29` `isAdmin` | TS أد-هوك | `role === 'super_admin' \|\| role === 'admin' \|\| role === 'researcher'` |

---

## 5) استخدامات التطبيق

- **استدعاءات RPC الوحيدة في الكود (3 فقط):** `lookup_campaign_by_short_code` (`src/core/supabase/data-service.ts:299`) · `increment_qr_counter` (`src/core/qr/campaign.ts:198,203`) · `has_super_admin` (`src/screens/auth/AdminSetupScreen.tsx:26`).
- **research-console:** كل الصفحات **select فقط** (لا write، لا rpc، لا فحص أدوار داخلي) — الحماية الفعلية **RLS**، والبوابة العليا `ResearchConsole` (researchRole + permissions.ts) للتوجيه فقط.
- **Guards في الواجهة:** `ProtectedRoute` (نظامان: هرمي App + مصفوفة Research) · `HomeMenu.isAdmin` · بوابة research-console.
- **ثغرة تدفق معروفة:** `AdminSetupScreen` يسجّل بـ `user_metadata.role='super_admin'` لكن `handle_new_user` يفرض `guest` الآن → المُنشأ ليس super_admin في DB؛ الترقية الحقيقية عبر `bootstrap_super_admin` (service_role فقط) — يحتاج توثيقاً/إصلاح تدفق.

---

## 6) خلاصة تنفيذية

1. **التحصين السليم:**
2. كل مسارات القراءة العابرة مغلقة (ملكية + `is_research_role()`)؛ الكتابة مقيدة (sessions/analytics/qr)؛ دوال الإدارة REVOKE.
3. **نقاط الضعف الباقية:** (أ) جداول repair عريضة (`true`) — LV-7 · (ب) تكرار `EXISTS role IN (...)` في سياسات الأدمن — بند 2.1 · (ج) نظاما أدوار موازيان في الواجهة — بند 2.1 · (د) migrations لا تعكس الحالة المصلَّحة وتبني فاشل من الصفر — بند 2.4 · (هـ) LV-3 مفتوح/blocked — بند 2.3.

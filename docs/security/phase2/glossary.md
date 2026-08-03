# Glossary — مفهوم "الضيف" (anon / guest / none) + مقارنات موحّدة

**المهمة:** 2.1.5 · **التاريخ:** 2026-08-02 · **المرجع:** `ADR-001` (A1, A3, A5, A7) · `02-authorization-layer-design.md` §2–§5
**معيار القبول:** وثيقة `glossary.md` + لا مقارنة أد-هوك جديدة (مراجعة grep).

---

## 1) ثلاثة مستويات من "الضيف" — لا يُخلط بينها

| المصطلح | النطاق | المعنى | أين يُحدَّد |
|---|---|---|---|
| **`anon`** | قاعدة البيانات (Postgres / Supabase) | سياق **بلا جلسة تسجيل دخول** — لا يوجد `auth.uid()`، الطلب يحمل مفتاح anon key فقط | `auth.uid() IS NULL` · `app_role()` ترجع NULL |
| **`guest`** | طبقة التطبيق / قاعدة البيانات (AppRole + `users.role`) | **جلسة ضيف مُسجّلة عبر Anonymous Auth** (`signInAnonymously`) — مستخدم حقيقي في `auth.users` وصف في `public.users` بدور `guest` | `handle_new_user` يُفرض `guest` + `now()` · `AuthStatus 'anonymous'` |
| **`none`** | الواجهة (ResearchCapability) | قدرة بحث **صفرية** لجلستَي الضيف السابقتين — النتيجة الوحيدة لخريطة `ROLE_CAPABILITY_MAP[guest]` | `permissions.ts` — `ROLE_PERMISSIONS.none = []` |

**قاعدة التمييز:**
- `anon` → **لا صف مالك**: `auth.uid()` فارغ، ولن يملك أي بيانات.
- `guest` → **جلسة مسجّلة بصف مالك**: `public.users.id = auth.uid()`، يملك بياناته الخاصة فقط (سطر المصفوفة `read own data` ✅ NULL-owned / owned-only).
- `none` → **قرار واجهة محايد**: `permissionGuard.can('none', …, …)` = `false` دائماً — لا مسار بحث، لا قائمة، لا عملية.

## 2) التدفق عبر الطبقات

```
auth.uid() IS NULL  ──anon──►  لا صف / app_role() = NULL        (DB)
signInAnonymously() ──guest─►  auth.users + users.role='guest'  (DB + Auth)
mapToResearchRole('guest') ──none─►  ResearchRole='none'        (UI)
permissionGuard.can('none', …, …) = false  (كل الموارد/الأفعال) (UI)
```

## 3) سلوك "الضيف" في كل طبقة (مُثبَّت بالاختبارات)

| الطبقة | سلوك الضيف | الدليل |
|---|---|---|
| SQL — `app_role()` | `NULL` (لا صف يطابق `auth.uid()`) | 2.1.1 probes |
| SQL — RLS كتابة إدارية | `is_admin()` = false → `0` صف | 2.1.2 (B/anon → 0) |
| SQL — RPC إدارية | `42501 Forbidden` (حارس داخلي) | 2.1.3 (A3: anon → Forbidden) |
| React — `mapToResearchRole` | guest → none | 2.1.4 (اختبار وحدة: 5/5) |
| React — `permissionGuard.can('none', …)` | `false` في كل الموارد | 2.1.4 (اختبار وحدة: none = []) |

**ملاحظة تسوية (naming):** `AuthStatus 'anonymous'` (طبقة Supabase) === `AppRole 'guest'` (صف DB) === واجهة `'none'` (قدرة). الاسم الثلاثي وراثة تاريخية — السلوك موحّد والوثائق هذه مرجع التحويل.

## 4) مقارنات موحّدة — نتيجة مسح 2.1.5

قرار صلاحية **لا** يُكتب إلا بصيغة `permissionGuard.can(researchRole, resource, action)`.

- [x] `ProtectedRoute.requiredRole` (هرمي) — حُذفت (2.1.4).
- [x] `roleHierarchy` / `RESEARCH_ROLE_MAP` المكرّران — حُذفا (2.1.4).
- [x] `HomeMenu.isAdmin` → `guard.can(researchRole, 'scientific', 'read')` (2.1.4).
- [x] `RepairHomeScreen.isAdmin` → `guard.can(researchRole, 'campaigns', 'read')` (2.1.4).
- [x] `SettingsScreen.isResearcher` → `guard.can(researchRole, 'scientific', 'read')` (2.1.5).
- [x] `ResearchConsole.RESEARCH_ROLE_MAP` → `permissionGuard` مباشرة (2.1.4).
- [x] لا `requiredRole` / `roleHierarchy` متبقٍّ في `src` (grep 2026-08-02 = 0).

**الاستثناء المشروع الوحيد المتبقي (ليس قرار صلاحية):** تصنيف بيانات/عرض — عدّ مستخدمي guest/registered في `api-supabase.ts` و`business-intelligence/api.ts` ووضع بطاقة `userType` في `live-sessions.ts`. هذه **تجزيء بيانات إحصائية عن المستخدمين كقيمة صف** وليست منح/منع وصول — خارج نطاق مصفوفة الصلاحيات (لا تتعارض مع A7).

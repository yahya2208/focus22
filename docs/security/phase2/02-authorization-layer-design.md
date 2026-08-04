# Phase 2.1 — تصميم طبقة التفويض الموحّدة (Authorization Layer — Design v0.1)

**الحالة:** تصميم مقترح — **لا يُنفَّذ قبل دمج PR #1 واعتماد هذا المستند**. يبني على Baseline v4.0.
**المدخلات:** `00-permissions-inventory.md` · `01-duplication-analysis.md`

---

## 1) الهدف

- إزالة تكرار فحوص الصلاحيات (D1..D4) وجعل كل قرار تفويض يمر عبر **مصدر واحد**.
- توحيد نموذج الأدوار وإنهاء نظامي الأدوار الموازيين في الواجهة (V1/V2).
- ترسيخ مبدأ *Authorization must be based on the authenticated user's application role* — قاعدة البيانات هي الحكم النهائي، والواجهة طبقة توجيه مشتقة من نفس المصفوفة.

## 2) نموذج الأدوار الموحّد (Single Source of Truth)

**مصدر الحقيقة:** قيمة `public.users.role` (صف قاعدة البيانات) — تُملأ من `handle_new_user` (لا من `user_metadata` — بعد إصلاح NR-1).

| App Role (قيمة DB) | المعنى | Research Capability (خريطة صريحة) |
|---|---|---|
| `guest` | جلسة ضيف بلا حساب | `none` |
| `user` | حساب عادي مسجّل | `viewer` |
| `researcher` | محلل بحث | `analyst` |
| `admin` | إدارة النظام/البحث | `research_admin` |
| `super_admin` | مالك النظام | `super_admin` |

> **قرار:** تُعتمد خريطة صريحة واحدة (`ROLE_CAPABILITY_MAP`) بدل `mapToResearchRole` الضمني. أي تغيير مستقبلي يمر من هنا فقط.

## 3) مصفوفة الصلاحيات (Role → Capability)

تُعتمد **مصفوفة Resource/Action** الحالية في `permissions.ts` كأساس، مع إضافة عمود الدور الفعلي:

| Capability | guest | user | researcher | admin | super_admin |
|---|---|---|---|---|---|
| read own data (user/sessions/analytics/…) | ✅ (NULL-owned only) | ✅ | ✅ | ✅ | ✅ |
| read all research data | ❌ | ❌ | ✅ | ✅ | ✅ |
| export research data | ❌ | ❌ | ✅ | ✅ | ✅ |
| manage campaigns (write) | ❌ | ❌ | ❌ | ✅ | ✅ |
| manage users / roles | ❌ | ❌ | ❌ | ✅ | ✅ |
| system settings / audit | ❌ | ❌ | ❌ | ✅ | ✅ |
| promote/bootstrap super_admin | ❌ | ❌ | ❌ | ❌ | ✅ |

> نفسها تُرسم إلى **دوال SQL** (فقرة 4) وإلى **Guards الواجهة** (فقرة 5) — لا تكرار.

## 4) Guards على مستوى قاعدة البيانات (SQL)

### 4.1 دوال أدوات موحّدة (تحل محل أنماط EXISTS المكررة)
```sql
-- (مقترح — يُعتمد نصه النهائي في التنفيذ)
create or replace function public.app_role()
returns text
language sql stable security definer set search_path = public
as $$ select role from public.users where id = auth.uid() $$;
```
واشتقاقها:
```sql
is_admin()          -- app_role() in ('admin','super_admin')
is_research_role()  -- app_role() in ('researcher','admin','super_admin')  (موجود — يُعاد استخدامه)
is_super_admin()    -- app_role() = 'super_admin'
```
**الاستبدال المستهدف:**
- سياسات M9 الثلاث `Admins …` + سياسة `Admins update user roles` + `Admins manage qr codes` → `public.is_admin()`.
- 6 سياسات بحث → `public.is_research_role()` (كما هي، بلا تغيير).
- سياسة bootstrap → `has_super_admin()` (كما هي، Exception موثّق).

### 4.2 حارس داخل كل RPC إدارية (متطلب Phase 2.2 في الـ roadmap)
قاعدة إلزامية لكل دالة `SECURITY DEFINER` حساسة تُستدعى من عميل:
```sql
if public.app_role() not in ('admin','super_admin') then
  raise exception 'Forbidden' using errcode = '42501';
end if;
```
- **الاستثناءات الثابتة:** `has_super_admin`/`handle_new_user`/`increment_qr_counter`/`lookup_*` (موثّقة في v4.0) — لا حارس داخلي.
- **حماية إضافية** لكل دالة: `SET search_path` صريح + allowlist معاملات (نموذج `increment_qr_counter`).

### 4.3 قواعد صارمة جديدة (policy de-facto)
- لا سياسة RLS جديدة بـ `auth.role()` بلا قيد صف.
- كل سياسة INSERT تفرض المِلكية (`auth.uid() = user_id`) أو NULL مسموح صراحةً.
- لا `USING(true)`/`WITH CHECK(true)` على أي جدول (يُطبق على جداول repair عبر LV-7 عند إعادة الكتابة).

## 5) Guards الواجهة (TS — طبقة توجيه مشتقة)

| الأداة | الاستبدال |
|---|---|
| `ROLE_PERMISSIONS` (permissions.ts) | تُبقي (مصدر واحد للواجهة) + تُبنى من نفس خريطة الدور (فقرة 2) |
| `ProtectedRoute.requiredRole` (هرمي) | **يُلغى أو يُشتق** من `guard.can(mappedRole, resource, action)` — نظام حراسة واحد |
| `HomeMenu.isAdmin` | يُستبدل بـ `guard.can(researchRole, ...)` أو `useCapability('users','read')` |
| `AdminSetupScreen` | يُبقي `has_super_admin` RPC (قراءة) + توثيق أن الترقية النهائية عبر `bootstrap_super_admin` (service_role) |

**مبدأ:** الواجهة **لا تُصدِّر ولا تخفي بياناتها الخاصة**؛ كلها تأتي عبر RLS. الـ Guards تُحسّن التجربة فقط ولا تُعتمد كحماية.

## 6) فصل المسؤولية (DB مقابل App) — ملخص تنفيذي

| يُفرض في DB (غير قابل للتجاوز) | في App (توجيه فقط) |
|---|---|
| الملكية + دور-البحث (RLS) | إظهار/إخفاء القوائم والمسارات |
| EXECUTE على الدوال الإدارية | إخفاء أزرار/عمليات بلا صلاحية |
| حارس الدور داخل RPC | تحسينات UX (AccessDeniedScreen) |
| allowlist المعاملات | — |

## 7) معايير قبول التصميم

- [ ] لا توجد قاعدة صلاحية مكتوبة في أكثر من مكان (مبدأ Single Source of Truth).
- [ ] كل `EXISTS role IN (...)` في سياسات الأدمن مستبدل بدالة موحّدة.
- [ ] `ProtectedRoute` يستخدم نظام حراسة واحداً.
- [ ] كل RPC إدارية لها حارس دور داخلي (إلا الاستثناءات الموثّقة).
- [ ] خريطة App→Research صريحة وواحدة.

## 8) مخاطر وضوابط
- **كسر وظيفي**: استبدال السياسات قد يكسر مسارات بحث → ضابطه: إعادة Baseline Verification (E1–E10) بعد كل مهمة.
- **تغيير معنى دور**: دمج `researcher→analyst` قد يُفقد صلاحيات → ضابطه: مصفوفة القبول (فقرة 3) تُراجع قبل التنفيذ.
- **Security DEFINER جديد**: أي دالة إضافية تُقيَّم كـ CVE-محتملة (search_path + allowlist + grant محدود).

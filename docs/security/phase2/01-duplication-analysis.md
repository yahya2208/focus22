# Phase 2 — تحليل التكرار والانقسام (Duplication & Split Analysis)

**الإدخال:** `docs/security/phase2/00-permissions-inventory.md` · **المرجع:** Baseline v4.0
**الهدف:** تحديد أين تتكرر قاعدة الصلاحية الواحدة، وأين تتباين قواعد متشابهة، وأين يُفرض القرار على SQL فقط أو على التطبيق فقط.

---

## 1) القواعد المكررة (نفس القرار في أماكن متعددة)

| # | قاعدة الصلاحية | المواقع | الخطر |
|---|---|---|---|
| D1 | **"دور أدمن"** = `role IN ('admin','super_admin')` | (1) سياسة حيّة `Admins manage qr codes` · (2) سياسة حيّة `Admins update user roles` · (3) M9 `Admins manage settings` · (4) M9 `Admins read audit log` · (5) M9 `Admins manage job assignments` — كلها **نص EXISTS مكرر** · (6) `HomeMenu.tsx:29` (نسخة App) | 🔴 انجراف: أي تغيير في تعريف "أدمن" يجب تعديله 6 أماكن |
| D2 | **"دور بحث"** = `role IN ('researcher','admin','super_admin')` | (1) `is_research_role()` (SQL، مصدر وحيد فعلي) · (2) `mapToResearchRole` (App: researcher→analyst، admin→research_admin، super_admin→super_admin) — **تعريفان مختلفان بالمعنى** | 🟠 نموذجان لا يتطابقان منطقياً |
| D3 | **"الوصول للبحث"** | (1) `is_research_role()` RLS (6 سياسات) · (2) `ROLE_PERMISSIONS` في `permissions.ts` (research roles) · (3) بوابة `ResearchConsole` · (4) `ProtectedRoute.requiredResource` | 🟠 4 طبقات تحقق من مفهوم واحد |
| D4 | **`auth.role()='authenticated'` بلا قيد صف** | M5 (9 مواضع) · M6 (3 مواضع) · M9 audit_log insert — كلها على جداول repair/العقد | 🟠 نفس النمط الخطير الذي سبب LV-1/2/4 |

---

## 2) القواعد المتباينة (متشابهة لكن غير متسقة)

| # | المفهوم | أين يتباين | الأثر |
|---|---|---|---|
| V1 | **"research access"** | SQL: `researcher/admin/super_admin` (سطر صريح في `is_research_role`) · App: `admin→research_admin` و`researcher→analyst` (تعيين فقداني) | مستخدم `researcher` في DB يُعرض كـ `analyst` في واجهة البحث؛ `admin` يُعرض `research_admin` — درجتان مختلفتان تماماً |
| V2 | **حراسة المسارات** | `ProtectedRoute.requiredRole` (هرمي: guest=0..super_admin=4) مقابل `requiredResource` (مصفوفة Resource/Action) — نظامان متوازيان في نفس المكوّن | مصدران للحقيقة للحراسة |
| V3 | **`users.id` TEXT مقابل UUID** | M2 يصرّح `id TEXT`؛ الحية UUID؛ M9 FK يفرض UUID | ينكسر على إعادة البناء + سياسات قديمة لا تطابق |
| V4 | **حارس bootstrap** | `has_super_admin() = false` كشرط INSERT · `AdminSetupScreen` يستدعي `has_super_admin` ويعرض الشاشة | المنطق مكرر بين RLS وUI |
| V5 | **دور الضيف** | `users.role='guest'` (قيمة صف) مقابل جلسة `anon`/`authenticated` بلا صف مقابل `researchRole='none'` — ثلاثة معانٍ لـ"ضيف" | مقارنات `user.role !== 'guest'` في BI/الأبحاث قد تُسقط مستخدمين حقيقيين |

---

## 3) SQL-only مقابل App-only (أين يُفرض القرار فعلياً)

### يُفرض في قاعدة البيانات فقط (معتمد — حماية حقيقية)
| القرار | الوسيلة |
|---|---|
| ملكية القراءة (users/sessions/analytics/devices/calibrations/surveys) | RLS `auth.uid() = user_id` |
| قراءة عابرة للبحث | RLS `is_research_role()` |
| INSERT sessions مملوك | RLS `auth.uid() = user_id` |
| INSERT analytics (NULL/ملكية) | RLS `(user_id IS NULL) OR (user_id=auth.uid())` |
| UPDATE qr عدّادات | إسقاط السياسة العريضة + `increment_qr_counter` allowlist |
| دوال إدارية | REVOKE EXECUTE (postgres/service_role فقط) |

### يُفرض في التطبيق فقط (توجيه/عرض — **لا يحمي البيانات**)
| القرار | المكان | ملاحظة |
|---|---|---|
| إظهار/إخفاء مدخل Research Console | بوابة `ResearchConsole` + `researchRole` | لا يمنع قراءة عبر RPC/API مباشر |
| توجيه `ProtectedRoute` | `requiredRole` / `requiredResource` | راحة استخدام لا أمان |
| `isAdmin` في `HomeMenu` | سطر واحد أد-هوك | لا يحمي أي جدول |
| `AdminSetupScreen` | `has_super_admin` RPC | عرض شاشة فقط |

> **مبدأ مؤكد:** كل البيانات محمية من RLS؛ الواجهة طبقة توجيه. أي Guard في الواجهة **يجب** أن يكون مشتقاً من مصدر واحد (أداة واحدة) حتى لا يتسرب مفهوم صغير إلى الحماية.

---

## 4) توصيات التحليل (مدخلات التصميم — لا تنفيذ)

1. **دالة SQL واحدة `authorize(role, capability)` أو `is_admin()`/`is_research_role()`** تعيد قائمة الأدوار — تُستبدل بها كل أنماط `EXISTS role IN (...)` (D1) وتمنع الانجراف.
2. **مصفوفة واحد في TS** (`ROLE_PERMISSIONS`) كمصدر وحيد لحراسة الواجهة، مع **خريطة صريحة** App→Research بدل التعيين الضمني في `mapToResearchRole` (D2/V1).
3. **إزالة `ProtectedRoute.requiredRole` الهرمي** أو جعله مشتقاً من المصفوفة نفسها (V2) — نظام حراسة واحد.
4. **توحيد مفهوم "ضيف"** (V5): `anon` (جلسة) ≠ `guest` (صف) ≠ `none` (researchRole) — توثيق صريح + مقارنات موحّدة.
5. **`auth.role()='authenticated'` بلا قيد صف** (D4) → يُستبدل بسياسات ملكية/دور عبر `auth.uid()` في أي إعادة كتابة لجداول repair (LV-7) والعقد (M9).
6. **جداول repair** تبقى صراحةً خارج Phase 2.1 حتى يُحسم نموذج ملكيتها (مثل LV-3/campaigns) — قرار LV-7.

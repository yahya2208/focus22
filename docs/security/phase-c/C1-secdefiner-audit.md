# C1 — SECURITY DEFINER Audit (تقرير مستقل)

| الحقل | القيمة |
|---|---|
| المراجعة | C1 · SECURITY DEFINER |
| الأولوية | 🔴 قصوى (امتياز متسرب = تسريب كامل) |
| الأداة | `supabase/security-hardening/phase-c/C1-secdefiner-audit.sql` (قراءة خالصة) |
| الحالة | ✅ **مُغلقة** — الأثر منشور والتحقق اللاحق عبر CR-003: **PASS** |
| المرجع | `docs/security/phase-c/README.md` · `change-management.md` |

## 1) الهدف

مراجعة كل دالة `SECURITY DEFINER`: `search_path` صريح · الملكية · أي Dynamic SQL ·
أي إمكانية Privilege Escalation — مع خريطة سطح الهجوم القابل للاستدعاء من العميل.

## 2) معايير القبول

- [x] لا دالة `SECURITY DEFINER` مملوكة لغير `postgres` بشكل غير مبرَّر (C1.3: فقط منصة/استثناء).
- [x] أي Dynamic SQL داخل `SECURITY DEFINER` إما غائب أو مُراجَع (C1.4: لا يوجد).
- [x] كل دالة `SECURITY DEFINER` قابلة للاستدعاء من anon/authenticated إما مبرَّرة
      (استثناء ADR معتمد) أو خارج تعرض الدوال الإدارية (C1.5 + C1.7 + C1.8).
- [x] كل دالة `SECURITY DEFINER` لديها `search_path` صريح (C1.2: **مُعالَج عبر CR-003 F1–F3**).
- [x] دوال الاستثناءات المعتمدة (`handle_new_user` · `has_super_admin` ·
      `increment_qr_counter` · `lookup_*`) موجودة **وبـ `search_path` صريح**
      (C1.8: **مُعالَج عبر CR-003** — الثلاثة الآن `{search_path=public}`).

## 3) الأدلة (نتائج تشغيل `C1-secdefiner-audit.sql` — 2026-08-04)

### C1.0 — جرد الدوال (SECURITY DEFINER = 12 · INVOKER = 1 في public)

| المخطط | الدالة | SECURITY | owner | اللغة | `search_path` | EXECUTE (تعرض فعلي) |
|---|---|---|---|---|---|---|
| `public` | `admin_promote_user` | DEFINER | postgres | plpgsql | `{search_path=public}` | postgres, service_role فقط |
| `public` | `app_role` | DEFINER | postgres | sql | `{search_path=public}` | anon, authenticated |
| `public` | `bootstrap_super_admin` | DEFINER | postgres | plpgsql | `{search_path=public}` | postgres, service_role فقط |
| `public` | `handle_new_user` | DEFINER | postgres | plpgsql | **`(none)` — RISK** | **anon, authenticated, public** |
| `public` | `has_super_admin` | DEFINER | postgres | sql | **`(none)` — RISK** | **anon, authenticated, public** |
| `public` | `increment_qr_counter(uuid,text)` | DEFINER | postgres | plpgsql | **`(none)` — RISK** | **anon, authenticated, public** |
| `public` | `is_admin` | DEFINER | postgres | sql | `{search_path=public}` | anon, authenticated, public |
| `public` | `is_research_role` | DEFINER | postgres | sql | `{search_path=public}` | anon, authenticated, public |
| `public` | `lookup_campaign_by_short_code` | DEFINER | postgres | sql | `{search_path=public}` | anon, authenticated |
| `public` | `update_updated_at` | **INVOKER** | postgres | plpgsql | `{search_path=public}` | (دالة trigger) |
| `pgbouncer` | `get_auth` | DEFINER | supabase_admin | plpgsql | `{"search_path=\"\""}` | supabase_admin, pgbouncer |
| `vault` | `create_secret` | DEFINER | supabase_admin | plpgsql | `{"search_path=\"\""}` | supabase_admin, postgres, service_role |
| `vault` | `update_secret` | DEFINER | supabase_admin | plpgsql | `{"search_path=\"\""}` | supabase_admin, postgres, service_role |

### C1.1 — أجسام الدوال الحساسة (مُصغَّرة)

- `handle_new_user()`: `INSERT INTO public.users (...) ON CONFLICT (id) DO UPDATE` — دالة trigger على `auth.users`.
- `increment_qr_counter(uuid, text)`: `UPDATE qr_codes SET <col> = <col> + 1 ... WHERE campaign_id = $1` — **`qr_codes` غير مؤهلة** (هدف hijack) + بلا تحقق صلاحيات/معدل.
- `has_super_admin()`: `SELECT exists (SELECT 1 FROM public.users WHERE role = 'super_admin')` — قراءة فقط، مؤهلة، لكن بلا `search_path`.
- `admin_promote_user()`: تتحقق `is_admin()`/`has_super_admin()` وتمنع الترقية لـ super_admin إلا من super_admin — `search_path=public` + غير معرّضة للعميل.
- `bootstrap_super_admin()`: تتحقق `has_super_admin()`=false قبل التنفيذ — `search_path=public` + غير معرّضة للعميل.

### C1.2 — `search_path` (RISK)

**3 دوال SECURITY DEFINER بدون `search_path` صريح (`(none)` = DEFAULT):**
`public.handle_new_user()` · `public.has_super_admin()` · `public.increment_qr_counter(uuid,text)`

### C1.3 — الملكية غير `postgres`

فقط منصة: `pgbouncer.get_auth` · `vault.create_secret` · `vault.update_secret`
(owner = supabase_admin مع `search_path=""` = آمن). لا تخصيص مخصص.

### C1.4 — Dynamic SQL

**PASS** — لا يوجد Dynamic SQL في أي دالة SECURITY DEFINER (كلها `has_dynamic_sql=false`).

### C1.5 — تعرض الدوال الإدارية للعميل

**PASS** — `admin_promote_user` و`bootstrap_super_admin` ليستا قابلتين للتنفيذ من
anon/authenticated (EXECUTE: postgres/service_role فقط).

### C1.6 — دوال التفويض (helper calls)

الشبكة الفارغة من التنفيذ؛ السلسلة مشتقة من أجسام C1.1:
`auth.uid()` → `app_role()` (تقرأ `public.users.role`) → `is_admin()`/`is_research_role()`
→ تُستدعى من `admin_promote_user` و`bootstrap_super_admin`. السلسلة سليمة، لكن
**`increment_qr_counter` خارجها تماماً**.

### C1.7 — سطح الهجوم القابل للاستدعاء من العميل (SECURITY DEFINER)

| الدالة | تعرض فعلي (acl) | التقييم |
|---|---|---|
| `app_role` | anon, authenticated | ADR — مبرَّر (حارس) |
| `is_admin` | anon, authenticated, public | ADR — مبرَّر (حارس) |
| `is_research_role` | anon, authenticated, public | ADR — مبرَّر (حارس) |
| `has_super_admin` | anon, authenticated, public | ADR — مبرَّر (حارس) |
| `increment_qr_counter` | anon, authenticated, public | ADR — مبرَّر كمكانه، **لكن بلا `search_path`** |
| `lookup_campaign_by_short_code` | anon, authenticated | ADR — مبرَّر (قراءة عامة) |
| `handle_new_user` | **anon, authenticated, public** | ⚠️ **غير مبرَّر** — دالة trigger فقط؛ EXECUTE العام سطح زائد (trigger يتجاوز فحص EXECUTE) |

### C1.8 — الاستثناءات المعتمدة (ADR)

موجودة: `handle_new_user` · `has_super_admin` · `increment_qr_counter` ·
`lookup_campaign_by_short_code` — لكن الثلاث الأولى **بدون `search_path` صريح**
(الشرط: موجودة **وبـ `search_path` صريح** — غير محقق).

## 4) النتائج (Findings)

| C1.x | الملاحظة | المستوى | القرار |
|---|---|---|---|
| C1.2 | 3 دوال SECURITY DEFINER بلا `search_path`: `handle_new_user` · `has_super_admin` · `increment_qr_counter` | **حرج** | يُعالج في **CR-003 (F1–F3)** |
| C1.3 | ملكية غير postgres = منصة فقط (`search_path=""`) — لا تخصيص | منخفض | مقبول/توثيق |
| C1.4 | لا Dynamic SQL في أي SECURITY DEFINER | معلوماتي | **PASS** |
| C1.5 | دوال إدارية (`admin_promote_user`/`bootstrap_super_admin`) غير معرّضة للعميل | معلوماتي | **PASS** |
| C1.7 | `handle_new_user` ممنوحة EXECUTE لـ PUBLIC/anon/authenticated رغم أنها دالة trigger فقط | **حرج** | يُعالج في **CR-003 (F4)** |
| C1.8 | الاستثناءات موجودة لكن 3 منها بلا `search_path` صريح | **حرج** | يُعالج في **CR-003 (F1–F3)** |

## 5) قرار الإغلاق (مستقل)

- [x] ✅ **مُغلقة** — كل معايير القبول محققة بالأدلة.
- [x] 🟡 **مفتوحة** — النتائج مسجَّلة وتُعالج عبر **CR-003** (F1–F4). — (رُجِّعت لاحقاً)

القرار: **CLOSED** · المبرر: findings الحرجة الأربعة عولجت عبر **CR-003**
(`final_verdict = PASS` — search_path ×3 = `{search_path=public}` · EXECUTE
`handle_new_user` = false للجميع · trigger `on_auth_user_created` سليم)، ومعايير
القبول كلها محققة الآن بالأدلة.

التاريخ: **2026-08-04** · الموقّع: ________

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-03 | إنشاء الأداة (قراءة خالصة) + القالب |
| 2026-08-04 | تنفيذ الأداة ولصق النتائج الفعلية · القرار: **OPEN → CR-003** |
| 2026-08-04 | **إغلاق CR-003** (`final_verdict = PASS`) · إعادة فحص = تطابق · **إغلاق C1** |

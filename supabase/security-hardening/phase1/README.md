# Phase 1 — Production Emergency Hardening (Workspace)

**المرجع:** `docs/security/remediation-roadmap.md` (Baseline v2.1 · Gate 1) · **الأدلة:** `docs/security/production-security-audit.md` (v3.6)

> **سياسة التنفيذ:** كل بند على PR مستقل، يُنفَّذ عبر SQL Editor بصلاحيات owner، وكل تغيير يسبقه/يتبعه توثيق قبل/بعد. **لا يُطبَّق على Production إلا بعد مراجعة.**
>
> **قاعدة التأجيل (قرار المستخدم 2026-08-02):** لا يُؤجَّل إصلاح من Phase 1 إلى Phase 2 تلقائياً. يُنفَّذ في Phase 1 **كل ما لا يعتمد على قرار معماري** (توزيع أدوار / شكل طبقة التفويض). يُؤجَّل فقط ما يرتبط فعلياً بتلك القرارات:
> - الحارس الداخلي للدوال الإدارية (طبقة التفويض المعتمدة) — Phase 2.
> - توسعة قراءة أدوار إضافية (باحث/أدمن على بيانات الآخرين) — Phase 2.
> - Rate Limit / Quota لمنصة `analytics_events` (اختيار منصة/قيم) — Phase 2.
>
> **نتيجة الفحص (2026-08-02):** حصر القراءة بالمِلكية (`auth.uid() = …`)، ربط `sessions.user_id`، إزالة UPDATE العريض على `qr_codes`، وقيد INSERT على `analytics_events` — كلها **مستقلة عن التصميم** وتُنفَّذ الآن (بنود 2-5 أدناه).

## مانيفست التنفيذ (Files to Execute — بالترتيب)

> **قاعدة من اليوم فصاعداً:** تُعرض قائمة الملفات القابلة للتنفيذ بالترتيب مع حالتها قبل أي تنفيذ. لا يُنفَّذ على Production إلا الملفات بحالة `✅ جاهز`، وكل ملف يُغلق بدورة (Review → Apply → Verify → Document → Close → Commit).

| # | الملف | الغرض | LV | الحالة |
|---|---|---|---|---|
| 1 | `01-LV9-revoke-admin-rpc-execute.sql` | REVOKE EXECUTE عن `admin_promote_user` من anon/authenticated/PUBLIC | LV-9 | ✅ **مُغلق بالكامل** (2026-08-02) — جاهز للالتزام |
| 2 | `02-LV1-4-owner-scope-reads.sql` (مقترح) | حصر قراءة users/sessions/campaigns/analytics_events بالمِلكية | LV-1..4 | ⏳ مسودة لم تُكتب |
| 3 | `03-LV10-sessions-insert-ownership.sql` (مقترح) | `WITH CHECK (user_id = auth.uid())` على INSERT sessions | LV-10 | ⏳ مسودة لم تُكتب |
| 4 | `04-LV11-qr-codes-remove-broad-update.sql` (مقترح) | إزالة سياسة `Anyone can update qr scan counts` | LV-11 | ⏳ مسودة لم تُكتب |
| 5 | `05-LV5-analytics-insert-ownership.sql` (مقترح) | قيد INSERT analytics_events بالمِلكية (Rate Limit = Phase 2) | LV-5 | ⏳ مسودة لم تُكتب |
| 6 | (تحقق) | تشغيل proacl/pg_policies/Probe بعد كل بند | — | ⏳ يُشغَّل دورياً |

## خط الأساس (Baseline — قبل الإصلاح، من تقرير v3.6)

| الكيان | الحالة قبل | المصدر |
|---|---|---|
| `admin_promote_user` proacl | `EXECUTE`: PUBLIC, anon, authenticated, postgres, service_role | proacl (بند III.0-10) |
| استدعاء anon لـ `admin_promote_user` | **نجح** (P0001 على صفّ صفري، أثر صفر) | PostgREST probe (III.0-11) |
| سياسات RLS العريضة | `Authenticated read …` بلا قيد صف على users/sessions/campaigns/analytics_events/devices/calibrations/qr_codes/surveys | pg_policies (DV-9) |
| `sessions` INSERT | بلا فحص ملكية `user_id` | pg_policies (LV-10) |
| `analytics_events` INSERT | `Anyone can insert` — بلا قيد | pg_policies (LV-5) |
| `qr_codes` UPDATE | `Anyone can update qr scan counts` | pg_policies (LV-11) |

## عناصر التنفيذ (بالترتيب المعتمد — كل بند بدورة: مراجعة → تطبيق → تحقق → توثيق → إغلاق → Commit)

| # | البند | المعرّف | يعتمد على تصميم Phase 2؟ | حالة الملف | الحالة على Production |
|---|---|---|---|---|---|
| 1 | REVOKE EXECUTE عن `admin_promote_user` | LV-9 | لا | `01-LV9-revoke-admin-rpc-execute.sql` | ⏳ قيد المراجعة — لم يُطبَّق |
| 2 | حصر قراءة users/sessions/campaigns/analytics_events بالمِلكية | LV-1..LV-4 | لا (الجزء الأساسي: `auth.uid()`) | — | ⏳ Pending |
| 3 | ربط `sessions.user_id` بجلسة المصادقة | LV-10 | لا | — | ⏳ Pending |
| 4 | إزالة UPDATE العريض على `qr_codes` (الكتابة عبر RPC الآمن فقط) | LV-11 | لا | — | ⏳ Pending |
| 5 | قيد INSERT على `analytics_events` (المِلكية) + Rate Limit/Quota/Cleanup | LV-5 | جزئي (المِلكية لا؛ Rate Limit نعم) | — | ⏳ Pending |
| 6 | تشغيل التحقق الكامل | — | — | (أدناه) | ⏳ Pending |
| 7 | تثبيت Baseline الجديدة (snapshot بعد) | — | — | — | ⏳ Pending |

## إغلاق البند 1 (LV-9) — دورة Review → Apply → Verify → Document → Close → Commit

| الخطوة | الإجراء | المسؤول | الحالة |
|---|---|---|---|
| A | مراجعة SQL (توافق اصطلاح المستودع، التوقيع، نطاق EXECUTE فقط) | المستخدم | ✅ أُعدّت للمراجعة (الملف `01-…`) |
| B | تشغيل `proacl`/الجرد **قبل** (الاستعلام أدناه) | المستخدم (SQL Editor) | ⏳ Pending |
| C | تطبيق SQL على بيئة مناسبة وفق الخطة | المستخدم (SQL Editor — owner) | ⏳ Pending |
| D | إعادة تشغيل `proacl` **بعد** ومقارنة | المستخدم | ⏳ Pending |
| E | توثيق الفرق قبل/بعد في سجل التنفيذ | مُنفَّذ (أنا) | ⏳ Pending |
| F | إغلاق LV-9 في سجل التنفيذ ثم Commit خاص بالبند | مُنفَّذ (أنا) | ⏳ Pending |

**استعلام Step B/D (الجرد = الخطوة 1 من خطة التنفيذ):**
```sql
select p.proname,
       p.proacl,
       p.prosecdef
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
order by p.proname;
```
> **تحذير جرد:** `increment_qr_counter` دالة QR whitelist-safe وتحتاج EXECUTE لـ anon/authenticated — **لا تُلمس**. المستهدَف بالمنع: الإدارية فقط (`admin_promote_user`, `bootstrap_super_admin`, `handle_new_user`, `has_super_admin`).

**دورة Runtime Probe للتحقق:** POST `/rest/v1/rpc/admin_promote_user` بجسم `{target_user_id:"00000000-0000-0000-0000-000000000000", new_role:"super_admin"}` من جلسة anon → المتوقع بعد الإصلاح: `403`/`42501` (وقبل: `P0001`).

## نتيجة البند 1 (LV-9) — قبل/بعد موثَّق (2026-08-02)

**Step B (قبل):** `admin_promote_user` → `proacl {=X/postgres, postgres=X, anon=X, authenticated=X, service_role=X}` + `SECURITY DEFINER=true` — مطابق تماماً لدليل تقرير v3.6.
**Step C:** REVOKE ALL عن PUBLIC / anon / authenticated — نُفّذ بلا أخطاء.
**Step D (بعد):** `proacl {postgres=X, service_role=X}` — اختفى PUBLIC ✅ / anon ✅ / authenticated ✅.

**تقييم المستخدم: 10/10** — بلا Side Effects.
**حالة LV-9:** ✅ **مُغلق بالكامل داخل Gate 1** (2026-08-02) بعد نجاح الـ Runtime Probe:
```
HTTP/1.1 401 Unauthorized          ← تغليف بوابة Supabase
Proxy-Status: PostgREST; error=42501
{"code":"42501","details":null,"hint":null,"message":"permission denied for function admin_promote_user"}
```
- **قبل (تقرير v3.6):** نفس الطلب وصل لجسم الدالة وعاد `P0001 User not found.`
- **بعد:** `42501 permission denied` — الدالة محجوبة عن anon قبل التنفيذ. **Verification = PASS.**
- الحارس الداخلي (`can_manage_users()` / `is_super_admin()` / Authorization Layer) = **Phase 2** وفق الـ Baseline.

**ملاحظات الجرد (من Step B — تُؤكَّد وثيقة التقرير، لا تُلمس خارج ترتيب الخطة):**
- لا تزال PUBLIC EXECUTE: `bootstrap_super_admin`, `handle_new_user`, `has_super_admin`, `update_updated_at` — تُعالَج في مواقعها المحددة في الـ Baseline (ترتيب معتمد: LV-9 → LV-1..4 → LV-10 → LV-11 → LV-5). `increment_qr_counter` و`lookup_campaign_by_short_code` تبقيان (whitelist-safe).
- سياسات RLS الحية مطابقة تماماً لما وثّقه التقرير (DV-9/LV-1..4/LV-10/LV-11/LV-5) — التقرير دقيق.

## التحقق (Verification — يُشغَّل بعد كل بند)

1. **proacl:** `select proname, proacl from pg_proc where proname in ('admin_promote_user','bootstrap_super_admin','handle_new_user','has_super_admin','increment_qr_counter');` → ألا يعود anon/authenticated/PUBLIC ضمن الممنوح إدارياً.
2. **Runtime Probe (صفر-الأثر):** POST `/rest/v1/rpc/admin_promote_user` بصفّ صفري من جلسة anon → المتوقع `403`/`42501` (و**ليس** `P0001`).
3. **pg_policies:** إعادة `select policyname, cmd, qual, with_check from pg_policies where schemaname='public';` ومقارنة زوال الأنماط العريضة.

## معايير القبول (Phase 1)
- لا توجد أي دالة إدارية قابلة للاستدعاء من `anon`/`authenticated` دون تفويض (probe → 403/42501).
- أي مستخدم لا يقرأ بيانات مستخدم آخر.
- `INSERT sessions` بـ `user_id` مستخدم آخر يفشل.
- آلاف الأحداث في `analytics_events` مقيَّدة.
- `UPDATE qr_codes` مباشر مرفوض.

## Rollback (إن رُصد انحدار إنتاجي)
1. Stop deployment.
2. Restore previous policies (من snapshot قبل).
3. Restore previous function definitions.
4. Verify application health.
5. Re-run Phase 1 verification.

## سجل التنفيذ (Execution Log)

| التاريخ | البند | الفعل | المرجع | الحالة |
|---|---|---|---|---|
| 2026-08-02 | إعداد الفرع `security/remediation-phase1` | checkout | Branch Policy (الـ baseline) | ✅ |
| 2026-08-02 | مسودة بند 1 (LV-9 REVOKE) | كتابة الملف `01-…` | ترتيب Phase 1 بند 1 | ✅ |
| 2026-08-02 | مراجعة ذاتية + مواءمة اصطلاح المستودع (REVOKE ALL) | review | 00007 convention | ✅ |
| 2026-08-02 | إعادة تصنيف بنود 2-5 (قابل الآن/مؤجَّل) | قرار المستخدم | قاعدة التأجيل | ✅ |
| 2026-08-02 | LV-9 Step A — SQL جاهز لمراجعة المستخدم | review | دورة الإغلاق | ✅ |
| 2026-08-02 | LV-9 Step B — جرد proacl + pg_policies (قبل) | apply-prep | SQL Editor | ✅ |
| 2026-08-02 | LV-9 Step C — تطبيق REVOKE على Production | apply | SQL Editor | ✅ |
| 2026-08-02 | LV-9 Step D — جرد proacl (بعد) | verify | SQL Editor | ✅ (المتوقع الحرفي) |
| 2026-08-02 | LV-9 Step E — توثيق الفرق قبل/بعد (أعلاه) | document | سجل التنفيذ | ✅ |
| 2026-08-02 | LV-9 Step F — Runtime Probe | verify | PostgREST (bash curl) | ✅ **42501 permission denied** = PASS |
| 2026-08-02 | **LV-9 Close** — الإغلاق الرسمي داخل Gate 1 | close | دورة الإغلاق | ✅ |
| 2026-08-02 | Commit خاص بالبند 1 (LV-9) | commit | سياسة Branch/PR | ✅ `d2c1ce7` |
| 2026-08-02 | Push + PR للبند 1 (LV-9) | push | سياسة Branch/PR | ⏳ بانتظار قرار المستخدم |
| 2026-08-02 | الانتقال إلى LV-1..LV-4 (القراءة العريضة) | next | ترتيب Phase 1 | ⏳ بعد Push/PR بند 1 |

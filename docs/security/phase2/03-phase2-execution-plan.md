# Phase 2 — خطة التنفيذ (Execution Plan — Draft)

**الحالة:** مقترح للاعتماد بعد دمج PR #1. كل مهمة صغيرة مستقلة: **معيار قبول مقيس + اختبار/بروتوكول تحقق + توثيق**.
**المنهجية:** نفس بروتوكول Phase 1 — Snapshot → Live SQL → Before probe → Apply → After probe → Baseline → Docs → Commit مستقل (منفصل لكل مهمة).

> **قاعدة:** لا يُبدأ تنفيذ أي مهمة قبل إغلاق المهمة السابقة في ترتيبها. أي انحراف يوقف المهمة ويُوثَّق.

> **عقد القبول (ADR Acceptance Contract):** ADR-001 ليس مرجعاً فقط بل **معيار قبول**. كل مهمة في 2.1 تنتهي بالإجابة على سؤالين:
> 1. هل يحقق التنفيذ **A1–A8** بالكامل؟
> 2. هل أُضيف **استثناء جديد**؟ إن نعم → يُحدَّث `ADR-001` صراحةً (لا يُترك الاستثناء داخل الكود وحده).
> الاستثناءات المعتمدة حالياً فقط: `handle_new_user` · `has_super_admin` · `increment_qr_counter` · `lookup_*` (v4.0).

---

## 2.1 — طبقة التفويض الموحّدة (Authorization Layer) — الأولوية الأعلى

| المهمة | الوصف | معيار القبول (مقيس) | اختبار/تحقق |
|---|---|---|---|
| **2.1.1** | تعريف دوال الأدوات الموحّدة `app_role()`/`is_admin()` (استثمار استدعاء `is_research_role`/`has_super_admin` القائمين) | لا تغيير سلوكي في أي سياسة حية؛ `is_admin()` يرجع true فقط لـ admin/super_admin | Probe SQL: استدعاء `is_admin()` بدور admin وuser وanon → القيم المتوقعة + جرد pg_policies يُظهر عدم تغيير |
| **2.1.2** | استبدال كل `EXISTS role IN ('admin','super_admin')` (qr_codes + M9 × 3 + "Admins update user roles") بـ `public.is_admin()` | 0 ظهور لنمط `role in ('admin','super_admin')` في سياسات حية | `pg_policies` + grep بالمستودع |
| **2.1.3** | حارس دور داخلي في كل RPC إدارية (`admin_promote_user`/`bootstrap_super_admin` وغيرها مستقبلاً) | استدعاء من غير admin → `42501`/`Forbidden` حتى مع REVOKE مفقود | Runtime Probe بدور user/anon مقابل admin |
| **2.1.4** | توحيد الواجهة: `ROLE_CAPABILITY_MAP` الصريح + إلغاء `ProtectedRoute.requiredRole` الهرمي + استبدال `HomeMenu.isAdmin` | نظام حراسة واحد؛ لا `roleHierarchy` مكرر؛ كل المسارات المحمية عبر `guard.can` | اختبارات وحدة `permissions.test.ts` + مراجعة مسارات |
| **2.1.5** | توثيق مفهوم "ضيف" (anon/guest/none) + مقارنات موحّدة | وثيقة `glossary.md` + لا مقارنة أد-هوك جديدة | مراجعة grep |
| **2.1.6** | إعادة Baseline Verification كاملة | مصفوفة E1–E10 + عزل الملكية = PASS | بروتوكول Phase 1 |

**مخرجات:** دوال SQL + اختبارات وحدة TS + تحديث `permissions.ts`/`AuthProvider` + توثيق.

> **تحقق ختامي لكل 2.1.x:** إجابة السؤالين أعلاه (A1–A8 / استثناء جديد → تحديث ADR) تُسجَّل في commit المهمة.

---

## 2.2 — Rate Limiting / Quotas (analytics_events · QR · RPCs · Sessions · Auth abuse)

| المهمة | الوصف | معيار القبول (مقيس) | اختبار/تحقق |
|---|---|---|---|
| **2.2.1** | دراسة مسارات الإدراج الحية (analytics/sessions/QR/signup) وحجمها (عدادات Baseline) | snapshot قبل | استعلامات عدّ |
| **2.2.2** | Rate Limit لـ `analytics_events` (quota/نافذة/عمود `request_id` الموجود لـ idempotency) | انفجار إدراج من جلسة واحدة يُرفض بعد حدّ/نافذة | اختبار حِمل صغير + probe |
| **2.2.3** | حماية `increment_qr_counter` (throttle + فحص مصدر) | تكرار مسح سريع لا يضخّم العدّ | probe |
| **2.2.4** | Rate Limit على RPCs عامة (`lookup_*`) | flood → يوقف | probe |
| **2.2.5** | Session creation + auth abuse (تكرار signUp/guest) | حدّ تسجيل/دورة | probe |
| **2.2.6** | Replay protection (idempotency عبر `request_id`/توقيع) | إعادة إرسال نفس الحدث لا يُسجَّل مرتين | probe |

**قرار مفتوح:** SQL/trigger أم Edge Function/منصة (Supabase لم تُوفّر Rate Limit SQL أصيل — القرار يُوثَّق هنا قبل التنفيذ).

---

## 2.3 — نموذج الملكية Schema Ownership (إغلاق LV-3 + campaigns)

| المهمة | الوصف | معيار القبول (مقيس) | اختبار/تحقق |
|---|---|---|---|
| **2.3.1** | تصميم `campaigns` ownership (إضافة `created_by` UUID + فحص بيانات حية) | مخطط مقبول + لا فقدان بيانات | snapshot أعمدة campaigns |
| **2.3.2** | ترحيل `created_by` للموجود (backfill من الأدلة إن وُجدت) | كل الصفوف بلا NULL أو NULL موثّق | استعلام عدّ |
| **2.3.3** | سياسات RLS لـ campaigns (مالك + admin + بحث) | مالك يقرأ/يعدّل؛ غيره `0`؛ admin كل شيء | مصفوفة probes |
| **2.3.4** | ربط الجداول المرتبطة (qr_codes/sessions/analytics عبر campaign_id) | لا تسريب عبر الارتباط | probes متقاطعة |
| **2.3.5** | توثيق إغلاق LV-3 + تحديث التقرير/الـ roadmap | LV-3 Closed | توثيق |

> **المتطلب المسبق:** 2.1 (أدوات الأدمن موحّدة) + 2.4 (مزامنة migrations لإعادة البناء). يُنفَّذ بعدها.

---

## 2.4 — مزامنة الـ Migrations (Rebuildable from scratch)

| المهمة | الوصف | معيار القبول (مقيس) | اختبار/تحقق |
|---|---|---|---|
| **2.4.1** | حذف `003_add_session_lifecycle.sql` و`004_add_analytics_events_indexes.sql` (مكرران متطابقان) | غيابهما + لا تغيير سلوكي | `supabase db reset` تجريبي |
| **2.4.2** | إنشاء `00008a_baseline_tables_idempotent.sql` — جداول `users`(UUID)/`sessions`/`analytics_events`/`campaigns`/`devices`/`calibrations`/`surveys`/`qr_codes` + فهارس/قيود/تريغر من **pg_dump حي** | `db reset` يبنيها من الصفر | reset كامل في بيئة تجريبية |
| **2.4.3** | إعادة كتابة `00002`: `users.id UUID` + `handle_new_user` المُصلّحة (فرض guest + `now()`) + سياسات Phase 1 المملوكة + `is_research_role` | سياسات M2 القديمة المكسورة غائبة؛ دالة آمنة | `pg_policies` + فحص إعادة بناء |
| **2.4.4** | حسم التداخل الثلاثي لأعمدة sessions (003/00003/00010) + إصلاح المرجع الميت في ترويسة 00003 | موضع واحد للأعمدة | grep |
| **2.4.5** | طيّ إصلاحات Phase 1 (01–08) في الـ migrations | إعادة البناء تُنتج الحالة الأمنية نفسها (Baseline v4.0) | `db reset` + Baseline Verification |
| **2.4.6** | CI: خطوة `supabase db reset`/اختبار في `deploy.yml` | أي تغيير migration يُختبَر آلياً | ناجح/فاشل في CI |

**المرجع:** `docs/architecture/17-migration-dependency-map.md` + `supabase/verify-live-schema.sql` (Gate A–E).

---

## 2.5 — Staging Validation (NR-2) + بنود P1

| المهمة | الوصف | معيار القبول (مقيس) | اختبار/تحقق |
|---|---|---|---|
| **2.5.1** | نشر نسخة Staging من الحالة المزامنة (2.4) | بيئة Staging = إنتاج (Rebuildable) | reset + فحص |
| **2.5.2** | إعادة كل probes Phase 1 في Staging (E1–E10 + عزل + تنظيف) | PASS في Staging | بروتوكول Phase 1 |
| **2.5.3** | NR-2 (مستحيل في الإنتاج صفر-الأثر) يُنفَّذ في Staging | نتيجة موثّقة | probe |
| **2.5.4** | بنود P1 (مصفوفة LV-7 لجداول repair + بقية بند §III) تُقيَّم وتُنفَّذ بالأولوية | لا عريض (`true`) متبقٍّ في الجداول الأساسية | pg_policies |

---

## 3) ترتيب التنفيذ والتوابع

```
2.1 (Authorization) ──► 2.2 (Rate Limit) ──► 2.4 (Migrations) ──► 2.3 (Ownership/LV-3) ──► 2.5 (Staging/P1)
        │                    │                    │
        └────────────────────┴────────────────────┴── 2.5 يحتاج 2.4 أولاً (Staging = rebuildable)
```

**ملاحظة ترتيب:** 2.4 توفر قاعدة قابلة للبناء → 2.3 يحتاجها لتحديث الـ migrations مع `created_by` → 2.5 تحتاجها كلها.

## 4) مخرجات كل مهمة (نمط ثابت)
1. SQL/كود في ملف مستقل. 2. Before/After probes. 3. تحديث التقرير/الـ roadmap. 4. Commit منفصل (فرع `security/remediation-phase2`).

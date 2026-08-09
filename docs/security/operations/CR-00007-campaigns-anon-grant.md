# CR-00007 — campaigns anon direct-grant remediation (Least-Privilege Hardening)

| الحقل | القيمة |
|---|---|
| Change ID | CR-00007 |
| التاريخ | 2026-08-09 |
| المرجع | LIVE evidence (2026-08-09 — تشغيل `10-CR-00007-pre-apply-gates.sql`) · `docs/audits/campaigns-hd-remediation-diagnosis.md` (§E/§G أُعيد تقييمها) · `docs/security/production-security-audit.md` · `CR-00006` |
| التصنيف | Hardening (Least Privilege) — **ليست معالجة تعرّض طارئ** |
| النطاق | `public.campaigns` · grants لـ `anon` فقط |
| الحالة | ✅ **ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED** (قرار مالك 2026-08-09) |
| الجهة المنفذة | `10-CR-00007-pre-apply-snapshot.sql` · `10-CR-00007-campaigns-anon-grant.sql` (APPLY) · `10-CR-00007-rollback.sql` · `10-CR-00007-verify.sql` |
| السياسة الحاكمة | Evidence Before Apply · موافقة صريحة · Rollback · fail-closed |

---

## 1) السبب (Root Cause)

- **افتراض سابق (Round-2) — مُكذَّب بالفحص الحي (2026-08-09):** كانت الوثائق تفترض أن `campaigns` يحمل ACL افتراضية من Supabase تُمنح عند إنشاء الجدول (`anon`/`authenticated`: SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE). **الفحص الحي يثبت العكس: anon لا يملك أي ACL مباشر على `public.campaigns`** (has_table_privilege = false للأربعة · raw ACL بلا أي صف لـ anon).
- **الدليل الحي (تشغيل `10-CR-00007-pre-apply-gates.sql`):** قراءة مباشرة تحت `SET LOCAL ROLE anon` → **`42501 permission denied for table campaigns`** (وليست «0 rows عبر RLS») — لأن anon بلا منح أساساً؛ RLS لا تُقيَّم إطلاقاً. RPC `lookup_campaign_by_short_code` سليم (SECURITY DEFINER · STABLE · search_path=public · EXECUTE anon+authenticated) وQR probes ناجحة (`kq7Iej` → حملة فعّالة واحدة · `ZZZZZZ` → 0 صفوف).
- **الخلاصة:** هدف الأمان المباشر (إزالة وصول anon المباشر) **مُحقَّق فعلياً على LIVE بلا أي تغيير**. لا REVOKE ولا GRANT ولا أي DDL/DML — قرار مالك صريح.
- لا يُعاد فتح LV-3 (يبقى `CLOSED — LIVE VERIFIED` ما لم يُثبت انحدار).

## 2) النموذج (Before / After)

| الدور | Before (فعلي على LIVE 2026-08-09) | After (المعتمد) |
|---|---|---|
| anon | **لا صلاحيات** (لا ACL مباشر — مثبَّت حياً) | **دون تغيير** — لا شيء مطلوب |
| authenticated | كامل (by design) | **دون تغيير** — إلزامي لنموذج RLS (أدمن عبر `is_admin()`) |
| service_role | كامل | **دون تغيير** |

- **لا يوجد فرق Before/After**: الحالة الحية تساوي الحالة المستهدفة. الـ CR **NO-OP**. أُعدّ نموذج الأدلة في السكربتات وفق الحالة الحية (لا «Round-2»).

## 3) SQL — التطبيق (نص حرفي، `10-CR-00007-campaigns-anon-grant.sql`)

> **⚠️ DO NOT EXECUTE (2026-08-09):** على LIVE الحالي سيفشل الحارس 4 (`anon بلا صلاحيات`) → **ABORT آمن = NO-OP**. الملف محفوظ كتعريف تاريخي للتغيير الوحيد فقط. لا يُنفَّذ لمجرد تغيير حالة التوثيق.

```sql
BEGIN;

DO $$ … guards (RLS enabled · Admins policy present · no broad policy ·
      anon HAS privileges (baseline) · authenticated SELECT intact) … $$;

REVOKE ALL ON public.campaigns FROM anon;

COMMIT;
```

- **التغيير الوحيد**: `REVOKE ALL ON public.campaigns FROM anon;`
- **ليس idempotent**: إعادة تشغيله بعد نجاح التطبيق → **ABORT آمن** (الحارس 4: anon بلا صلاحيات) — وهو بالضبط ما سيحدث الآن.
- **لا تغيير**: `authenticated` · `service_role` · RLS · RPCs · schema · بيانات · أي جدول آخر. **لا fallback صامت.**

## 4) SQL — التراجع (نص حرفي، `10-CR-00007-rollback.sql`)

> **⚠️ DO NOT EXECUTE — NOT APPLICABLE (2026-08-09):** تنفيذه الآن سيُعيد منح anon ACL كاملة على `public.campaigns` — **عكس هدف الأمان تماماً**. السكربت مُعطَّل بحارس ABORT غير مشروط. محفوظ كتعريف تاريخي فقط.

```sql
BEGIN;
DO $$ … guard: ABORT غير مشروط — NO-OP / HISTORICAL APPLY NOT ESTABLISHED … $$;
COMMIT;
```

- كان سيعيد بالضبط ACL `anon` السابق حسب pre-apply evidence (بلا GRANT OPTION). **لا تخمين** — لكن لا يصلح الآن: لا يوجد تطبيق مسجَّل يستحق التراجع.

## 5) LIVE Evidence — تشغيل الـ PRE-APPLY GATES (2026-08-09)

شُغّل `10-CR-00007-pre-apply-gates.sql` (read-only) على LIVE بنتائج حاسمة:

| الدليل | النتيجة الحية |
|---|---|
| anon `has_table_privilege` | SELECT=false · INSERT=false · UPDATE=false · DELETE=false |
| raw ACL (`aclexplode`) | **بلا أي صف لـ anon** (لا ACL مباشر) |
| قراءة مباشرة تحت `SET LOCAL ROLE anon` | **`42501 permission denied for table campaigns`** — رفض على مستوى ACL (RLS لا تُقيَّم أصلاً) |
| RPC `lookup_campaign_by_short_code` | SECURITY DEFINER=true · STABLE=true · search_path=public · anon EXECUTE=true · authenticated EXECUTE=true |
| QR probes | `kq7Iej` → حملة فعّالة واحدة · `ZZZZZZ` → 0 صفوف |

**تصحيح نموذج الأدلة:** الافتراض السابق (§H في الـ gates / §3.F في الـ snapshot) كان «anon يملك ACL وأن RLS تحوّل القراءة إلى 0 صفوف». الفحص الحي **يُكذِّب** هذا: anon بلا ACL → الخطأ `42501` بدل «0 rows». السكربتان حُدِّثتا وفق الحالة الحية (probe مغلَّف بـ EXCEPTION يثبت الرفض).

> **قرار المالك (2026-08-09):** **NO DATABASE CHANGE — CURRENT LIVE STATE ALREADY SATISFIES THE DIRECT-ACCESS SECURITY OBJECTIVE.** لا GRANT لـ anon · لا REVOKE · لا DDL/DML · لا migration.

**السؤال التاريخي:** لا يوجد دليل موثوق في الـ repo على تنفيذ `REVOKE ALL ON public.campaigns FROM anon` على LIVE (لا migration، لا سجل تنفيذ، لا change register؛ رسالة commit `17d259f` تقول «apply-success» بينما وثائقها تقول PENDING — غير حاسمة). بالتالي الحالة الموثَّقة: **ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED**.

## 6) Post-Apply Verification — الحالة الحية تطابق المتوقع (`10-CR-00007-verify.sql`)

> يستخدم كتحقق قراءة-فقط لحالة «مُحقَّق سلفاً» — لا APPLY. المتوقع هو ما تراه LIVE فعلاً:

| Check | متوقع (= الحالة الحية) |
|---|---|
| anon grants | كلها FALSE (لا ACL مباشر) |
| authenticated grants | كاملة (SELECT/INSERT/UPDATE/DELETE) — CRUD الأدمن سليم (by design) |
| service_role | كاملة — دون تغيير |
| RLS | `relrowsecurity=true` · سياسة واحدة `Admins manage campaigns` |
| RPC | `RPC_INTACT` + anon lookup لكود فعّال → صف واحد + كود غير صالح → 0 |
| anon direct read | **`42501 permission denied`** (رفض ACL) — لا «0 صفوف عبر RLS» |

## 7) Regression Gates (أُجريت محلياً — لا تغيير في كود التطبيق)

```text
TypeScript   PASS (tsc --noEmit exit 0)
ESLint       PASS (0 errors; 5195 baseline warnings — دون تغيير)
Tests        PASS (118 files / 1159 tests)
Build        PASS (vite build OK)
```

+ Security sweep (static): صفر `.from('campaigns')` خارج `campaign-service.ts` (Research Console فقط) · صفر `.from('qr_codes'|placements|placement_history|analytics_events')` · `.rpc()` عند `lookup_campaign_by_short_code` + `has_super_admin` فقط · لا attribution/telemetry/localStorage في QR runtime · عميل Supabase يستخدم ANON key فقط.

## 8) حدود النطاق (لا يُلمس)

`authenticated` grants · `service_role` · RLS policies · RPCs · campaigns schema · qr_codes · placements · placement_history · analytics_events · sessions/users/devices/ads/inventory/catalog/repair · `/c/<SHORT_CODE>` · 404.html · Phase B QR parser · Phase 2.3 ownership · CR-00005 · LV-3 · P7-01..03.

## 9) الحالة بعد الإغلاق

`CR-00007 → ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED` (2026-08-09).

**شروط الإغلاق المستوفاة:**
1. ✅ LIVE evidence (تشغيل الـ pre-apply gates): anon بلا ACL مباشر — الهدف مُحقَّق سلفاً.
2. ✅ قرار مالك صريح: **NO DATABASE CHANGE**.
3. ✅ لا APPLY نُفِّذ (لا تغيير توثيقي يُبرر تنفيذ APPLY).
4. ✅ نموذج الأدلة في السكربتات حُدِّث وفق الحالة الحية (probing يثبت `42501` بدل «0 rows»).
5. ⬜ (اختياري، قراءة-فقط) تشغيل `10-CR-00007-verify.sql` وتثبيت ناتجه كدليل إغلاق نهائي.

> **HARD STOP**: لا commit/push/tag/deploy ولا أي GRANT/REVOKE/DDL/DML على `public.campaigns`. لا APPLY «لإغلاق» الـ CR — الحالة الحية هي الوضع النهائي.

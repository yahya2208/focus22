# CR-00007 — Campaigns Anon Direct-Grant Remediation · Report

| البند | القيمة |
|---|---|
| Change ID | CR-00007 |
| النطاق | `public.campaigns` — إزالة ACL مباشرة غير ضرورية لـ `anon` |
| التصنيف | Least-Privilege Hardening (ليست معالجة تعرّض طارئ) |
| **الحالة** | ⏸ **PENDING APPLY** — بانتظار موافقة المالك + تنفيذ على LIVE (per CR-00007 §15) |
| **النتيجة النهائية** | **غير مُعلنة** — لا `CLOSED` بدون أدلة LIVE بعد التطبيق (§12) |

---

## 1) CR ID
`CR-00007` · المرجع: `docs/security/operations/CR-00007-campaigns-anon-grant.md` · `docs/audits/campaigns-hd-remediation-diagnosis.md`

## 2) Objective
إزالة صلاحيات الجدول المباشرة غير الضرورية من `anon` على `public.campaigns` (تحصين Least Privilege) مع حفظ: CRUD أدمن عبر `authenticated`+`is_admin()`، RLS، RPC العام، عقد QR `/c/<SHORT_CODE>`، كل الإغلاقات الأمنية السابقة، وكامل وظائف التطبيق. **لا** تعديل على `authenticated`.

## 3) Pre-Apply Evidence
**مصدر معتمد — فحص المالك على LIVE (موثّق 2026-08-09):**
- `columns_verdict = ALL_COLUMNS_PRESENT` · `rls_verdict = POSTURE_UNCHANGED` · `rpc_verdict = RPC_INTACT`
- `public.campaigns`: RLS مفعّلة · `anon.rolbypassrls = false` · `anon_direct_rows = 0` تحت `SET LOCAL ROLE anon` · السياسة الوحيدة = `Admins manage campaigns` (ALL · {authenticated} · is_admin()).
- QR baseline حي: `lookup_campaign_by_short_code('kq7Iej')` تحت anon → الحملة الصحيحة (1 صف) · كود غير موجود → 0 صفوف.
- ACL حية على `public.campaigns`: `anon` و`authenticated` لديهما `SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE`؛ `service_role` كامل.
- **سكربت snapshot الجاهز:** `supabase/security-hardening/phase1/10-CR-00007-pre-apply-snapshot.sql` (read-only، §3 A–F) — يجب تشغيله على LIVE وإرفاق ناتجه الحرفي **قبل** APPLY (المتوقع مطابق للأدلة أعلاه).
- **ملاحظة تفسيرية (§14):** ACL `anon` الحالية **لا** تثبت قابلية القراءة/الكتابة العامة — RLS تمنع الوصول الفعلي. لا يُعاد فتح LV-3.

## 4) Exact APPLY Statement
```sql
REVOKE ALL ON public.campaigns FROM anon;
```
مغلّف بـ **9 baseline guards fail-closed** في `supabase/security-hardening/phase1/10-CR-00007-campaigns-anon-grant.sql` (RLS مفعّلة · سياسة الأدمن موجودة · لا broad SELECT · anon لديه ACL قابلة للإزالة · authenticated SELECT سليم · RPC موجود · RPC SECURITY DEFINER · STABLE · search_path=public). أي فشل → `ABORT` بلا REVOKE. لا أي GRANT/REVOKE آخر. لا `REVOKE … FROM authenticated`.

## 5) Post-Apply Evidence
**⏳ PENDING** — تُلتقط بعد تنفيذ APPLY على LIVE عبر `supabase/security-hardening/phase1/10-CR-00007-verify.sql` (§5 A–D): anon=كلها FALSE · authenticated كاملة · service_role دون تغيير · RLS سليمة · RPC_INTACT · QR lookup anon (`kq7Iej`) سليم · كود غير صالح 0 صفوف · anon direct read مرفوض (permission denied).

## 6) RLS Verification
**PENDING (live post-apply)** — المتوقع: `relrowsecurity=true`, `relforcerowsecurity=false`, سياسة واحدة `Admins manage campaigns` (ALL · {authenticated} · is_admin()).

## 7) RPC Verification
**PENDING (live post-apply)** — المتوقع: `SECURITY DEFINER` · `STABLE` · `search_path=public` · `EXECUTE` لـ anon+authenticated · body يعيد `id/short_code/name/is_active` مع `is_active=true` · كود غير صالح → 0 صفوف.

## 8) Admin CRUD Regression
**PENDING (live, جلسة أدمن)** — المتوقع: list/create/update/archive/restore/detail + QR generation تعمل؛ الرابط يبقى `/c/<SHORT_CODE>` بلا أي `?campaign=/p=/utm_/source=/ref=`. **ملاحظة معمارية:** CRUD الأدمن يمر عبر RLS `authenticated` (لا يُلمس) — إزالة ACL `anon` لا تؤثر على هذا المسار.

## 9) Public QR Regression
**PENDING (live, مسار عام)** — المتوقع: `…/focus22/c/<ACTIVE_CODE>` → 404.html → `?/c/<code>` → Phase B parser → `lookup_campaign_by_short_code` → حملة فعّالة → `game-intro` · بلا login · بلا analytics/telemetry · بلا قراءة مباشرة لـ campaigns/qr_codes/placements.

## 10) Security Gate Results (static — جارية الآن)
- `.from('campaigns')` في **7 مواضع فقط** داخل `campaign-service.ts` (Research Console) — صفر في QR runtime.
- صفر `.from('qr_codes'|placements|placement_history|analytics_events')` في كامل `src/`.
- `.rpc()` عند المواضع المعتمدة فقط: `lookup_campaign_by_short_code` (`src/services/campaign-lookup.ts:31`) و`has_super_admin` (`src/screens/auth/AdminSetupScreen.tsx:26`).
- لا attribution params · لا telemetry · لا localStorage في QR runtime · عميل Supabase يستخدم ANON key فقط (`src/core/supabase/client.ts:14-16`).

## 11) Test / Build Results (تم التنفيذ — لا تغيير كود في هذا CR)
| Gate | النتيجة |
|---|---|
| vitest | **118 files / 1159 tests PASS** |
| tsc --noEmit | **exit 0** |
| eslint src/ | **0 errors** (5195 baseline warnings — دون تغيير) |
| vite build | **OK** (ResearchConsole chunk 140.48 kB — مطابق للخط الأساسي) |

## 12) Rollback Statement
```sql
GRANT SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE
  ON public.campaigns TO anon;
```
(منسوخ حرفياً من pre-apply ACL — لا تخمين) في `supabase/security-hardening/phase1/10-CR-00007-rollback.sql`.

## 13) Files Changed
| الملف | النوع |
|---|---|
| `supabase/security-hardening/phase1/10-CR-00007-pre-apply-snapshot.sql` | جديد — read-only evidence |
| `supabase/security-hardening/phase1/10-CR-00007-campaigns-anon-grant.sql` | جديد — APPLY (9 fail-closed guards) |
| `supabase/security-hardening/phase1/10-CR-00007-rollback.sql` | جديد — ROLLBACK |
| `supabase/security-hardening/phase1/10-CR-00007-verify.sql` | جديد — post-apply verify |
| `docs/security/operations/CR-00007-campaigns-anon-grant.md` | جديد — change record |
| `docs/audits/cr-00007-campaigns-anon-grant-remediation-report.md` | جديد — هذا التقرير |

**لا تغيير في كود التطبيق ولا الاختبارات.**

## 14) Frozen Systems Confirmation
لا تغيير: qr_codes · placements · placement_history · analytics_events · lookup_scan_context · Phase 2.3 ownership · CR-00005 · LV-3 · P7-01..03 · `/c/<SHORT_CODE>` · 404.html · Phase B parser · sessions/users/devices/ads/inventory/catalog/repair.

## 15) Final Verdict
```text
PENDING APPLY — awaiting owner approval and live execution (per CR-00007 §15)
```
لا تُعلن `CLOSED — LIVE VERIFIED` حتى: (1) موافقة مالك صريحة، (2) pre-apply snapshot موثّق على LIVE، (3) APPLY، (4) post-apply verify + regressions (Admin/Public QR) على LIVE، (5) مراجعة المالك.

> **HARD STOP**: لا commit / push / tag / deploy حتى مراجعة المالك للتقرير واعتماد التطبيق.

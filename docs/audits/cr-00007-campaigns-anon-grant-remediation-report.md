# CR-00007 — Campaigns Anon Direct-Grant Remediation · Report

| البند | القيمة |
|---|---|
| Change ID | CR-00007 |
| النطاق | `public.campaigns` — هدف: إزالة ACL مباشرة غير ضرورية لـ `anon` |
| التصنيف | Least-Privilege Hardening (ليست معالجة تعرّض طارئ) |
| **الحالة** | ✅ **ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED** (قرار مالك 2026-08-09) |
| **النتيجة النهائية** | **NO DATABASE CHANGE** — الحالة الحية تحقق هدف الأمان المباشر سلفاً؛ لا APPLY ولا GRANT/REVOKE/DDL/DML |

---

## 1) CR ID
`CR-00007` · المرجع: `docs/security/operations/CR-00007-campaigns-anon-grant.md` · `docs/audits/campaigns-hd-remediation-diagnosis.md`

## 2) Objective
إزالة صلاحيات الجدول المباشرة غير الضرورية من `anon` على `public.campaigns` (تحصين Least Privilege) مع حفظ: CRUD أدمن عبر `authenticated`+`is_admin()`، RLS، RPC العام، عقد QR `/c/<SHORT_CODE>`، كل الإغلاقات الأمنية السابقة، وكامل وظائف التطبيق. **لا** تعديل على `authenticated`.

## 3) LIVE Evidence (تشغيل الـ PRE-APPLY GATES — 2026-08-09)

**دليل حي حاسم (تشغيل `supabase/security-hardening/phase1/10-CR-00007-pre-apply-gates.sql`):**

| الدليل | النتيجة الحية |
|---|---|
| anon `has_table_privilege` | SELECT=false · INSERT=false · UPDATE=false · DELETE=false |
| raw ACL (`aclexplode`) | **بلا أي صف لـ anon** (لا ACL مباشر) |
| قراءة مباشرة تحت `SET LOCAL ROLE anon` | **`42501 permission denied for table campaigns`** — رفض ACL (RLS لا تُقيَّم أصلاً) |
| RPC `lookup_campaign_by_short_code` | SECURITY DEFINER=true · STABLE=true · search_path=public · anon EXECUTE=true · authenticated EXECUTE=true |
| QR probes | `kq7Iej` → حملة فعّالة واحدة · `ZZZZZZ` → 0 صفوف |

- **نموذج الأدلة السابق مُكذَّب:** كانت الوثائق تفترض أن anon يملك ACL كاملة (`SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER, TRUNCATE`) وأن RLS هي التي تحوّل القراءة إلى 0 صفوف. الفحص الحي يثبت أن **anon بلا ACL أصلًا** → القراءة المباشرة تعطي `42501` بدل «0 rows». السكربتان (`10-CR-00007-pre-apply-gates.sql` و `10-CR-00007-pre-apply-snapshot.sql`) حُدِّثتا وفقاً لذلك (probe مغلَّف بـ EXCEPTION).
- **المصدر الأصلي للافتراض:** استنتاج في `docs/audits/campaigns-hd-remediation-diagnosis.md` (§E/§G) من «صفر GRANT/REVOKE على campaigns في الـ repo ⇒ Supabase defaults» — استنتاج غير مباشر، وليس قراءة ACL حية. `DIRECT_GRANT_DETECTED` كان يتحقق بمجرد وجود grants `authenticated` (by design) دون إثبات anything عن anon.

## 4) Exact APPLY Statement
```sql
REVOKE ALL ON public.campaigns FROM anon;
```
مغلّف بـ **9 baseline guards fail-closed** في `supabase/security-hardening/phase1/10-CR-00007-campaigns-anon-grant.sql` (RLS مفعّلة · سياسة الأدمن موجودة · لا broad SELECT · anon لديه ACL قابلة للإزالة · authenticated SELECT سليم · RPC موجود · RPC SECURITY DEFINER · STABLE · search_path=public). أي فشل → `ABORT` بلا REVOKE. لا أي GRANT/REVOKE آخر. لا `REVOKE … FROM authenticated`.

> **⚠️ DO NOT EXECUTE (2026-08-09):** الحارس 4 (anon لديه ACL) فاشل على LIVE الحالي → ABORT = NO-OP. محفوظ كتعريف تاريخي فقط.

## 5) Post-Apply Evidence
**الحالة الحية = الحالة المستهدفة (لا حاجة لتطبيق):** anon = كلها FALSE (لا ACL مباشر) · authenticated = كاملة (by design) · service_role = كاملة · RLS مفعّلة بسياسة واحدة `Admins manage campaigns` · RPC_INTACT · QR lookup anon (`kq7Iej`) → صف واحد · كود غير صالح → 0 · anon direct read = **مرفوض `42501` (permission denied)** — أقوى إثبات لهدف الأمان المباشر.

## 6) RLS Verification
**مُحقَّق حياً (2026-08-09):** `relrowsecurity=true` · `relforcerowsecurity=false` · سياسة واحدة `Admins manage campaigns` (ALL · {authenticated} · is_admin()) — لا broad SELECT.

## 7) RPC Verification
**مُحقَّق حياً (2026-08-09):** `SECURITY DEFINER=true` · `STABLE=true` · `search_path=public` · `EXECUTE` لـ anon+authenticated · body يعيد `id/short_code/name/is_active` مع `is_active=true` · كود غير صالح → 0 صفوف.

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
> **⚠️ NOT APPLICABLE (2026-08-09):** تنفيذه الآن سيعيد منح anon ACL كاملة — عكس هدف الأمان. `10-CR-00007-rollback.sql` مُعطَّل بحارس ABORT غير مشروط. (كان مبنياً على فرضية «Round-2» التي أُثبت خطؤها.)

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
ALREADY SATISFIED / NO-OP — HISTORICAL APPLY NOT ESTABLISHED
NO DATABASE CHANGE — CURRENT LIVE STATE ALREADY SATISFIES THE
DIRECT-ACCESS SECURITY OBJECTIVE (owner decision 2026-08-09)
```
**الشروط المستوفاة:** (1) ✅ موافقة مالك صريحة على **NO DATABASE CHANGE** · (2) ✅ LIVE evidence (تشغيل الـ pre-apply gates): anon بلا ACL مباشر — الهدف مُحقَّق سلفاً · (3) ✅ لا APPLY لازم ولا نُفِّذ · (4) ✅ نموذج الأدلة في السكربتات حُدِّث وفق الحالة الحية · (5) ⬜ اختياري: تشغيل `10-CR-00007-verify.sql` (read-only) وتثبيت ناتجه كدليل إغلاق نهائي.

> **HARD STOP**: لا commit / push / tag / deploy. لا أي GRANT/REVOKE/DDL/DML على `public.campaigns`. لا APPLY «لإغلاق» الـ CR — الحالة الحية هي الوضع النهائي.

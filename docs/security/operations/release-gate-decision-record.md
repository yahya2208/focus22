# Part VI — Release Decision Record · GO — CONDITIONAL RISK ACCEPTANCE / RELEASE PENDING FINAL LIVE + UX GATES

| الحقل | القيمة |
|---|---|
| Record ID | RD-2026-08-09-001 |
| التاريخ | 2026-08-09 |
| النظام | FOCUS v2 · `package.json` version 2.0.2 · React 19 · Vite 6 · TypeScript 5.8 |
| Repo | `https://github.com/yahya2208/focus22.git` · branch `main` · HEAD `5b2a3d07698276a0b7c90bb81bb27354dc1c630b` |
| المراجع | `docs/security/operations/change-management.md` (§6) · Final Release Inventory (2026-08-09) · `CR-00006` · `CR-00007` · Owner LIVE evidence (2026-08-09) |
| الحالة | **GO — CONDITIONAL RISK ACCEPTANCE / RELEASE PENDING FINAL LIVE + UX GATES** |
| القرار النهائي | **غير مُصرّح به بعد (NOT FINAL GO)** حتى إغلاق بوابات Part IV + Part V + تحديد نطاق release artifact |

---

## 1) قواعد الحوكمة السارية (تأكيد)

1. لا تغيير Prod حتى يُغلق Release Gate نهائيًا — **Evidence beats history**؛ الحالة الحية (LIVE) هي المرجع، والسجلات القديمة المتناقضة معها تُسجَّل كـ drift توثيقي فقط ولا تُعاد.
2. ممنوع تنفيذ أي من الآتي حتى موافقة صريحة: **SQL · GRANT/REVOKE · DDL/DML · migration · تغيير RLS · إصلاح code · CR-00006 · CR-00007**.
3. ممنوع **commit / push / tag / deploy** لأي إصلاح أمني جديد أو تغيير Release دون موافقة صريحة.
4. تُغلق كل بوابة (Gate) بالـ **أدلة الفعلية فقط**؛ **Repo-side PASS ≠ LIVE PASS ≠ UX PASS** — لا يُفترض نجاح أيٍّ من الآخر.
5. **HARD STOP** بعد هذا السجل: لا commit، لا push، لا deploy، لا تعديل إضافي — حتى موافقة المالك الصريحة بعد مراجعة السجل وفحوصات LIVE/UX.

---

## 2) قبولات المخاطر — Owner Risk Acceptance (Part II / RA-01..RA-07)

تم قبول **جميع القبولات السبعة بالكامل** (غير مشروط) بأمر صريح من المالك بتاريخ 2026-08-09. تُعتبر هذه القبولات **وثيقة تغطية معتمدة** للفجوات المتبقية وتُحيل المعالجة إلى خارطة الطريق ما بعد الإصدار (Waves 0–10):

| # | العنصر | الوصف المختصر | المرجع للخطة |
|---|---|---|---|
| RA-01 | **CV-2** | Bootstrap TOCTOU (نافذة زمنية في بدء التشغيل) | Wave 9 bootstrap atomicity |
| RA-02 | **CV-4** | Client-trusted measurement integrity (سلامة القياس) | Wave 8 measurement integrity |
| RA-03 | **LV-5 (residual)** | Rate-limit / quota / cleanup المتبقية | Wave 1 LV-5 |
| RA-04 | **CV-8** | LocalStorage residual exposure | Wave 6 localStorage hardening |
| RA-05 | **Headers / CDN** | تكوين Headers و CDN (CSP last, report-only first) | Wave 4 headers/CDN |
| RA-06 | **F-07** | Retention enforcement (فرض فترة الاحتفاظ) | Wave 5 retention |
| RA-07 | **DV-1..DV-9** | Migration drift بين repo والـ LIVE | Wave 3 migration reconciliation |

- لا يترتب على هذه القبولات أي تغيير DB أو code الآن.
- كل بند محمول على خارطة ما بعد الإصدار بـ **before/after evidence** لكل إصلاح لاحق.

---

## 3) عناصر مُسجَّلة بـ CLOSED (حسب LIVE evidence المتوفرة)

| العنصر | الحالة | الملاحظة |
|---|---|---|
| **LV-3** | **CLOSED / LIVE VERIFIED** | `campaigns` عليها سياسة واحدة `Admins manage campaigns` (ALL · authenticated · `USING is_admin()`)؛ لا `Authenticated read campaigns`؛ anon=0 |
| **CR-00006** | **ALREADY SATISFIED / NO-OP** | سكربت التطبيق fail-closed (`RAISE EXCEPTION 'ABORT: baseline mismatch…'`) — لا يُنفَّذ |
| **CR-00007** | **CLOSED / ALREADY SATISFIED / NO-OP** | anon بلا ACL؛ `DIRECT_GRANT_DETECTED` = false positive (مفنّد) |
| **Release Blockers الأمنية** | **لا يوجد حاليًا** | وفق LIVE evidence المتوفر — لا يوجد Red item مفتوح |

---

## 4) Part III — Repo-side Quality Gates (تم تنفيذه — نتيجة رسمية)

| البوابة | الأمر | النتيجة |
|---|---|---|
| Typecheck | `node node_modules/typescript/bin/tsc --noEmit` | **PASS** |
| ESLint | `node node_modules/eslint/bin/eslint.js src/ --report-unused-disable-directives` | **PASS — 0 errors** (5202 pre-existing design-system warnings — نفس convention القائمة) |
| Tests | `node node_modules/vitest/vitest.mjs run` | **PASS — 122 files / 1183 tests** (لا FAIL) |
| Build | `node node_modules/typescript/bin/tsc -b` + `node node_modules/vite/bin/vite.js build` | **PASS** (dist built in 4.17s) |

ملاحظة غير مانعة: اختبار i18n أخرج قائمة إعلامية بـ ~31 مفتاح `repair.*` غير مستخدم في `en.ts` (ناتجة عن تجميد نظام repair) — لا فشل، يُسجَّل كـ P2 cleanup في Waves.

### Part III — Repo Integrity: **لم تُغلق (OWNER-PENDING)**

| الفحص | الحالة | التفصيل |
|---|---|---|
| HEAD / branch | ✔ | `main` · `5b2a3d07698276a0b7c90bb81bb27354dc1c630b` (M2 marketplace-mediator) |
| Secrets scan | ✔ | لا `.env` / service_role / credential patterns في tracked files أو `src`؛ `.env` في `.gitignore` |
| Working tree نظيفة | ✘ | **65 عنصرًا** (modified/deleted/untracked) |
| نطاق release artifact | **غير محدد بعد** | مطلوب من المالك تحديد exact scope قبل أي commit؛ **لا تُخلط تغييرات الإصدار مع أعمال remediation المؤجلة** |

> قاعدة: **لا تُدخل الـ 65 عنصرًا تلقائيًا في release commit** — يجب تحديد نطاق الإصدار ومراجعته أولًا.

---

## 5) Part IV — LIVE Security/Release Checks: **OWNER-PENDING**

لا تُغلق هذه البوابة إلا بالأدلة الحية من المالك (لا استنتاج من repo PASS). الفحوصات المطلوبة:

| # | الفحص | المتوقع |
|---|---|---|
| IV-1 | `campaigns` RLS policy snapshot | سياسة واحدة `Admins manage campaigns` فقط؛ anon=false ×4 |
| IV-2 | QR RPC attributes | SECURITY DEFINER=true · STABLE=true · search_path=public · anon EXECUTE=true · authenticated EXECUTE=true |
| IV-3 | QR lookup بكود فعّال `kq7Iej` | **صف واحد نشط** |
| IV-4 | QR lookup بكود غير صالح | **0 صفوف** |
| IV-5 | CR dispositions على LIVE | LV-3 closed · CR-00006 no-op · CR-00007 no-op |

- **PASS →** تُغلق البوابة وتُسجَّل الأدلة هنا.
- **FAIL →** **STOP** — لا release، لا إصلاح تلقائي؛ يُرفع التقرير للمالك.

---

## 6) Part V — UX Regression Gates: **OWNER-PENDING**

| # | الفحص | المتوقع |
|---|---|---|
| V-1 | QR flow (تصوير/دخول/نتيجة) | يعمل دون انقطاع |
| V-2 | Ads flow | لا انحدار |
| V-3 | Research Console (login/داشبورد/قراءة) | يعمل دون انقطاع |
| V-4 | مبدأ UX protection | أمن غير مرئي: لا شاشات تحميل/ديالوجات/انقطاعات إضافية؛ verification غير متزامن/خلفي |

- **PASS →** تُغلق البوابة. **FAIL →** **STOP** — لا release.

---

## 7) Part VI — القرار

```text
القرار الحالي: GO — CONDITIONAL RISK ACCEPTANCE / RELEASE PENDING FINAL LIVE + UX GATES

شروط تحويله إلى GO FINAL:
  1. إغلاق Part IV (LIVE) بالأدلة الفعلية — PASS
  2. إغلاق Part V (UX) بالأدلة الفعلية — PASS
  3. تحديد نطاق release artifact ومراجعته من المالك
  4. موافقة المالك الصريحة النهائية على هذا السجل

أي FAIL في (1) أو (2) → STOP نهائي بلا release وبلا إصلاح تلقائي.
```

---

## 8) HARD STOP

**لا commit · لا push · لا tag · لا deploy · لا SQL · لا GRANT/REVOKE · لا DDL/DML · لا migration · لا تغيير RLS · لا إصلاح code · لا تنفيذ CR-00006 · لا تنفيذ CR-00007 — حتى موافقة المالك الصريحة بعد مراجعة هذا السجل وإغلاق Part IV + Part V بالأدلة.**

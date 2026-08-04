# C2 — Trigger Audit (تقرير مستقل)

| الحقل | القيمة |
|---|---|
| المراجعة | C2 · Trigger Audit |
| الأولوية | 🔴 قصوى (trigger آثار جانبية تُشغَّل خارج إرادة المطور بصلاحيات owner) |
| الأداة | `supabase/security-hardening/phase-c/C2-trigger-audit.sql` (قراءة خالصة · Result Set واحد) |
| الحالة | ✅ **مُغلقة** — PASS (بدون CR؛ ملاحظات معلوماتية فقط) |
| المرجع | `docs/security/phase-c/README.md` · `change-management.md` |

## 1) الهدف

جرد كل trigger حي (غير نظامي): أين/متى/كيف يشتعل، أي دالة يُشغِّل، وهل هي
SECURITY DEFINER، وأي آثار جانبية صامتة (set_config بمدى SESSION، كتابة
غير مؤهلة، تعديل جداول حساسة). تركيز خاص: `handle_new_user` على `auth.users`.
إضافةً إلى **ترابط الدوال** (C2.7): أيتام/غير مستخدمة/إصدار قديم/تنفيذ مزدوج.

## 2) معايير القبول

- [x] كل trigger حي في المخططات غير النظامية مُوثَّق (C2.1): 11 trigger.
- [x] أي trigger مشغول بدالة `SECURITY DEFINER` إما مبرَّر أو مُعالَج (C2.3: فقط `handle_new_user` — مبرَّر).
- [x] `handle_new_user` على `auth.users`: trigger حي · `search_path=public` ·
      EXECUTE مسحوب من public/anon/authenticated (C2.5: **PASS**).
- [x] لا trigger يستخدم `set_config(..., false)` ولا كتابة temp في جسمه (C2.4: **PASS**).
- [x] triggers على الجداول الحساسة (`auth.users`/`users`/`qr_codes`) مُراجَعة وظيفياً (C2.2) · لا triggers معطَّلة (C2.6: كلها O/enabled).
- [x] **ترابط الدوال (C2.7):** C2.7.1–C2.7.4 **PASS** · C2.7.5: كل دالة trigger لها توقيع واحد (لا إصدار قديم).

## 3) الأدلة (نتيجة `C2-trigger-audit.sql` — صف `audit_result` واحد، 2026-08-04)

### C2.1 — كل الـ Triggers الحية (11)

| trigger (الجدول) | الدالة | التوقيت/الحدث/المستوى | security | search_path | enabled |
|---|---|---|---|---|---|
| `auth.users.on_auth_user_created` | `public.handle_new_user()` | AFTER INSERT ROW | **DEFINER** | `{search_path=public}` | O |
| `public.campaigns.campaigns_updated_at` | `public.update_updated_at()` | BEFORE UPDATE ROW | INVOKER | (default) | O |
| `public.qr_codes.qr_codes_updated_at` | `public.update_updated_at()` | BEFORE UPDATE ROW | INVOKER | (default) | O |
| `public.sessions.sessions_updated_at` | `public.update_updated_at()` | BEFORE UPDATE ROW | INVOKER | (default) | O |
| `public.users.users_updated_at` | `public.update_updated_at()` | BEFORE UPDATE ROW | INVOKER | (default) | O |
| `realtime.subscription.tr_check_filters` | `realtime.subscription_check_filters()` | BEFORE INSERT ROW | INVOKER | (default) | O |
| `storage.buckets.enforce_bucket_name_length_trigger` | `storage.enforce_bucket_name_length()` | BEFORE INSERT ROW | INVOKER | (default) | O |
| `storage.buckets.protect_buckets_delete` | `storage.protect_delete()` | BEFORE DELETE STATEMENT | INVOKER | (default) | O |
| `storage.objects.protect_objects_delete` | `storage.protect_delete()` | BEFORE DELETE STATEMENT | INVOKER | (default) | O |
| `storage.objects.update_objects_updated_at` | `storage.update_updated_at_column()` | BEFORE UPDATE ROW | INVOKER | (default) | O |

### C2.2 — Triggers على الجداول الحساسة (3)

- `auth.users.on_auth_user_created` → `handle_new_user` (DEFINER): ينشئ/يحدّث صفاً مقابلاً في `public.users` — **مبرَّر (مزامنة التسجيل)**.
- `public.qr_codes.qr_codes_updated_at` + `public.users.users_updated_at` → `update_updated_at` (INVOKER): `new.updated_at = now()` — خفيف/مقبول.

### C2.3 — Triggers على دوال SECURITY DEFINER (1)

- `public.handle_new_user` → على `auth.users` (AFTER INSERT ROW, owner=postgres, `search_path={search_path=public}`) — **الوحيد**، مبرَّر ومسيَّر.

### C2.4 — إشارات الآثار الجانبية في أجساد دوال الـ trigger (6 دوال)

| الدالة | set_config(_,_,false) | pg_temp | unqualified hint | الحكم |
|---|---|---|---|---|
| `public.handle_new_user` | false | false | update=true / insert=true | ⚠️ **إيجابية كاذبة في الـ regex**: يُطابق `DO UPDATE SET` و`insert into public.users` (المُؤهَّل) — الدالة الآن `search_path=public` لذا التحليل حتمي وآمن |
| `public.update_updated_at` | false | false | false/false | PASS |
| `realtime.subscription_check_filters` | false | false | false/false | PASS |
| `storage.enforce_bucket_name_length` | false | false | false/false | PASS |
| `storage.protect_delete` | false | false | false/false | PASS |
| `storage.update_updated_at_column` | false | false | false/false | PASS |

**النتيجة:** لا `set_config(..., false)` (درس 2.1.6 غير موجود) · لا كتابة temp ·
لا إشارة كتابة غير مؤهلة حقيقية.

### C2.5 — عقد `handle_new_user` بعد CR-003

`trigger=on_auth_user_created on auth.users · enabled=O · secdef=true ·
search_path={search_path=public} · EXECUTE public=false anon=false auth=false` — **تطابق كامل مع حالة CR-003 المستهدفة**.

### C2.5b — مراجعة الـ body الكامل (`C2b-handle-new-user-body.sql` — 2026-08-04)

**التعريف الكامل (verbatim):**

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.users (id, email, display_name, role, is_anonymous, created_at, updated_at, last_login_at)
  values (new.id, new.email, new.raw_user_meta_data->>'display_name', 'guest',
          new.is_anonymous, now(), now(), now())
  on conflict (id) do update set
    email = excluded.email,
    display_name = excluded.display_name,
    last_login_at = now(),
    updated_at = now();
  return new;
end;
$function$
```

**تدقيق مرجعي لكل سطر:**
- `SET search_path TO 'public'` — صريح (يعادل `ALTER FUNCTION ... SET search_path = public`؛ إضافة `pg_temp` غير ضرورية).
- `insert into public.users` — **مؤهَّل بالكامل**.
- `new.*` / `excluded.*` — حقول سجل (NEW/EXCLUDED)، ليست مراجع جداول.
- `now()` — دالة `pg_catalog` (تُحلّ دائماً بأمان).
- لا `set_config` · لا Dynamic SQL (EXECUTE/format) · لا وصول temp · لا مرجع جدول عارٍ واحد.

**الخلاصة:** بنود الصلابة الثلاثة (search_path صريح · schema qualification · REVOKE
EXECUTE) **محققة جميعاً فعلاً** عبر CR-003 — لا حاجة لأي CR جديد، **لا CR-004**.
إشارتا `unqualified_update/insert` في C2.4 = إيجابيات كاذبة مؤكَّدة (طابقتا
`DO UPDATE SET` و`insert into public.users`).

### C2.6 — Triggers معطَّلة / على مخططات الإضافات

- لا triggers معطَّلة (`D`).
- 5 triggers على مخططات إضافات (realtime/storage) — كلها `O` ومملوكة للمنصة — **توثيق فقط**.

### C2.7 — ترابط الدوال

- **C2.7.1** — PASS: لا مرجع يتيم لدالة مفقودة.
- **C2.7.2** — PASS: كل دالة trigger مستخدمة (لا دوال يتيمة).
- **C2.7.3** — PASS: لا نقطة اشتعال بأكثر من trigger واحد (لا تنفيذ مزدوج).
- **C2.7.4** — PASS: لا دالة موصّلة بأكثر من trigger على نفس الجدول
  (`update_updated_at` على 4 جداول مختلفة — trigger واحد لكل جدول = سليم).
- **C2.7.5** — PASS: كل دالة trigger لها **توقيع واحد** (لا إصدار قديم مخفي):
  `handle_new_user()` · `update_updated_at()` · realtime/storage (3) — جميعها `signatures=1`.

## 4) النتائج (Findings)

| C2.x | الملاحظة | المستوى | القرار |
|---|---|---|---|
| C2.1 | 11 trigger موثّق؛ `handle_new_user` بعد CR-003 في حالته الصحيحة | معلوماتي | **PASS** |
| C2.2 | `handle_new_user` (DEFINER) مبرَّر لمزامنة `auth.users`→`public.users`؛ `update_updated_at` (INVOKER) خفيف | منخفض | مقبول |
| C2.3 | لا trigger على دالة SECURITY DEFINER إلا `handle_new_user` المبرَّر | معلوماتي | **PASS** |
| C2.4 | لا `set_config(..., false)` ولا temp؛ إشارات unqualified على `handle_new_user` **إيجابيات كاذبة مؤكَّدة** بمراجعة الـ body (C2.5b) | معلوماتي | **PASS** |
| C2.5 | `handle_new_user`: search_path صريح + EXECUTE مسحوب + trigger حي | معلوماتي | **PASS** |
| C2.6 | لا triggers معطَّلة؛ 5 triggers إضافات (realtime/storage) توثيق فقط | معلوماتي | مقبول |
| C2.7 | لا أيتام · لا دوال يتيمة · لا تنفيذ مزدوج · لا إصدار قديم | معلوماتي | **PASS** |

ملاحظة معلوماتية (لا تستوجب CR): `update_updated_at` (INVOKER) بلا `search_path`
صريح — لكنها لا تصل إلى أي كائن (فقط `new.updated_at = now()`)، فلا سطح استيلاء.

## 5) قرار الإغلاق (مستقل)

- [x] ✅ **مُغلقة** — كل معايير القبول محققة بالأدلة.
- [ ] 🟡 **مفتوحة** — تُسجَّل النتائج وتُعالج عبر CR مستقل.

القرار: **CLOSED — PASS** · المبرر: لا دالة trigger تفرض تغييراً وظيفياً؛
`handle_new_user` موثَّق بالحالة الصحيحة بعد CR-003 (search_path صريح + EXECUTE
مسحوب + trigger حي + **body مؤهَّل بالكامل — C2.5b**)؛ لا إشارات
`set_config(..., false)`؛ كل فحوصات الترابط PASS. **لا حاجة لـ CR-004.**

التاريخ: **2026-08-04** · الموقّع: ________

## سجل

| التوقيت | الحدث |
|---|---|
| 2026-08-04 | إنشاء الأداة (قراءة خالصة) + القالب — بعد إغلاق C1 |
| 2026-08-04 | **إضافة C2.7 — Trigger Function Dependency Audit** (طلب المراجع) |
| 2026-08-04 | تحويل الأداة إلى Result Set واحد (JSON) + إصلاح `"char"` cast + قاعدة المشروع |
| 2026-08-04 | تنفيذ الأداة ولصق `audit_result` · القرار: **CLOSED — PASS** |
| 2026-08-04 | **C2.5b** — مراجعة الـ body الكامل لـ `handle_new_user`: كل بنود الصلابة محققة فعلاً (search_path/qualification/REVOKE) → **لا CR-004** · إغلاق C2 نهائي |

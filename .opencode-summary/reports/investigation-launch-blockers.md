# تقرير التحقيق — عوائق الإطلاق (READ-ONLY) — جولة الإجابات الإلزامية

التاريخ: 2026-08-04
النوع: READ-ONLY — لم يُعدَّل أي ملف، ولم يُنفَّذ أي SQL.
الحالة: بانتظار موافقتك الصريحة قبل أي تنفيذ.

---

## 1) عداد QR = 7,999,999,995 (الأولوية القصوى)

### من أين تأتي القيمة بالضبط؟
من جدول **`public.qr_codes`** عمود **`scan_count`** — يُقرأ ويُجمع مباشرة:
- `src/research-console/pages/live/LiveDashboard.tsx:192,195`:
  `client.from('qr_codes').select('scan_count')` ثم `reduce((s, q) => s + (q.scan_count ?? 0), 0)`.
- نفس النمط في `CampaignsDashboard.tsx:87`، `CampaignAnalytics.tsx:171`، `api-supabase.ts:895`.

### لماذا أصبحت 7,999,999,995؟
حسابياً: **8 صفوف × 999,999,999 = 7,999,999,992 + 3 مسحات حقيقية = 7,999,999,995.** مطابقة تامة.

### هل هي بيانات قديمة أم Bug جديد؟
**تلوث بيانات من حادثة موثقة (2026-08-03 18:30:05Z)** — وليس Bug جديداً:
- `supabase/security-hardening/phase2/06-2.1.6-incident-evidence-collect.sql:13` يوثّق: `D2 qr_codes.scan_count = 999999999 (8 rows)` في الإنتاج.
- السبب الجذري (RCA مغلق، H1): سكربت الفحص `04-2.1.6-baseline-reverify.sql:200-208` نفّذ `set role anon; update public.qr_codes set scan_count = 999999999;` **بينما كان `request.jwt.claims` قد تسرّب لشخصية super_admin (set_config بجلسة النطاق)** → حُرِّرت الصفوف الثمانية بدل 0.
- قرار تنفيذي **INC-2026-08-03-D2-close** (`07-2.1.6-incident-restore.sql:15-21,83-101`): لا يوجد PITR، الصفوف الثمانية تجريبية غير تشغيلية، **يُمنع استرجاع scan_count أو تخمينه، ويُمنع أي UPDATE عليها**.

### هل يوجد أكثر من مصدر لعدد المسحات؟
نعم:
| المصدر | طبيعته | مستخدم؟ |
|---|---|---|
| `qr_codes.scan_count` | عداد مُركَّم عبر RPC | لوحة التحكم (مصدر العدد الخاطئ) |
| `analytics_events` (event_type='qr_scanned') | سجل أحداث فعلي | يُنشأ في `App.tsx:139,157` عبر telemetry — **المصدر الصحيح للعد الحقيقي** |
| `referral_scan` / `sticker getScanCount` | مسارات منفصلة | غير مرتبطة بالعداد العام |

### هل يعتمد الـ Dashboard على scan_count أم يحسب من الأحداث؟
**يعتمد على عمود `scan_count` مباشرة** (LiveDashboard.tsx:195) — لا يحسب من `analytics_events`.

### الطريقة الصحيحة لإرجاع العدد الحقيقي (دون مخالفة القرار التنفيذي)
- **خيار (C) موصى به:** حساب العدد من `analytics_events` حيث `event_type = 'qr_scanned'` (سجل فعلي غير ملوث) في `LiveDashboard` و`CampaignsDashboard`.
- **خيار (B) دفاعي:** في قراءة `qr_codes.scan_count` استبعاد صفوف العلامة الملوثة (`scan_count = 999999999`) — بدون أي UPDATE.
- **خيار (A) مُحرَّم:** تعديل scan_count للصفوف الثمانية — ممنوع بقرار INC-2026-08-03-D2-close.

### كيف نضمن عدم التكرار مستقبلاً؟
- سياسة UPDATE الواسعة "Anyone can update qr scan counts" أُسقطت (LV-11، `phase1/07`).
- الكتابة الشرعية الوحيدة عبر `increment_qr_counter` (SECURITY DEFINER + allowlist أعمدة).
- **ممنوع إعادة تشغيل `04-2.1.6` في الإنتاج** (موثّق في README phase2).
- الحارس في مسار القراءة (استبعاد علامة التلوث) يجعل أي تكرار مستقبلي غير مرئي في اللوحة.

### خطة Rollback إن أخطأ SQL
- الحل المقترح **بدون SQL** (تغيير TS في مسار القراءة فقط) → لا يوجد SQL يخطئ.
- أي SQL مستقبلي ملزم بنمط ملف الاستعادة: اطبع الحالة أولاً (SELECT)، ثم UPDATE مستهدف بشرط، ثم تحقق بعدد الصفوف، داخل معاملة.

---

## 2) الهواتف المستعملة لا تظهر على الموقع المنشور

### تتبع رحلة البيانات كاملة (أين تتوقف؟)
```
Admin ─▶ Insert ─▶ Database ─▶ API ─▶ Repository ─▶ State ─▶ UI ─▶ Production Website
 │        │
 │        └─▶ InventoryService.addStock()  →  localStorage 'catalog_inventory'   ◄── تتوقف هنا
 │             (لا يوجد أي جدول Supabase، لا API، لا مزامنة)
```
**الرحلة تتوقف عند النقطة 2 (Insert → localStorage).** الأدلة:
- `AddInventoryModal.tsx:42` → `InventoryService.addStock(...)` → `localStorage.setItem('catalog_inventory', ...)` (`inventory-service.ts:152-154`).
- جرد جداول Supabase المستخدمة من الكود: `analytics_events, calibrations, campaigns, devices, qr_codes, repair_*, sessions, surveys, trade_requests, users` — **لا يوجد جدول مخزون/منتجات/هواتف**.
- `devices` = جهاز الزائر (user_agent/os/browser) — ليس كتالوج هواتف.
- لا يوجد أي `storage.from('...')` (لا Supabase Storage).
- لا يوجد `sync`/`migration` للمخزون في أي ملف.

### هل المشكلة في Supabase/RLS/Build/API/المزامنة/النشر؟
- **لا** في Supabase أو RLS أو API أو Build أو النشر — **نعم** في **مصدر التخزين نفسه**: المخزون LocalFirst (localStorage) مقيّد بـ **Origin**:
  - بيئة التطوير: `http://localhost:5173`
  - الموقع المنشور: `https://yahya2208.github.io`
  → **نطاقات مختلفة = تخزين مختلف**. حتى الأدمن نفسه، إضافة على localhost لا تظهر على الموقع المنشور، وأي زائر آخر يرى مخزوناً فارغاً.
- **الفلترة** (`getExchangeableDevices`: quantity>0 وغير archived/discontinued) تعمل على ما هو موجود في localStorage فقط — ليست سبب الاختفاء، لكنها تخفي النافد/المؤرشف.

### الخلاصة
المشكلة ليست "تتوقف عند نقطة ما في التطبيق الحالي" بل **غياب طبقة بيانات مشتركة كلياً**. الحل الجذري: جدول `inventory` (أو `used_phones`) في Supabase + RLS قراءة عامة / كتابة أدمن + مزامنة من Add/Edit + قراءة موحدة في المعرض/البيع/الشراء/الاستبدال من مصدر واحد. **هذا تغيير معماري** (بند 4-ب في تقرير الجولة السابقة) ويحتاج موافقتك لأنه يمس بند «LocalFirst».

---

## 3) إدارة معرض الهواتف — هل يوجد CRUD كامل؟

### الوضع الحالي (نعم جزئي / لا كامل)
| القدرة | موجود؟ | الدليل |
|---|---|---|
| إضافة | ✅ جزئي | `AddInventoryModal` (موديل/نسخة/حالة/كمية/صور) |
| الشركة/الموديل | ✅ | من CatalogAutocomplete |
| الحالة New/Used | ✅ | خطوة condition (ALL_CONDITIONS) |
| السعر | ❌ **غير موجود في الواجهة** | addStock يُمرَّر `undefined, undefined` |
| الصور | ✅ | PhoneImageUploader → data-URL → record.images |
| الوصف | ❌ **غير موجود في النموذج إطلاقاً** | InventoryRecord بلا حقل description |
| السعة/النسخة | ✅ | من اختيار Variant |
| اللون | ❌ **غير موجود في النموذج** | InventoryRecord بلا حقل color |
| الكمية | ✅ | Add/Edit |
| حالة التوفر | ⚠️ جزئي | quantity/status فقط، بلا واجهة أرشفة |
| التعديل | ⚠️ جزئي | `EditInventoryModal` يعدّل الكمية + الصور فقط |
| الحذف | ✅ | `deleteRecord` (`CatalogInventoryScreen.tsx:48`) |
| الإخفاء دون حذف | ⚠️ موجود في الخدمة بلا واجهة | `setStatus('archived')` (`inventory-service.ts:482`) — **لا يوجد أي UI في InventoryRow** |

### ما الذي ينقص تحديداً
1. حقلا **سعر الشراء/البيع** (إدخال + تعديل).
2. حقلا **الوصف** و**اللون** (إضافة للحقل + واجهة).
3. **إخفاء دون حذف** (زر أرشفة/إخفاء في InventoryRow → setStatus('archived') أو isHidden).
4. **تعديل كامل** (سعر/حالة/توفر — وليس كمية فقط).
5. **عرض كل ذلك** في المعرض/البيع/الشراء/الاستبدال **من مصدر واحد** (بند 2 يحل ذلك: مصدر موحّد Supabase بدل localStorage).

---

## 4) السعر — هل الحقل موجود؟

**الجواب الثلاثي بالدليل:**
- **هل قاعدة البيانات لا تحتوي الحقل؟** لا يوجد جدول منتجات أصلاً (بند 2) — فلا حقل سعر في DB.
- **هل موجود وغير مستخدم؟** نعم في **نموذج البيانات المحلي**: `InventoryRecord.buyPrice/sellPrice` (`inventory-service.ts:54-55`) **موجودان لكنهما لا يُملآن أبداً** — `AddInventoryModal.tsx:42` يمرر `undefined`، و`EditInventoryModal` لا يعرضهما.
- **هل لا يصل للواجهة؟** عند تواجده **يصل**: `PhoneShowroom.tsx:130-134` و`CustomerPhoneFlow.tsx:400-404` يعرضان `sellPrice` تلقائياً. المشكلة أن القيمة لا تُدخل أصلاً.

**تحذير عن "عدم إنشاء أكثر من حقل سعر":** يوجد حالياً تمثيلان إضافيان للأسعار في `price-memory.ts` (`price_memory_v1` = سجل أحداث أسعار، `focus-price-memory` = كتالوج أسعار BI) — لكن **الحقل التشغيلي الوحيد للمعرض/البيع هو `InventoryRecord.sellPrice`**. سنعتمد عليه فقط ونترك PriceMemory كأداة تحليل (أو نقرر إيقافها — يحتاج قرارك).

---

## 5) الصور — أين تحفظ وهل تظهر بعد النشر؟

- **الحفظ: Base64 data-URL فقط** — `compressImage` → `canvas.toDataURL('image/jpeg', quality)` (`image-service.ts:54`) → تُخزَّن في `record.images` → localStorage `catalog_inventory` (`inventory-service.ts:561-573`).
- **لا يوجد Supabase Storage** (لا `storage.from/upload` في الكود) — لا تحفظ في Storage ولا URL.
- **لا تظهر بعد النشر لأي مستخدم آخر** — لنفس سبب بند 2 (localStorage مقيد بالـ Origin). حتى الأدمن على الموقع المنشور لا يرى صوراً أُضيفت محلياً.
- **مخاطرة إضافية:** الصور Base64 في localStorage → سعة الـ localStorage (~5MB) تُستنفد بسرعة مع عدة صور مضغوطة؛ `saveAll` يبتلع الأخطاء في try/catch صامت (`inventory-service.ts:152-154`) → **فقدان صامت للبيانات عند الامتلاء** بدون إشعار المستخدم.

---

## 6) مخاطر إضافية اكتشفتها قد تؤثر على الإطلاق (لم تذكرها)

1. **فقدان بيانات صامت عند امتلاء localStorage** (صور Base64 + سجل المخزون) — لا يوجد تحقق من نجاح الحفظ.
2. **بيئة التطوير ≠ الإنتاج في البيانات**: كل شيء LocalFirst (بند 2/4/5) — هذا أكبر معطل إطلاق.
3. **الموقع الحي متأخر بنسخة واحدة** (`index-C7i7BYQo.js` مقابل المحلي `index-DD5w3ctr.js`).
4. **لوحة التحكم تعرض أرقاماً مضللة** من scan_count الملوث في 3 شاشات (Live, Campaigns, Analytics).
5. **Sticker Studio غير محروس بالصلاحيات** (من جولة التحقيق السابقة — يظهر للضيف).
6. **تسريب `console.error`** في `InventoryHealthScreen.tsx:134` (واحد فقط، في Research Console).
7. **آثار الحادثة الأمنية**: إعادة تشغيل سكربتات `04-2.1.6` في الإنتاج ممنوعة؛ حارس SQL Editor مفقود (ملاحظة README: الجلسات قد تقرأ claims خاطئة).
8. **الأسئلة المفتوحة من الجولة السابقة لم تُحسم بعد**: صلاحيات Sticker Studio، مصدر بيانات المخزون، نطاق سعر المستعمل.

---

## الجدول النهائي — المشكلة / السبب الجذري / الملفات / الخطر / طريقة الإصلاح

| # | المشكلة | السبب الجذري | الملفات | الخطر | طريقة الإصلاح |
|---|---|---|---|---|---|
| 1 | عداد QR = 7,999,999,995 | حادثة 2026-08-03 (H1): سكربت فحص كتب 8 صفوف `scan_count=999999999` في الإنتاج؛ اللوحة تجمع العمود مباشرة | `LiveDashboard.tsx:192-195`، `CampaignsDashboard.tsx:87`، `api-supabase.ts:895` | منخفض (تغيير قراءة فقط)؛ يمنع لمس scan_count بقرار D2-close | العد من `analytics_events qr_scanned` (أو استبعاد علامة التلوث في مسار القراءة) — بدون SQL |
| 2 | الهواتف المستعملة لا تظهر على الموقع | لا يوجد جدول/API/مزامنة للمخزون؛ LocalFirst مقيد بـ Origin | `inventory-service.ts`، `AddInventoryModal.tsx`، `ShowroomScreen.tsx`، `CustomerPhoneFlow.tsx` | **عالٍ (تغيير معماري)** — يمس LocalFirst/Offline | جدول `inventory` في Supabase + RLS + مزامنة + قراءة موحدة من مصدر واحد |
| 3 | CRUD المعرض غير كامل | لا سعر/وصف/لون في الواجهة؛ لا واجهة أرشفة/إخفاء؛ التعديل كمية فقط | `AddInventoryModal.tsx`، `EditInventoryModal.tsx`، `InventoryRow.tsx` | منخفض-متوسط (توسيع UI + حقول) | إضافة حقول السعر/الوصف/اللون + زر إخفاء (setStatus) + تعديل كامل |
| 4 | لا يوجد سعر للمستعمل | الحقل موجود في النموذج لكن addStock يُمرَّر undefined | `AddInventoryModal.tsx:42`، `EditInventoryModal.tsx` | منخفض | ملء buyPrice/sellPrice من الواجهة؛ اعتماد sellPrice كحقل السعر الوحيد |
| 5 | الصور لا تظهر بعد النشر | Base64 في localStorage فقط؛ لا Storage | `image-service.ts:54`، `inventory-service.ts:561-573` | متوسط | رفع إلى Supabase Storage عند تنفيذ بند 2 (أو جدول data-URL في نفس جدول inventory) |
| 6 | استوديو الملصقات غير محروس | بطاقة غير مشروطة + مسار بلا ProtectedRoute | `HomeScreen.tsx:256-270`، `App.tsx:96` | منخفض | نفس نمط research: ProtectedRoute + إخفاء حسب الدور |
| 7 | تسرب console.error في الإنتاج | `.catch(console.error)` مباشر | `InventoryHealthScreen.tsx:134` | منخفض جداً | استبدال بـ `devError` |
| 8 | فقدان صامت عند امتلاء localStorage | saveAll يبتلع الأخطاء | `inventory-service.ts:152-154` | متوسط | تحقق من نجاح الحفظ + حد كمية صور + إشعار |
| 9 | الموقع الحي متأخر | workflow GitHub Actions لم يُبنِ بعد آخر main | `.github/workflows/deploy.yml` | منخفض | إعادة تشغيل البناء/الانتظار بعد الدفع |

---

## قرارات مطلوبة منك قبل أي تنفيذ (أجب أو وافق)
1. **عداد QR:** اعتماد خيار (C) العد من `analytics_events qr_scanned` (موصى به) أم (B) استبعاد الصفوف الملوثة؟
2. **المخزون:** الموافقة على تغيير المصدر إلى Supabase (بند 2) — هل هي أولوية الإطلاق اليوم أم نطلق LocalFirst مؤقتاً؟ (الهدف: لا نريد إخفاء المخاطرة — المحلي لا يصل للموقع إطلاقاً).
3. **السعر:** حقل واحد = `sellPrice` فقط أم `buyPrice + sellPrice` معاً؟
4. **استوديو الملصقات:** الأدوار المصرح بها (مقترح: researcher/admin/super_admin فقط).

**التقرير READ-ONLY بالكامل — لم يُعدَّل أي ملف ولم يُنفَّذ أي SQL. التنفيذ معلّق على موافقتك الصريحة.**

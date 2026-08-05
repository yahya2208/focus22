# تقرير التحقيق الشامل — تسرب Logging + 5 مشاكل (READ-ONLY)

التاريخ: 2026-08-04
النوع: تحقيق READ-ONLY — لم يُعدَّل أي ملف.
الفرع: main (1dbfd39 = v2.2-performance-stable)
الحالة: تم جمع الأدلة الكاملة؛ التنفيذ معلّق على اعتماد التقرير.

---

## 1) صلاحيات استوديو الملصقات (Sticker Studio)

### السبب الجذري
استوديو الملصقات **خارج نظام الصلاحيات تماماً**:
1. بطاقة "🖼️ ستوديو الملصقات" تُرسم **بدون أي شرط دور** في `src/screens/home/HomeScreen.tsx:256-270` (على عكس القائمة الجانبية `HomeMenu.tsx:96-106` التي تحرس الإعدادات وResearch Console بـ `permissionGuard.can(researchRole, 'scientific', 'read')`).
2. المسار `'sticker-studio'` مُسجَّل في خريطة `screens` العادية في `src/App.tsx:96` ويُعرض عند `src/App.tsx:242` (`content = <Screen />`) **بدون** `ProtectedRoute` — بينما كل شاشات الإدارة (`research`, `business-intelligence`, `repair-admin`, `repair-courier`, `repair-customer-history`, `repair-personnel`, `repair-diagnostics`) مغلَّفة بـ `ProtectedRoute` + resource/action (أسطر 199-240).
3. لا يوجد مورد `stickers` في `src/core/research/permissions.ts` (ROLE_PERMISSIONS) — لا يوجد "تصريح معتمد" مبرمج له إطلاقاً.
4. `AppRole → ResearchRole` (`permissions.ts:16-22`): guest→none، user→viewer. أي أن المستخدم العادي/الضيف لا يملك أصلاً أي صلاحيات للوصول لأدوات الإدارة الداخلية.

النتيجة: الضيف والمستخدم المسجل يريان البطاقة ويفتحان الشاشة، لأن البطاقة غير مشروطة والمسار غير محروس.

### الملفات المتأثرة
- `src/screens/home/HomeScreen.tsx:256-270`
- `src/App.tsx:96` + `src/App.tsx:242` (مسار غير محروس)
- `src/core/research/permissions.ts` (لا يوجد مورد sticker)

### خطة الإصلاح
- حماية المسار: لفّ `StickerStudioScreen` داخل `ProtectedRoute` في `App.tsx` بنفس نمط بقية شاشات الإدارة.
- إخفاء البطاقة عن غير المصرح: شرط `permissionGuard.can(researchRole, <resource>, 'read')` في `HomeScreen.tsx:256`.
- (اختياري/مستحسن) إضافة مورد `stickers` في `permissions.ts` لمنح الباحث/الأدمن/سوبر أدمن فقط (النمط المعتمد: `scientific`).

### التأثير المتوقع
- الضيف والمستخدم المسجل لا يريان البطاقة ولا يستطيعان فتح الشاشة (حتى بالـ URL المباشر).
- المسؤولون يحتفظون بالوصول الكامل — لا Regression على الميزة.

### مخاطر الإصلاح
- إذا اخترنا مورداً جديداً `stickers` يجب تعريفه لكل الأدوار المقصودة، وإلا قد يُحرم الأدمن بطريق الخطأ.
- `AccessDeniedScreen` يجب أن يكون مساراً متاحاً (موجود فعلاً في خريطة screens).

### طريقة التحقق بعد التنفيذ
- Typecheck + Tests + يدوياً: خروج الضيف → لا تظهر البطاقة، وفتح `#/sticker-studio` مباشرة يعيد Access Denied؛ دخول الأدمن → تظهر وتعمل.

---

## 2) لا يوجد حقل لإدخال سعر الهاتف المستعمل

### السبب الجذري
نموذج إدخال المخزون لا يجمع الأسعار إطلاقاً:
1. `src/components/inventory/AddInventoryModal.tsx:42` يستدعي:
   `InventoryService.addStock(..., quantity, undefined, undefined, 'purchase', ...)` — أي `buyPrice` و `sellPrice` = `undefined`.
2. `src/components/inventory/EditInventoryModal.tsx` يحرّر **الكمية والصور فقط** (سطر 15-16) — لا أسعار.
3. `InventoryService.addStock` يقبل الأسعار (`inventory-service.ts:188-189, 215-216`) و`InventoryRecord` يدعم `buyPrice/sellPrice` (`inventory-service.ts:54-55`) — البنية جاهزة لكن الواجهة لا تجمع القيم.

### الملفات المتأثرة
- `src/components/inventory/AddInventoryModal.tsx` (إضافة حقل/خطوة سعر)
- `src/components/inventory/EditInventoryModal.tsx` (إضافة حقلي buy/sell)
- `src/components/inventory/InventoryRow.tsx` (إظهار السعر إن وُجد)
- لا حاجة لتغيير `inventory-service.ts` (البنية جاهزة).

### خطة الإصلاح
- في `AddInventoryModal` إضافة حقول `سعر الشراء` و `سعر البيع` (في خطوة الكمية أو خطوة مستقلة) وتمريرها لـ `addStock`.
- في `EditInventoryModal` إضافة حقل سعر البيع (ومنهج حفظ مباشر عبر `addStock(...,0)`؟ — لا؛ نحتاج طريقة تحديث سعر بدون تغيير كمية. الخيار الآمن: إضافة دالة `updatePrices(recordId, buyPrice, sellPrice)` في `inventory-service.ts` تحفظ + تسجل `TimelineEvent 'price_updated'` الموجود مسبقاً في النوع `TimelineEventType`).

### التأثير على العمليات (بعد إضافة السعر)
- **بيع/شراء/استبدال (CustomerPhoneFlow):** سطر 400-404 يعرض `item.sellPrice` تلقائياً إن وُجد — سيظهر السعر فوراً.
- **معرض الهواتف (PhoneShowroom):** سطر 130-134 يعرض `device.sellPrice` تلقائياً.
- **رسائل واتساب:** قالب `buy` في `whatsapp-message.ts:64` يتضمن `{price}` لكن `openWhatsAppForAction` (سطر 155-180) **لا يمرر السعر حالياً** → بند تحسين اختياري: تمرير `sellPrice` عند إرسال طلب شراء.
- **استبدال (PhoneExchangeEngine):** لا يستخدم sellPrice حالياً — لا Regression متوقعة.
- **بيانات المخزون القديمة:** بدون سعر → لا يُعرض سعر (آمن).

### مخاطر الإصلاح
- منخفضة: البنية جاهزة، والمواضع تعرض `!= null` فقط.
- `updatePrices` يجب أن تحافظ على compatibility مع السجلات القديمة (`priceBefore/priceAfter` اختيارية في Timeline).

### طريقة التحقق بعد التنفيذ
- اختبار وحدة: addStock بأسعار → getExchangeableDevices يعيد sellPrice؛ updatePrices يحدّث والتايملاين يسجل price_updated.
- يدوياً: إضافة هاتف مستعمل بسعر → يظهر في المعرض وفي قائمة بيع/استبدال.

---

## 3) معرض الهواتف — علامة New / Used أسفل البطاقة

### السبب الجذري
`PhoneShowroom` يعرض الموديل/النسخة/الكمية/السعر (أسطر 108-135) لكنه **لا يعرض `device.condition`** رغم وجوده في البيانات (`inventory-service.ts:51`).

### الملفات المتأثرة
- `src/components/showroom/PhoneShowroom.tsx` (إضافة شارة الحالة أسفل البطاقة)
- اختياري: `src/screens/phone-services/CustomerPhoneFlow.tsx:391-404` (قائمة البيع/الاستبدال) + `PhoneGallery.tsx` العنوان.

### خطة الإصلاح
- عرض شارة صغيرة أنيقة (`condition === 'New' ? 'جديد/New' : 'مستعمل/Used'`) بنفس أسلوب شارة الكمية الحالية (borderRadius 999px، خلفية glass، حجم 0.6rem) داخل `PhoneShowroom.tsx` أسفل بطاقة كل جهاز.
- التصنيف الثنائي: `condition === 'New'` → New، أي حالة أخرى من `ALL_CONDITIONS` → Used (متوافق مع `price-memory.ts:28-44`).

### التأثير المتوقع
- وضوح حالة كل جهاز للعميل داخل المعرض وبوابات بيع/استبدال — بدون تغيير منطق البيانات.

### مخاطر الإصلاح
- منخفضة جداً (عنصر عرضي فقط).

### طريقة التحقق
- يدوياً: جهاز condition='New' يظهر New، وآخر 'Good' يظهر Used.

---

## 4) الهواتف الموجودة في المخزون لا تظهر في صفحة الهواتف

### السبب الجذري (بتشريح ثنائي، بأدلة)
صفحة الهواتف `CustomerPhoneFlow` (سطر 43) و`ShowroomScreen` (سطر 18) **تستعلمان فعلاً** من المخزون عبر `InventoryService.getExchangeableDevices()`. المشكلة ليست في الاستعلام بل في **مصدر البيانات + الفلترة**:

- **(أ) الفلترة بالتصميم (مختبَرة):** `inventory-service.ts:455-461` يخفي `quantity<=0` و `archived` و `discontinued`. اختبار `src/__tests__/inventory/exchange-source.test.ts` يوثّق حرفياً "reproduces the reported divergence: a quantity<=0 record appears on the Inventory page but is hidden in the exchange list". أي: الأجهزة التي نفدت كميتها أو أُرشفت تبقى ظاهرة في صفحة المخزون (الأدمن) لكنها تختفي من صفحة الهواتف — **بتعاقد مقصود** (لا يُعرض للعميل غير القابل للتسليم).
- **(ب) مصدر البيانات (جذري/بيئي):** المخزون في `localStorage` مفتاح `catalog_inventory` (`inventory-service.ts:113`) — **مقيّد بالمتصفح/الجهاز وبدون أي بيانات Seed**. أي جهاز جديد أو متصفح جديد يعرض "لا توجد أجهزة متوفرة حالياً" حتى لو كان المخزون ممتلئاً على جهاز الأدمن.
- **(ج) فجوة UX مساهمة:** البحث (`CatalogAutocomplete`/`searchCatalog`) يغطي **الكاملوج الاستاتيكي كاملاً** (`catalog-service.ts:16`)، بينما قائمة بيع/استبدال تعرض **فقط سجلات المخزون المضافة يدوياً** → العميل يبحث عن أي موديل موجود في الكتالوج ثم يجد المخزون فارغاً بالنسبة له → إدراك "المخزون لا يظهر".

الخلاصة: **الاستعلام سليم ومختبَر. المشكلة الحقيقية = (أ) فلترة التسليم المقصودة + (ب) بيانات محلية غير مسبورة لكل جهاز + (ج) فجوة بين الكتالوج الاستاتيكي والمخزون الفعلي.**

### الملفات المتأثرة
- `src/services/inventory-service.ts` (قرار الفلترة/البيانات)
- `src/screens/phone-services/CustomerPhoneFlow.tsx:43-50`
- `src/screens/showroom/ShowroomScreen.tsx:17-19`

### خطة الإصلاح (بحاجة لقرار اعتماد المنتج)
- **الخيار المحافظ (يُحافظ على العقد المختبر):** الإبقاء على `getExchangeableDevices` كما هي، وعلاج (ب) و(ج):
  1. إضافة بذرة مخزون اختيارية (Seed) أو Sync عبر Supabase للمخزون الفعلي بدل localStorage المقيّد بالجهاز (هذا هو الحل الجذري لمصدر البيانات).
  2. إظهار رسالة إرشادية واضحة عند فراغ المخزون توضح أن المخزون يُدار من صفحة الإدارة.
- **الخيار الذي يُظهر الكتالوج:** ليس حلاً مؤقتاً مرفوضاً؟ هو تغيير عقد — يحتاج موافقة المنتج (يخالف اختبار exchange-source).
- **لا يوجد حل مؤقت:** يُرفض خيار "إظهار الكل دون فلترة" لأنه يخالف عقد التسليم المختبر.

### التأثير المتوقع
- بعد علاج (ب): نفس المخزون يظهر في صفحة الهواتف على كل الأجهزة (بيانات موحدة).
- بعد (أ): يبقى السلوك المقصود (إخفاء غير القابل للتسليم).

### مخاطر الإصلاح
- الانتقال إلى Supabase للمخزون = تغيير مصدر بيانات أساسي (LocalFirst → Remote) — أثر على وضع Offline، الخطة تحتاج بوابة Offline/Queuing قائمة (`src/core/offline`).

### طريقة التحقق
- اختبار وحدة على مصدر البيانات الجديد (نفس عقد exchange-source) + اختبار يدوي على جهازين متصفحين مختلفين.

---

## 5) أيقونة TikTok غير رسمية (موسيقى بدلاً من الشعار)

### السبب الجذري
في `src/components/brand/BrandFooter.tsx:40-46` الأيقونة المعبأة هي SVG **نغمة موسيقية عامة**:
```
<path d="M9.5 18.2V6.2l10-2.1v11.9" /> + دائرتان
```
هذه ليست علامة TikTok التجارية (شعارها أيقونة موسيقية **ممتلئة** بملامح مقطعية معروفة). الرسالة النصية سليمة: `brand.social.tiktokReview` = "الحساب قيد المراجعة، يمكنك العودة لاحقاً" وتُعرض عبر `tiktokOpen` (`BrandFooter.tsx:116-132`).

### الملفات المتأثرة
- `src/components/brand/BrandFooter.tsx:40-46` (فقط استبدال الـ SVG، يبقى `href: null` + الرسالة).

### خطة الإصلاح
- استبدال الـ SVG بالمسار الرسمي لشعار TikTok (أيقونة "التدوينة الموسيقية" الممتلئة) بنفس الحجم/الألوان الحالية (currentColor). لا تغيير للسلوك ولا للرسالة ولا للترجمة.

### التأثير المتوقع
- مظهر مطابق للشعار الرسمي عالمياً، والرسالة "قيد المراجعة" تبقى.

### مخاطر الإصلاح
- منخفضة جداً (عنصر SVG بصري). يجب إبقاء `aria-label="TikTok"`.

### طريقة التحقق
- فحص بصري مقارنة بالشعار الرسمي + اختبار DOM (SVG موجود + click يظهر نص المراجعة).

---

## 6) سبب استمرار ظهور `[obs]` في بيئة التطوير (تأكيد بالأدلة)

- **السلوك بتصميم:** `src/core/logging.ts` يعرّف `IS_DEV = import.meta.env.DEV` وكل دوال `devLog/devInfo/devWarn/devError/devDebug` محاطة بـ `if (IS_DEV)`.
- **في dev server و Vitest:** `import.meta.env.DEV === true` → الطباعة تعمل. `src/core/obs/structured-log.ts:55,57` يطبع `[obs] ...` عبر `devError`/`devInfo`. ناتج `npm run test` يعرضها = المنبع الذي رأيته.
- **في build الإنتاجي (دليل اليوم):** `dist/assets/index-DD5w3ctr.js` يحتوي `function Aa(...e){}function k(...e){}` — الدوال **no-op فارغة**، و`import.meta.env` = **0 ظهور** (استُبدل زمن البناء)، وconsole في chunk التطبيق = **0**، والسلسلة `[obs]` تبقى **2 مرة في كود ميت** فقط.
- **الخلاصة:** ليس تسريباً، بل هي سلوك Dev/Test المتعمد. الإنتاج صامت.

## 7) سبب ظهور "Manifest: Syntax Error" (تأكيد)

- `dist/manifest.json` يبدأ بالبايت `0x7B` (`{`) بدون BOM ويُحلل بنجاح عبر `ConvertFrom-Json` (18 أيقونة، id/start_url/scope=`/focus22/`).
- الرابط الحي `https://yahya2208.github.io/focus22/manifest.json` يُرجع JSON صالحاً.
- `index.html` الحية ترجع `<link rel="manifest" href="/focus22/manifest.json" />`.
- **السبب الحقيقي:** `public/404.html` SPA fallback — أي طلب لمسار لا يُحل للملف يُرجع HTML، وChrome يفشل في تحليل HTML كـ JSON فيعرض Syntax Error. لذا الخطأ يحدث عندما يُطلب الملف عبر مسار خاطئ/ذاكرة مخبأة قديمة، **وليس** في الملف المرسَل.

## 8) لا يوجد Console/Logging يتسرب إلى Production (تأكيد)

- chunk التطبيق الرئيسي: **0** console.info/error/log (عدّ هذا الجلسة).
- الوحيد في كود التطبيق: `src/screens/research/InventoryHealthScreen.tsx:134` → `navigator.clipboard.writeText(handleExport()).catch(console.error)` — موجود في `ResearchConsole-5qVnmNIT.js` (1 occurrence) — **تسريب إنتاجي حقيقي لكنه في مسار Research فقط وليس له علاقة بـ `[obs]` أو logging.ts**.
- مكتبات الطرف الثالث: `react-vendor` (6 console) و`supabase-vendor` (25) — داخل المكتبات نفسها، ليست من كود المشروع.
- **خطة الإصلاح:** استبدال `.catch(console.error)` بـ `.catch(devError)` (استيراد من `src/core/logging.ts`).

## 9) لا يوجد أكثر من نظام Logging متداخل (تأكيد)

- نظام واحد من كود المشروع: `src/core/logging.ts` + مستهلكه `src/core/obs/structured-log.ts`. كل الطباعة في الكود تمر عبر دوال `dev*` المحروسة.
- `PersistenceProvider` لا يستدعي console مباشرة إطلاقاً — يستدعي `devError`.
- المصادر الأخرى (Telemetry/analytics) تخزينية وليست console.
- سكربتات `src/database/*` (seed/verify/golden) تُشغَّل عبر npm scripts خارج المتصفح وليست في البundle.

---

## قرارات مطلوبة قبل التنفيذ (أسئلة مفتوحة)
1. **صلاحيات استوديو الملصقات:** ما الأدوار المصرح لها؟ (المقترح: نفس بوابة `scientific/read` = researcher + admin + super_admin؛ الضيف والمستخدم العادي محرومان).
2. **مصدر بيانات المخزون (بند 4):** هل نعالج (ب) بالانتقال إلى مصدر موحّد (Supabase) أم نكتفي بتوثيق العقد المختبر وعلاج (ج)؟
3. **سعر المستعمل:** هل نضيف سعر البيع فقط أم سعر البيع + سعر الشراء معاً؟

التقرير READ-ONLY — لم يعدَّل أي ملف في الجلسة.

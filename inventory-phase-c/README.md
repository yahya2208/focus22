# FOCUS — Phase C: Inventory Export & Reconciliation

أدوات **قراءة فقط** (لا تكتب شيئًا في localStorage، لا تعدّل التطبيق).

## المبدأ

localStorage خاص بكل **متصفح + Origin**. "المخزون الحالي" قد يكون مختلفًا على
كل جهاز. نحن لا نختار جهازًا كمصدر — نأخذ نسخة من كل Origin ثم نمطابق واترك
القرار للمالك.

## الأداة 1 — التصدير من جهاز (`01-export-origin.html`)

يُفتح على **كل جهاز/متصفح يملك مخزونًا** (Chrome PC، Edge PC، الهاتف...).
طريقة الفتح في وضع التطوير:

```
pnpm dev
```

ثم افتح: `http://localhost:5173/focus22/inventory-phase-c/01-export-origin.html`

> ملاحظة: `localStorage` يُقرأ فقط من نفس Origin للتطبيق (لا يعمل عبر `file://`).

ما يفعله:
- يقرأ مفاتيح: `catalog_inventory`, `catalog_inventory_transactions`,
  `catalog_inventory_movements_v2`, `inventory_timeline_v3`, `catalog_favorites`,
  `catalog_most_used`, `price_memory_v1`.
- يعرض: Origin، المتصفح، الوقت، عدد السجلات، حجم كل مفتاح.
- يحسب SHA-256 للحمولة.
- ينشئ ملف JSON قابلًا للتنزيل: `focus-inventory-export_<host>_<ts>.json`.

**كرر على كل جهاز.** سمِّ الملفات بأسماء واضحة (مثل: `chrome-pc.json`, `edge-pc.json`, `phone.json`).

## الأداة 2 — المطابقة (`02-reconcile.html`)

يُفتح على حاسوب المالك (أو أي جهاز)، اسحب إليه ملفات التصدير كلها:

```
chrome-pc.json
edge-pc.json
phone.json
```

يُنتج:
- ملخص: عدد الأجهزة، عدد الهواتف الفريدة (SKU)، مطابق / اختلاف / جهاز واحد.
- جدول لكل هاتف: كميته وسعره في كل جهاز + القرار.

**القرار التلقائي فقط للمطابق.** أي اختلاف → `OWNER_REVIEW` (قرار المالك) —
لا يُختار رقم تلقائيًا أبدًا.

التنزيل: `focus-inventory-reconcile_<ts>.json` (يغذي Phase E backfill).

## الحالات الثلاث في المطابقة

| الحالة | المعنى | القرار |
|---|---|---|
| `MATCH` | نفس الكمية والسعر في كل الأجهزة | مقبول تلقائيًا |
| `OWNER_REVIEW` (اختلاف) | كميات/أسعار مختلفة بين الأجهزة | قرار المالك |
| `OWNER_REVIEW` (جهاز واحد) | الهاتف موجود في جهاز واحد فقط | قرار المالك |

## الترتيب

1. قرر المالك: **D1=freeze 00014, D3=campaign_items, D4=FK بعد 0 orphan** — تم.
2. تشغيل `01-export-origin.html` على كل Origin → ملفات تصدير.
3. تشغيل `02-reconcile.html` بكل الملفات → تقرير المطابقة.
4. **OWNER REVIEW** — قرارك على كل `OWNER_REVIEW` صف.
5. الناتج = **CANONICAL DATASET** → مدخل Phase D/E.
6. قبل أي تنفيذ: `03-pre-apply-evidence.sql` read-only يثبت حالة قاعدة البيانات.

## الأمان

- الأداتان لا تكتبان أي شيء: لا `setItem`، لا `removeItem`، لا fetch، لا شبكة.
- لا تلمسان التطبيق أو قاعدة البيانات.
- التقرير النهائي يعتمد كليًا على قرارك للـ `OWNER_REVIEW` صفوف.

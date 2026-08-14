# Ads — Per-Slide Device Links (BATCH 4D · migration 00021)

**المصدر:** AdsManager / `AdImageConfig.deviceId` (src/services/ads-service.ts) · **النموذج:** Marketplace Mediator §10/§17 + ads-device-links (BATCH 4A).

> **سياسة التنفيذ:** SQL **additive** (ADD COLUMN + ADD CONSTRAINT **NOT VALID** + RPCs بأسماء **جديدة**) ويُنفَّذ من قبل **المالك (owner)** في Supabase SQL editor بالترتيب أدناه. لا يمسّ 00020 / RLS / Storage. صفوف ad_images الحالية (6) تعمل دون تغيير (`device_id` يبدأ `''`).

## Files to Execute — بالترتيب

| # | الملف | النوع | الحالة |
|---|---|---|---|
| 1 | `03-pre-apply-evidence.sql` | read-only | ⏳ owner: قبل التطبيق |
| 2 | `01-ads-slide-devices-apply.sql` | **apply** | ⏳ owner: التطبيق |
| 3 | `04-post-apply-verify.sql` | read-only | ⏳ owner: بعد التطبيق |

## Rollback
`02-ads-slide-devices-rollback.sql` — exact one-shot (DROP 2 RPCs + DROP constraint + DROP device_id). يُفقد device_id لكل الشرائح.

## 🛑 HARD STOP — VALIDATE
القيود تُضاف **NOT VALID** فقط في هذه الدفعة. لا تُشغَّل `VALIDATE CONSTRAINT ad_images_device_id_format` حتى يُصحّح المالك كل صف مخالف (انظر `04-post-apply-verify.sql`: `device_assigned_total` يجب أن يكون 0 والعدّاد الكلّي مساويًا قبل-التطبيق). تنفيذ VALIDATE مبكرًا = فشل معروف ومتوقع.

## Client side (بعد نجاح التطبيق)
- `ads-service` يمرّر `device_ids` إلى `ad_replace_images_devices` **فقط** عندما يملك أحد الشرائح جهازًا؛ وإلا يبقى على RPCs الـ 00020 (بدون device).
- الـ render يشتقّ الرابط وقت العرض (`buildAdPhoneLink` → `#/phone-details?device=<id>`) لكل شريحة من `device_id` الخاص بها.
- وجود الـ inventory نفسه يُتحقَّق في **Ads Manager** عبر `InventoryService.getExchangeableDevices()` (مثل `ads.device_id` في ads-device-links) — الـ DB لا يفحص الوجود، يفرض الصيغة فقط.

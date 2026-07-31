# Repair OS v1.0

نظام Smart Repair & Pickup OS — نظام متكامل لإدارة دورة حياة طلب الإصلاح بالكامل.

## العمارة (Architecture)

Repair OS состоит из 15 محرك (Engine) مستقل، كل محرك مسؤول عن وظيفة محددة.

```
src/
├── services/repair/
│   ├── repair-types.ts         # الأنواع الأساسية (جميع المحركات)
│   ├── repair-database.ts      # طبقة تخزين JSON (localStorage)
│   ├── repair-engine.ts        # المحرك الأساسي (المنطق التجاري)
│   ├── repair-analytics.ts     # تحليلات الإصلاح
│   ├── repair-whatsapp.ts      # رسائل واتساب التلقائية
│   ├── repair-recommendations.ts  # محرك التوصيات الذكية
│   └── repair-bi.ts            # تكامل مع Treasure Mode
├── components/repair/
│   ├── RepairTimeline.tsx      # المخطط الزمني
│   ├── RepairQR.tsx            # رمز QR
│   └── RepairPhotoUpload.tsx   # رفع الصور
└── screens/repair/
    ├── RepairHomeScreen.tsx        # الشاشة الرئيسية
    ├── RepairRequestScreen.tsx     # إنشاء طلب الإصلاح
    ├── RepairTrackingScreen.tsx    # تتبع الطلب (عام، بدون تسجيل)
    ├── RepairAdminDashboard.tsx    # لوحة الإدارة
    ├── RepairCourierScreen.tsx     # لوحة المندوب
    └── RepairCustomerHistory.tsx   # سجل العميل
```

## المحركات (Engines)

### المحرك 1: Repair Request Engine
**الملف:** `RepairRequestScreen.tsx` + `repair-engine.ts` → `createRepairRequest()`

إنشاء طلب إصلاح عبر 6 خطوات: معلومات العميل ← اختيار الهاتف (Catalog Search) ← اختيار العطل ← الوصف والموقع ← الصور ← المراجعة والإرسال.

### المحرك 2: Quote Engine
**الملف:** `repair-engine.ts` → `createQuote()` / `approveQuote()` / `rejectQuote()`

التسلسل: Customer → Quote Request → Admin Reviews → Admin Sends Price → Customer Approves → Courier Assigned.

الحالة الأولى دائماً: `Pending Quote` → `Quoted` → `Approved` → `Courier Assigned`

### المحرك 3: WhatsApp Quote
**الملف:** `repair-whatsapp.ts` → `generateWhatsAppMessage()` / `getWhatsAppLink()`

بعد إرسال طلب التصليح، يتم فتح واتساب تلقائياً برسالة تحتوي على: الجهاز، العطل، الحالة، الموقع، كود الطلب.

### المحرك 4: Courier System
**الملف:** `RepairCourierScreen.tsx` + `repair-engine.ts` → `assignCourier()` / `updateCourierJobStatus()`

لوحة خاصة بالمندوب تعرض المهام مع أزرار: Start Trip → Arrived → Collected → Heading To Store → Delivered To Store.

### المحرك 5: Repair Workflow
**الملف:** `repair-engine.ts` → `updateRepairStatus()`

الحالات المتاحة (16 حالة):
1. Pending Quote → 2. Quoted → 3. Approved → 4. Courier Assigned → 5. Collected → 6. Received At Store → 7. Inspection → 8. Waiting Parts → 9. Repairing → 10. Quality Check → 11. Ready → 12. Courier Returning → 13. Delivered → 14. Completed | 15. Failed | 16. Cancelled

### المحرك 6: QR Tracking
**الملف:** `RepairQR.tsx` + `RepairTrackingScreen.tsx`

بعد قبول السعر، ينشئ النظام Repair Code (REP-26-XXXXX) و QR Code. يمكن للعميل فتح رابط التتبع بدون تسجيل دخول.

### المحرك 7: Timeline
**الملف:** `RepairTimeline.tsx` + `repair-database.ts` → `addTimelineEvent()` / `getAllTimelineEvents()`

كل طلب له Timeline مستقل يسجل كل الأحداث مع الوقت والتوقيع.

### المحرك 8: Customer Notifications
**الملف:** `repair-whatsapp.ts` → `getStatusNotificationMessage()` / `getStatusWhatsAppMessage()`

كل انتقال حالة يرسل إشعار ورسالة واتساب للعميل.

### المحرك 9: Admin Dashboard
**الملف:** `RepairAdminDashboard.tsx`

لوحة تحتوي على: عداد الطلبات المعلقة، قيد الإصلاح، بانتظار القطع، الجاهز. مع إرسال العروض وإدارة الحالات.

### المحرك 10: Repair Analytics
**الملف:** `repair-analytics.ts`

تسجيل الأحداث التالية في analytics_events: repair_requested, quote_sent, quote_approved, courier_assigned, courier_collected, store_received, inspection_started, repair_started, waiting_parts, quality_check, repair_completed, repair_failed, customer_received.

### المحرك 11: Business Intelligence
**الملف:** `repair-bi.ts`

تكامل مع Treasure Mode. المؤشرات: Average Repair Time, Repair Success Rate, Top Issues, Top Brands, Repeat Customers, Courier Performance.

### المحرك 12: Customer History
**الملف:** `RepairCustomerHistory.tsx`

صفحة لكل عميل تعرض: إجمالي التصليحات, المدفوع, متوسط التكلفة, أكثر جهاز تم إصلاحه, أكثر عطل شائع, آخر تصليح.

### المحرك 13: Smart Recommendation Engine
**الملف:** `repair-recommendations.ts` → `getRecommendations()`

تحليل الطلب قبل إرساله: تحذير إذا كانت تكلفة الإصلاح مرتفعة، تنبيه إذا كان الموديل يتعرض لنفس العطل كثيراً، تنبيه إذا كان العميل متكرراً.

## قاعدة البيانات

جداول JSON في localStorage:
| الجدول | المفتاح |
|---|---|
| repair_requests | `repair_requests_v1` |
| repair_quotes | `repair_quotes_v1` |
| repair_timeline | `repair_timeline_v1` |
| courier_jobs | `repair_courier_jobs_v1` |
| notifications | `repair_notifications_v1` |
| photos | `repair_photos_v1` |

## الاختبارات

`src/__tests__/repair/repair.test.ts` — 29 اختبار تغطي:
- توليد كود الإصلاح
- تدفق الحالات
- إنشاء الطلب
- دورة حياة العرض
- رسائل واتساب
- نظام المندوب
- دورة الإصلاح الكاملة
- التحليلات
- تكامل BI
- طبقة البيانات

## الاستخدام

```typescript
import { createRepairRequest } from '../../services/repair/repair-engine';
import { getWhatsAppLink } from '../../services/repair/repair-whatsapp';

const { request, code } = createRepairRequest({
  customerName: 'أحمد',
  customerPhone: '0555123456',
  brandName: 'Samsung',
  modelName: 'Galaxy A52',
  issue: 'Charging',
  description: 'لا يشحن',
  deviceWorking: 'Partially',
  lockScreen: 'Yes',
  previouslyRepaired: 'No',
  latitude: null,
  longitude: null,
  locationAccuracy: null,
  googleMapsLink: null,
  photoPaths: [],
  customerId: null,
});

const whatsappLink = getWhatsAppLink('0555123456', request);
window.open(whatsappLink, '_blank');
```

## شاشات النظام

| الشاشة | المسار | الحماية |
|---|---|---|
| الصيانة الرئيسية | `repair-home` | لا |
| طلب تصليح | `repair-request` | لا |
| تتبع طلب | `repair-tracking` | لا (عام) |
| لوحة الإدارة | `repair-admin` | Admin |
| مهام المندوب | `repair-courier` | Admin |
| سجل العملاء | `repair-customer-history` | Admin |

## التكامل

- **Catalog OS**: يستخدم `CatalogCascadeSelector` لاختيار الهاتف
- **Analytics**: يسجل الأحداث عبر `getGlobalTelemetry().track()`
- **Theme**: جميع الشاشات تستخدم `useThemeColors()` والثيم الحالي
- **Notifications**: متكامل مع `NotificationEngine` (للإدارة)

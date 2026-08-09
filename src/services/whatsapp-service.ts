import { buildAppUrl } from '../core/base-path';
import type { InventoryRecord } from './inventory-service';

export const WHATSAPP_PHONE = '+213556254007';

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) return '213' + cleaned.slice(1);
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  return cleaned;
}

function buildWhatsAppUrl(phone: string, message: string): string {
  const formatted = formatPhone(phone);
  return `https://wa.me/${formatted}?text=${encodeURIComponent(message)}`;
}

export { buildWhatsAppUrl, formatPhone };

export function openWhatsApp(phone: string, message: string): void {
  const url = buildWhatsAppUrl(phone, message);
  // Launch-blocker fix: open WhatsApp in a new window/tab (reliable for mobile
  // & in-app browsers), with a same-tab fallback if the popup is blocked.
  const win = window.open(url, '_blank', 'noopener');
  if (!win) {
    window.location.href = url;
  }
}

export function buildBuyRequestMessage(params: { brand: string; model: string; variant?: string; condition?: string }): string {
  return [
    'السلام عليكم.',
    '',
    'أرغب في شراء الهاتف التالي.',
    '',
    `📱 الهاتف:`,
    `${params.brand} ${params.model}`,
    params.variant ? `النسخة: ${params.variant}` : '',
    params.condition ? `الحالة: ${params.condition}` : '',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
}

export function openBuyRequest(params: { brand: string; model: string; variant?: string; condition?: string }): void {
  openWhatsApp(WHATSAPP_PHONE, buildBuyRequestMessage(params));
}

export function buildSellRequestMessage(params: { brand: string; model: string; variant?: string; condition?: string }): string {
  return [
    'السلام عليكم.',
    '',
    'أرغب في بيع الهاتف التالي.',
    '',
    `📱 الهاتف:`,
    `${params.brand} ${params.model}`,
    params.variant ? `النسخة: ${params.variant}` : '',
    params.condition ? `الحالة: ${params.condition}` : '',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
}

export function openSellRequest(params: { brand: string; model: string; variant?: string; condition?: string }): void {
  openWhatsApp(WHATSAPP_PHONE, buildSellRequestMessage(params));
}

export function buildExchangeRequestMessage(params: { myBrand: string; myModel: string; myVariant?: string; wantBrand: string; wantModel: string; wantVariant?: string }): string {
  return [
    'السلام عليكم.',
    '',
    'أرغب في استبدال هاتفي.',
    '',
    `📱 هاتفي الحالي:`,
    `${params.myBrand} ${params.myModel}`,
    params.myVariant ? `النسخة: ${params.myVariant}` : '',
    '',
    `📱 الهاتف المطلوب:`,
    `${params.wantBrand} ${params.wantModel}`,
    params.wantVariant ? `النسخة: ${params.wantVariant}` : '',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
}

export function openExchangeRequest(params: { myBrand: string; myModel: string; myVariant?: string; wantBrand: string; wantModel: string; wantVariant?: string }): void {
  openWhatsApp(WHATSAPP_PHONE, buildExchangeRequestMessage(params));
}

export function openRepairRequest(params: { brand: string; model: string; issue: string; description?: string; location?: string; code: string; condition?: string; customerPhone?: string }): void {
  const message = [
    'السلام عليكم.',
    '',
    'أرغب في إصلاح الهاتف التالي.',
    '',
    `📱 الهاتف:`,
    `${params.brand} ${params.model}`,
    params.condition ? `الحالة: ${params.condition}` : '',
    `🔧 العطل: ${params.issue}`,
    params.description ? `الوصف: ${params.description}` : '',
    params.location ? `📍 الموقع: ${params.location}` : '',
    '',
    `🆔 رقم الطلب: ${params.code}`,
    params.customerPhone ? `📞 رقم العميل: ${params.customerPhone}` : '',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
  openWhatsApp(WHATSAPP_PHONE, message);
}

export function openInventoryRequest(params: { brand: string; model: string; variant?: string; quantity?: number }): void {
  const message = [
    'السلام عليكم.',
    '',
    'أرغب في الاستعلام عن توفر القطعة التالية.',
    '',
    `📱 القطعة:`,
    `${params.brand} ${params.model}`,
    params.variant ? `النسخة: ${params.variant}` : '',
    params.quantity ? `الكمية: ${params.quantity}` : '',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
  openWhatsApp(WHATSAPP_PHONE, message);
}

export function openCustomMessage(phone: string, message: string): void {
  openWhatsApp(phone, message);
}

/**
 * Central contact layer adapter (formerly in whatsapp-message.ts): routes a
 * customer-flow action (sell / buy / exchange) to the matching request opener.
 * The `phone` argument is accepted for interface compatibility; all flows send
 * to the single business number.
 */
export function buildWhatsAppForActionMessage(
  action: 'buy' | 'sell' | 'exchange',
  params: {
    brand: string;
    model: string;
    variant?: string;
    condition?: string;
    targetDevice?: { brand: string; model: string; variant?: string };
  },
): string {
  switch (action) {
    case 'buy':
      return buildBuyRequestMessage({ brand: params.brand, model: params.model, variant: params.variant, condition: params.condition });
    case 'sell':
      return buildSellRequestMessage({ brand: params.brand, model: params.model, variant: params.variant, condition: params.condition });
    case 'exchange':
      return buildExchangeRequestMessage({
        myBrand: params.brand,
        myModel: params.model,
        myVariant: params.variant,
        wantBrand: params.targetDevice?.brand ?? '',
        wantModel: params.targetDevice?.model ?? '',
        wantVariant: params.targetDevice?.variant,
      });
  }
}

export function openWhatsAppForAction(
  _phone: string,
  action: 'buy' | 'sell' | 'exchange',
  params: {
    brand: string;
    model: string;
    variant?: string;
    condition?: string;
    targetDevice?: { brand: string; model: string; variant?: string };
  },
): void {
  openWhatsApp(WHATSAPP_PHONE, buildWhatsAppForActionMessage(action, params));
}

export function buildModelNotFoundMessage(brand: string, model: string): string {
  return [
    'السلام عليكم.',
    '',
    'الهاتف الذي أبحث عنه غير موجود في موقعكم.',
    '',
    `🏭 الشركة المصنعة: ${brand}`,
    `📱 الموديل: ${model}`,
    '',
    'هل يمكنكم توفيره لي؟',
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
}

export function openModelNotFoundRequest(brand: string, model: string): void {
  openWhatsApp(WHATSAPP_PHONE, buildModelNotFoundMessage(brand, model));
}

/**
 * ── BATCH 3 — Single contact-owner WhatsApp template (Marketplace Mediator) ────
 * FOCUS is a communication intermediary ONLY — it never sells, buys, exchanges,
 * finances, or installments phones, and no transaction happens inside the app.
 * The message is phrased as a user who wants to talk about the listed phone;
 * only data that actually exists on the record is included (no invented
 * installment price / duration / down payment / interest, no selling terms).
 */

export interface PhoneActionContext {
  /** brand + model (variant) */
  name: string;
  /** record.code when set, else the short form of record.id (first 8 chars) */
  code: string;
  /** formatted price number (د.ج) — line omitted when the record has no price */
  price?: string;
  /** record.city — line omitted when unknown */
  city?: string;
  /** base-aware listing deep link (base + '#/phone-details?device=' + id) */
  url: string;
}

export function getPhoneActionContext(device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>): PhoneActionContext {
  const name = `${device.brand} ${device.model}${device.variant ? ` (${device.variant})` : ''}`;
  const code = device.code && device.code.trim() ? device.code.trim() : device.id.slice(0, 8);
  return {
    name,
    code,
    price: device.sellPrice != null ? device.sellPrice.toLocaleString('en-US') : undefined,
    city: device.city && device.city.trim() ? device.city.trim() : undefined,
    url: buildAppUrl(`#/phone-details?device=${device.id}`),
  };
}

export function buildContactOwnerMessage(
  device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>,
): string {
  const ctx = getPhoneActionContext(device);
  const lines = [
    'السلام عليكم،',
    'مرحبًا، أرغب في التواصل بخصوص الهاتف المعروض في FOCUS.',
    `اسم الهاتف: ${ctx.name}`,
    `الكود: ${ctx.code}`,
  ];
  if (ctx.price != null) lines.push(`السعر: ${ctx.price} دج`);
  if (ctx.city) lines.push(`المدينة: ${ctx.city}`);
  lines.push(`رابط الإعلان: ${ctx.url}`);
  lines.push('شكراً.');
  return lines.join('\n');
}

/**
 * BATCH 3 — §9.2 pipeline entry: returns the message for the same-tab open
 * (`useSmartWhatsApp`). Does NOT open anything itself.
 */
export function sendContactOwnerWhatsApp(
  device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>,
): string {
  return buildContactOwnerMessage(device);
}

/**
 * M1 — Ad Click → WhatsApp (§10): clicking an ad that points to a phone builds a
 * contact message with the available phone data and opens WhatsApp to the owner.
 * Same 6-field contract as the details action bar (name/code/price/city/link).
 */
export function buildAdClickMessage(
  device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>,
): string {
  const ctx = getPhoneActionContext(device);
  const lines = [
    'السلام عليكم،',
    'أود الاستفسار عن الهاتف الذي شاهدت إعلانه:',
    `اسم الهاتف: ${ctx.name}`,
    `الكود: ${ctx.code}`,
  ];
  if (ctx.price != null) lines.push(`السعر: ${ctx.price} دج`);
  if (ctx.city) lines.push(`المدينة: ${ctx.city}`);
  lines.push(`رابط الإعلان: ${ctx.url}`);
  lines.push('شكراً.');
  return lines.join('\n');
}

export function openPhoneAdWhatsApp(
  device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>,
): void {
  openWhatsApp(WHATSAPP_PHONE, buildAdClickMessage(device));
}

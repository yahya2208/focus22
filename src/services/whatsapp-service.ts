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

export function openBuyRequest(params: { brand: string; model: string; variant?: string; condition?: string }): void {
  const message = [
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
  openWhatsApp(WHATSAPP_PHONE, message);
}

export function openSellRequest(params: { brand: string; model: string; variant?: string; condition?: string }): void {
  const message = [
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
  openWhatsApp(WHATSAPP_PHONE, message);
}

export function openExchangeRequest(params: { myBrand: string; myModel: string; myVariant?: string; wantBrand: string; wantModel: string; wantVariant?: string }): void {
  const message = [
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
  openWhatsApp(WHATSAPP_PHONE, message);
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

export function openModelNotFoundRequest(brand: string, model: string): void {
  const message = [
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
  openWhatsApp(WHATSAPP_PHONE, message);
}

/**
 * ── Phase 3B §9.1 — Phone action WhatsApp templates (v5, uniform 6 fields) ─────
 * Every message auto-fills: اسم الهاتف · الكود · السعر · المدينة · رابط الإعلان ·
 * نوع الطلب. The user types nothing. `بيع` is intentionally NOT part of the
 * details action bar (v5 §2); the sell template stays only in CustomerPhoneFlow.
 */
export type PhoneActionId = 'buy' | 'exchange' | 'installment' | 'inquiry';

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

const PHONE_ACTION_OPENERS: Record<PhoneActionId, string> = {
  buy: 'أود شراء الهاتف التالي:',
  exchange: 'أود استبدال هاتفي بهذا الجهاز:',
  installment: 'أود الاستفسار عن إمكانية التقسيط لهذا الهاتف:',
  inquiry: 'أود الاستفسار عن هذا الهاتف:',
};

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

export function buildPhoneActionMessage(action: PhoneActionId, device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>): string {
  const ctx = getPhoneActionContext(device);
  const lines = [
    'السلام عليكم،',
    PHONE_ACTION_OPENERS[action],
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
 * §9.2 pipeline entry: returns the message for the same-tab open
 * (`useSmartWhatsApp`). Does NOT open anything itself.
 */
export function sendPhoneActionWhatsApp(
  action: PhoneActionId,
  device: Pick<InventoryRecord, 'id' | 'brand' | 'model' | 'variant' | 'sellPrice' | 'city' | 'code'>,
): string {
  return buildPhoneActionMessage(action, device);
}

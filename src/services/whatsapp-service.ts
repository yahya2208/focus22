import { getGlobalTelemetry } from '../core/telemetry';
import { EventTypes } from '../core/analytics/events';

export const WHATSAPP_PHONE = '+213551148943';

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

export function openWhatsApp(phone: string, message: string, analyticsEvent?: string): void {
  const url = buildWhatsAppUrl(phone, message);
  if (analyticsEvent) {
    getGlobalTelemetry().track(analyticsEvent as any, { phone: formatPhone(phone), has_message: true });
  }
  window.location.href = url;
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
  openWhatsApp(WHATSAPP_PHONE, message, EventTypes.BUY_FLOW_STARTED);
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
  openWhatsApp(WHATSAPP_PHONE, message, EventTypes.SELL_FLOW_STARTED);
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
  openWhatsApp(WHATSAPP_PHONE, message, EventTypes.EXCHANGE_FLOW_STARTED);
}

export function openRepairRequest(params: { brand: string; model: string; issue: string; description?: string; location?: string; code: string }): void {
  const message = [
    'السلام عليكم.',
    '',
    'أرغب في إصلاح الهاتف التالي.',
    '',
    `📱 الهاتف:`,
    `${params.brand} ${params.model}`,
    `🔧 العطل: ${params.issue}`,
    params.description ? `الوصف: ${params.description}` : '',
    params.location ? `📍 الموقع: ${params.location}` : '',
    '',
    `🆔 رقم الطلب: ${params.code}`,
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
  openWhatsApp(WHATSAPP_PHONE, message, 'repair_requested');
}

export function openRepairStatus(params: { brand: string; model: string; status: string; code: string }): void {
  const message = [
    'السلام عليكم.',
    '',
    `حالة طلب التصليح رقم ${params.code}:`,
    '',
    `📱 الهاتف: ${params.brand} ${params.model}`,
    `📌 الحالة: ${params.status}`,
    '',
    'شكراً.',
  ].filter(Boolean).join('\n');
  openWhatsApp(WHATSAPP_PHONE, message, 'repair_status_notification');
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

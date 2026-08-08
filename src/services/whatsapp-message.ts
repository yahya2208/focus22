import type { InventoryRecord } from './inventory-service';
import {
  openBuyRequest, openSellRequest, openExchangeRequest,
  openCustomMessage, WHATSAPP_PHONE,
} from './whatsapp-service';

export type CustomerAction = 'buy' | 'sell' | 'exchange';
export type WhatsAppAction = 'buy' | 'sell' | 'exchange' | 'inquiry' | 'stock_check' | 'price_check';
export type WhatsAppTemplateId = WhatsAppAction;

export interface WhatsAppTemplate {
  id: WhatsAppTemplateId;
  labelAr: string;
  labelFr: string;
  emoji: string;
  generateMessage: (params: MessageParams) => string;
}

export interface MessageParams {
  brand: string;
  model: string;
  variant?: string;
  targetDevice?: { brand: string; model: string; variant?: string };
  customerName?: string;
  shopName?: string;
  quantity?: number;
  price?: number;
}

export const DEFAULT_WHATSAPP_PHONE = WHATSAPP_PHONE;

function interpolate(template: string, params: MessageParams): string {
  return template.replace(/\{(\w+)\}/g, (_match: string, key: string) => {
    const value = (params as unknown as Record<string, unknown>)[key];
    return value != null ? String(value) : '';
  });
}

function createTemplate(
  id: WhatsAppTemplateId,
  labelAr: string,
  labelFr: string,
  emoji: string,
  messageTemplate: string,
): WhatsAppTemplate {
  return {
    id,
    labelAr,
    labelFr,
    emoji,
    generateMessage: (params: MessageParams) => interpolate(messageTemplate, params),
  };
}

export const WHATSAPP_TEMPLATES: WhatsAppTemplate[] = [
  createTemplate(
    'buy',
    'شراء',
    'Achat',
    '🛒',
    'مرحباً {customerName}، أريد شراء {brand} {model} ({variant}). هل يتوفر؟ السعر: {price} د.ج',
  ),
  createTemplate(
    'sell',
    'بيع',
    'Vente',
    '💰',
    'مرحباً، أريد بيع {brand} {model} ({variant}). الرجاء إرسال العرض.',
  ),
  createTemplate(
    'exchange',
    'استبدال',
    'Échange',
    '🔄',
    'مرحباً، أريد استبدال {brand} {model} ({variant}) بـ {targetDevice.brand} {targetDevice.model} ({targetDevice.variant}).',
  ),
  createTemplate(
    'inquiry',
    'استفسار',
    'Renseignement',
    '❓',
    'مرحباً، لدي استفسار عن {brand} {model} ({variant}).',
  ),
  createTemplate(
    'stock_check',
    'طلب توفر',
    'Disponibilité',
    '📦',
    'مرحباً، هل {brand} {model} ({variant}) متوفر؟',
  ),
  createTemplate(
    'price_check',
    'طلب سعر',
    'Demande de prix',
    '💵',
    'مرحباً، كم سعر {brand} {model} ({variant})؟',
  ),
];

function formatPhone(phone: string): string {
  const cleaned = phone.replace(/[^0-9]/g, '');
  if (cleaned.startsWith('0')) return '213' + cleaned.slice(1);
  if (cleaned.startsWith('+')) return cleaned.slice(1);
  return cleaned;
}

export function generateMessage(templateId: WhatsAppTemplateId, params: MessageParams): string;
export function generateMessage(
  model: string,
  brand: string,
  variant: string,
  action: WhatsAppAction,
  targetDevice?: { brand: string; model: string; variant?: string },
): string;

export function generateMessage(
  modelOrTemplate: string | WhatsAppTemplateId,
  brandOrParams?: string | MessageParams,
  variant?: string,
  action?: WhatsAppAction,
  targetDevice?: { brand: string; model: string; variant?: string },
): string {
  if (brandOrParams && typeof brandOrParams === 'object' && 'brand' in brandOrParams) {
    const template = WHATSAPP_TEMPLATES.find(t => t.id === modelOrTemplate);
    if (!template) {
      throw new Error(`Unknown WhatsApp template: ${modelOrTemplate}`);
    }
    return template.generateMessage(brandOrParams);
  }

  const model = modelOrTemplate as string;
  const brand = brandOrParams as string;
  const act = action as WhatsAppAction;

  return generateMessage(act, {
    model,
    brand,
    variant: variant ?? '',
    targetDevice: targetDevice
      ? { brand: targetDevice.brand, model: targetDevice.model, variant: targetDevice.variant }
      : undefined,
  });
}

export function openWhatsAppWithMessage(phone: string, message: string): void {
  openCustomMessage(phone, message);
}

export function openWhatsAppForAction(
  _phone: string,
  action: CustomerAction,
  params: { brand: string; model: string; variant?: string; condition?: string; targetDevice?: { brand: string; model: string; variant?: string } },
): void {
  switch (action) {
    case 'buy':
      openBuyRequest({ brand: params.brand, model: params.model, variant: params.variant, condition: params.condition });
      break;
    case 'sell':
      openSellRequest({ brand: params.brand, model: params.model, variant: params.variant, condition: params.condition });
      break;
    case 'exchange':
      openExchangeRequest({
        myBrand: params.brand,
        myModel: params.model,
        myVariant: params.variant,
        wantBrand: params.targetDevice?.brand ?? '',
        wantModel: params.targetDevice?.model ?? '',
        wantVariant: params.targetDevice?.variant,
      });
      break;
  }
}

export function generateWhatsAppLink(
  phone: string,
  customerModel: string,
  customerBrand: string,
  customerVariant: string,
  action: WhatsAppAction,
  targetDevice?: InventoryRecord | { brand: string; model: string; variant?: string },
): string {
  const message = generateMessage(action, {
    model: customerModel,
    brand: customerBrand,
    variant: customerVariant,
    targetDevice: targetDevice
      ? { brand: targetDevice.brand, model: targetDevice.model, variant: ('variant' in targetDevice ? targetDevice.variant : undefined) }
      : undefined,
  });
  const formattedPhone = formatPhone(phone);
  return `https://wa.me/${formattedPhone}?text=${encodeURIComponent(message)}`;
}

export function generateShareLink(
  phone: string,
  brand: string,
  model: string,
  variant: string,
  storeName = 'المتجر',
): string {
  const message = [
    `📱 ${brand} ${model}`,
    `💾 ${variant}`,
    '',
    `🏪 ${storeName}`,
  ].join('\n');

  return `https://wa.me/${formatPhone(phone)}?text=${encodeURIComponent(message)}`;
}

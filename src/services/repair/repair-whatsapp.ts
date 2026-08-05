import type { RepairRequest } from './repair-types';
import { openRepairRequest, openCustomMessage, WHATSAPP_PHONE } from '../whatsapp-service';

export function sendRepairRequestWhatsApp(request: RepairRequest): void {
  openRepairRequest({
    brand: request.brandName,
    model: request.modelName,
    issue: request.issue,
    description: request.description || undefined,
    location: request.googleMapsLink || undefined,
    condition: request.condition || undefined,
    customerPhone: request.customerPhone || undefined,
    code: request.repairCode,
  });
}

export function sendStatusWhatsApp(request: RepairRequest): void {
  const message = [
    'السلام عليكم.',
    '',
    `حالة طلب التصليح رقم ${request.repairCode}:`,
    '',
    `📱 الهاتف: ${request.brandName} ${request.modelName}`,
    `📌 الحالة: ${request.status}`,
    '',
    'شكراً.',
  ].join('\n');
  openCustomMessage(WHATSAPP_PHONE, message);
}

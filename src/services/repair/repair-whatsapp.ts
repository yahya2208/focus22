import type { RepairRequest } from './repair-types';
import { openRepairRequest } from '../whatsapp-service';

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

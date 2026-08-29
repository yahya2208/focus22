/**
 * Arabic label resolution for listing presenter i18n keys.
 *
 * The P8.1 presenter contract carries `labelKey` strings; the admin screens
 * (like every sibling inventory screen) render hardcoded Arabic rather than
 * going through the global t() dictionaries. This resolver keeps that local
 * convention WITHOUT scattering category display logic across components:
 * keys live in the presenters, their Arabic rendering lives here — one
 * place. An unknown key renders AS the key itself (visible gap, never a
 * silent blank).
 */

const AR: Record<string, string> = {
  'listings.price.sale': 'للبيع',
  'listings.price.monthly': 'إيجار شهري',

  'listings.car.trim': 'الطراز',
  'listings.car.year': 'السنة',
  'listings.car.mileageKm': 'الممشى',
  'listings.car.fuel': 'الوقود',
  'listings.car.transmission': 'ناقل الحركة',
  'listings.car.bodyType': 'الهيكل',
  'listings.car.engineCc': 'سعة المحرك',
  'listings.car.conditionState': 'الحالة',

  'listings.property.propertyType': 'نوع العقار',
  'listings.property.transactionType': 'نوع المعاملة',
  'listings.property.district': 'الحي',
  'listings.property.areaM2': 'المساحة',
  'listings.property.bedrooms': 'الغرف',
  'listings.property.bathrooms': 'الحمامات',
  'listings.property.floor': 'الطابق',
  'listings.property.furnished': 'الأثاث',
  'listings.property.conditionState': 'الحالة',

  // P8.7/D3 — phone presenter labels, same house convention as car/property
  // (presenter keys resolve here in Arabic; the four t() dictionaries carry
  // zero listings.* keys by design).
  'listings.phone.variant': 'الإصدار',
  'listings.phone.ram': 'الرام',
  'listings.phone.storage': 'التخزين',
  'listings.phone.batteryHealth': 'صحة البطارية',
  'listings.phone.color': 'اللون',
  'listings.phone.warranty': 'الضمان',
  'listings.phone.condition': 'الحالة',

  // Generic Catalog — produce domain labels
  'listings.produce.unit': 'الوحدة',
  'listings.produce.origin': 'المنشأ',
  'listings.produce.grade': 'الجودة',
  'listings.filters.unit': 'الوحدة',
  'listings.filters.unit.piece': 'قطعة',
  'listings.filters.unit.kg': 'كغ',
  'listings.filters.unit.g': 'غرام',
  'listings.filters.unit.liter': 'لتر',
  'listings.filters.unit.dozen': 'دزينة',
  'listings.filters.unit.bag': 'كيس',
  'listings.filters.grade': 'الجودة',
  'listings.filters.grade.A': 'A',
  'listings.filters.grade.B': 'B',
  'listings.filters.grade.C': 'C',
  'listings.filters.grade.organic': 'عضويات',
};

export function listingLabel(labelKey: string): string {
  return AR[labelKey] ?? labelKey;
}

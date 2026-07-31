/**
 * Data Source tracking — tags every piece of data with its origin.
 * Enables the UI to show "Demo" badges and the Data Quality Engine to audit.
 */

let demoMode = false;

export function isDemoMode(): boolean {
  return demoMode;
}

export function setDemoMode(v: boolean) {
  demoMode = v;
}

export type DataSource = 'live' | 'demo' | 'partial' | 'cached';

export interface SourceTagged<T> {
  data: T;
  source: DataSource;
  capturedAt: string;
}

export function tag<T>(data: T, source: DataSource): SourceTagged<T> {
  return { data, source, capturedAt: new Date().toISOString() };
}

export function guardDemo<T>(data: T, isDemo: boolean): SourceTagged<T> {
  return tag(data, isDemo ? 'demo' : 'live');
}

export function generateId(): string {
  return crypto.randomUUID?.() ?? `id_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export const DEMO_BRANCHES = [
  { id: generateId(), name: 'الفرع الرئيسي', location: 'وسط المدينة', totalVisitors: 0, totalSales: 0, conversionRate: 0, revenue: 0 },
  { id: generateId(), name: 'فرع المطار', location: 'مطار الجزائر', totalVisitors: 0, totalSales: 0, conversionRate: 0, revenue: 0 },
  { id: generateId(), name: 'فرع الجامعة', location: 'جامعة الجزائر', totalVisitors: 0, totalSales: 0, conversionRate: 0, revenue: 0 },
];

export type MetricStatus = 'real' | 'coming-soon';

export type MetricValue = number | string | boolean | null;

export interface Metric {
  readonly value: MetricValue;
  readonly status: MetricStatus;
  readonly source: string | null;
}

export function createMetric(
  value: MetricValue,
  status: MetricStatus,
  source: string | null,
): Metric {
  return { value, status, source };
}

export function displayMetric(m: Metric): string {
  if (m.status === 'coming-soon') return '—';
  if (m.value === null) return '—';
  if (typeof m.value === 'boolean') return m.value ? 'Yes' : 'No';
  return String(m.value);
}

export function realMetric(value: MetricValue, source: string): Metric {
  return createMetric(value, 'real', source);
}

export function comingSoonMetric(): Metric {
  return createMetric(null, 'coming-soon', null);
}

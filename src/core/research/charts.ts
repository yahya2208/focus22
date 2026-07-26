export interface ChartDataPoint {
  readonly label: string;
  readonly value: number;
  readonly color?: string;
}

export interface TimeSeriesPoint {
  readonly timestamp: number;
  readonly value: number;
  readonly label?: string;
}

export interface ScatterPoint {
  readonly x: number;
  readonly y: number;
  readonly label?: string;
  readonly group?: string;
}

export interface HeatmapCell {
  readonly row: string;
  readonly col: string;
  readonly value: number;
}

export interface ChartDimensions {
  readonly width: number;
  readonly height: number;
  readonly padding: { readonly top: number; readonly right: number; readonly bottom: number; readonly left: number };
}

const DEFAULT_DIMS: ChartDimensions = {
  width: 400, height: 250,
  padding: { top: 20, right: 20, bottom: 40, left: 50 },
};

export function computeBarChartLayout(
  data: readonly ChartDataPoint[],
  dims: ChartDimensions = DEFAULT_DIMS,
): { bars: { x: number; y: number; width: number; height: number; color: string; label: string; value: number }[]; maxValue: number; axisLabels: { x: string; y: string }[] } {
  if (data.length === 0) return { bars: [], maxValue: 0, axisLabels: [] };
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartW = dims.width - dims.padding.left - dims.padding.right;
  const chartH = dims.height - dims.padding.top - dims.padding.bottom;
  const barWidth = Math.min(chartW / data.length - 4, 60);
  const bars = data.map((d, i) => ({
    x: dims.padding.left + (chartW / data.length) * i + (chartW / data.length - barWidth) / 2,
    y: dims.padding.top + chartH - (d.value / maxValue) * chartH,
    width: barWidth,
    height: (d.value / maxValue) * chartH,
    color: d.color ?? '#6366f1',
    label: d.label,
    value: d.value,
  }));
  const axisLabels = data.map((d) => ({ x: d.label, y: '' }));
  return { bars, maxValue, axisLabels };
}

export function computeLineChartPath(
  data: readonly TimeSeriesPoint[],
  dims: ChartDimensions = DEFAULT_DIMS,
): { path: string; points: { cx: number; cy: number; value: number; timestamp: number }[]; maxValue: number } {
  if (data.length === 0) return { path: '', points: [], maxValue: 0 };
  const maxValue = Math.max(...data.map((d) => d.value), 1);
  const chartW = dims.width - dims.padding.left - dims.padding.right;
  const chartH = dims.height - dims.padding.top - dims.padding.bottom;
  const step = chartW / Math.max(data.length - 1, 1);

  const points = data.map((d, i) => ({
    cx: dims.padding.left + step * i,
    cy: dims.padding.top + chartH - (d.value / maxValue) * chartH,
    value: d.value,
    timestamp: d.timestamp,
  }));

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.cx} ${p.cy}`).join(' ');
  return { path, points, maxValue };
}

export function computeHistogram(
  values: readonly number[],
  binCount: number = 10,
): ChartDataPoint[] {
  if (values.length === 0) return [];
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (min === max) return [{ label: `${min.toFixed(0)}`, value: values.length }];
  const binSize = (max - min) / binCount;
  const bins: number[] = new Array(binCount).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= binCount) idx = binCount - 1;
    const count = bins[idx];
    if (count !== undefined) bins[idx] = count + 1;
  }
  return bins.map((count, i) => ({
    label: `${(min + i * binSize).toFixed(0)}-${(min + (i + 1) * binSize).toFixed(0)}`,
    value: count,
  }));
}

export function computePieChart(
  data: readonly ChartDataPoint[],
): { slices: { startAngle: number; endAngle: number; color: string; label: string; value: number; percentage: number }[]; total: number } {
  const total = data.reduce((sum, d) => sum + d.value, 0);
  if (total === 0) return { slices: [], total: 0 };
  let currentAngle = -Math.PI / 2;
  const slices = data.map((d) => {
    const angle = (d.value / total) * 2 * Math.PI;
    const slice = {
      startAngle: currentAngle,
      endAngle: currentAngle + angle,
      color: d.color ?? '#6366f1',
      label: d.label,
      value: d.value,
      percentage: (d.value / total) * 100,
    };
    currentAngle += angle;
    return slice;
  });
  return { slices, total };
}

export function computeScatterLayout(
  points: readonly ScatterPoint[],
  dims: ChartDimensions = DEFAULT_DIMS,
): { positioned: { cx: number; cy: number; label: string; group: string }[]; xRange: [number, number]; yRange: [number, number] } {
  if (points.length === 0) return { positioned: [], xRange: [0, 1], yRange: [0, 1] };
  const xMin = Math.min(...points.map((p) => p.x));
  const xMax = Math.max(...points.map((p) => p.x));
  const yMin = Math.min(...points.map((p) => p.y));
  const yMax = Math.max(...points.map((p) => p.y));
  const chartW = dims.width - dims.padding.left - dims.padding.right;
  const chartH = dims.height - dims.padding.top - dims.padding.bottom;
  const xRange: [number, number] = [xMin, xMax || 1];
  const yRange: [number, number] = [yMin, yMax || 1];

  const positioned = points.map((p) => ({
    cx: dims.padding.left + ((p.x - xRange[0]) / (xRange[1] - xRange[0] || 1)) * chartW,
    cy: dims.padding.top + chartH - ((p.y - yRange[0]) / (yRange[1] - yRange[0] || 1)) * chartH,
    label: p.label ?? '',
    group: p.group ?? 'default',
  }));
  return { positioned, xRange, yRange };
}

export function computeHeatmapLayout(
  cells: readonly HeatmapCell[],
): { rows: readonly string[]; cols: readonly string[]; grid: (number | null)[][]; maxValue: number } {
  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = [...new Set(cells.map((c) => c.col))];
  const maxValue = Math.max(...cells.map((c) => c.value), 1);
  const lookup = new Map<string, number>();
  for (const c of cells) lookup.set(`${c.row}|${c.col}`, c.value);
  const grid = rows.map((r) => cols.map((col) => lookup.get(`${r}|${col}`) ?? null));
  return { rows, cols, grid, maxValue };
}

export function computePercentiles(values: readonly number[]): { p50: number; p75: number; p90: number; p95: number; p99: number } {
  if (values.length === 0) return { p50: 0, p75: 0, p90: 0, p95: 0, p99: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const percentile = (p: number) => {
    const idx = Math.ceil(sorted.length * p / 100) - 1;
    return sorted[Math.max(0, idx)] ?? 0;
  };
  return { p50: percentile(50), p75: percentile(75), p90: percentile(90), p95: percentile(95), p99: percentile(99) };
}

export function computeStatistics(values: readonly number[]): {
  mean: number; median: number; stdDev: number; variance: number; min: number; max: number; count: number;
} {
  if (values.length === 0) return { mean: 0, median: 0, stdDev: 0, variance: 0, min: 0, max: 0, count: 0 };
  const n = values.length;
  const mean = values.reduce((s, v) => s + v, 0) / n;
  const sorted = [...values].sort((a, b) => a - b);
  const median = n % 2 === 0 ? (sorted[n / 2 - 1]! + sorted[n / 2]!) / 2 : sorted[Math.floor(n / 2)]!;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / n;
  return { mean, median, stdDev: Math.sqrt(variance), variance, min: sorted[0]!, max: sorted[n - 1]!, count: n };
}

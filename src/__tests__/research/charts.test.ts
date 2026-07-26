import { describe, it, expect } from 'vitest';
import {
  computeBarChartLayout, computeLineChartPath, computeHistogram,
  computePieChart, computeScatterLayout, computeHeatmapLayout,
  computePercentiles, computeStatistics,
} from '../../core/research/charts';

describe('Charts', () => {
  describe('computeBarChartLayout', () => {
    it('returns empty for empty data', () => {
      const r = computeBarChartLayout([]);
      expect(r.bars).toHaveLength(0);
      expect(r.maxValue).toBe(0);
    });

    it('computes bars with correct positions', () => {
      const r = computeBarChartLayout([
        { label: 'A', value: 10 },
        { label: 'B', value: 20 },
      ]);
      expect(r.bars).toHaveLength(2);
      expect(r.maxValue).toBe(20);
      expect(r.bars[0]!.label).toBe('A');
      expect(r.bars[0]!.value).toBe(10);
      expect(r.bars[1]!.label).toBe('B');
      expect(r.bars[1]!.value).toBe(20);
    });

    it('uses custom color', () => {
      const r = computeBarChartLayout([{ label: 'X', value: 5 }]);
      expect(r.bars[0]!.color).toBe('#6366f1');
    });
  });

  describe('computeLineChartPath', () => {
    it('returns empty for empty data', () => {
      const r = computeLineChartPath([]);
      expect(r.path).toBe('');
      expect(r.points).toHaveLength(0);
    });

    it('generates SVG path', () => {
      const r = computeLineChartPath([
        { timestamp: 1, value: 10 },
        { timestamp: 2, value: 20 },
        { timestamp: 3, value: 15 },
      ]);
      expect(r.path).toContain('M');
      expect(r.path).toContain('L');
      expect(r.points).toHaveLength(3);
      expect(r.maxValue).toBe(20);
    });
  });

  describe('computeHistogram', () => {
    it('returns empty for empty values', () => {
      expect(computeHistogram([])).toEqual([]);
    });

    it('creates bins for data', () => {
      const r = computeHistogram([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5);
      expect(r.length).toBe(5);
      const total = r.reduce((s, b) => s + b.value, 0);
      expect(total).toBe(10);
    });

    it('handles identical values', () => {
      const r = computeHistogram([5, 5, 5], 5);
      expect(r).toHaveLength(1);
      expect(r[0]!.value).toBe(3);
    });
  });

  describe('computePieChart', () => {
    it('returns empty for empty data', () => {
      const r = computePieChart([]);
      expect(r.slices).toHaveLength(0);
      expect(r.total).toBe(0);
    });

    it('computes slices with percentages', () => {
      const r = computePieChart([
        { label: 'A', value: 30 },
        { label: 'B', value: 70 },
      ]);
      expect(r.total).toBe(100);
      expect(r.slices).toHaveLength(2);
      expect(r.slices[0]!.percentage).toBeCloseTo(30);
      expect(r.slices[1]!.percentage).toBeCloseTo(70);
    });
  });

  describe('computeScatterLayout', () => {
    it('returns empty for empty points', () => {
      const r = computeScatterLayout([]);
      expect(r.positioned).toHaveLength(0);
    });

    it('positions points in chart area', () => {
      const r = computeScatterLayout([
        { x: 0, y: 0 },
        { x: 100, y: 100 },
      ]);
      expect(r.positioned).toHaveLength(2);
      expect(r.xRange).toEqual([0, 100]);
      expect(r.yRange).toEqual([0, 100]);
    });
  });

  describe('computeHeatmapLayout', () => {
    it('builds grid from cells', () => {
      const r = computeHeatmapLayout([
        { row: 'R1', col: 'C1', value: 1 },
        { row: 'R1', col: 'C2', value: 2 },
        { row: 'R2', col: 'C1', value: 3 },
      ]);
      expect(r.rows).toEqual(['R1', 'R2']);
      expect(r.cols).toEqual(['C1', 'C2']);
      expect(r.grid.length).toBe(2);
      expect(r.grid[0]![0]).toBe(1);
      expect(r.grid[0]![1]).toBe(2);
      expect(r.grid[1]![0]).toBe(3);
      expect(r.maxValue).toBe(3);
    });
  });

  describe('computePercentiles', () => {
    it('returns zeros for empty values', () => {
      const r = computePercentiles([]);
      expect(r.p50).toBe(0);
      expect(r.p99).toBe(0);
    });

    it('computes percentiles correctly', () => {
      const values = Array.from({ length: 100 }, (_, i) => i + 1);
      const r = computePercentiles(values);
      expect(r.p50).toBeGreaterThanOrEqual(49);
      expect(r.p50).toBeLessThanOrEqual(51);
      expect(r.p99).toBeGreaterThanOrEqual(98);
    });
  });

  describe('computeStatistics', () => {
    it('returns zeros for empty values', () => {
      const r = computeStatistics([]);
      expect(r.count).toBe(0);
      expect(r.mean).toBe(0);
    });

    it('computes mean, median, stdDev', () => {
      const r = computeStatistics([2, 4, 4, 4, 5, 5, 7, 9]);
      expect(r.mean).toBeCloseTo(5);
      expect(r.median).toBeCloseTo(4.5);
      expect(r.stdDev).toBeGreaterThan(0);
      expect(r.min).toBe(2);
      expect(r.max).toBe(9);
      expect(r.count).toBe(8);
    });
  });
});

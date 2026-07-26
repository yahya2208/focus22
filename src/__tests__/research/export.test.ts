import { describe, it, expect } from 'vitest';
import {
  exportToCsv, exportToJson, exportScientificDataset,
  exportAggregatedDataset, exportAnonymousDataset, createExportService,
} from '../../core/research/export';

describe('Export', () => {
  describe('exportToCsv', () => {
    it('produces CSV from records', () => {
      const data = [
        { name: 'Alice', score: 100 },
        { name: 'Bob', score: 200 },
      ];
      const r = exportToCsv(data, { anonymize: false });
      expect(r.format).toBe('csv');
      expect(r.rowCount).toBe(2);
      expect(r.data).toContain('name,score');
      expect(r.data).toContain('Alice,100');
      expect(r.data).toContain('Bob,200');
      expect(r.mimeType).toBe('text/csv');
    });

    it('returns empty for no data', () => {
      const r = exportToCsv([], { anonymize: false });
      expect(r.rowCount).toBe(0);
      expect(r.data).toBe('');
    });

    it('escapes CSV fields with commas', () => {
      const data = [{ field: 'a,b' }];
      const r = exportToCsv(data, { anonymize: false });
      expect(r.data).toContain('"a,b"');
    });

    it('anonymizes personal data when requested', () => {
      const data = [{ id: 'user123', email: 'test@example.com', score: 50 }];
      const r = exportToCsv(data, { anonymize: true });
      expect(r.data).toContain('[REDACTED]');
      expect(r.anonymized).toBe(true);
    });
  });

  describe('exportToJson', () => {
    it('produces JSON from records', () => {
      const data = [{ x: 1 }, { x: 2 }];
      const r = exportToJson(data, { anonymize: false });
      expect(r.format).toBe('json');
      expect(r.rowCount).toBe(2);
      expect(r.mimeType).toBe('application/json');
      const parsed = JSON.parse(r.data) as unknown[];
      expect(parsed).toHaveLength(2);
    });
  });

  describe('exportScientificDataset', () => {
    it('exports scientific results', () => {
      const sessions = [
        {
          id: 's1',
          measurements: { correctedRts: [100, 200, 300] },
          scientificResults: {
            meanCorrectedMs: 200,
            medianCorrectedMs: 200,
            consistencyScore: 0.8,
            fatigueScore: 0.2,
            focusScore: 75,
            grade: 'B',
          },
          metadata: { os: 'Windows' },
        },
      ];
      const r = exportScientificDataset(sessions, { anonymize: false });
      expect(r.format).toBe('scientific');
      expect(r.rowCount).toBe(1);
      const parsed = JSON.parse(r.data) as Record<string, unknown>[];
      expect(parsed[0]!.sessionId).toBe('s1');
      expect(parsed[0]!.meanCorrectedMs).toBe(200);
      expect(parsed[0]!.rtCount).toBe(3);
    });

    it('handles null scientific results', () => {
      const sessions = [
        { id: 's2', measurements: null, scientificResults: null, metadata: {} },
      ];
      const r = exportScientificDataset(sessions, { anonymize: false });
      const parsed = JSON.parse(r.data) as Record<string, unknown>[];
      expect(parsed[0]!.meanCorrectedMs).toBeNull();
    });
  });

  describe('exportAggregatedDataset', () => {
    it('exports stats as JSON array', () => {
      const r = exportAggregatedDataset({ avg: 50, count: 100 });
      const parsed = JSON.parse(r.data) as Record<string, unknown>[];
      expect(parsed).toHaveLength(1);
      expect(parsed[0]!.avg).toBe(50);
    });
  });

  describe('exportAnonymousDataset', () => {
    it('redacts sensitive fields', () => {
      const data = [
        { id: 'user123456', email: 'test@test.com', ip: '1.2.3.4', score: 10 },
      ];
      const r = exportAnonymousDataset(data);
      const parsed = JSON.parse(r.data) as Record<string, unknown>[];
      expect(parsed[0]!.email).toBe('[REDACTED]');
      expect(parsed[0]!.ip).toBe('[REDACTED]');
      expect(parsed[0]!.score).toBe(10);
      expect(String(parsed[0]!.id)).toContain('anon_');
    });

    it('preserves non-sensitive fields', () => {
      const data = [{ id: 'x', displayName: 'Alice', score: 42 }];
      const r = exportAnonymousDataset(data);
      const parsed = JSON.parse(r.data) as Record<string, unknown>[];
      expect(parsed[0]!.displayName).toBe('[REDACTED]');
      expect(parsed[0]!.score).toBe(42);
    });
  });

  describe('ExportService', () => {
    it('exports sessions as CSV or JSON', () => {
      const svc = createExportService();
      const data = [{ a: 1 }];
      const csv = svc.exportSessions(data, 'csv');
      expect(csv.format).toBe('csv');
      const json = svc.exportSessions(data, 'json');
      expect(json.format).toBe('json');
    });

    it('exports scientific', () => {
      const svc = createExportService();
      const sessions = [
        { id: 's1', measurements: null, scientificResults: null, metadata: {} },
      ];
      const r = svc.exportScientific(sessions);
      expect(r.format).toBe('scientific');
    });

    it('exports anonymous', () => {
      const svc = createExportService();
      const r = svc.exportAnonymous([{ id: 'abc', secret: 'hidden' }]);
      expect(r.format).toBe('anonymous');
    });

    it('filters by consent', () => {
      const svc = createExportService();
      const data = [
        { userId: 'u1', score: 10 },
        { userId: 'u2', score: 20 },
        { score: 30 },
      ];
      const consentCheck = (userId: string) => userId !== 'u2';
      const filtered = svc.filterByConsent(data, consentCheck);
      expect(filtered).toHaveLength(2);
      expect((filtered[0] as { userId: string }).userId).toBe('u1');
      expect((filtered[1] as { score: number }).score).toBe(30);
    });
  });
});

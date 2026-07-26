export type ExportFormat = 'csv' | 'json' | 'scientific' | 'aggregated' | 'anonymous';

export interface ExportOptions {
  readonly format: ExportFormat;
  readonly includePersonalData: boolean;
  readonly anonymize: boolean;
  readonly respectConsent: boolean;
  readonly filterApplied: boolean;
  readonly filename?: string;
}

export interface ExportResult {
  readonly data: string;
  readonly format: ExportFormat;
  readonly filename: string;
  readonly mimeType: string;
  readonly rowCount: number;
  readonly exportedAt: number;
  readonly anonymized: boolean;
}

function toCsvRow(values: readonly unknown[]): string {
  return values.map((v) => {
    const s = String(v ?? '');
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  }).join(',');
}

function anonymizeValue(value: unknown, field: string): unknown {
  if (field === 'email' || field === 'ip' || field === 'userAgent') return '[REDACTED]';
  if (field === 'id' || field === 'userId') return `anon_${String(value).slice(0, 4)}***`;
  return value;
}

function anonymizeRecord(record: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) {
    result[key] = anonymizeValue(value, key);
  }
  return result;
}

export function exportToCsv(
  data: readonly Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts: ExportOptions = {
    format: 'csv',
    includePersonalData: false,
    anonymize: true,
    respectConsent: true,
    filterApplied: false,
    ...options,
  };

  let rows = data;
  if (opts.anonymize) rows = rows.map(anonymizeRecord);

  const headers = rows.length > 0 ? Object.keys(rows[0]!) : [];
  const csv = [
    toCsvRow(headers),
    ...rows.map((r) => toCsvRow(headers.map((h) => r[h]))),
  ].join('\n');

  return {
    data: csv,
    format: 'csv',
    filename: opts.filename ?? `export-${Date.now()}.csv`,
    mimeType: 'text/csv',
    rowCount: rows.length,
    exportedAt: Date.now(),
    anonymized: opts.anonymize,
  };
}

export function exportToJson(
  data: readonly Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const opts: ExportOptions = {
    format: 'json',
    includePersonalData: false,
    anonymize: true,
    respectConsent: true,
    filterApplied: false,
    ...options,
  };

  let rows = data;
  if (opts.anonymize) rows = rows.map(anonymizeRecord);

  return {
    data: JSON.stringify(rows, null, 2),
    format: opts.format,
    filename: opts.filename ?? `export-${Date.now()}.json`,
    mimeType: 'application/json',
    rowCount: rows.length,
    exportedAt: Date.now(),
    anonymized: opts.anonymize,
  };
}

export function exportScientificDataset(
  sessions: readonly { id: string; measurements: { correctedRts: readonly number[] } | null; scientificResults: { meanCorrectedMs: number; medianCorrectedMs: number; consistencyScore: number; fatigueScore: number; focusScore: number; grade: string } | null; metadata: Record<string, unknown> }[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const records = sessions.map((s) => ({
    sessionId: s.id,
    meanCorrectedMs: s.scientificResults?.meanCorrectedMs ?? null,
    medianCorrectedMs: s.scientificResults?.medianCorrectedMs ?? null,
    consistencyScore: s.scientificResults?.consistencyScore ?? null,
    fatigueScore: s.scientificResults?.fatigueScore ?? null,
    focusScore: s.scientificResults?.focusScore ?? null,
    grade: s.scientificResults?.grade ?? null,
    rtCount: s.measurements?.correctedRts.length ?? 0,
    ...s.metadata,
  }));

  return exportToJson(records, { ...options, format: 'scientific' });
}

export function exportAggregatedDataset(
  stats: Record<string, unknown>,
  options: Partial<ExportOptions> = {},
): ExportResult {
  return exportToJson([stats], { ...options, format: 'aggregated' });
}

export function exportAnonymousDataset(
  data: readonly Record<string, unknown>[],
  options: Partial<ExportOptions> = {},
): ExportResult {
  const REDACTED_FIELDS = ['email', 'ip', 'userAgent', 'displayName', 'phoneNumber'];
  const anonymized = data.map((record) => {
    const result = { ...record };
    for (const field of REDACTED_FIELDS) {
      if (field in result) {
        (result as Record<string, unknown>)[field] = '[REDACTED]';
      }
    }
    if ('id' in result) {
      (result as Record<string, unknown>).id = `anon_${String(result.id).slice(0, 8)}`;
    }
    return result;
  });

  return exportToJson(anonymized, { ...options, format: 'anonymous', anonymize: false });
}

export interface ExportService {
  exportSessions(data: readonly Record<string, unknown>[], format: ExportFormat): ExportResult;
  exportScientific(sessions: readonly { id: string; measurements: { correctedRts: readonly number[] } | null; scientificResults: { meanCorrectedMs: number; medianCorrectedMs: number; consistencyScore: number; fatigueScore: number; focusScore: number; grade: string } | null; metadata: Record<string, unknown> }[]): ExportResult;
  exportAnonymous(data: readonly Record<string, unknown>[]): ExportResult;
  filterByConsent<T extends { userId?: string }>(
    data: readonly T[],
    consentCheck: (userId: string) => boolean,
  ): readonly T[];
}

export function createExportService(): ExportService {
  return {
    exportSessions(data, format) {
      if (format === 'csv') return exportToCsv(data);
      return exportToJson(data);
    },

    exportScientific(sessions) {
      return exportScientificDataset(sessions);
    },

    exportAnonymous(data) {
      return exportAnonymousDataset(data);
    },

    filterByConsent(data, consentCheck) {
      return data.filter((item) => {
        if (!item.userId) return true;
        return consentCheck(item.userId);
      });
    },
  };
}

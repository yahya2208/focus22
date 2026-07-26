export interface ConsentVersion {
  readonly version: string;
  readonly effectiveDate: number;
}

export const CURRENT_CONSENT_VERSION: ConsentVersion = {
  version: '1.0.0',
  effectiveDate: Date.now(),
};

export interface ConsentRecord {
  readonly userId: string;
  readonly version: string;
  readonly granted: boolean;
  readonly timestamp: number;
  readonly ipAddress?: string;
}

export interface ConsentService {
  record(userId: string, granted: boolean): ConsentRecord;
  hasConsented(userId: string): boolean;
  getRecord(userId: string): ConsentRecord | null;
  withdraw(userId: string): void;
  getCurrentVersion(): ConsentVersion;
}

export function createConsentService(): ConsentService {
  const records = new Map<string, ConsentRecord>();

  return {
    record(userId: string, granted: boolean): ConsentRecord {
      const consent: ConsentRecord = {
        userId,
        version: CURRENT_CONSENT_VERSION.version,
        granted,
        timestamp: Date.now(),
      };
      records.set(userId, consent);
      return consent;
    },

    hasConsented(userId: string): boolean {
      const record = records.get(userId);
      return record?.granted === true;
    },

    getRecord(userId: string): ConsentRecord | null {
      return records.get(userId) ?? null;
    },

    withdraw(userId: string): void {
      const existing = records.get(userId);
      if (existing) {
        records.set(userId, { ...existing, granted: false, timestamp: Date.now() });
      }
    },

    getCurrentVersion(): ConsentVersion {
      return CURRENT_CONSENT_VERSION;
    },
  };
}

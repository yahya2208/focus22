import { useCallback, useEffect, useRef, useState } from 'react';
import { adminFamilyLedger, type FamilyLedgerEntry } from '../../../../services/pilot-account-service';

/**
 * Shared family ledger read (G2.2) — the ONE owner of ledger state.
 *
 * Both the Families page (G2.1, approved) and the independent Finance page
 * (G2.2) read through this hook, so there is exactly one fetch path and no
 * competing state ownership.
 *
 * Money rule: this hook NEVER computes a balance. `SUM(ledger.amount)` remains
 * the single balance source of truth and arrives from
 * `pilot_admin_list_family_members`; `entries[].balance_after` is returned but
 * is an AUDIT SNAPSHOT only (00100:13-14) and is labeled as such by callers.
 *
 * Failure rule (STOP-1): a failed read sets `error` and KEEPS the previous
 * entries. It never converts a transport/server failure into an empty ledger,
 * because "unavailable" and "no movements" are different facts.
 */
export interface FamilyLedgerState {
  readonly entries: readonly FamilyLedgerEntry[];
  readonly loading: boolean;
  /** Non-null when the last read failed; callers must render an explicit state. */
  readonly error: string | null;
  /** Re-read the current family (call after a financial write). */
  readonly refresh: () => Promise<void>;
}

export function useFamilyLedger(familyId: string, limit = 50): FamilyLedgerState {
  const [entries, setEntries] = useState<FamilyLedgerEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards a slow response for a previously selected family.
  const requestSeq = useRef(0);

  const refresh = useCallback(async () => {
    if (!familyId) return;
    const seq = ++requestSeq.current;
    setLoading(true);
    try {
      const rows = await adminFamilyLedger(familyId, limit);
      if (seq !== requestSeq.current) return;
      setEntries(rows);
      setError(null);
    } catch {
      if (seq !== requestSeq.current) return;
      // Keep the last known rows: an error is never rendered as an empty ledger.
      setError('LEDGER_UNAVAILABLE');
    } finally {
      if (seq === requestSeq.current) setLoading(false);
    }
  }, [familyId, limit]);

  useEffect(() => {
    if (!familyId) {
      requestSeq.current += 1;
      setEntries([]);
      setError(null);
      setLoading(false);
      return;
    }
    // A new selection starts from a clean slate and an explicit loading state;
    // the previous family's rows are never shown against the new family.
    setEntries([]);
    setError(null);
    void refresh();
  }, [familyId, refresh]);

  return { entries, loading, error, refresh };
}

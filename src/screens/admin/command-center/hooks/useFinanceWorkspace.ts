import { useCallback, useMemo, useState } from 'react';
import type { FamilyLedgerEntry, PilotFamilyMember } from '../../../../services/pilot-account-service';
import type { FamilyGroup } from '../../../../services/neighborhood-service';
import type { FamilyWorkspace } from './useFamilyWorkspace';

/** Ledger transaction types allowed by the schema CHECK (00100:96-97). */
export const LEDGER_TYPES = ['CASH_DEPOSIT', 'PURCHASE', 'REFUND', 'REVERSAL'] as const;
export type LedgerType = (typeof LEDGER_TYPES)[number] | 'ALL';

export interface FamilyBalanceRow {
  readonly family: FamilyGroup;
  /**
   * Server-computed SUM(ledger.amount) for this family, or null when no active
   * member row exists for it. NEVER 0 as a substitute: a family with no members
   * has no admin balance read at all (pilot_admin_list_family_members inner-joins
   * family_members), so 0.00 would be an invented financial figure.
   */
  readonly balance: number | null;
  readonly memberCount: number;
  readonly activeMemberCount: number;
}

/**
 * Finance view model (G2.2).
 *
 * Owns PRESENTATION state only — search text, the ledger type filter, and the
 * derived rows/totals. It performs ZERO fetching: every datum comes from the
 * shared family workspace, so Finance adds no queries of its own and never
 * depends on the operator having visited Families first.
 *
 * Money rule: no arithmetic is invented here. `balance` is passed through from
 * the server (SUM(ledger.amount) per family) exactly once per family; the total
 * is a sum of those per-family values, never of per-member rows.
 */
export function useFinanceWorkspace({ workspace }: { workspace: FamilyWorkspace }) {
  const [query, setQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState<LedgerType>('ALL');

  // One row per family, balance deduplicated across its member rows. Mirrors the
  // G1 home rule so both surfaces always show the same figure for a family.
  const rows = useMemo<FamilyBalanceRow[]>(() => {
    const byFamily = new Map<string, PilotFamilyMember[]>();
    for (const m of workspace.allMembers) {
      const list = byFamily.get(m.family_id);
      if (list) list.push(m);
      else byFamily.set(m.family_id, [m]);
    }
    return workspace.families.map((family) => {
      const members = byFamily.get(family.id) ?? [];
      const active = members.filter((m) => m.status === 'active');
      const source = active[0] ?? null;
      return {
        family,
        balance: source ? Number(source.balance) || 0 : null,
        memberCount: members.length,
        activeMemberCount: active.length,
      };
    });
  }, [workspace.families, workspace.allMembers]);

  const visibleRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    const filtered = q
      ? rows.filter(
          (r) =>
            r.family.name.toLowerCase().includes(q) ||
            r.family.slug.toLowerCase().includes(q) ||
            (r.family.name_ar ?? '').toLowerCase().includes(q),
        )
      : rows;
    // Highest balance first; families without a balance read sit last.
    return [...filtered].sort((a, b) => {
      if (a.balance === null && b.balance === null) return a.family.name.localeCompare(b.family.name);
      if (a.balance === null) return 1;
      if (b.balance === null) return -1;
      return b.balance - a.balance;
    });
  }, [rows, query]);

  /**
   * Total across families that HAVE a server-computed balance. Families without
   * one are excluded rather than counted as zero, and the caller states how many
   * were excluded so the figure is never presented as a complete total.
   */
  const totals = useMemo(() => {
    let sum = 0;
    let withBalance = 0;
    let withoutBalance = 0;
    for (const r of rows) {
      if (r.balance === null) {
        withoutBalance += 1;
        continue;
      }
      sum += r.balance;
      withBalance += 1;
    }
    return { sum, withBalance, withoutBalance, familyCount: rows.length };
  }, [rows]);

  const selectedFamily = useMemo(
    () => workspace.families.find((f) => f.id === workspace.selectedFamilyId) ?? null,
    [workspace.families, workspace.selectedFamilyId],
  );

  // Type filtering is pure presentation over rows already in memory: changing
  // the filter must never issue a request.
  const visibleEntries = useMemo<readonly FamilyLedgerEntry[]>(() => {
    if (typeFilter === 'ALL') return workspace.familyLedger;
    return workspace.familyLedger.filter((e) => e.transaction_type === typeFilter);
  }, [workspace.familyLedger, typeFilter]);

  const selectFamily = useCallback(
    (familyId: string) => {
      workspace.selectFamily(familyId);
    },
    [workspace],
  );

  return {
    query,
    setQuery,
    typeFilter,
    setTypeFilter,
    rows,
    visibleRows,
    totals,
    selectedFamily,
    selectFamily,
    visibleEntries,
    depositAmount: workspace.depositAmount,
    setDepositAmount: workspace.setDepositAmount,
    depositNote: workspace.depositNote,
    setDepositNote: workspace.setDepositNote,
    depositing: workspace.depositing,
    submitDeposit: workspace.submitDeposit,
  };
}

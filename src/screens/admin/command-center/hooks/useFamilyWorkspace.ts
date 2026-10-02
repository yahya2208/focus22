import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from '../../../../hooks/useTranslation';
import { adminListFamilies, adminFindUsers, type FamilyGroup, type AdminUserLookup } from '../../../../services/neighborhood-service';
import { useFamilyLedger } from './useFamilyLedger';
import {
  adminListFamilyMembers,
  adminDeposit,
  adminProvisionFamilyMember,
  adminUpsertFamily,
  adminFamilyPreferences,
  type PilotFamilyMember,
  type AdminFamilyPreferences,
} from '../../../../services/pilot-account-service';
import {
  adminListInvitations,
  sendFamilyInvitation,
  resendFamilyInvitation,
  messageKeyFor,
  successMessageKeyFor,
  toInviteOutcome,
  type InvitationRow,
} from '../../../../services/pilot-invite-service';

export interface FamilyMovePending {
  userId: string;
  email: string;
  fromFamilyId: string;
  fromFamilyName: string;
  toFamilyId: string;
}

export interface FamilyWorkspaceOptions {
  storeId: string;
}

/**
 * Family domain workspace (G2.1): the complete families/finance-reads/
 * provision/move-guard/family-invite state machine, extracted verbatim from
 * PilotOpsAdminScreen (no behavior change). Single source of truth: the legacy
 * staff UI and the independent AdminFamilies section both read from here.
 * Family message/error surfaces are owned here so every host renders the
 * same values; all writes go through the existing admin RPCs.
 */
export function useFamilyWorkspace({ storeId }: FamilyWorkspaceOptions) {
  const { locale } = useTranslation();
  const name = useCallback(
    (en: string, ar: string) => (locale === 'ar' && ar ? ar : en),
    [locale],
  );

  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [families, setFamilies] = useState<FamilyGroup[]>([]);
  const [selectedFamilyId, setSelectedFamilyId] = useState('');
  const [allFamilyMembers, setAllFamilyMembers] = useState<PilotFamilyMember[]>([]);
  const [familyPrefs, setFamilyPrefs] = useState<AdminFamilyPreferences | null>(null);
  const [prefsError, setPrefsError] = useState<string | null>(null);
  const [familyLoading, setFamilyLoading] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositNote, setDepositNote] = useState('');
  const [depositing, setDepositing] = useState(false);
  const [familyEmail, setFamilyEmail] = useState('');
  const [familyUserResults, setFamilyUserResults] = useState<AdminUserLookup[]>([]);
  const [familySearching, setFamilySearching] = useState(false);
  const [bindingUserId, setBindingUserId] = useState<string | null>(null);
  const [pendingMove, setPendingMove] = useState<FamilyMovePending | null>(null);
  const [invitations, setInvitations] = useState<InvitationRow[]>([]);
  const [familyInviteEmail, setFamilyInviteEmail] = useState('');
  const [familyInviting, setFamilyInviting] = useState(false);
  const [newFamilyName, setNewFamilyName] = useState('');
  const [newFamilyNameAr, setNewFamilyNameAr] = useState('');
  const [newFamilySlug, setNewFamilySlug] = useState('');
  const [newFamilyDescription, setNewFamilyDescription] = useState('');
  const [creatingFamily, setCreatingFamily] = useState(false);

  // Families catalog. Sole reader after G2.1 extraction (host boot no longer
  // fetches it), so the Command Center and legacy views cannot diverge.
  useEffect(() => {
    let cancelled = false;
    void adminListFamilies()
      .then((rows) => {
        if (!cancelled) setFamilies(rows);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  // Invitation lifecycle rows (Gate 1B). Best-effort admin read; the EF + RPCs
  // remain the server-authoritative path for every send/resend.
  // Shared refresh: throws on failure so staff send paths keep their exact
  // legacy error mapping (outer catch); the effect below maps to load errors.
  const refreshInvitations = useCallback(async () => {
    if (!storeId) {
      setInvitations([]);
      return;
    }
    setInvitations(await adminListInvitations(storeId));
  }, [storeId]);

  useEffect(() => {
    if (!storeId) {
      setInvitations([]);
      return;
    }
    void refreshInvitations()
      .then(() => setError(null))
      .catch(() => setError('INVITE_LOAD_FAILED'));
  }, [storeId, refreshInvitations, setError]);

  // Ledger history is owned by useFamilyLedger (G2.2) so Families and Finance
  // share ONE fetch path and one owner. Refresh is called explicitly after a
  // financial write instead of being coupled to member-state changes.
  const ledger = useFamilyLedger(selectedFamilyId, 50);
  const familyLedger = ledger.entries;
  const ledgerLoading = ledger.loading;
  const ledgerError = ledger.error;

  // Family vegetable preferences (read-only display alongside). A failed read is
  // reported as unavailable rather than as "no preferences set".
  useEffect(() => {
    if (!selectedFamilyId) {
      setFamilyPrefs(null);
      setPrefsError(null);
      return;
    }
    let cancelled = false;
    void adminFamilyPreferences(selectedFamilyId)
      .then((prefs) => {
        if (cancelled) return;
        setFamilyPrefs(prefs);
        setPrefsError(null);
      })
      .catch(() => {
        if (!cancelled) {
          setFamilyPrefs(null);
          setPrefsError('PREFERENCES_UNAVAILABLE');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [selectedFamilyId, setPrefsError]);

  // Family account management (Gate B, ADMIN ONLY). Loaded ONCE on mount so
  // Finance can render balances without a prior Families visit, and so a
  // family selection is a pure local filter (it no longer re-fetches).
  const loadMembers = useCallback(async () => {
    setFamilyLoading(true);
    try {
      const rows = await adminListFamilyMembers();
      setAllFamilyMembers(rows);
      setError(null);
    } catch {
      setError('FAMILY_MEMBERS_FAILED');
    } finally {
      setFamilyLoading(false);
    }
  }, [setError]);

  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);

  const familyMembers = useMemo(
    () => (selectedFamilyId ? allFamilyMembers.filter((m) => m.family_id === selectedFamilyId) : []),
    [allFamilyMembers, selectedFamilyId],
  );

  const handleCreateFamily = useCallback(async () => {
    if (creatingFamily) return;
    const trimmedName = newFamilyName.trim();
    const slug = newFamilySlug.trim().toLowerCase();
    if (!trimmedName || !slug) {
      setError('FAMILY_FIELDS_REQUIRED');
      return;
    }
    setCreatingFamily(true);
    setError(null);
    setMessage(null);
    try {
      const created = await adminUpsertFamily({
        name: trimmedName,
        nameAr: newFamilyNameAr.trim(),
        slug,
        description: newFamilyDescription.trim(),
      });
      const refreshed = await adminListFamilies();
      setFamilies(refreshed);
      setSelectedFamilyId(created.id);
      setNewFamilyName('');
      setNewFamilyNameAr('');
      setNewFamilySlug('');
      setNewFamilyDescription('');
      setMessage('FAMILY_CREATED');
    } catch {
      setError('FAMILY_CREATE_FAILED');
    } finally {
      setCreatingFamily(false);
    }
  }, [creatingFamily, newFamilyName, newFamilyNameAr, newFamilySlug, newFamilyDescription, setError, setMessage]);

  const submitDeposit = useCallback(async () => {
    if (!selectedFamilyId) return;
    const amount = Number(depositAmount);
    if (!Number.isFinite(amount) || amount <= 0) {
      setError('DEPOSIT_INVALID');
      return;
    }
    setDepositing(true);
    setError(null);
    setMessage(null);
    try {
      await adminDeposit(selectedFamilyId, amount, depositNote.trim());
      setMessage('DEPOSIT_OK');
      setDepositAmount('');
      setDepositNote('');
      // Server already applied the FIFO debt pay-down and returned the new
      // balance; refresh the two reads the UI shows. No client-side money math.
      await loadMembers();
      await ledger.refresh();
    } catch {
      setError('DEPOSIT_FAILED');
    } finally {
      setDepositing(false);
    }
  }, [selectedFamilyId, depositAmount, depositNote, loadMembers, ledger, setError, setMessage]);

  const searchFamilyUsers = useCallback(async () => {
    setPendingMove(null);
    setFamilySearching(true);
    try {
      setFamilyUserResults(await adminFindUsers(familyEmail, 20));
      setError(null);
    } catch {
      setError('SEARCH_FAILED');
    } finally {
      setFamilySearching(false);
    }
  }, [familyEmail, setError]);

  const familyNameOf = useCallback(
    (familyId: string, fallback?: string | null): string => {
      const known = families.find((f) => f.id === familyId);
      if (known) return name(known.name, known.name_ar);
      return fallback ?? `${familyId.slice(0, 8)}…`;
    },
    [families, name],
  );

  const bindToFamily = useCallback(
    async (userId: string) => {
      if (!selectedFamilyId || bindingUserId) return;
      setPendingMove(null);
      setError(null);
      setMessage(null);
      // Cross-family move guard: resolve current active membership from the
      // snapshot already held by this workspace — no new request, no RPC yet.
      const current = allFamilyMembers.find((m) => m.user_id === userId && m.status === 'active') ?? null;
      if (current && current.family_id === selectedFamilyId) {
        setMessage('FAMILY_ALREADY_LINKED');
        return;
      }
      if (current) {
        const listed = familyUserResults.find((u) => u.user_id === userId) ?? null;
        setPendingMove({
          userId,
          email: listed?.email ?? listed?.display_name ?? userId,
          fromFamilyId: current.family_id,
          fromFamilyName: familyNameOf(current.family_id, current.family_name),
          toFamilyId: selectedFamilyId,
        });
        return;
      }
      setBindingUserId(userId);
      try {
        await adminProvisionFamilyMember(userId, selectedFamilyId, 'active');
        setMessage('PROVISION_OK');
        setFamilyEmail('');
        setFamilyUserResults([]);
        await loadMembers();
        await ledger.refresh();
      } catch {
        setError('FAMILY_PROVISION_FAILED');
      } finally {
        setBindingUserId(null);
      }
    },
    [selectedFamilyId, bindingUserId, allFamilyMembers, familyUserResults, familyNameOf, loadMembers, ledger, setError, setMessage],
  );

  const confirmPendingMove = useCallback(async () => {
    const pending = pendingMove;
    // Re-validate against live selection: stale confirmations can never fire.
    if (!pending || bindingUserId) return;
    if (pending.toFamilyId !== selectedFamilyId) {
      setPendingMove(null);
      return;
    }
    setBindingUserId(pending.userId);
    setError(null);
    setMessage(null);
    try {
      const live = await adminListFamilyMembers();
      setAllFamilyMembers(live);
      const stillThere = live.find((m) => m.user_id === pending.userId && m.status === 'active') ?? null;
      if (!stillThere || stillThere.family_id !== pending.fromFamilyId) {
        // Membership changed under the panel (moved elsewhere, deactivated,
        // or joined target already) — refuse the stale confirm explicitly.
        setPendingMove(null);
        setError('FAMILY_MOVE_STALE');
        return;
      }
      await adminProvisionFamilyMember(pending.userId, pending.toFamilyId, 'active');
      setMessage('PROVISION_OK');
      setPendingMove(null);
      setFamilyEmail('');
      setFamilyUserResults([]);
      await loadMembers();
      await ledger.refresh();
    } catch {
      setError('FAMILY_PROVISION_FAILED');
    } finally {
      setBindingUserId(null);
    }
  }, [pendingMove, bindingUserId, selectedFamilyId, loadMembers, ledger, setError, setMessage]);

  const cancelPendingMove = useCallback(() => {
    setPendingMove(null);
  }, []);

  const selectFamily = useCallback((familyId: string) => {
    setPendingMove(null);
    setSelectedFamilyId(familyId);
  }, []);

  const handleFamilyInvite = useCallback(
    async (resend: boolean, presetEmail?: string) => {
      if (!storeId || familyInviting) return;
      const normalized = (presetEmail ?? familyInviteEmail).trim().toLowerCase();
      if (!normalized) return;
      setFamilyInviting(true);
      setError(null);
      setMessage(null);
      try {
        const result = resend
          ? await resendFamilyInvitation({ storeId, email: normalized })
          : await sendFamilyInvitation({ storeId, email: normalized });
        if (result.ok) {
          const outcome = toInviteOutcome(result);
          if (outcome.kind === 'noop') {
            // P3: no email was dispatched (address already active) — report
            // honestly instead of "sent", and keep the form populated.
            setMessage('INVITE_NOT_NEEDED');
          } else {
            setMessage(successMessageKeyFor(result.code === 'INVITATION_RESENT'));
            setFamilyInviteEmail('');
          }
          await refreshInvitations();
        } else {
          setError(messageKeyFor(result.code));
        }
      } catch {
        setError('INVITE_SEND_FAILED');
      } finally {
        setFamilyInviting(false);
      }
    },
    [storeId, familyInviting, familyInviteEmail, refreshInvitations, setError, setMessage],
  );

  // Staff (operator/courier) rows for the legacy Team section; family rows are
  // owned exclusively by AdminFamilies after G2.1.
  const staffInvitations = useMemo(
    () => invitations.filter((i) => i.member_kind !== 'family'),
    [invitations],
  );

  const familyInvitations = useMemo(
    () => invitations.filter((i) => i.member_kind === 'family'),
    [invitations],
  );

  return {
    message,
    error,
    families,
    selectedFamilyId,
    selectFamily,
    familyMembers,
    allMembers: allFamilyMembers,
    membersLoading: familyLoading,
    refreshMembers: loadMembers,
    familyLedger,
    ledgerLoading,
    ledgerError,
    refreshLedger: ledger.refresh,
    familyPrefs,
    prefsError,
    depositAmount,
    setDepositAmount,
    depositNote,
    setDepositNote,
    depositing,
    familyEmail,
    setFamilyEmail,
    familyUserResults,
    familySearching,
    bindingUserId,
    pendingMove,
    cancelPendingMove,
    invitations,
    staffInvitations,
    familyInvitations,
    refreshInvitations,
    familyInviteEmail,
    setFamilyInviteEmail,
    familyInviting,
    newFamilyName,
    setNewFamilyName,
    newFamilyNameAr,
    setNewFamilyNameAr,
    newFamilySlug,
    setNewFamilySlug,
    newFamilyDescription,
    setNewFamilyDescription,
    creatingFamily,
    name,
    familyNameOf,
    handleCreateFamily,
    submitDeposit,
    searchFamilyUsers,
    bindToFamily,
    confirmPendingMove,
    handleFamilyInvite,
  };
}

export type FamilyWorkspace = ReturnType<typeof useFamilyWorkspace>;

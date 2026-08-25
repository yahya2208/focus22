import { useState, useEffect, useCallback } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';
import { useAppDispatch } from '../../store/navigation';
import {
  adminListChallenges,
  adminGetChallengeDetails,
  adminCreateChallenge,
  adminUpdateChallenge,
  finalizeChallenge,
} from '../../challenge/admin-service';
import type { FinalizeChallengeResult } from '../../challenge/admin-service';
import { Leaderboard } from '../../components/challenge/Leaderboard';
import type {
  AdminChallengeRow,
  AdminChallengeDetail,
  AdminCreateChallengeParams,
  ChallengeStatus,
} from '../../challenge/types';

// ─── Status Badge ────────────────────────────────────────────────────────────

const STATUS_COLORS: Record<ChallengeStatus, { bg: string; fg: string }> = {
  draft: { bg: '#64748b22', fg: '#64748b' },
  active: { bg: '#10b98122', fg: '#10b981' },
  paused: { bg: '#f59e0b22', fg: '#f59e0b' },
  ended: { bg: '#ef444422', fg: '#ef4444' },
  archived: { bg: '#6b728022', fg: '#6b7280' },
};

function StatusBadge({ status }: { status: string }) {
  const s = STATUS_COLORS[status as ChallengeStatus] ?? STATUS_COLORS.draft;
  return (
    <span style={{
      display: 'inline-block', padding: '0.15rem 0.5rem', borderRadius: '6px',
      background: s.bg, color: s.fg, fontSize: '0.7rem', fontWeight: 600,
    }}>
      {status}
    </span>
  );
}

// ─── Challenge Card ──────────────────────────────────────────────────────────

function ChallengeCard({
  challenge,
  colors,
  onSelect,
  onStatusChange,
  actingId,
}: {
  challenge: AdminChallengeRow;
  colors: ReturnType<typeof useThemeColors>;
  onSelect: (id: string) => void;
  onStatusChange: (id: string, status: ChallengeStatus) => void;
  actingId: string | null;
}) {
  const isActive = actingId === challenge.id;
  return (
    <div style={{
      padding: '0.85rem 1rem', borderRadius: '10px',
      border: `1px solid ${colors.border}`, background: colors.bgCard,
      opacity: isActive ? 0.6 : 1,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginBottom: '0.2rem' }}>
            <span style={{ fontSize: '0.95rem', fontWeight: 700, color: colors.text }}>{challenge.name}</span>
            <StatusBadge status={challenge.status} />
          </div>
          {challenge.description && (
            <p style={{ margin: 0, fontSize: '0.75rem', color: colors.textMuted, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {challenge.description}
            </p>
          )}
        </div>
        <button
          onClick={() => onSelect(challenge.id)}
          style={{
            padding: '0.3rem 0.6rem', borderRadius: '6px',
            border: `1px solid ${colors.border}`, background: colors.bgCard,
            color: colors.textSecondary, cursor: 'pointer', fontSize: '0.75rem',
            fontFamily: 'inherit', whiteSpace: 'nowrap',
          }}
        >
          Details
        </button>
      </div>

      <div style={{ display: 'flex', gap: '1rem', fontSize: '0.7rem', color: colors.textMuted, marginBottom: '0.5rem' }}>
        <span>{challenge.participantCount} plays</span>
        <span>{challenge.qualifiedCount} qualified</span>
        <span>{challenge.claimCount} claims</span>
        <span>{challenge.guestClaimCount} guest</span>
      </div>

      <div style={{ display: 'flex', gap: '0.4rem', flexWrap: 'wrap' }}>
        {challenge.status === 'draft' && (
          <button
            onClick={() => onStatusChange(challenge.id, 'active')}
            disabled={isActive}
            style={{
              padding: '0.25rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${colors.accent}`, background: `${colors.accent}18`,
              color: colors.accent, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Activate
          </button>
        )}
        {challenge.status === 'active' && (
          <button
            onClick={() => onStatusChange(challenge.id, 'paused')}
            disabled={isActive}
            style={{
              padding: '0.25rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${colors.warning}`, background: `${colors.warning}18`,
              color: colors.warning, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Pause
          </button>
        )}
        {challenge.status === 'paused' && (
          <button
            onClick={() => onStatusChange(challenge.id, 'active')}
            disabled={isActive}
            style={{
              padding: '0.25rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${colors.accent}`, background: `${colors.accent}18`,
              color: colors.accent, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Resume
          </button>
        )}
        {(challenge.status === 'active' || challenge.status === 'paused') && (
          <button
            onClick={() => onStatusChange(challenge.id, 'ended')}
            disabled={isActive}
            style={{
              padding: '0.25rem 0.5rem', borderRadius: '5px', fontSize: '0.7rem', fontWeight: 600,
              border: `1px solid ${colors.danger}`, background: `${colors.danger}18`,
              color: colors.danger, cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            End
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Detail Panel ────────────────────────────────────────────────────────────

function DetailPanel({
  detail,
  colors,
  onClose,
  onFinalize,
  finalizing,
  finalizeResult,
}: {
  detail: AdminChallengeDetail;
  colors: ReturnType<typeof useThemeColors>;
  onClose: () => void;
  onFinalize: () => void;
  finalizing: boolean;
  finalizeResult: FinalizeChallengeResult | null;
}) {
  const ch = detail.challenge;
  return (
    <div style={{
      padding: '1rem', borderRadius: '10px',
      border: `1px solid ${colors.border}`, background: colors.bgCard,
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
        <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: colors.text }}>{ch.name}</h3>
        <button
          onClick={onClose}
          style={{
            padding: '0.25rem 0.5rem', borderRadius: '6px',
            border: `1px solid ${colors.border}`, background: colors.bgCard,
            color: colors.textSecondary, cursor: 'pointer', fontSize: '0.75rem', fontFamily: 'inherit',
          }}
        >
          Close
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem', marginBottom: '0.75rem' }}>
        {[
          { label: 'Participants', value: detail.participantCount },
          { label: 'Qualified', value: detail.qualifiedCount },
          { label: 'Claims', value: detail.claimCount },
          { label: 'Pending Claims', value: detail.pendingClaims },
          { label: 'Redeemed', value: detail.redeemedClaims },
          { label: 'Guest Claims', value: detail.guestClaimCount },
          { label: 'Guest Pending', value: detail.guestPendingClaims },
          { label: 'Guest Redeemed', value: detail.guestRedeemedClaims },
          { label: 'Status', value: ch.status },
        ].map((item) => (
          <div key={item.label}>
            <p style={{ margin: 0, fontSize: '0.6rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{item.label}</p>
            <p style={{ margin: 0, fontSize: '0.85rem', fontWeight: 700, color: colors.text }}>{item.value}</p>
          </div>
        ))}
      </div>

      {ch.starts_at && (
        <p style={{ margin: 0, fontSize: '0.7rem', color: colors.textMuted }}>
          Starts: {new Date(ch.starts_at).toLocaleString()} — Ends: {ch.ends_at ? new Date(ch.ends_at).toLocaleString() : 'No end'}
        </p>
      )}

      {ch.campaign_id && (
        <p style={{ margin: '0.4rem 0 0', fontSize: '0.7rem', color: colors.textMuted }}>
          Campaign: {ch.campaign_id}
        </p>
      )}

      {ch.description && (
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.8rem', color: colors.textSecondary, lineHeight: 1.4 }}>
          {ch.description}
        </p>
      )}

      {/* Finalize button — only for ended challenges */}
      {ch.status === 'ended' && (
        <div style={{ marginTop: '0.75rem' }}>
          {detail.winnerSubmissionId || finalizeResult ? (
            <div style={{
              padding: '0.6rem 0.85rem', borderRadius: '8px',
              border: `1px solid ${colors.success}33`, background: `${colors.success}12`,
              fontSize: '0.8rem',
            }}>
              <p style={{ margin: '0 0 0.3rem', color: colors.success, fontWeight: 700 }}>
                {finalizeResult?.alreadyFinalized ? 'Challenge was already finalized.' : 'Challenge Finalized'}
              </p>
              {detail.winnerSubmissionId && (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.3rem 0.75rem' }}>
                  <div>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Winner: </span>
                    <span style={{ color: colors.text, fontWeight: 600 }}>{detail.winnerName ?? 'Unknown'}</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Score: </span>
                    <span style={{ color: colors.text, fontWeight: 600 }}>{detail.winnerScore ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Grade: </span>
                    <span style={{ color: colors.text, fontWeight: 600 }}>{detail.winnerGrade ?? '—'}</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Type: </span>
                    <span style={{ color: colors.text, fontWeight: 600 }}>{detail.winnerIsGuest ? 'Guest' : 'Registered'}</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Claim: </span>
                    <span style={{ color: detail.winnerClaimStatus === 'redeemed' ? colors.success : colors.text, fontWeight: 600 }}>{detail.winnerClaimStatus ?? 'No claim yet'}</span>
                  </div>
                  {detail.winnerClaimId && (
                    <div>
                      <span style={{ color: colors.textMuted, fontSize: '0.7rem' }}>Claim ID: </span>
                      <span style={{ color: colors.accent, fontWeight: 600, fontSize: '0.7rem', wordBreak: 'break-all' }}>{detail.winnerClaimId}</span>
                    </div>
                  )}
                </div>
              )}
              {!detail.winnerSubmissionId && finalizeResult?.winnerId && (
                <p style={{ margin: 0, color: colors.success }}>
                  Final winner: {finalizeResult.displayName ?? 'Unknown'} — Score: {finalizeResult.focusScore} — Grade: {finalizeResult.grade}
                </p>
              )}
              {!detail.winnerSubmissionId && !finalizeResult?.winnerId && (
                <p style={{ margin: 0, color: colors.textMuted }}>No qualified submissions.</p>
              )}
            </div>
          ) : (
            <button
              onClick={onFinalize}
              disabled={finalizing}
              style={{
                padding: '0.4rem 0.85rem', borderRadius: '6px',
                border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
                color: colors.accent, cursor: finalizing ? 'wait' : 'pointer',
                fontSize: '0.8rem', fontWeight: 600, fontFamily: 'inherit',
                opacity: finalizing ? 0.5 : 1,
              }}
            >
              {finalizing ? 'Finalizing…' : 'Finalize Challenge'}
            </button>
          )}
          <p style={{ margin: '0.3rem 0 0', fontSize: '0.7rem', color: colors.textMuted, fontStyle: 'italic' }}>
            Finalizes the challenge and declares the final winner. This action is atomic and idempotent.
          </p>
        </div>
      )}

      <p style={{ margin: '0.75rem 0 0.25rem', fontSize: '0.7rem', color: colors.textMuted, textTransform: 'uppercase', letterSpacing: '0.04em', fontWeight: 600 }}>
        Challenge ID
      </p>
      <code style={{ fontSize: '0.7rem', color: colors.accent, wordBreak: 'break-all' }}>{ch.id}</code>

      <div style={{ marginTop: '0.75rem' }}>
        <Leaderboard challengeId={ch.id} limit={10} />
      </div>
    </div>
  );
}

// ─── Create Form ─────────────────────────────────────────────────────────────

function CreateForm({
  colors,
  onSuccess,
  onClose,
}: {
  colors: ReturnType<typeof useThemeColors>;
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = useCallback(async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const params: AdminCreateChallengeParams = {
        name: name.trim(),
        ...(description.trim() ? { description: description.trim() } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {}),
      };
      await adminCreateChallenge(params);
      onSuccess();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [name, description, startsAt, endsAt, onSuccess]);

  return (
    <div style={{
      padding: '1rem', borderRadius: '10px',
      border: `1px solid ${colors.accent}44`, background: colors.bgCard,
    }}>
      <h3 style={{ margin: '0 0 0.75rem', fontSize: '0.95rem', fontWeight: 700, color: colors.text }}>Create Challenge</h3>
      {error && (
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '6px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          color: colors.dangerText, fontSize: '0.8rem', marginBottom: '0.5rem',
        }}>
          {error}
        </div>
      )}
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Challenge name"
          required
          style={{
            padding: '0.45rem 0.65rem', borderRadius: '6px',
            border: `1px solid ${colors.border}`, background: colors.bg,
            color: colors.text, fontSize: '0.85rem', fontFamily: 'inherit',
          }}
        />
        <textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description (optional)"
          rows={2}
          style={{
            padding: '0.45rem 0.65rem', borderRadius: '6px',
            border: `1px solid ${colors.border}`, background: colors.bg,
            color: colors.text, fontSize: '0.85rem', fontFamily: 'inherit', resize: 'vertical',
          }}
        />
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: colors.textMuted, marginBottom: '0.2rem' }}>
              Starts At
            </label>
            <input
              type="datetime-local"
              value={startsAt}
              onChange={(e) => setStartsAt(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem', borderRadius: '6px', width: '100%',
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: '0.85rem', fontFamily: 'inherit',
              }}
            />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '0.7rem', color: colors.textMuted, marginBottom: '0.2rem' }}>
              Ends At
            </label>
            <input
              type="datetime-local"
              value={endsAt}
              onChange={(e) => setEndsAt(e.target.value)}
              style={{
                padding: '0.45rem 0.65rem', borderRadius: '6px', width: '100%',
                border: `1px solid ${colors.border}`, background: colors.bg,
                color: colors.text, fontSize: '0.85rem', fontFamily: 'inherit',
              }}
            />
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            type="submit"
            disabled={loading || !name.trim()}
            style={{
              padding: '0.4rem 0.85rem', borderRadius: '6px',
              border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
              color: colors.accent, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit', opacity: loading || !name.trim() ? 0.5 : 1,
            }}
          >
            {loading ? 'Creating...' : 'Create'}
          </button>
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '0.4rem 0.85rem', borderRadius: '6px',
              border: `1px solid ${colors.border}`, background: colors.bgCard,
              color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem',
              fontFamily: 'inherit',
            }}
          >
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}

// ─── Main Screen ─────────────────────────────────────────────────────────────

export function ChallengeAdminScreen() {
  const colors = useThemeColors();
  const navDispatch = useAppDispatch();

  const [challenges, setChallenges] = useState<AdminChallengeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const [statusFilter, setStatusFilter] = useState<ChallengeStatus | ''>('');
  const [detail, setDetail] = useState<AdminChallengeDetail | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [finalizing, setFinalizing] = useState(false);
  const [finalizeResult, setFinalizeResult] = useState<FinalizeChallengeResult | null>(null);
  const [finalizeError, setFinalizeError] = useState<string | null>(null);

  const loadChallenges = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await adminListChallenges(statusFilter || null);
      setChallenges(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => { loadChallenges(); }, [loadChallenges]);

  const handleSelect = useCallback(async (id: string) => {
    setActingId(id);
    try {
      const d = await adminGetChallengeDetails(id);
      setDetail(d);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingId(null);
    }
  }, []);

  const handleStatusChange = useCallback(async (id: string, status: ChallengeStatus) => {
    setActingId(id);
    setError(null);
    setSuccess(null);
    try {
      await adminUpdateChallenge(id, { status });
      setSuccess(`Challenge ${status}`);
      await loadChallenges();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setActingId(null);
    }
  }, [loadChallenges]);

  const handleCreateSuccess = useCallback(async () => {
    setShowCreate(false);
    setSuccess('Challenge created.');
    await loadChallenges();
  }, [loadChallenges]);

  const handleFinalize = useCallback(async () => {
    if (!detail) return;
    setFinalizing(true);
    setFinalizeError(null);
    try {
      const result = await finalizeChallenge(detail.challenge.id);
      setFinalizeResult(result);
    } catch (err) {
      setFinalizeError((err as Error).message);
    } finally {
      setFinalizing(false);
    }
  }, [detail]);

  return (
    <nav
      aria-label="Challenge Admin"
      style={{
        padding: '1.5rem 1.25rem',
        maxWidth: '800px',
        margin: '0 auto',
        display: 'flex',
        flexDirection: 'column',
        gap: '1rem',
      }}
    >
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <button
            onClick={() => navDispatch({ type: 'NAVIGATE', screen: 'settings' })}
            aria-label="Back to Settings"
            style={{
              padding: '0.35rem 0.75rem', borderRadius: '8px',
              border: `1px solid ${colors.border}`, background: colors.bgCard,
              color: colors.textSecondary, cursor: 'pointer', fontSize: '0.8rem', fontFamily: 'inherit',
            }}
          >
            {'\u2190'} Back
          </button>
          <h1 style={{ fontSize: '1.4rem', fontWeight: 800, color: colors.text, margin: 0 }}>
            Challenge Admin
          </h1>
        </div>
        <div style={{ display: 'flex', gap: '0.4rem' }}>
          <button
            onClick={() => setShowCreate(!showCreate)}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: '8px',
              border: `1px solid ${colors.accent}`, background: `${colors.accent}22`,
              color: colors.accent, cursor: 'pointer', fontSize: '0.8rem', fontWeight: 600,
              fontFamily: 'inherit',
            }}
          >
            {showCreate ? 'Cancel' : '+ Create'}
          </button>
          <button
            onClick={loadChallenges}
            disabled={loading}
            style={{
              padding: '0.35rem 0.75rem', borderRadius: '8px',
              border: `1px solid ${colors.border}`, background: colors.bgCard,
              color: colors.textSecondary, cursor: loading ? 'wait' : 'pointer',
              fontSize: '0.8rem', fontFamily: 'inherit',
            }}
          >
            {loading ? 'Loading...' : 'Refresh'}
          </button>
        </div>
      </div>

      {/* Status Filter */}
      <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap' }}>
        {(['', 'draft', 'active', 'paused', 'ended'] as const).map((s) => (
          <button
            key={s || 'all'}
            onClick={() => setStatusFilter(s)}
            style={{
              padding: '0.25rem 0.6rem', borderRadius: '6px',
              border: `1px solid ${statusFilter === s ? colors.accent : colors.border}`,
              background: statusFilter === s ? `${colors.accent}18` : 'transparent',
              color: statusFilter === s ? colors.accent : colors.textMuted,
              cursor: 'pointer', fontSize: '0.7rem', fontWeight: 600, fontFamily: 'inherit',
            }}
          >
            {s || 'All'}
          </button>
        ))}
      </div>

      {/* Messages */}
      {error && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          color: colors.dangerText, fontSize: '0.85rem',
        }}>
          {error}
        </div>
      )}
      {success && (
        <div style={{
          padding: '0.75rem 1rem', borderRadius: '8px',
          background: colors.successBg, border: `1px solid ${colors.success}33`,
          color: colors.successText, fontSize: '0.85rem',
        }}>
          {success}
        </div>
      )}

      {/* Create Form */}
      {showCreate && (
        <CreateForm colors={colors} onSuccess={handleCreateSuccess} onClose={() => setShowCreate(false)} />
      )}

      {/* Detail Panel */}
      {detail && (
        <DetailPanel
          detail={detail}
          colors={colors}
          onClose={() => { setDetail(null); setFinalizeResult(null); }}
          onFinalize={handleFinalize}
          finalizing={finalizing}
          finalizeResult={finalizeResult}
        />
      )}

      {finalizeError && (
        <div style={{
          padding: '0.5rem 0.75rem', borderRadius: '6px',
          background: colors.dangerBg, border: `1px solid ${colors.danger}33`,
          color: colors.dangerText, fontSize: '0.8rem',
        }}>
          Finalize error: {finalizeError}
        </div>
      )}

      {/* Challenge List */}
      {loading && challenges.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          Loading challenges...
        </div>
      ) : challenges.length === 0 ? (
        <div style={{ textAlign: 'center', color: colors.textMuted, padding: '2rem' }}>
          No challenges{statusFilter ? ` with status "${statusFilter}"` : ''}.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {challenges.map((ch) => (
            <ChallengeCard
              key={ch.id}
              challenge={ch}
              colors={colors}
              onSelect={handleSelect}
              onStatusChange={handleStatusChange}
              actingId={actingId}
            />
          ))}
        </div>
      )}

      {/* Footer */}
      <div style={{ fontSize: '0.7rem', color: colors.textFaint, textAlign: 'center', paddingTop: '0.5rem' }}>
        All actions are audit-logged. Only admin/super_admin roles can access.
      </div>
    </nav>
  );
}

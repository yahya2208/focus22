import { useState, useEffect } from 'react';
import { createBusinessAPI, type BusinessAPI } from './api';
import type {
  CommandCenterData, DeviceInsight, CampaignInsight, CommerceFunnel,
} from './types';
import { useThemeColors } from '../hooks/useThemeColors';

const api: BusinessAPI = createBusinessAPI();

export interface QualityCheck {
  id: string;
  name: string;
  nameAr: string;
  status: 'pass' | 'warn' | 'fail' | 'skip';
  issues: number;
  details: string[];
  score: number;
}

interface AllData {
  commandCenter: CommandCenterData | null;
  deviceInsights: DeviceInsight[];
  campaignInsights: CampaignInsight[];
  commerceFunnel: CommerceFunnel | null;
}

function runNullCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  for (const opp of data.commandCenter?.opportunities ?? []) {
    if (!opp.userId) issues.push('Missing userId');
    if (!opp.displayName) issues.push(`Missing displayName for userId ${opp.userId || 'unknown'}`);
    if (!opp.lastVisit) issues.push(`Missing lastVisit for ${opp.displayName || 'unknown'}`);
    if (!opp.deviceInfo) issues.push(`Missing deviceInfo for ${opp.displayName || 'unknown'}`);
  }
  for (const os of data.deviceInsights) {
    if (!os.os) issues.push('Missing OS name');
    for (const brand of os.brands) {
      if (!brand.brand) issues.push(`Missing brand name in OS ${os.os || 'unknown'}`);
      for (const model of brand.models) {
        if (!model.model) issues.push(`Missing model name in brand ${brand.brand || 'unknown'}`);
        if (!model.lastSeen) issues.push(`Missing lastSeen for ${brand.brand || 'unknown'} ${model.model || 'unknown'}`);
      }
    }
  }
  for (const c of data.campaignInsights) {
    if (!c.id) issues.push('Missing campaign ID');
    if (!c.name) issues.push('Missing campaign name');
  }
  for (const s of data.commerceFunnel?.stages ?? []) {
    if (!s.name) issues.push('Missing funnel stage name');
  }
  const n = issues.length;
  return {
    id: 'null-check',
    name: 'NULL Integrity',
    nameAr: 'التحقق من القيم الفارغة',
    status: n === 0 ? 'pass' : n > 5 ? 'fail' : 'warn',
    issues: n,
    details: issues.slice(0, 10),
    score: Math.max(0, 100 - n * 10),
  };
}

function runNegativeDurationCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  for (const os of data.deviceInsights) {
    for (const brand of os.brands) {
      for (const model of brand.models) {
        if (model.avgReactionTime < 0) issues.push(`${brand.brand} ${model.model}: avgReactionTime = ${model.avgReactionTime}`);
        if (model.avgFocusScore < 0) issues.push(`${brand.brand} ${model.model}: avgFocusScore = ${model.avgFocusScore}`);
      }
    }
  }
  for (const c of data.campaignInsights) {
    if (c.avgFocusScore < 0) issues.push(`Campaign "${c.name}": avgFocusScore = ${c.avgFocusScore}`);
  }
  const n = issues.length;
  return {
    id: 'negative-duration',
    name: 'Negative Duration',
    nameAr: 'المدة السالبة',
    status: n === 0 ? 'pass' : 'fail',
    issues: n,
    details: issues,
    score: n === 0 ? 100 : 0,
  };
}

function runDuplicateCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  const seen = new Map<string, number>();
  for (const opp of data.commandCenter?.opportunities ?? []) {
    const count = (seen.get(opp.userId) ?? 0) + 1;
    seen.set(opp.userId, count);
    if (count === 2) issues.push(`Duplicate userId: ${opp.displayName} (${opp.userId})`);
  }
  const modelSet = new Set<string>();
  for (const os of data.deviceInsights) {
    for (const brand of os.brands) {
      for (const model of brand.models) {
        const key = `${brand.brand}|${model.model}`;
        if (modelSet.has(key)) issues.push(`Duplicate device model: ${brand.brand} ${model.model}`);
        modelSet.add(key);
      }
    }
  }
  const n = issues.length;
  return {
    id: 'duplicate-sessions',
    name: 'Duplicate Sessions',
    nameAr: 'الجلسات المكررة',
    status: n === 0 ? 'pass' : 'warn',
    issues: n,
    details: issues,
    score: Math.max(0, 100 - n * 20),
  };
}

function runTimestampCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  const now = Date.now();
  const minTs = new Date('2020-01-01').getTime();
  for (const opp of data.commandCenter?.opportunities ?? []) {
    if (!opp.lastVisit) continue;
    const t = new Date(opp.lastVisit).getTime();
    if (t > now) issues.push(`Future timestamp for ${opp.displayName}: ${opp.lastVisit}`);
    else if (t < minTs) issues.push(`Pre-2020 timestamp for ${opp.displayName}: ${opp.lastVisit}`);
  }
  for (const os of data.deviceInsights) {
    for (const brand of os.brands) {
      for (const model of brand.models) {
        if (!model.lastSeen) continue;
        const t = new Date(model.lastSeen).getTime();
        if (t > now) issues.push(`Future lastSeen for ${brand.brand} ${model.model}: ${model.lastSeen}`);
        else if (t < minTs) issues.push(`Pre-2020 lastSeen for ${brand.brand} ${model.model}: ${model.lastSeen}`);
      }
    }
  }
  const n = issues.length;
  return {
    id: 'impossible-timestamps',
    name: 'Impossible Timestamps',
    nameAr: 'الأوقات المستحيلة',
    status: n === 0 ? 'pass' : 'fail',
    issues: n,
    details: issues,
    score: n === 0 ? 100 : Math.max(0, 100 - n * 15),
  };
}

function runSessionIntegrityCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  for (const opp of data.commandCenter?.opportunities ?? []) {
    if (opp.gameCount > opp.visitCount) issues.push(`${opp.displayName}: ${opp.gameCount} games > ${opp.visitCount} visits`);
    if (opp.gameCount > 0 && opp.bestFocusScore === 0) issues.push(`${opp.displayName}: ${opp.gameCount} games but zero focus score`);
  }
  for (const c of data.campaignInsights) {
    if (c.games > 0 && c.avgFocusScore === 0) issues.push(`Campaign "${c.name}": ${c.games} games but zero avgFocusScore`);
  }
  const stages = data.commerceFunnel?.stages ?? [];
  for (let i = 1; i < stages.length; i++) {
    const curr = stages[i];
    const prev = stages[i - 1];
    if (curr && prev && curr.count > prev.count) issues.push(`Funnel: ${curr.name} (${curr.count}) > ${prev.name} (${prev.count})`);
  }
  const n = issues.length;
  return {
    id: 'session-integrity',
    name: 'Session Integrity',
    nameAr: 'سلامة الجلسات',
    status: n === 0 ? 'pass' : n > 3 ? 'fail' : 'warn',
    issues: n,
    details: issues,
    score: Math.max(0, 100 - n * 15),
  };
}

function runZeroValueCheck(data: AllData): QualityCheck {
  const issues: string[] = [];
  const today = data.commandCenter?.today;
  if (today) {
    if (today.visitors > 0 && today.conversionRate === 0) issues.push(`conversionRate = 0 despite ${today.visitors} visitors`);
    if (today.players > 0 && today.tradeRequests === 0) issues.push(`tradeRequests = 0 despite ${today.players} players`);
  }
  for (const c of data.campaignInsights) {
    if (c.visitors > 0 && c.conversionRate === 0) issues.push(`Campaign "${c.name}": 0% conversion with ${c.visitors} visitors`);
    if (c.visitors > 0 && c.games === 0) issues.push(`Campaign "${c.name}": ${c.visitors} visitors but 0 games`);
  }
  for (const os of data.deviceInsights) {
    for (const brand of os.brands) {
      for (const model of brand.models) {
        if (model.count > 5 && model.tradeRate === 0) issues.push(`${brand.brand} ${model.model}: 0% trade rate with ${model.count} devices`);
      }
    }
  }
  for (const s of data.commerceFunnel?.stages ?? []) {
    if (s.count === 0) issues.push(`Funnel stage "${s.name}" has 0 count`);
  }
  const n = issues.length;
  return {
    id: 'zero-values',
    name: 'Zero Values',
    nameAr: 'القيم الصفرية',
    status: n === 0 ? 'pass' : n > 3 ? 'warn' : 'warn',
    issues: n,
    details: issues,
    score: Math.max(0, 100 - n * 15),
  };
}

const CHECKS_RUNNERS = [
  runNullCheck,
  runNegativeDurationCheck,
  runDuplicateCheck,
  runTimestampCheck,
  runSessionIntegrityCheck,
  runZeroValueCheck,
];

const statusColors: Record<QualityCheck['status'], string> = {
  pass: '#22c55e',
  warn: '#f59e0b',
  fail: '#ef4444',
  skip: '#6b7280',
};

export function DataQualityEngine() {
  const colors = useThemeColors();
  const [checks, setChecks] = useState<QualityCheck[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      try {
        const [cc, di, ci, cf] = await Promise.all([
          api.getCommandCenter(),
          api.getDeviceInsights(),
          api.getCampaignInsights(),
          api.getCommerceFunnel(),
        ]);
        if (cancelled) return;
        const data: AllData = { commandCenter: cc, deviceInsights: di, campaignInsights: ci, commerceFunnel: cf };
        setChecks(CHECKS_RUNNERS.map(fn => fn(data)));
        setLoading(false);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Failed to load data');
          setLoading(false);
        }
      }
    }
    run();
    return () => { cancelled = true; };
  }, []);

  const activeChecks = checks.filter(c => c.status !== 'skip');
  const overallScore = activeChecks.length > 0
    ? Math.round(activeChecks.reduce((sum, c) => sum + c.score, 0) / activeChecks.length)
    : 0;
  const passedCount = checks.filter(c => c.status === 'pass').length;
  const totalCount = checks.length;
  const hasFailures = checks.some(c => c.status === 'fail');

  if (loading) {
    return (
      <div style={{ color: colors.textMuted, textAlign: 'center', padding: '3rem', fontSize: '1.1rem' }}>
        Scanning data quality...
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ color: colors.danger, textAlign: 'center', padding: '2rem' }}>
        {error}
      </div>
    );
  }

  const statusColor = overallScore >= 80 ? statusColors.pass : overallScore >= 50 ? statusColors.warn : statusColors.fail;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Warning banner */}
      {hasFailures && (
        <div style={{
          background: colors.dangerBg,
          border: `1px solid ${colors.danger}40`,
          borderRadius: '10px',
          padding: '12px 16px',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
        }}>
          <span style={{ fontSize: '1.2rem' }}>⚠️</span>
          <span style={{ color: colors.dangerText, fontSize: '0.85rem' }}>
            بعض الفحوصات فشلت — يُرجى مراجعة مصدر البيانات
          </span>
        </div>
      )}

      {/* Dashboard card */}
      <div style={{
        background: colors.bgCard,
        border: `1px solid ${colors.border}`,
        borderRadius: '16px',
        padding: '20px',
      }}>
        {/* Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
          <div>
            <h2 style={{ color: colors.text, fontSize: '1.1rem', margin: 0, fontWeight: 700 }}>
              🔍 Data Quality Dashboard
            </h2>
            <div style={{ color: colors.textMuted, fontSize: '0.75rem', marginTop: '4px' }}>
              فحص سلامة بيانات التحليلات
            </div>
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{
              fontSize: '2rem',
              fontWeight: 800,
              color: statusColor,
              fontVariantNumeric: 'tabular-nums',
            }}>
              {overallScore}
            </div>
            <div style={{ fontSize: '0.6rem', color: colors.textMuted, letterSpacing: '0.04em' }}>النسبة العامة</div>
          </div>
        </div>

        {/* Summary */}
        <div style={{
          background: colors.bgInput,
          borderRadius: '8px',
          padding: '10px 14px',
          marginBottom: '16px',
          textAlign: 'center',
          color: colors.textSecondary,
          fontSize: '0.85rem',
        }}>
          {passedCount} من {totalCount} فحوصات ناجحة
        </div>

        {/* Checks list */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {checks.map(check => {
            const isExpanded = expanded === check.id;
            const color = statusColors[check.status];
            return (
              <div key={check.id} style={{
                background: colors.bgInput,
                borderRadius: '10px',
                border: `1px solid ${color}25`,
                overflow: 'hidden',
              }}>
                <button
                  onClick={() => setExpanded(isExpanded ? null : check.id)}
                  style={{
                    width: '100%',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    border: 'none',
                    background: 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'inherit',
                    textAlign: 'right',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{
                      width: '10px',
                      height: '10px',
                      borderRadius: '50%',
                      background: color,
                      display: 'inline-block',
                      flexShrink: 0,
                    }} />
                    <div style={{ textAlign: 'right' }}>
                      <div style={{ color: colors.text, fontSize: '0.85rem', fontWeight: 600 }}>{check.nameAr}</div>
                      <div style={{ color: colors.textMuted, fontSize: '0.65rem' }}>{check.name}</div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {check.issues > 0 && (
                      <span style={{
                        background: color + '25',
                        color,
                        fontSize: '0.7rem',
                        fontWeight: 600,
                        padding: '2px 8px',
                        borderRadius: '10px',
                        minWidth: '24px',
                        textAlign: 'center',
                      }}>
                        {check.issues}
                      </span>
                    )}
                    <span style={{ fontSize: '0.7rem', fontWeight: 700, color, minWidth: '28px', textAlign: 'center' }}>
                      {check.score}
                    </span>
                    <span style={{ color: colors.textMuted, fontSize: '0.75rem', transition: 'transform 0.2s', transform: isExpanded ? 'rotate(180deg)' : 'rotate(0deg)' }}>
                      ▼
                    </span>
                  </div>
                </button>
                {isExpanded && check.details.length > 0 && (
                  <div style={{
                    borderTop: `1px solid ${colors.border}`,
                    padding: '10px 14px',
                    maxHeight: '200px',
                    overflowY: 'auto',
                  }}>
                    {check.details.map((d, i) => (
                      <div key={i} style={{
                        color: colors.textSecondary,
                        fontSize: '0.75rem',
                        padding: '4px 0',
                        borderBottom: i < check.details.length - 1 ? `1px solid ${colors.borderLight}` : 'none',
                        direction: 'ltr',
                        textAlign: 'left',
                      }}>
                        {d}
                      </div>
                    ))}
                    {check.issues > check.details.length && (
                      <div style={{ color: colors.textMuted, fontSize: '0.7rem', padding: '4px 0' }}>
                        ... and {check.issues - check.details.length} more
                      </div>
                    )}
                  </div>
                )}
                {isExpanded && check.details.length === 0 && (
                  <div style={{
                    borderTop: `1px solid ${colors.border}`,
                    padding: '10px 14px',
                    color: colors.success,
                    fontSize: '0.75rem',
                  }}>
                    ✓ No issues found
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

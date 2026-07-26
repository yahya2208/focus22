import type {
  CoachReport,
  CognitiveInput,
  ReportPeriod,
  PerformanceAnalysis,
  TrendResult,
  Goal,
  Recommendation,
  Insight,
  ConfidenceResult,
  CognitivePassport,
} from './types';

export function generateReport(
  period: ReportPeriod,
  _input: CognitiveInput,
  performance: PerformanceAnalysis,
  trends: readonly TrendResult[],
  goals: readonly Goal[],
  recommendations: readonly Recommendation[],
  insights: readonly Insight[],
  confidence: ConfidenceResult,
  passport: CognitivePassport,
): CoachReport {
  const now = Date.now();
  const date = new Date(now);
  const summary = buildSummary(period, date);

  return {
    period,
    generatedAt: now,
    summary,
    performance,
    trends,
    goals,
    recommendations,
    insights,
    overallConfidence: confidence,
    passport,
  };
}

function buildSummary(period: ReportPeriod, date: Date): string {
  switch (period) {
    case 'daily': {
      const formatted = date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return `Daily Cognitive Report — ${formatted}`;
    }
    case 'weekly': {
      const startOfWeek = new Date(date);
      startOfWeek.setDate(date.getDate() - date.getDay());
      const formatted = startOfWeek.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      });
      return `Weekly Cognitive Report — Week of ${formatted}`;
    }
    case 'monthly': {
      const formatted = date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
      });
      return `Monthly Cognitive Report — ${formatted}`;
    }
    case 'longitudinal':
      return 'Longitudinal Cognitive Report';
  }
}

export function formatReport(report: CoachReport): string {
  const lines: string[] = [];

  lines.push('═══════════════════════════════════════════════════');
  lines.push(report.summary);
  lines.push(`Generated: ${new Date(report.generatedAt).toISOString()}`);
  lines.push('═══════════════════════════════════════════════════');
  lines.push('');

  lines.push('── Performance Analysis ──────────────────────────');
  const dims: Array<[string, { current: number; rating: string }]> = [
    ['Reaction Time', report.performance.reactionTime],
    ['Consistency', report.performance.consistency],
    ['Fatigue', report.performance.fatigue],
    ['Calibration', report.performance.calibration],
    ['Focus Score', report.performance.focusScore],
    ['Accuracy', report.performance.accuracy],
    ['Overall', report.performance.overall],
  ];
  for (const [label, dim] of dims) {
    lines.push(`  ${label}: ${dim.current} (${dim.rating})`);
  }
  lines.push('');

  lines.push('── Trends ───────────────────────────────────────');
  if (report.trends.length === 0) {
    lines.push('  No trends available.');
  } else {
    for (const t of report.trends) {
      lines.push(
        `  ${t.dimension}: ${t.direction} (magnitude: ${t.magnitude.toFixed(2)}, significance: ${t.statisticalSignificance.toFixed(2)})`,
      );
    }
  }
  lines.push('');

  lines.push('── Goals ────────────────────────────────────────');
  if (report.goals.length === 0) {
    lines.push('  No goals set.');
  } else {
    for (const g of report.goals) {
      lines.push(`  [${g.status.toUpperCase()}] ${g.title}`);
      lines.push(
        `    ${g.currentValue} / ${g.targetValue} ${g.unit} — ${Math.round(g.progress * 100)}%`,
      );
      lines.push(`    ${g.description}`);
    }
  }
  lines.push('');

  lines.push('── Recommendations ──────────────────────────────');
  if (report.recommendations.length === 0) {
    lines.push('  No recommendations at this time.');
  } else {
    const sorted = [...report.recommendations].sort(
      (a, b) => a.priority - b.priority,
    );
    for (const r of sorted) {
      lines.push(`  [${r.category}] ${r.message}`);
      lines.push(`    Rationale: ${r.rationale}`);
      lines.push(`    Research: ${r.researchTag}`);
    }
  }
  lines.push('');

  lines.push('── Insights ─────────────────────────────────────');
  if (report.insights.length === 0) {
    lines.push('  No insights available.');
  } else {
    for (const i of report.insights) {
      lines.push(`  [${i.category}] ${i.text}`);
      lines.push(`    Confidence: ${i.confidence.level}`);
      lines.push(`    Source: ${i.researchTag}`);
    }
  }
  lines.push('');

  lines.push('── Confidence ───────────────────────────────────');
  lines.push(`  Level: ${report.overallConfidence.level}`);
  lines.push(`  Score: ${report.overallConfidence.score.toFixed(2)}`);
  lines.push(`  ${report.overallConfidence.explanation}`);
  for (const f of report.overallConfidence.factors) {
    lines.push(
      `    ${f.name}: value=${f.value}, weight=${f.weight}, contribution=${f.contribution.toFixed(2)}`,
    );
  }
  lines.push('');

  lines.push('── Cognitive Passport ───────────────────────────');
  const p = report.passport;
  lines.push(`  Overall Score: ${p.profile.overallScore}`);
  lines.push(`  Summary: ${p.profile.summary}`);
  lines.push(`  Dominant Strength: ${p.profile.dominantStrength}`);
  lines.push(`  Primary Focus: ${p.profile.primaryFocus}`);
  lines.push(`  Sessions: ${p.profile.sessionCount} | Days Active: ${p.profile.daysActive}`);
  lines.push(`  Reliability Index: ${p.reliabilityIndex.toFixed(2)}`);
  if (p.strengths.length > 0) {
    lines.push('  Strengths:');
    for (const s of p.strengths) {
      lines.push(`    ${s.dimension} (${s.score}): ${s.description}`);
    }
  }
  if (p.areasToImprove.length > 0) {
    lines.push('  Areas to Improve:');
    for (const a of p.areasToImprove) {
      lines.push(
        `    ${a.dimension}: ${a.currentScore} → ${a.targetScore} — ${a.suggestion}`,
      );
    }
  }
  if (p.milestones.length > 0) {
    lines.push('  Milestones:');
    for (const m of p.milestones) {
      lines.push(`    ${m.title}: ${m.description}`);
    }
  }
  lines.push('');
  lines.push('═══════════════════════════════════════════════════');

  return lines.join('\n');
}

export function exportReport(
  report: CoachReport,
  format: 'json' | 'text',
): string {
  if (format === 'json') {
    return JSON.stringify(report, null, 2);
  }
  return formatReport(report);
}

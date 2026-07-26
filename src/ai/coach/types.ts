export type ConfidenceLevel = 'high' | 'medium' | 'low';
export type ResearchTag = 'scientific' | 'experimental' | 'informational';
export type TrendDirection = 'improving' | 'regressing' | 'plateau' | 'unstable' | 'recovering' | 'accelerating' | 'decelerating';
export type TimeWindow = 'today' | 'week' | 'month' | 'quarter' | 'lifetime';
export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'longitudinal';
export type GoalStatus = 'active' | 'completed' | 'overdue' | 'adapted';

export interface CognitiveInput {
  readonly sessions: readonly SessionSnapshot[];
  readonly scientificMetrics: ScientificSnapshot;
  readonly calibrationConfidence: number;
  readonly deviceStability: number;
  readonly recentActivity: ActivityWindow[];
}

export interface SessionSnapshot {
  readonly id: string;
  readonly timestamp: number;
  readonly duration: number;
  readonly meanRT: number;
  readonly medianRT: number;
  readonly consistencyScore: number;
  readonly fatigueIndex: number;
  readonly fatigueScore: number;
  readonly focusScore: number;
  readonly accuracy: number;
  readonly calibrationConfidence: number;
  readonly grade: string;
  readonly roundCount: number;
}

export interface ScientificSnapshot {
  readonly reactionTime: { readonly median: number; readonly mean: number; readonly stdDev: number; readonly variance: number };
  readonly percentiles: { readonly p50: number; readonly p75: number; readonly p90: number; readonly p95: number; readonly p99: number };
  readonly falseStarts: number;
  readonly accuracy: number;
  readonly consistency: { readonly score: number; readonly rating: string; readonly cv: number };
  readonly fatigue: { readonly index: number; readonly score: number; readonly detected: boolean };
  readonly calibrationConfidence: number;
}

export interface ActivityWindow {
  readonly date: string;
  readonly sessions: number;
  readonly avgFocusScore: number;
  readonly avgRT: number;
}

export interface ConfidenceInput {
  readonly sessionCount: number;
  readonly calibrationConfidence: number;
  readonly deviceStability: number;
  readonly variance: number;
  readonly recentSessions: number;
  readonly daysActive: number;
}

export interface ConfidenceResult {
  readonly level: ConfidenceLevel;
  readonly score: number;
  readonly factors: readonly ConfidenceFactor[];
  readonly explanation: string;
}

export interface ConfidenceFactor {
  readonly name: string;
  readonly value: number;
  readonly weight: number;
  readonly contribution: number;
}

export interface Evidence {
  readonly metric: string;
  readonly previous: number;
  readonly current: number;
  readonly unit: string;
  readonly changePercent: number;
  readonly direction: 'up' | 'down' | 'stable';
}

export interface Explanation {
  readonly observation: string;
  readonly evidence: readonly Evidence[];
  readonly confidence: ConfidenceResult;
  readonly recommendation: string;
  readonly researchTag: ResearchTag;
}

export interface PerformanceAnalysis {
  readonly reactionTime: DimensionAnalysis;
  readonly consistency: DimensionAnalysis;
  readonly fatigue: DimensionAnalysis;
  readonly calibration: DimensionAnalysis;
  readonly focusScore: DimensionAnalysis;
  readonly accuracy: DimensionAnalysis;
  readonly overall: DimensionAnalysis;
}

export interface DimensionAnalysis {
  readonly current: number;
  readonly rating: string;
  readonly trend: TrendDirection;
  readonly confidence: ConfidenceResult;
  readonly explanation: string;
}

export interface TrendResult {
  readonly dimension: string;
  readonly direction: TrendDirection;
  readonly magnitude: number;
  readonly confidence: ConfidenceResult;
  readonly dataPoints: readonly { readonly date: string; readonly value: number }[];
  readonly statisticalSignificance: number;
}

export interface Goal {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly dimension: string;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly unit: string;
  readonly deadline: number;
  readonly status: GoalStatus;
  readonly progress: number;
  readonly researchTag: ResearchTag;
}

export interface Recommendation {
  readonly id: string;
  readonly category: string;
  readonly message: string;
  readonly rationale: string;
  readonly evidence: readonly Evidence[];
  readonly priority: number;
  readonly confidence: ConfidenceResult;
  readonly researchTag: ResearchTag;
  readonly scientificBasis: string;
}

export interface Insight {
  readonly id: string;
  readonly text: string;
  readonly category: string;
  readonly evidence: readonly Evidence[];
  readonly confidence: ConfidenceResult;
  readonly researchTag: ResearchTag;
}

export interface CognitivePassport {
  readonly profile: CognitiveProfile;
  readonly strengths: readonly StrengthEntry[];
  readonly areasToImprove: readonly ImprovementEntry[];
  readonly reliabilityIndex: number;
  readonly milestones: readonly CognitiveMilestone[];
  readonly timeline: readonly TimelineEntry[];
  readonly updatedAt: number;
}

export interface CognitiveProfile {
  readonly summary: string;
  readonly overallScore: number;
  readonly dominantStrength: string;
  readonly primaryFocus: string;
  readonly sessionCount: number;
  readonly daysActive: number;
}

export interface StrengthEntry {
  readonly dimension: string;
  readonly score: number;
  readonly description: string;
}

export interface ImprovementEntry {
  readonly dimension: string;
  readonly currentScore: number;
  readonly targetScore: number;
  readonly suggestion: string;
}

export interface CognitiveMilestone {
  readonly id: string;
  readonly title: string;
  readonly description: string;
  readonly achievedAt: number;
  readonly category: string;
}

export interface TimelineEntry {
  readonly date: string;
  readonly overallScore: number;
  readonly reactionTime: number;
  readonly consistency: number;
  readonly fatigueIndex: number;
}

export interface CoachReport {
  readonly period: ReportPeriod;
  readonly generatedAt: number;
  readonly summary: string;
  readonly performance: PerformanceAnalysis;
  readonly trends: readonly TrendResult[];
  readonly goals: readonly Goal[];
  readonly recommendations: readonly Recommendation[];
  readonly insights: readonly Insight[];
  readonly overallConfidence: ConfidenceResult;
  readonly passport: CognitivePassport;
}

export interface LearningProfile {
  readonly preferredPlayTimes: readonly string[];
  readonly averageSessionLength: number;
  readonly typicalFatiguePattern: string;
  readonly preferredDifficulty: string;
  readonly favoriteGames: readonly string[];
  readonly totalSessionsAnalyzed: number;
  readonly lastUpdated: number;
}

export interface PersonalityConstraints {
  readonly tone: 'professional' | 'scientific' | 'encouraging';
  readonly forbiddenPatterns: readonly string[];
  readonly requiredDisclaimers: readonly string[];
}

export interface ComparativeResult {
  readonly dimension: string;
  readonly label: string;
  readonly baseline: number;
  readonly current: number;
  readonly changePercent: number;
  readonly trend: TrendDirection;
  readonly confidence: ConfidenceResult;
}

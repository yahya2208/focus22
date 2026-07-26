export type {
  ConfidenceLevel, ResearchTag, TrendDirection, TimeWindow, ReportPeriod, GoalStatus,
  CognitiveInput, SessionSnapshot, ScientificSnapshot, ActivityWindow,
  ConfidenceInput, ConfidenceResult, ConfidenceFactor,
  Evidence, Explanation,
  PerformanceAnalysis, DimensionAnalysis,
  TrendResult,
  Goal,
  Recommendation,
  Insight,
  CognitivePassport, CognitiveProfile, StrengthEntry, ImprovementEntry, CognitiveMilestone, TimelineEntry,
  CoachReport,
  LearningProfile,
  PersonalityConstraints,
  ComparativeResult,
} from './types';

export { calculateConfidence, createConfidenceEngine } from './confidence';
export { createExplanation, formatExplanation, createEvidence } from './explainability';
export { analyzePerformance, analyzeDimension } from './analysis';
export { analyzeTrends, detectTrend, computeStatisticalSignificance } from './trends';
export { generateGoals, createGoal, evaluateGoalProgress } from './goals';
export { generateRecommendations, createRecommendation } from './recommendations';
export { generateInsights } from './insights';
export { generatePassport } from './passport';
export { generateComparisons, comparePeriods, compareTimeOfDay, compareSessionLength } from './comparative';
export { createLearningEngine, type LearningEngine } from './learning';
export { generateReport, formatReport, exportReport } from './reports';
export { getPersonalityConstraints, validateMessage, applyPersonality } from './personality';
export { tagOutput, classifyTag, getTagLabel, filterByTag } from './research-tagging';
export { createCoachEngine, buildCognitiveInput, type CoachEngine, type CoachState } from './engine';

import type { Goal, CognitiveInput, GoalStatus, ResearchTag } from './types';

export function generateGoals(input: CognitiveInput): readonly Goal[] {
  const goals: Goal[] = [];
  const now = Date.now();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  const monthMs = 30 * 24 * 60 * 60 * 1000;

  const { sessions, scientificMetrics, calibrationConfidence, recentActivity } = input;

  if (sessions.length === 0) {
    return [];
  }

  const latestSession = sessions[sessions.length - 1]!;
  const currentRT = scientificMetrics.reactionTime.median;
  const currentConsistency = scientificMetrics.consistency.score;
  const currentFatigue = scientificMetrics.fatigue.detected;
  const currentCalibration = calibrationConfidence;

  const sessionsPerWeek = recentActivity.reduce((sum, activity) => sum + activity.sessions, 0) / recentActivity.length || 0;

  const rtTarget = Math.max(currentRT - (currentRT * 0.05), 150);
  goals.push(createGoal({
    title: 'Improve Reaction Time',
    description: 'Reduce median reaction time by 5-10% for better cognitive processing speed.',
    dimension: 'reactionTime',
    targetValue: rtTarget,
    currentValue: currentRT,
    unit: 'ms',
    deadline: now + monthMs,
  }));

  const consistencyTarget = Math.min(currentConsistency + 0.05, 0.95);
  goals.push(createGoal({
    title: 'Enhance Consistency',
    description: 'Increase consistency score to improve performance reliability.',
    dimension: 'consistency',
    targetValue: consistencyTarget,
    currentValue: currentConsistency,
    unit: 'score',
    deadline: now + weekMs,
  }));

  if (sessionsPerWeek < 3) {
    goals.push(createGoal({
      title: 'Increase Session Frequency',
      description: 'Aim for 5 sessions per week to build cognitive training habit.',
      dimension: 'sessionFrequency',
      targetValue: 5,
      currentValue: sessionsPerWeek,
      unit: 'sessions/week',
      deadline: now + weekMs,
    }));
  }

  if (currentFatigue) {
    goals.push(createGoal({
      title: 'Manage Fatigue',
      description: 'Reduce fatigue index by incorporating breaks and shorter sessions.',
      dimension: 'fatigue',
      targetValue: latestSession.fatigueIndex * 0.9,
      currentValue: latestSession.fatigueIndex,
      unit: 'index',
      deadline: now + weekMs,
    }));
  }

  if (currentCalibration < 0.8) {
    goals.push(createGoal({
      title: 'Improve Calibration',
      description: 'Increase calibration confidence to 0.85 for more reliable data.',
      dimension: 'calibration',
      targetValue: 0.85,
      currentValue: currentCalibration,
      unit: 'confidence',
      deadline: now + monthMs,
    }));
  }

  return goals;
}

export function createGoal(params: {
  readonly title: string;
  readonly description: string;
  readonly dimension: string;
  readonly targetValue: number;
  readonly currentValue: number;
  readonly unit: string;
  readonly deadline: number;
}): Goal {
  const progress = Math.min((params.currentValue / params.targetValue) * 100, 100);
  const researchTag: ResearchTag =
    params.dimension === 'reactionTime' || params.dimension === 'consistency' || params.dimension === 'fatigue'
      ? 'scientific'
      : params.dimension === 'sessionFrequency'
        ? 'experimental'
        : 'informational';

  return {
    id: `goal_${params.dimension}_${Date.now()}`,
    title: params.title,
    description: params.description,
    dimension: params.dimension,
    targetValue: params.targetValue,
    currentValue: params.currentValue,
    unit: params.unit,
    deadline: params.deadline,
    status: 'active',
    progress,
    researchTag,
  };
}

export function evaluateGoalProgress(goal: Goal, currentValue: number): Goal {
  const now = Date.now();
  let status: GoalStatus = 'active';
  let progress = goal.progress;

  if (currentValue >= goal.targetValue) {
    status = 'completed';
    progress = 100;
  } else if (now > goal.deadline) {
    status = 'overdue';
  } else if (Math.abs(currentValue - goal.currentValue) > goal.currentValue * 0.1) {
    status = 'adapted';
  } else {
    progress = Math.min((currentValue / goal.targetValue) * 100, 99);
  }

  return {
    ...goal,
    currentValue,
    status,
    progress,
  };
}
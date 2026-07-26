import { GamePlugin, GameEvent, GameConfig } from '../types';

export const REACTION_LIGHT_CONFIG: GameConfig = {
  id: 'reaction-light',
  name: 'Reaction Light Test',
  description: 'Tap when the light appears. Measures reaction time and consistency.',
  totalRounds: 20,
  minDelayMs: 1500,
  maxDelayMs: 4000,
};

type Phase = 'idle' | 'waiting' | 'stimulus' | 'responded' | 'too_early';

export function createReactionLightPlugin(): GamePlugin {
  let phase: Phase = 'idle';
  let round = 0;
  let stimulusTime = 0;
  const events: GameEvent[] = [];
  let roundStart = 0;

  return {
    config: REACTION_LIGHT_CONFIG,

    start(): GameEvent[] {
      phase = 'waiting';
      round = 0;
      events.length = 0;
      const startEvent: GameEvent = { type: 'game_start', timestamp: performance.now() };
      events.push(startEvent);
      roundStart = performance.now();
      return [startEvent];
    },

    showStimulus(): GameEvent {
      if (phase !== 'waiting') {
        return { type: 'stimulus_shown', timestamp: performance.now(), metadata: { ignored: true } };
      }
      const now = performance.now();
      stimulusTime = now;
      phase = 'stimulus';
      const event: GameEvent = { type: 'stimulus_shown', timestamp: now, roundNumber: round };
      events.push(event);
      return event;
    },

    handleInput(input: 'tap' | 'wait'): GameEvent {
      const now = performance.now();

      if (input === 'tap' && phase === 'stimulus') {
        const rt = now - stimulusTime;
        const event: GameEvent = {
          type: 'round_complete',
          timestamp: now,
          roundNumber: round,
          reactionTimeMs: rt,
          metadata: { phase: 'responded' },
        };
        events.push(event);
        round++;
        phase = round >= REACTION_LIGHT_CONFIG.totalRounds ? 'idle' : 'waiting';
        roundStart = now;
        return event;
      }

      if (input === 'tap' && phase === 'waiting') {
        const event: GameEvent = {
          type: 'user_tap',
          timestamp: now,
          roundNumber: round,
          metadata: { phase: 'too_early', roundStartTime: roundStart },
        };
        events.push(event);
        return event;
      }

      return { type: 'user_tap', timestamp: now, metadata: { ignored: true } };
    },

    isComplete(): boolean {
      return phase === 'idle' && round >= REACTION_LIGHT_CONFIG.totalRounds;
    },

    getResults(): GameEvent[] {
      return [...events];
    },

    reset(): void {
      phase = 'idle';
      round = 0;
      stimulusTime = 0;
      events.length = 0;
      roundStart = 0;
    },
  };
}

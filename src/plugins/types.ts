export interface GameEvent {
  type: 'stimulus_shown' | 'user_tap' | 'round_complete' | 'game_start' | 'game_end';
  timestamp: number;
  roundNumber?: number;
  reactionTimeMs?: number;
  metadata?: Record<string, unknown>;
}

export interface GameConfig {
  id: string;
  name: string;
  description: string;
  totalRounds: number;
  minDelayMs: number;
  maxDelayMs: number;
}

export interface GamePlugin {
  config: GameConfig;
  start(): GameEvent[];
  showStimulus(): GameEvent;
  handleInput(event: 'tap' | 'wait'): GameEvent;
  isComplete(): boolean;
  getResults(): GameEvent[];
  reset(): void;
}

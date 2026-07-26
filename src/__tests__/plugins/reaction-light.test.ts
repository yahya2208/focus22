import { describe, it, expect } from 'vitest';
import { createReactionLightPlugin } from '../../plugins/reaction-light';

describe('Reaction Light Plugin', () => {
  it('should initialize with correct config', () => {
    const plugin = createReactionLightPlugin();
    expect(plugin.config.id).toBe('reaction-light');
    expect(plugin.config.totalRounds).toBe(20);
  });

  it('should start and emit game_start event', () => {
    const plugin = createReactionLightPlugin();
    const events = plugin.start();
    expect(events).toHaveLength(1);
    expect(events[0]?.type).toBe('game_start');
    expect(plugin.isComplete()).toBe(false);
  });

  it('should handle tap during stimulus as round_complete', () => {
    const plugin = createReactionLightPlugin();
    plugin.start();
    plugin.showStimulus();
    const event = plugin.handleInput('tap');
    expect(event.type).toBe('round_complete');
    expect(event.reactionTimeMs).toBeGreaterThanOrEqual(0);
  });

  it('should track round count', () => {
    const plugin = createReactionLightPlugin();
    plugin.start();
    plugin.showStimulus();
    plugin.handleInput('tap');
    const results = plugin.getResults();
    expect(results.filter((e) => e.type === 'round_complete')).toHaveLength(1);
  });

  it('should complete after all rounds', () => {
    const plugin = createReactionLightPlugin();
    plugin.start();
    for (let i = 0; i < plugin.config.totalRounds; i++) {
      plugin.showStimulus();
      plugin.handleInput('tap');
    }
    expect(plugin.isComplete()).toBe(true);
  });

  it('should reset state', () => {
    const plugin = createReactionLightPlugin();
    plugin.start();
    plugin.showStimulus();
    plugin.handleInput('tap');
    plugin.reset();
    expect(plugin.isComplete()).toBe(false);
    expect(plugin.getResults()).toHaveLength(0);
  });
});

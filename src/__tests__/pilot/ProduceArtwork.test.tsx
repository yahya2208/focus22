import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { ProduceArtwork, resolveProduceArtKey } from '../../screens/pilot/ProduceArtwork';

const EXPECTED: Array<[string, string]> = [
  ['veg-potato', 'veg-potato'],
  ['veg-tomato', 'veg-tomato'],
  ['veg-onion', 'veg-onion'],
  ['veg-carrot', 'veg-carrot'],
  ['veg-zucchini', 'veg-zucchini'],
  ['veg-bell-pepper', 'veg-bell-pepper'],
  ['veg-hot-pepper', 'veg-hot-pepper'],
  ['veg-lettuce', 'veg-lettuce'],
  ['veg-beans', 'veg-beans'],
  ['veg-garlic', 'veg-garlic'],
];

describe('ProduceArtwork — deterministic mapping', () => {
  it.each(EXPECTED)('source_key %s renders its own artwork', (key, art) => {
    const { container } = render(<ProduceArtwork artKey={resolveProduceArtKey(key, '')} />);
    const svg = container.querySelector('svg[data-art]');
    expect(svg?.getAttribute('data-art')).toBe(art);
  });

  it('resolves via model_id fallback and tolerates case/whitespace', () => {
    expect(resolveProduceArtKey(null, 'veg-carrot')).toBe('veg-carrot');
    expect(resolveProduceArtKey('  VEG-TOMATO ', null)).toBe('veg-tomato');
  });

  it('strips the staging pilot: source_key prefix', () => {
    expect(resolveProduceArtKey('pilot:veg-onion', 'veg-onion')).toBe('veg-onion');
    expect(resolveProduceArtKey('pilot:veg-garlic', 'other')).toBe('veg-garlic');
  });

  it('aliases legacy staging keys to their pilot equivalent', () => {
    expect(resolveProduceArtKey('veg-pepper', null)).toBe('veg-bell-pepper');
    expect(resolveProduceArtKey('pilot:veg-pepper', null)).toBe('veg-bell-pepper');
  });

  it('unknown keys resolve to the placeholder (never emoji, never network)', () => {
    expect(resolveProduceArtKey('veg-dragonfruit', null)).toBe('');
    expect(resolveProduceArtKey(null, null)).toBe('');
    const { container } = render(<ProduceArtwork artKey="" />);
    const svg = container.querySelector('svg[data-art="placeholder"]');
    expect(svg).toBeTruthy();
    expect(svg?.querySelector('path, ellipse, rect, circle')).toBeTruthy();
    expect(container.textContent).not.toMatch(/🥬|📱|🥦/);
  });

  it('renders real SVG shapes (not text/emoji)', () => {
    const { container } = render(<ProduceArtwork artKey="veg-tomato" />);
    expect(container.querySelector('svg')).toBeTruthy();
    expect(container.querySelector('svg ellipse, svg path')).toBeTruthy();
  });

  it('gives every pilot vegetable a distinct silhouette', () => {
    const keys = [
      'veg-potato', 'veg-tomato', 'veg-onion', 'veg-carrot', 'veg-zucchini',
      'veg-bell-pepper', 'veg-hot-pepper', 'veg-lettuce', 'veg-beans', 'veg-garlic',
    ] as const;
    const bodies = keys.map((artKey) => {
      const { container, unmount } = render(<ProduceArtwork artKey={artKey} />);
      const svg = container.querySelector('svg');
      const shapes = svg
        ? Array.from(svg.querySelectorAll('path, ellipse, rect, circle'))
            .map((el) => el.getAttribute('d') ?? `${el.tagName}:${el.getAttribute('cx')},${el.getAttribute('cy')}`)
            .join('|')
        : '';
      unmount();
      return shapes;
    });
    expect(new Set(bodies).size).toBe(keys.length);
  });
});

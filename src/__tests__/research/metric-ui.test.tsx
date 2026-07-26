import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { StatCard } from '../../research-console/layout/ResearchLayout';
import { realMetric, comingSoonMetric } from '../../core/research/types';

afterEach(() => {
  cleanup();
});

describe('StatCard — Metric Rendering', () => {
  it('renders real number value', () => {
    render(<StatCard label="Sessions" value={realMetric(42, 'sessions')} />);
    expect(screen.getByText('42')).toBeTruthy();
    expect(screen.queryByText('Coming Soon')).toBeNull();
  });

  it('renders real string value', () => {
    render(<StatCard label="Status" value={realMetric('healthy', 'users')} />);
    expect(screen.getByText('healthy')).toBeTruthy();
  });

  it('renders coming-soon with dash and badge', () => {
    render(<StatCard label="Realtime" value={comingSoonMetric()} />);
    expect(screen.getByText('—')).toBeTruthy();
    expect(screen.getByText('Coming Soon')).toBeTruthy();
  });

  it('renders plain number (backward compat)', () => {
    const { container } = render(<StatCard label="Count" value={42} />);
    expect(container.textContent).toContain('42');
  });

  it('renders plain string (backward compat)', () => {
    render(<StatCard label="Name" value="Test" />);
    expect(screen.getByText('Test')).toBeTruthy();
  });
});

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, cleanup, fireEvent } from '@testing-library/react';
import { useState } from 'react';
import { ResearchLayout, type DashboardId } from '../../research-console/layout/ResearchLayout';

const ALL_DASHBOARDS: readonly DashboardId[] = [
  'overview', 'scientific', 'users', 'sessions', 'devices', 'system',
  'inventory', 'catalog-health', 'variant-coverage', 'inventory-health',
  'price-memory', 'ads',
];

function Harness({ availableDashboards = ALL_DASHBOARDS, onBack }: { availableDashboards?: readonly DashboardId[]; onBack?: () => void }) {
  const [active, setActive] = useState<DashboardId>('overview');
  return (
    <ResearchLayout activeDashboard={active} onNavigate={setActive} availableDashboards={availableDashboards} onBack={onBack}>
      <p data-testid="content">{active}</p>
    </ResearchLayout>
  );
}

beforeEach(() => {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
  vi.restoreAllMocks();
});

describe('research console sidebar navigation', () => {
  it('renders one button per dashboard and every click switches the active dashboard', () => {
    const { container, getByTestId } = render(<Harness />);

    const nav = container.querySelector('nav[aria-label="Research console navigation"]');
    expect(nav).not.toBeNull();

    const buttons = Array.from(nav!.querySelectorAll('button'));
    expect(buttons).toHaveLength(ALL_DASHBOARDS.length);

    for (let i = 0; i < buttons.length; i++) {
      const button = nav!.querySelectorAll('button')[i]!;
      fireEvent.click(button);
      expect(getByTestId('content').textContent).toBe(ALL_DASHBOARDS[i]);
      expect(nav!.querySelectorAll('button')[i]!.getAttribute('aria-current')).toBe('page');
    }
  });

  it('does NOT remount the sidebar DOM across navigations', () => {
    const { container, getByTestId } = render(<Harness />);
    const nav = container.querySelector('nav[aria-label="Research console navigation"]')!;
    const navNode = nav;

    for (let i = 0; i < ALL_DASHBOARDS.length; i++) {
      fireEvent.click(nav.querySelectorAll('button')[i]!);
      expect(getByTestId('content').textContent).toBe(ALL_DASHBOARDS[i]);
    }

    expect(navNode.isConnected).toBe(true);
    expect(container.querySelector('nav[aria-label="Research console navigation"]')).toBe(navNode);
  });

  it('stays responsive on repeated and rapid clicks (no freeze, lag, or crash)', () => {
    const errors: string[] = [];
    const spy = vi.spyOn(console, 'error').mockImplementation((...args: unknown[]) => {
      errors.push(args.map(String).join(' '));
    });

    const { container, getByTestId } = render(<Harness />);
    const nav = container.querySelector('nav[aria-label="Research console navigation"]')!;
    const navNode = nav;

    for (let i = 0; i < 3; i++) {
      fireEvent.click(nav.querySelectorAll('button')[3]!); // 'sessions'
      expect(getByTestId('content').textContent).toBe('sessions');
      fireEvent.click(nav.querySelectorAll('button')[7]!); // 'catalog-health'
      expect(getByTestId('content').textContent).toBe('catalog-health');
    }

    // rapid-fire: 10 clicks with no await in between, then verify a stable final state
    const rapid = ['overview', 'scientific', 'sessions', 'system', 'catalog-health', 'price-memory', 'overview', 'ads', 'devices', 'sessions'];
    for (const id of rapid) {
      const idx = ALL_DASHBOARDS.indexOf(id as DashboardId);
      fireEvent.click(nav.querySelectorAll('button')[idx]!);
    }
    expect(getByTestId('content').textContent).toBe('sessions');
    expect(navNode.isConnected).toBe(true);

    spy.mockRestore();
    const crashes = errors.filter((e) => /not wrapped in act|uncaught|maximum update|key/i.test(e));
    expect(crashes).toEqual([]);
  });

  it('back button fires onBack without breaking subsequent navigation', () => {
    const onBack = vi.fn();
    const { container, getByTestId } = render(<Harness onBack={onBack} />);
    const nav = container.querySelector('nav[aria-label="Research console navigation"]')!;

    fireEvent.click(nav.querySelectorAll('button')[1]!); // 'scientific'
    expect(getByTestId('content').textContent).toBe('scientific');

    const back = Array.from(nav.parentElement!.querySelectorAll('button')).find((b) => b.getAttribute('title') === 'research.back');
    expect(back).toBeTruthy();
    fireEvent.click(back!);
    expect(onBack).toHaveBeenCalledTimes(1);

    fireEvent.click(nav.querySelectorAll('button')[3]!); // 'sessions'
    expect(getByTestId('content').textContent).toBe('sessions');
  });
});

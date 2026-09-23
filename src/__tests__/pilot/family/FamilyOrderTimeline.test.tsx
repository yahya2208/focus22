import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { FamilyOrderTimeline, stepIndexForStatus } from '../../../screens/pilot/family/FamilyOrderTimeline';

vi.mock('../../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../../hooks/useThemeColors', () => ({
  useThemeColors: () => new Proxy({}, { get: () => '#111111' }),
}));

describe('FamilyOrderTimeline — step mapping', () => {
  it('maps every known status to its step index', () => {
    expect(stepIndexForStatus('pending')).toBe(0);
    expect(stepIndexForStatus('confirmed')).toBe(1);
    expect(stepIndexForStatus('preparing')).toBe(2);
    expect(stepIndexForStatus('out_for_delivery')).toBe(3);
    expect(stepIndexForStatus('delivered')).toBe(4);
    expect(stepIndexForStatus('cancelled')).toBe(-1);
    expect(stepIndexForStatus('mystery')).toBe(-1);
  });

  it('renders all five human steps with the current one highlighted', () => {
    const { container } = render(<FamilyOrderTimeline status="preparing" />);
    for (const key of [
      'pilot.stepReceived',
      'pilot.stepConfirmed',
      'pilot.stepPreparing',
      'pilot.readyForHandoff',
      'pilot.stepDelivered',
    ]) {
      expect(screen.getByText(key)).toBeTruthy();
    }
    // Current step (preparing) is visually dominant: larger badge.
    const badges = Array.from(container.querySelectorAll('span[aria-hidden="true"]')) as HTMLElement[];
    const current = badges.find((b) => b.style.width === '46px');
    expect(current).toBeTruthy();
  });

  it('renders a cancelled note instead of steps, with no raw enum', () => {
    render(<FamilyOrderTimeline status="cancelled" />);
    expect(screen.getByText('pilot.orderCancelled')).toBeTruthy();
    expect(screen.queryByText('cancelled', { exact: true })).toBeNull();
  });

  it('never leaks raw DB statuses for any input', () => {
    for (const status of ['pending', 'confirmed', 'preparing', 'out_for_delivery', 'delivered']) {
      const { unmount } = render(<FamilyOrderTimeline status={status} />);
      expect(screen.queryByText(status, { exact: true })).toBeNull();
      unmount();
    }
  });
});

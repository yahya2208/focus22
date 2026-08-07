import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { Suspense } from 'react';
import App from '../../App';

function renderApp() {
  return render(<Suspense fallback={<div>Loading...</div>}><App /></Suspense>);
}
describe('App', () => {
  const TEST_TIMEOUT = 20000;

  it('should render the home screen by default', async () => {
    renderApp();
    await waitFor(() => {
      expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
    }, { timeout: 5000 });
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  it('should render all home screen buttons', async () => {
    renderApp();
    const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
    expect(buttons.length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByRole('button').length).toBeGreaterThanOrEqual(3);
    const menuButtons = await screen.findAllByRole('button', { name: 'Menu' });
    expect(menuButtons.length).toBeGreaterThanOrEqual(1);
  }, TEST_TIMEOUT);

  describe('P3 Stop-Write: QR/campaign attribution removed from boot', () => {
    afterEach(() => {
      window.history.replaceState({}, '', '/');
    });

    it('a campaign deep-link URL no longer routes to landing/START_QR_FLOW (P3: لا attribution)', async () => {
      window.history.pushState({}, '', '/?campaign=test-campaign&source=qr');
      renderApp();

      // P3 (مسار الخصوصية): campaign params في الـ URL لم تعد تُقرأ إطلاقاً —
      // التطبيق يفتح على الشاشة الرئيسية فقط، ولا landing ولا تتبع حملات.
      await waitFor(() => {
        expect(screen.getByRole('main', { name: 'Main navigation' })).toBeTruthy();
      }, { timeout: 5000 });

      // انتظار إضافي: إثبات عدم وجود تحويل/تتبع متأخر (لا async attribution)
      await new Promise((resolve) => setTimeout(resolve, 1200));
      expect(screen.queryByText('Start Assessment')).toBeNull();
      expect(screen.queryByText('Test Your Focus')).toBeNull();
      const buttons = await screen.findAllByRole('button', { name: '▶ Start Test' });
      expect(buttons.length).toBeGreaterThanOrEqual(1);
    }, 20000);

    it('hash-based initial route still works (P3 يبقي توجيه #/hash دون حملات)', async () => {
      window.history.pushState({}, '', '/#/settings');
      renderApp();

      // InitialRoute لا يزال يعالج #/hash — التوجيه المبدئي السليم محفوظ دون أي
      // فرع حملات: نفتح شاشة الإعدادات بدلاً من البقاء على home أو landing.
      await waitFor(() => {
        expect(screen.getByRole('navigation', { name: 'Settings' })).toBeTruthy();
      }, { timeout: 5000 });

      await new Promise((resolve) => setTimeout(resolve, 800));
      expect(screen.queryByText('Test Your Focus')).toBeNull();
      expect(screen.queryByText('Start Assessment')).toBeNull();
      expect(screen.getByRole('navigation', { name: 'Settings' })).toBeTruthy();
    }, 20000);
  });
});

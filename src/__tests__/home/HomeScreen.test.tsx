import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '../../screens/home/HomeScreen';
import { AppProvider, useAppState } from '../../store/navigation';

vi.mock('../../hooks/useTranslation', () => ({
  useTranslation: () => ({ t: (key: string) => key, locale: 'en', dir: 'ltr' }),
}));
vi.mock('../../core/auth/AuthProvider', () => ({
  useAuth: () => ({ state: { user: null }, researchRole: 'none' }),
}));
vi.mock('../../components/navigation/HomeMenu', () => ({ HomeMenu: () => null }));
vi.mock('../../components/brand/BrandLogo', () => ({ BrandLogo: () => null }));
vi.mock('../../components/brand/BrandFooter', () => ({ BrandFooter: () => null }));

function ScreenProbe() {
  const { screen: current, routeParams } = useAppState();
  return (
    <div data-testid="screen" data-params={JSON.stringify(routeParams ?? {})}>
      {current}
    </div>
  );
}

function renderHome() {
  return render(
    <AppProvider>
      <HomeScreen />
      <ScreenProbe />
    </AppProvider>,
  );
}

const isBefore = (a: Element, b: Element) =>
  (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

describe('HomeScreen — H1 landing order (menu → hero → two cards → contact)', () => {
  it('presents exactly the FOCUS hero, two portal cards, then contact actions', () => {
    renderHome();

    const menuButton = screen.getByLabelText('home.menu');
    const hero = screen.getByText('home.whatToday');
    const vegCard = screen.getByText('home.vegetables');
    const phonesCard = screen.getByText('home.phones');
    const callButton = screen.getByLabelText('home.callUs');
    const whatsappButton = screen.getByLabelText('home.whatsapp');

    expect(screen.getByText('FOCUS')).toBeTruthy();
    expect(isBefore(menuButton, hero)).toBe(true);
    expect(isBefore(hero, vegCard)).toBe(true);
    expect(isBefore(hero, phonesCard)).toBe(true);
    expect(isBefore(vegCard, callButton)).toBe(true);
    expect(isBefore(phonesCard, whatsappButton)).toBe(true);
  });

  it('has no dashboard sections', () => {
    renderHome();

    expect(screen.queryByText('home.startTest')).toBeNull();
    expect(screen.queryByText('home.services', { exact: true })).toBeNull();
    expect(screen.queryByText('home.stats')).toBeNull();
    expect(screen.queryByText('home.latestDevices')).toBeNull();
    expect(screen.queryByText('home.noDevices')).toBeNull();
    expect(screen.queryByTestId('home-ad')).toBeNull();
  });
});

describe('HomeScreen — portal navigation', () => {
  it('opens the vegetables storefront with the produce category', () => {
    renderHome();

    fireEvent.click(screen.getByLabelText('home.vegetables'));

    const probe = screen.getByTestId('screen');
    expect(probe.textContent).toBe('pilot-storefront');
    expect(JSON.parse(probe.getAttribute('data-params') ?? '{}')).toEqual(
      expect.objectContaining({ category: 'produce' }),
    );
  });

  it('opens the phone gallery directly', () => {
    renderHome();

    fireEvent.click(screen.getByLabelText('home.phones'));

    expect(screen.getByTestId('screen').textContent).toBe('showroom');
  });
});

describe('HomeScreen — contact actions', () => {
  it('exposes a direct-call link', () => {
    renderHome();

    const href = screen.getByLabelText('home.callUs').getAttribute('href') ?? '';
    expect(href.startsWith('tel:')).toBe(true);
    expect(href.replace(/[^0-9]/g, '')).toContain('213556254007');
  });

  it('uses the business WhatsApp pipeline number', () => {
    renderHome();

    const href = screen.getByLabelText('home.whatsapp').getAttribute('href') ?? '';
    expect(href).toContain('wa.me/213556254007');
  });
});

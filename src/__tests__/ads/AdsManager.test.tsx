import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, within, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { AdsManager } from '../../research-console/pages/ads/AdsManager';

interface AdImageShape {
  id: string;
  path: string;
  url: string;
  position: number;
  isCover: boolean;
  deviceId?: string;
}

interface AdConfigShape {
  enabled: boolean;
  image: string;
  link: string;
  alt: string;
  deviceId: string;
  destinationType?: string;
  destination?: Record<string, unknown>;
  title?: string;
  images?: AdImageShape[];
}

const mock = vi.hoisted(() => {
  const PLACEMENTS = ['home', 'phones', 'repair', 'results', 'exchange', 'phone-details'] as const;
  let ads: Record<string, AdConfigShape> = {};
  return {
    PLACEMENTS,
    __setAds: (next: Record<string, AdConfigShape>) => {
      ads = next;
    },
    __emptyAds: () => {
      const empty = {} as Record<string, AdConfigShape>;
      for (const p of PLACEMENTS) empty[p] = { enabled: false, image: '', link: '', alt: '', deviceId: '' };
      return empty;
    },
    refreshAds: vi.fn(async () => {}),
    getAds: vi.fn(() => ads),
    saveAd: vi.fn(async () => {}),
    resetAd: vi.fn(async () => {}),
    uploadAdImage: vi.fn(async () => ({ path: 'ads/home/new.jpg', url: 'https://cdn/new.jpg' })),
    replaceAdImages: vi.fn(async () => {}),
    removeAdImage: vi.fn(async () => {}),
    AD_PLACEMENTS: PLACEMENTS,
    compressImageToBlob: vi.fn(async () => new Blob(['x'], { type: 'image/jpeg' })),
    buildAdPhoneLink: vi.fn((deviceId: string) => `#/phone-details?device=${deviceId}`),
  };
});

vi.mock('../../services/ads-service', () => ({
  refreshAds: mock.refreshAds,
  getAds: mock.getAds,
  saveAd: mock.saveAd,
  resetAd: mock.resetAd,
  uploadAdImage: mock.uploadAdImage,
  replaceAdImages: mock.replaceAdImages,
  removeAdImage: mock.removeAdImage,
  AD_PLACEMENTS: mock.AD_PLACEMENTS,
  buildAdPhoneLink: mock.buildAdPhoneLink,
}));

vi.mock('../../services/image-service', () => ({
  compressImageToBlob: mock.compressImageToBlob,
}));

vi.mock('../../services/inventory-service', () => ({
  InventoryService: {
    getExchangeableDevices: () => [
      { id: 'dev-samsung-1', brand: 'Samsung', model: 'Galaxy S22', variant: '128GB', quantity: 2, status: 'in_stock' },
    ],
  },
}));

afterEach(() => {
  cleanup();
});

describe('AdsManager', () => {
  beforeEach(() => {
    Object.defineProperty(URL, 'createObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn(() => 'blob:mock'),
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      writable: true,
      configurable: true,
      value: vi.fn(),
    });
    vi.clearAllMocks();
    mock.__setAds(mock.__emptyAds());
  });

  function cardFor(label: string): HTMLElement {
    const heading = screen.getByText(label);
    let el: HTMLElement | null = heading;
    while (el && el.querySelector('input[type="file"]') === null) {
      el = el.parentElement;
    }
    if (!el) throw new Error(`Ad card not found for ${label}`);
    return el;
  }

  it('shows a loading note, then renders all placement cards', async () => {
    render(<AdsManager />);
    expect(screen.getByText('جارِ التحميل...')).toBeTruthy();

    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());
    expect(screen.getByText('📍 الصفحة الرئيسية')).toBeTruthy();
    expect(screen.getByText('📍 صفحة الهواتف')).toBeTruthy();
    expect(screen.getByText('📍 صفحة الصيانة')).toBeTruthy();
    expect(screen.getAllByRole('checkbox')).toHaveLength(mock.PLACEMENTS.length);
  });

  it('reflects an enabled ad as a checked toggle', async () => {
    const ads = mock.__emptyAds();
    ads.home = { enabled: true, image: 'https://cdn/home.png', link: '', alt: '', deviceId: '' };
    mock.__setAds(ads);

    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    expect((within(cardFor('📍 الصفحة الرئيسية')).getByRole('checkbox') as HTMLInputElement).checked).toBe(true);
    expect((within(cardFor('📍 صفحة الصيانة')).getByRole('checkbox') as HTMLInputElement).checked).toBe(false);
  });

  it('saves the edited config when  حفظ ونشر is clicked', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('checkbox'));
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({ placement: 'home', enabled: true }));
    await waitFor(() => expect(screen.getByText('✓ تم الحفظ — لا توجد صورة، لن يظهر للزوار')).toBeTruthy());
  });

  it('uploads a compressed image into the gallery and applies it on save', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    const fileInput = homeCard.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'banner.png', { type: 'image/png' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    await waitFor(() => expect(mock.compressImageToBlob).toHaveBeenCalled());
    expect(mock.compressImageToBlob).toHaveBeenCalledWith(file, { maxDimension: 1280, quality: 0.8 });

    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.uploadAdImage).toHaveBeenCalled());
    expect(mock.uploadAdImage).toHaveBeenCalledWith('home', expect.any(Blob));
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({ placement: 'home' }));
    await waitFor(() => expect(mock.replaceAdImages).toHaveBeenCalled());
    expect(mock.replaceAdImages).toHaveBeenCalledWith('home', ['ads/home/new.jpg'], [true], ['']);
  });

  it('removes the ad via resetAd when  إزالة is clicked', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const repairCard = cardFor('📍 صفحة الصيانة');
    fireEvent.click(within(repairCard).getByRole('button', { name: '🗑 إزالة' }));

    await waitFor(() => expect(mock.resetAd).toHaveBeenCalledWith('repair'));
    await waitFor(() => expect(screen.getByText('✓ تمت الإزالة')).toBeTruthy());
  });

  it('surfaces save errors as status text', async () => {
    mock.saveAd.mockRejectedValueOnce(new Error('فشل الحفظ: DB down'));
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const phonesCard = cardFor('📍 صفحة الهواتف');
    fireEvent.click(within(phonesCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(screen.getByText('فشل الحفظ: DB down')).toBeTruthy());
  });

  it('selecting a phone derives the phone link and saves deviceId + derived link', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.change(within(homeCard).getByRole('combobox'), { target: { value: 'dev-samsung-1' } });

    const derivedLink = within(homeCard).getByTestId('ad-phone-link') as HTMLInputElement;
    expect(derivedLink.value).toBe('#/phone-details?device=dev-samsung-1');

    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));
    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({
      placement: 'home',
      deviceId: 'dev-samsung-1',
      link: '#/phone-details?device=dev-samsung-1',
    }));
  });

  it('blocks save when the linked phone is not in the current inventory', async () => {
    const ads = mock.__emptyAds();
    ads.home = {
      enabled: true, image: 'https://cdn/home.png', alt: '',
      link: '#/phone-details?device=ghost-device', deviceId: 'ghost-device',
    };
    mock.__setAds(ads);

    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(screen.getByText(/الهاتف المحدد غير موجود/)).toBeTruthy());
    expect(mock.saveAd).not.toHaveBeenCalled();
  });

  it('renders the loaded gallery and persists cover/order via replaceAdImages', async () => {
    const ads = mock.__emptyAds();
    ads.home = {
      enabled: true, image: 'https://cdn/cover.jpg', link: '', alt: '', deviceId: '',
      images: [
        { id: 'g1', path: 'ads-images/home/a.jpg', url: 'https://cdn/a.jpg', position: 0, isCover: true },
        { id: 'g2', path: 'ads-images/home/b.jpg', url: 'https://cdn/b.jpg', position: 1, isCover: false },
      ],
    };
    mock.__setAds(ads);

    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    expect(homeCard.querySelectorAll('img[data-gallery-thumb]')).toHaveLength(2);

    // move the second image up, then save -> replaceAdImages persists the reorder
    fireEvent.click(within(homeCard).getByRole('button', { name: 'رفع صورة 1' }));
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.replaceAdImages).toHaveBeenCalled());
    expect(mock.replaceAdImages).toHaveBeenCalledWith('home', ['ads-images/home/b.jpg', 'ads-images/home/a.jpg'], [false, true], ['', '']);
  });

  it('assigns a per-slide device and persists deviceIds via replaceAdImages', async () => {
    const ads = mock.__emptyAds();
    ads.home = {
      enabled: true, image: 'https://cdn/cover.jpg', link: '', alt: '', deviceId: '',
      images: [
        { id: 'g1', path: 'ads-images/home/a.jpg', url: 'https://cdn/a.jpg', position: 0, isCover: true, deviceId: '' },
        { id: 'g2', path: 'ads-images/home/b.jpg', url: 'https://cdn/b.jpg', position: 1, isCover: false, deviceId: '' },
      ],
    };
    mock.__setAds(ads);

    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    const slideSelect = within(homeCard).getByTestId('ad-slide-device-0') as HTMLSelectElement;
    fireEvent.change(slideSelect, { target: { value: 'dev-samsung-1' } });
    expect(slideSelect.value).toBe('dev-samsung-1');

    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.replaceAdImages).toHaveBeenCalled());
    expect(mock.replaceAdImages).toHaveBeenCalledWith(
      'home',
      ['ads-images/home/a.jpg', 'ads-images/home/b.jpg'],
      [true, false],
      ['dev-samsung-1', ''],
    );
  });

  it('blocks save when a per-slide device is not in the current inventory', async () => {
    const ads = mock.__emptyAds();
    ads.home = {
      enabled: true, image: 'https://cdn/cover.jpg', link: '', alt: '', deviceId: '',
      images: [
        { id: 'g1', path: 'ads-images/home/a.jpg', url: 'https://cdn/a.jpg', position: 0, isCover: true, deviceId: 'ghost-device' },
      ],
    };
    mock.__setAds(ads);

    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(screen.getByText(/هاتف إحدى الصور غير موجود/)).toBeTruthy());
    expect(mock.replaceAdImages).not.toHaveBeenCalled();
  });

  it('shows the four destination types per placement', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    expect(within(homeCard).getByRole('radio', { name: 'هاتف (مخزون)' })).toBeTruthy();
    expect(within(homeCard).getByRole('radio', { name: 'رابط خارجي (http)' })).toBeTruthy();
    expect(within(homeCard).getByRole('radio', { name: 'واتساب' })).toBeTruthy();
    expect(within(homeCard).getByRole('radio', { name: 'شاشة داخلية' })).toBeTruthy();
  });

  it('saves an external destination as destination.external.url without legacy link/deviceId', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'رابط خارجي (http)' }));
    fireEvent.change(within(homeCard).getByTestId('ad-external-url'), { target: { value: 'https://example.com/offer' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({
      placement: 'home',
      destinationType: 'external',
      destination: { external: { url: 'https://example.com/offer' } },
    }));
    const firstCall = mock.saveAd.mock.calls[0] as unknown[];
    const args = (firstCall?.[0] as Record<string, unknown>) ?? {};
    expect(args).not.toHaveProperty('link');
    expect(args).not.toHaveProperty('deviceId');
  });

  it('disables save with a live warning when the external URL is invalid', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'رابط خارجي (http)' }));
    fireEvent.change(within(homeCard).getByTestId('ad-external-url'), { target: { value: 'javascript:alert(1)' } });

    await waitFor(() => expect(within(homeCard).getByText(/الوجهة الخارجية تتطلب رابطًا مطلقًا صالحًا/)).toBeTruthy());
    expect((within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.saveAd).not.toHaveBeenCalled();
  });

  it('saves a whatsapp destination as destination.whatsapp.{number,message}', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'واتساب' }));
    fireEvent.change(within(homeCard).getByTestId('ad-wa-number'), { target: { value: '+966512345678' } });
    fireEvent.change(within(homeCard).getByTestId('ad-wa-message'), { target: { value: 'مرحبًا، أستفسر عن العرض' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({
      placement: 'home',
      destinationType: 'whatsapp',
      destination: { whatsapp: { number: '+966512345678', message: 'مرحبًا، أستفسر عن العرض' } },
    }));
  });

  it('disables save with a live warning when the whatsapp number is invalid', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'واتساب' }));
    fireEvent.change(within(homeCard).getByTestId('ad-wa-number'), { target: { value: '123' } });

    await waitFor(() => expect(within(homeCard).getByText(/تتطلب رقمًا صالحًا/)).toBeTruthy());
    expect((within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.saveAd).not.toHaveBeenCalled();
  });

  it('saves an internal destination with a selected screen and no params', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'شاشة داخلية' }));
    fireEvent.change(within(homeCard).getByTestId('ad-internal-screen'), { target: { value: 'showroom' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({
      placement: 'home',
      destinationType: 'internal',
      destination: { internal: { screen: 'showroom', params: {} } },
    }));
  });

  it('requires a device for the internal phone-details screen', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.click(within(homeCard).getByRole('radio', { name: 'شاشة داخلية' }));
    fireEvent.change(within(homeCard).getByTestId('ad-internal-screen'), { target: { value: 'phone-details' } });

    await waitFor(() => expect(within(homeCard).getByText(/تتطلب اختيار هاتف مرتبط/)).toBeTruthy());
    expect((within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }) as HTMLButtonElement).disabled).toBe(true);
    expect(mock.saveAd).not.toHaveBeenCalled();

    fireEvent.change(within(homeCard).getByTestId('ad-internal-device'), { target: { value: 'dev-samsung-1' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({
      placement: 'home',
      destinationType: 'internal',
      destination: { internal: { screen: 'phone-details', params: { device: 'dev-samsung-1' } } },
    }));
  });

  it('saves the title alongside the destination', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.change(within(homeCard).getByTestId('ad-title'), { target: { value: 'عرض الافتتاح' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    expect(mock.saveAd).toHaveBeenCalledWith(expect.objectContaining({ placement: 'home', title: 'عرض الافتتاح' }));
  });

  it('keeps the legacy phone save path when the phone destination is selected', async () => {
    render(<AdsManager />);
    await waitFor(() => expect(screen.queryByText('جارِ التحميل...')).toBeNull());

    const homeCard = cardFor('📍 الصفحة الرئيسية');
    fireEvent.change(within(homeCard).getByRole('combobox'), { target: { value: 'dev-samsung-1' } });
    fireEvent.click(within(homeCard).getByRole('button', { name: '💾 حفظ ونشر' }));

    await waitFor(() => expect(mock.saveAd).toHaveBeenCalled());
    const firstCall = mock.saveAd.mock.calls[0] as unknown[];
    const args = (firstCall?.[0] as Record<string, unknown>) ?? {};
    expect(args).toMatchObject({ placement: 'home', deviceId: 'dev-samsung-1', link: '#/phone-details?device=dev-samsung-1' });
    expect(args).not.toHaveProperty('destination');
  });
});
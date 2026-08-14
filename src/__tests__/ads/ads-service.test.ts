import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockStorage, mockChannel, resetDefaults, mockRpc } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(): any {
    const c: Record<string, unknown> = {};
    c.select = vi.fn(() => c);
    c.insert = vi.fn(() => c);
    c.update = vi.fn(() => c);
    c.upsert = vi.fn(() => c);
    c.delete = vi.fn(() => c);
    c.order = vi.fn(() => c);
    c.single = vi.fn();
    c.maybeSingle = vi.fn();
    c.eq = vi.fn(() => {
      // eq terminates the delete flow (await) but must stay chainable for
      // the select flow (select().eq().maybeSingle()).
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thenable = Object.create(c) as any;
      thenable.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return thenable;
    });
    return c;
  }
  const tables = { ads: makeChain(), ad_images: makeChain() };
  const mockFrom = vi.fn((table = '') => tables[table as keyof typeof tables] ?? tables.ads);
  const mockRpc = vi.fn(async () => ({ data: null as string | null, error: null }));
  const storageObj = {
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://test.supabase.co/storage/v1/object/public/ads-images/${path}` } }),
    upload: vi.fn(),
    remove: vi.fn(),
  };
  const mockStorage = { from: vi.fn((_bucket = '') => storageObj) };
  const mockChannel = {
    on: vi.fn(() => mockChannel),
    subscribe: vi.fn(() => ({ unsubscribe: vi.fn() })),
  };
  // vi.clearAllMocks() only clears call history, so any mockResolvedValue set
  // by a previous test would leak here. Re-apply the chainable defaults.
  function resetDefaults() {
    for (const chain of Object.values(tables)) {
      chain.select.mockImplementation(() => chain);
      chain.insert.mockImplementation(() => chain);
      chain.update.mockImplementation(() => chain);
      chain.upsert.mockImplementation(() => chain);
      chain.delete.mockImplementation(() => chain);
      chain.order.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const thenable = Object.create(chain) as any;
        thenable.then = (resolve: (v: unknown) => void) => resolve({ data: [], error: null });
        return thenable;
      });
      chain.eq.mockImplementation(() => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const thenable = Object.create(chain) as any;
        thenable.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
        return thenable;
      });
      chain.single.mockImplementation(async () => ({ data: null, error: null }));
      chain.maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
    }
    storageObj.upload.mockImplementation(async () => ({ error: null }));
    storageObj.remove.mockImplementation(async () => ({ error: null }));
    mockRpc.mockImplementation(async () => ({ data: null, error: null }));
  }
  return { mockFrom, mockStorage, mockChannel, resetDefaults, mockRpc };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    storage: mockStorage,
    rpc: mockRpc,
    channel: vi.fn((_name = '') => mockChannel),
  }),
}));

import {
  AD_PLACEMENTS, ensureAdsLoaded, getAd, getAds, saveAd, resetAd, uploadAdImage, resetAdsService,
  replaceAdImages, addAdImage, removeAdImage,
  buildAdPhoneLink, validateAdInput,
} from '../../services/ads-service';

describe('ads-service (Supabase-backed)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaults();
    resetAdsService();
    mockFrom.mockClear();
    mockStorage.from.mockClear();
    mockStorage.from('ads-images').upload.mockClear();
  });

  it('loads ads from the ads table and exposes them via getAd', async () => {
    mockFrom().select.mockResolvedValue({
      data: [
        { placement: 'home', enabled: true, image_path: '', image_url: 'https://cdn/x.jpg', link: 'https://go', alt: 'X' },
        { placement: 'phones', enabled: false, image_path: '', image_url: '', link: '', alt: '' },
      ],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')).toEqual({ enabled: true, image: 'https://cdn/x.jpg', link: 'https://go', alt: 'X', deviceId: '', images: [] });
    expect(getAd('phones')?.enabled).toBe(false);
    // every placement is present
    expect(Object.keys(getAds() ?? {})).toHaveLength(AD_PLACEMENTS.length);
  });

  it('returns disabled defaults when the table is unavailable (SQL not applied yet)', async () => {
    mockFrom().select.mockResolvedValue({ data: null, error: { message: 'relation "ads" does not exist' } });

    await ensureAdsLoaded();
    expect(getAd('home')).toEqual({ enabled: false, image: '', link: '', alt: '', deviceId: '', images: [] });
  });

  it('resolves the public URL from a storage path when image_url is empty', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'results', enabled: true, image_path: 'ads/results/1.jpg', image_url: '', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('results')?.image).toContain('ads-images/ads/results/1.jpg');
  });

  it('saveAd upserts the row and refreshes the cache', async () => {
    mockFrom().upsert.mockResolvedValue({ error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await saveAd({ placement: 'home', enabled: true, link: 'https://go', alt: '' });
    expect(mockFrom).toHaveBeenCalledWith('ads');
    expect(mockFrom().upsert).toHaveBeenCalledWith(expect.objectContaining({ placement: 'home', enabled: true, link: 'https://go', device_id: '' }));
  });

  it('saveAd with a deviceId derives the internal phone link and stores device_id', async () => {
    mockFrom().upsert.mockResolvedValue({ error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await saveAd({ placement: 'showroom', enabled: true, alt: 'A', deviceId: 'dev-123' });
    const expectedLink = buildAdPhoneLink('dev-123');
    expect(mockFrom().upsert).toHaveBeenCalledWith(expect.objectContaining({ link: expectedLink, device_id: 'dev-123' }));
  });

  it('saveAd overrides a stale phone link with the derived one', async () => {
    mockFrom().upsert.mockResolvedValue({ error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await saveAd({
      placement: 'showroom', enabled: true, alt: 'A',
      link: buildAdPhoneLink('stale-id'), deviceId: 'dev-456',
    });
    expect(mockFrom().upsert).toHaveBeenCalledWith(expect.objectContaining({ link: buildAdPhoneLink('dev-456'), device_id: 'dev-456' }));
  });

  it('rowToConfig surfaces device_id as deviceId on the loaded config', async () => {
    mockFrom().select.mockResolvedValue({
      data: [
        { placement: 'home', enabled: true, image_path: '', image_url: 'https://cdn/x.jpg', link: buildAdPhoneLink('dev-1'), alt: 'X', device_id: 'dev-1' },
      ],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.deviceId).toBe('dev-1');
    expect(getAd('home')?.link).toBe(buildAdPhoneLink('dev-1'));
  });

  it('buildAdPhoneLink / validateAdInput: phone-link consistency rules', async () => {
    const id = '36be2ef7-2e28-4c18-8bf7-2c9f3e9d4a51';
    const link = buildAdPhoneLink(id);
    expect(link).toBe(`#/phone-details?device=${id}`);
    expect(() => validateAdInput({ placement: 'home', enabled: true, deviceId: id, link })).not.toThrow();
    expect(() => validateAdInput({ placement: 'home', enabled: true, link })).toThrow(/device/);
    expect(() => validateAdInput({ placement: 'home', enabled: true, deviceId: id })).toThrow(/رابط هاتف/);
    expect(() => validateAdInput({ placement: 'home', enabled: true, deviceId: id, link: buildAdPhoneLink('other-device') })).toThrow(/لا يطابق/);
    expect(() => validateAdInput({ placement: 'home', enabled: true, deviceId: id, link: 'https://external.com' })).toThrow(/رابط هاتف داخلي/);
  });

  it('validateAdInput: an enabled ad requires a destination link', () => {
    expect(() => validateAdInput({ placement: 'home', enabled: true, link: '' })).toThrow(/رابط وجهة/);
    expect(() => validateAdInput({ placement: 'home', enabled: false, link: '' })).not.toThrow();
  });

  it('resetAd deletes the row and its storage object', async () => {
    mockFrom().maybeSingle.mockResolvedValue({ data: { image_path: 'ads/home/old.jpg' }, error: null });

    await resetAd('home');
    expect(mockFrom().delete).toHaveBeenCalled();
    expect(mockStorage.from).toHaveBeenCalledWith('ads-images');
    expect(mockStorage.from('ads-images').remove).toHaveBeenCalledWith(['ads/home/old.jpg']);
  });

  it('uploadAdImage uploads the compressed blob to the bucket', async () => {
    mockStorage.from('ads-images').upload.mockResolvedValue({ error: null });
    const result = await uploadAdImage('home', new Blob(['x'], { type: 'image/jpeg' }));
    expect(mockStorage.from).toHaveBeenCalledWith('ads-images');
    expect(mockStorage.from('ads-images').upload).toHaveBeenCalledTimes(1);
    expect(result.path).toMatch(/^ads-images\/home\/.+\.jpg$/);
    expect(result.url).toContain('ads-images');
  });
});

describe('F-204 — stale/broken ad URL resolution (ads-service)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaults();
    resetAdsService();
  });

  it('valid image_url is used as-is', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: '', image_url: 'https://cdn/ok.jpg', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.image).toBe('https://cdn/ok.jpg');
  });

  it('missing image_url + valid image_path resolves the public URL from the path', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'results', enabled: true, image_path: 'ads/results/1.jpg', image_url: '', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('results')?.image).toContain('ads-images/ads/results/1.jpg');
  });

  it('invalid image_url falls back to a valid image_path', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: 'ads/home/1.jpg', image_url: 'not-a-url', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.image).toContain('ads-images/ads/home/1.jpg');
  });

  it('invalid image_url + missing image_path resolves empty', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: '', image_url: 'not-a-url', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.image).toBe('');
  });

  it('stale/broken (malformed scheme) image_url with no path resolves empty', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'phones', enabled: true, image_path: '', image_url: 'https://', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('phones')?.image).toBe('');
  });

  it('whitespace-only image_url and image_path resolve empty', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'repair', enabled: true, image_path: '   ', image_url: '  ', link: '', alt: '' }],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('repair')?.image).toBe('');
  });

  it('existing valid ads continue to render normally (regression)', async () => {
    mockFrom().select.mockResolvedValue({
      data: [
        { placement: 'home', enabled: true, image_path: '', image_url: 'https://cdn/a.jpg', link: 'https://go', alt: 'A' },
        { placement: 'phones', enabled: true, image_path: 'ads/phones/1.jpg', image_url: '', link: '', alt: 'B' },
      ],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.image).toBe('https://cdn/a.jpg');
    expect(getAd('phones')?.image).toContain('ads-images/ads/phones/1.jpg');
  });
});

describe('Phase C — ad galleries (ad_images)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetDefaults();
    resetAdsService();
  });

  it('loads the ordered gallery for a placement into images[]', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: '', image_url: '', link: '', alt: '', device_id: '' }],
      error: null,
    });
    mockFrom('ad_images').order.mockResolvedValue({
      data: [
        { id: 'img-1', ad_placement: 'home', path: 'ads-images/home/a.jpg', position: 0, is_cover: true },
        { id: 'img-2', ad_placement: 'home', path: 'ads-images/home/b.jpg', position: 1, is_cover: false },
      ],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.images).toHaveLength(2);
    expect(getAd('home')?.images?.[0]).toMatchObject({ id: 'img-1', path: 'ads-images/home/a.jpg', position: 0, isCover: true });
    expect(getAd('home')?.images?.[1]?.url).toContain('ads-images/ads-images/home/b.jpg');
  });

  it('tolerates a missing ad_images table (legacy pre-Phase-C rows)', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: '', image_url: 'https://cdn/x.jpg', link: '', alt: '' }],
      error: null,
    });
    mockFrom('ad_images').order.mockRejectedValue({ message: 'relation "ad_images" does not exist' });

    await ensureAdsLoaded();
    expect(getAd('home')?.image).toBe('https://cdn/x.jpg');
    expect(getAd('home')?.images).toEqual([]);
  });

  it('replaceAdImages calls the RPC and removes stale storage objects', async () => {
    mockFrom('ad_images').select.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [{ path: 'ads-images/home/old.jpg' }], error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await replaceAdImages('home', ['ads-images/home/a.jpg'], [true]);
    expect(mockRpc).toHaveBeenCalledWith('ad_replace_images', {
      p_ad_placement: 'home', p_paths: ['ads-images/home/a.jpg'], p_covers: [true],
    });
    expect(mockStorage.from('ads-images').remove).toHaveBeenCalledWith(['ads-images/home/old.jpg']);
  });

  it('replaceAdImages with no paths is a no-op', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    await replaceAdImages('home', [], []);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it('addAdImage / removeAdImage call the gallery RPCs', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await addAdImage('home', 'ads-images/home/new.jpg', 0, false);
    expect(mockRpc).toHaveBeenCalledWith('ad_add_image', {
      p_ad_placement: 'home', p_path: 'ads-images/home/new.jpg', p_position: 0, p_is_cover: false,
    });

    mockRpc.mockResolvedValue({ data: 'ads-images/home/old.jpg', error: null });
    await removeAdImage('img-1');
    expect(mockRpc).toHaveBeenCalledWith('ad_remove_image', { p_image_id: 'img-1' });
    expect(mockStorage.from('ads-images').remove).toHaveBeenCalledWith(['ads-images/home/old.jpg']);
  });

  it('surfaces per-slide device_id as deviceId on the loaded gallery (00021)', async () => {
    mockFrom().select.mockResolvedValue({
      data: [{ placement: 'home', enabled: true, image_path: '', image_url: '', link: '', alt: '', device_id: '' }],
      error: null,
    });
    mockFrom('ad_images').order.mockResolvedValue({
      data: [
        { id: 'img-1', ad_placement: 'home', path: 'ads-images/home/a.jpg', position: 0, is_cover: true, device_id: 'dev-samsung-1' },
        { id: 'img-2', ad_placement: 'home', path: 'ads-images/home/b.jpg', position: 1, is_cover: false, device_id: '' },
      ],
      error: null,
    });

    await ensureAdsLoaded();
    expect(getAd('home')?.images?.[0]?.deviceId).toBe('dev-samsung-1');
    expect(getAd('home')?.images?.[1]?.deviceId).toBe('');
  });

  it('replaceAdImages with per-slide deviceIds calls the 00021 RPC', async () => {
    mockFrom('ad_images').select.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [{ path: 'ads-images/home/old.jpg' }], error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await replaceAdImages('home', ['ads-images/home/a.jpg'], [true], ['dev-samsung-1']);
    expect(mockRpc).toHaveBeenCalledWith('ad_replace_images_devices', {
      p_ad_placement: 'home',
      p_paths: ['ads-images/home/a.jpg'],
      p_covers: [true],
      p_device_ids: ['dev-samsung-1'],
    });
  });

  it('replaceAdImages with all-empty deviceIds keeps the device-free 00020 RPC', async () => {
    mockFrom('ad_images').select.mockReturnValue({
      eq: vi.fn().mockResolvedValue({ data: [{ path: 'ads-images/home/old.jpg' }], error: null }),
    });
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await replaceAdImages('home', ['ads-images/home/a.jpg'], [true], ['']);
    expect(mockRpc).toHaveBeenCalledWith('ad_replace_images', {
      p_ad_placement: 'home',
      p_paths: ['ads-images/home/a.jpg'],
      p_covers: [true],
    });
    expect(mockRpc).not.toHaveBeenCalledWith('ad_replace_images_devices', expect.anything());
  });

  it('replaceAdImages rejects a deviceIds length mismatch', async () => {
    await expect(
      replaceAdImages('home', ['ads-images/home/a.jpg', 'ads-images/home/b.jpg'], [true, false], ['dev-samsung-1']),
    ).rejects.toThrow('عدد الأجهزة لا يطابق عدد الصور');
  });

  it('addAdImage with a deviceId calls the 00021 RPC, otherwise the 00020 RPC', async () => {
    mockRpc.mockResolvedValue({ data: null, error: null });
    mockFrom().select.mockResolvedValue({ data: [], error: null });

    await addAdImage('home', 'ads-images/home/new.jpg', 0, false, 'dev-samsung-1');
    expect(mockRpc).toHaveBeenCalledWith('ad_add_image_devices', {
      p_ad_placement: 'home',
      p_path: 'ads-images/home/new.jpg',
      p_position: 0,
      p_is_cover: false,
      p_device_id: 'dev-samsung-1',
    });

    mockRpc.mockResolvedValue({ data: null, error: null });
    await addAdImage('home', 'ads-images/home/new2.jpg', 1, false);
    expect(mockRpc).toHaveBeenCalledWith('ad_add_image', {
      p_ad_placement: 'home',
      p_path: 'ads-images/home/new2.jpg',
      p_position: 1,
      p_is_cover: false,
    });
  });
});

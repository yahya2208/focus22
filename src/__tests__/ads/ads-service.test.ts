import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockFrom, mockStorage, mockChannel, resetDefaults } = vi.hoisted(() => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  function makeChain(): any {
    const c: Record<string, unknown> = {};
    c.select = vi.fn(() => c);
    c.insert = vi.fn(() => c);
    c.update = vi.fn(() => c);
    c.upsert = vi.fn(() => c);
    c.delete = vi.fn(() => c);
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const chain = makeChain() as any;
  const mockFrom = vi.fn((_table = '') => chain);
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
    chain.select.mockImplementation(() => chain);
    chain.insert.mockImplementation(() => chain);
    chain.update.mockImplementation(() => chain);
    chain.upsert.mockImplementation(() => chain);
    chain.delete.mockImplementation(() => chain);
    chain.eq.mockImplementation(() => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const thenable = Object.create(chain) as any;
      thenable.then = (resolve: (v: unknown) => void) => resolve({ data: null, error: null });
      return thenable;
    });
    chain.single.mockImplementation(async () => ({ data: null, error: null }));
    chain.maybeSingle.mockImplementation(async () => ({ data: null, error: null }));
    storageObj.upload.mockImplementation(async () => ({ error: null }));
    storageObj.remove.mockImplementation(async () => ({ error: null }));
  }
  return { mockFrom, mockStorage, mockChannel, resetDefaults };
});

vi.mock('../../core/supabase/client', () => ({
  getSupabaseClient: () => ({
    from: mockFrom,
    storage: mockStorage,
    channel: vi.fn((_name = '') => mockChannel),
  }),
}));

import {
  AD_PLACEMENTS, ensureAdsLoaded, getAd, getAds, saveAd, resetAd, uploadAdImage, resetAdsService,
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
    expect(getAd('home')).toEqual({ enabled: true, image: 'https://cdn/x.jpg', link: 'https://go', alt: 'X' });
    expect(getAd('phones')?.enabled).toBe(false);
    // every placement is present
    expect(Object.keys(getAds() ?? {})).toHaveLength(AD_PLACEMENTS.length);
  });

  it('returns disabled defaults when the table is unavailable (SQL not applied yet)', async () => {
    mockFrom().select.mockResolvedValue({ data: null, error: { message: 'relation "ads" does not exist' } });

    await ensureAdsLoaded();
    expect(getAd('home')).toEqual({ enabled: false, image: '', link: '', alt: '' });
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

    await saveAd({ placement: 'home', enabled: true, image_url: 'https://cdn/x.jpg', link: '', alt: '' });
    expect(mockFrom).toHaveBeenCalledWith('ads');
    expect(mockFrom().upsert).toHaveBeenCalledWith(expect.objectContaining({ placement: 'home', enabled: true }));
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
    expect(result.path).toMatch(/^ads\/home\/.+\.jpg$/);
    expect(result.url).toContain('ads-images');
  });
});

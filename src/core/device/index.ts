export interface DeviceProfile {
  readonly id: string;
  readonly browser: string;
  readonly browserVersion: string;
  readonly os: string;
  readonly osVersion: string;
  readonly platform: 'desktop' | 'mobile' | 'tablet' | 'unknown';
  readonly screenWidth: number;
  readonly screenHeight: number;
  readonly pixelRatio: number;
  readonly refreshRate: number;
  readonly touchSupport: boolean;
  readonly pointerType: 'touch' | 'mouse' | 'pen' | 'coarse' | 'fine' | 'unknown';
  readonly cpuCores: number;
  readonly memoryGB: number | null;
  readonly language: string;
  readonly timezone: string;
  readonly userAgent: string;
  readonly collectedAt: number;
}

function detectPlatform(): DeviceProfile['platform'] {
  const ua = navigator.userAgent;
  if (/Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) {
    if (/iPad|Android(?!.*Mobile)/i.test(ua)) return 'tablet';
    return 'mobile';
  }
  return 'desktop';
}

function detectBrowser(): { name: string; version: string } {
  const ua = navigator.userAgent;
  if (ua.includes('Firefox/')) {
    const match = ua.match(/Firefox\/([\d.]+)/);
    return { name: 'Firefox', version: match?.[1] ?? 'unknown' };
  }
  if (ua.includes('Edg/')) {
    const match = ua.match(/Edg\/([\d.]+)/);
    return { name: 'Edge', version: match?.[1] ?? 'unknown' };
  }
  if (ua.includes('Chrome/')) {
    const match = ua.match(/Chrome\/([\d.]+)/);
    return { name: 'Chrome', version: match?.[1] ?? 'unknown' };
  }
  if (ua.includes('Safari/') && ua.includes('Version/')) {
    const match = ua.match(/Version\/([\d.]+)/);
    return { name: 'Safari', version: match?.[1] ?? 'unknown' };
  }
  return { name: 'Unknown', version: 'unknown' };
}

function detectOS(): { name: string; version: string } {
  const ua = navigator.userAgent;
  if (ua.includes('Windows NT 10')) return { name: 'Windows', version: '10+' };
  if (ua.includes('Windows NT 6.1')) return { name: 'Windows', version: '7' };
  if (ua.includes('Windows')) return { name: 'Windows', version: 'unknown' };
  if (ua.includes('Mac OS X')) {
    const match = ua.match(/Mac OS X ([\d_]+)/);
    return { name: 'macOS', version: match?.[1]?.replace(/_/g, '.') ?? 'unknown' };
  }
  if (ua.includes('Android')) {
    const match = ua.match(/Android ([\d.]+)/);
    return { name: 'Android', version: match?.[1] ?? 'unknown' };
  }
  if (ua.includes('iPhone OS') || ua.includes('iPad')) {
    const match = ua.match(/OS ([\d_]+)/);
    return { name: 'iOS', version: match?.[1]?.replace(/_/g, '.') ?? 'unknown' };
  }
  if (ua.includes('Linux')) return { name: 'Linux', version: 'unknown' };
  return { name: 'Unknown', version: 'unknown' };
}

function detectPointerType(): DeviceProfile['pointerType'] {
  if (typeof window === 'undefined') return 'unknown';
  if (window.matchMedia('(pointer: coarse)').matches) return 'coarse';
  if (window.matchMedia('(pointer: fine)').matches) return 'fine';
  if (navigator.maxTouchPoints > 0) return 'touch';
  return 'mouse';
}

function createDeviceId(): string {
  const components = [
    navigator.userAgent,
    screen.width.toString(),
    screen.height.toString(),
    navigator.language,
  ].join('|');
  let hash = 0;
  for (let i = 0; i < components.length; i++) {
    hash = ((hash << 5) - hash + components.charCodeAt(i)) | 0;
  }
  return `dev_${Math.abs(hash).toString(36)}`;
}

let cachedProfile: DeviceProfile | null = null;

export function collectDeviceProfile(): DeviceProfile {
  if (cachedProfile) return cachedProfile;

  const browser = detectBrowser();
  const os = detectOS();

  cachedProfile = {
    id: createDeviceId(),
    browser: browser.name,
    browserVersion: browser.version,
    os: os.name,
    osVersion: os.version,
    platform: detectPlatform(),
    screenWidth: screen.width,
    screenHeight: screen.height,
    pixelRatio: window.devicePixelRatio ?? 1,
    refreshRate: 60,
    touchSupport: 'ontouchstart' in window || navigator.maxTouchPoints > 0,
    pointerType: detectPointerType(),
    cpuCores: navigator.hardwareConcurrency ?? 0,
    memoryGB: 'deviceMemory' in navigator ? (navigator as { deviceMemory?: number }).deviceMemory ?? null : null,
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    userAgent: navigator.userAgent,
    collectedAt: Date.now(),
  };

  return cachedProfile;
}

export function resetDeviceProfile(): void {
  cachedProfile = null;
}

export function createDeviceProfileForTest(overrides: Partial<DeviceProfile> = {}): DeviceProfile {
  return {
    id: 'dev_test',
    browser: 'Chrome',
    browserVersion: '120.0',
    os: 'Windows',
    osVersion: '10',
    platform: 'desktop',
    screenWidth: 1920,
    screenHeight: 1080,
    pixelRatio: 1,
    refreshRate: 60,
    touchSupport: false,
    pointerType: 'mouse',
    cpuCores: 8,
    memoryGB: 16,
    language: 'en-US',
    timezone: 'UTC',
    userAgent: 'test-agent',
    collectedAt: Date.now(),
    ...overrides,
  };
}

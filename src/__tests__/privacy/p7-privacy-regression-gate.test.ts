import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * P7 PRIVACY REGRESSION GATE (المعتمدة 2026-08-08 — FOCUS v2 "Final Privacy
 * Cleanup & QR Attribution Hardening").
 *
 * هدف P7 حصراً: منع عودة أي PII/أدوات تتبع/هوية جهاز دائمة أو QR-attribution
 * في مسار التشغيل، دون أي حذف بيانات أو تعديل على الكتالوج/المخزون/الإعلانات.
 *
 *  P7-01  لا API متعطشة للخصوصية في الإنتاج: geolocation / document.cookie /
 *         sendBeacon / getBattery / canvas-fingerprint (WEBGL_debug_renderer_info
 *         و getImageData) / advertisingId / IMEI. (canvas العادي للرسم والضغط
 *         مشروع: StickerStudio + image-service — لا يعتبر تتبعاً).
 *  P7-02  navigator.userAgent عابر بالذاكرة فقط (CalibrationScreen + silent.ts)
 *         — لا يُخزَّن ولا يُرسل؛ ولا هوية زائر/جهاز دائمة في localStorage.
 *  P7-03  QR-runtime لا يلمس قيداً أحد أدوات التتبع: qr_codes / placements /
 *         placement_history / analytics_events / lookup_scan_context /
 *         increment_qr_counter / scan_count / START_QR_FLOW / setCampaignId /
 *         setPlacementId / qr_scanned.
 *
 * استثناءات موثقة (ليست QR-runtime): قراءات BI/research للـ aggregates مقيدة
 * بالأدوار بموجب P6 red-gate-04؛ وتسميات i18n ('campaign.placements'...) كلمات
 * مترجمة جامدة لا تشغّل أي قراءة/كتابة.
 */

const SRC = path.resolve(__dirname, '../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

function exists(rel: string): boolean {
  return fs.existsSync(path.join(SRC, rel));
}

function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walkProductionSrc(): Array<{ rel: string; content: string }> {
  const out: Array<{ rel: string; content: string }> = [];
  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
        walk(p, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ rel: prefix ? `${prefix}/${entry.name}` : entry.name, content: fs.readFileSync(p, 'utf-8') });
      }
    }
  }
  walk(SRC, '');
  return out;
}

// Runtime path = الكود الذي يُشغَّل عند فتح التطبيق ولعب اللعبة (لا يشمل admin/research/BI)
const RUNTIME_PATH: string[] = [
  'App.tsx',
  'store/navigation.tsx',
  'core/session/service.ts',
  'core/navigation/back-dispatcher.ts',
  'core/navigation/BackProvider.tsx',
  'hooks/useSmartWhatsApp.ts',
  'services/whatsapp-service.ts',
  'services/whatsapp-message.ts',
  'services/qr-measurement.ts',
  'screens/game/GameScreen.tsx',
  'screens/countdown/CountdownScreen.tsx',
  'screens/game-intro/GameIntroScreen.tsx',
  'screens/results/ResultsScreen.tsx',
  'screens/home/HomeScreen.tsx',
  'screens/landing/LandingScreen.tsx',
  'screens/message/PreGameMessageScreen.tsx',
  'screens/register/RegisterScreen.tsx',
  'screens/consent/ConsentScreen.tsx',
  'screens/share/ShareScreen.tsx',
];

describe('P7-01: لا API متعطشة للخصوصية في الإنتاج', () => {
  it('لا geolocation / getCurrentPosition في أي ملف إنتاج', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /getCurrentPosition|geolocation/i.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files using geolocation: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا قراءة/كتابة document.cookie في أي ملف إنتاج', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /document\.cookie/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files using document.cookie: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا navigator.sendBeacon في أي ملف إنتاج', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /sendBeacon/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files using sendBeacon: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا navigator.getBattery في أي ملف إنتاج', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /getBattery/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files using getBattery: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا canvas/WebGL fingerprinting (WEBGL_debug_renderer_info / getImageData)', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /WEBGL_debug_renderer_info|getImageData/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files doing canvas fingerprinting: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا advertisingId / IMEI قراءة في كود الإنتاج (التعليقات مستثناة)', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /advertisingId|advertising_id|getImei|imei\s*=/i.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files reading advertisingId/IMEI: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P7-02: لا هوية جهاز/زائر دائمة', () => {
  it('navigator.userAgent قراءة عابرة بالذاكرة فقط (CalibrationScreen + silent.ts)', () => {
    const allowed = ['screens/calibration/CalibrationScreen.tsx', 'core/calibration/silent.ts'];
    const offenders = walkProductionSrc()
      .filter((f) => /navigator\.userAgent/.test(codeOnly(f.content)))
      .filter((f) => !allowed.includes(f.rel))
      .map((f) => f.rel);
    expect(offenders, `files reading navigator.userAgent outside transient allowlist: ${offenders.join(', ')}`).toEqual([]);
  });

  it('لا مفاتيح localStorage دائمة لهوية زائر/جهاز (visitorId/deviceId/anonymousId/installationId)', () => {
    const offenders = walkProductionSrc()
      .filter((f) => /localStorage\.(getItem|setItem)\(\s*['"][^'"]*?(visitor|device|anonymous|installation|client)[-_]?id[^'"]*?['"]/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files persisting visitor/device ids: ${offenders.join(', ')}`).toEqual([]);
  });

  it('collectDeviceProfile / device-fingerprint module يبقى غائباً (core/device/index.ts)', () => {
    expect(exists('core/device/index.ts')).toBe(false);
    const offenders = walkProductionSrc()
      .filter((f) => /collectDeviceProfile|createDeviceProfileForTest/.test(codeOnly(f.content)))
      .map((f) => f.rel);
    expect(offenders, `files still calling device fingerprinting: ${offenders.join(', ')}`).toEqual([]);
  });
});

describe('P7-03: QR-runtime لا يلمس أدوات QR attribution', () => {
  const FORBIDDEN = [
    'qr_codes', 'placements', 'placement_history', 'analytics_events',
    'lookup_scan_context', 'increment_qr_counter', 'scan_count',
    'START_QR_FLOW', 'setCampaignId', 'setPlacementId', 'qr_scanned',
  ];

  it('لا ملف من مسار التشغيل يشير لأي كيان/دالة QR attribution', () => {
    const offenders: Array<{ rel: string; token: string }> = [];
    for (const rel of RUNTIME_PATH) {
      let content: string;
      try {
        content = codeOnly(read(rel));
      } catch {
        continue;
      }
      for (const token of FORBIDDEN) {
        if (content.includes(token)) offenders.push({ rel, token });
      }
    }
    expect(offenders, `QR-runtime refs: ${offenders.map((o) => `${o.rel}→${o.token}`).join(', ')}`).toEqual([]);
  });

  it('core/qr يحتوي فقط وحدة المشاركة العامة (share) — لا وحدات attribution', () => {
    // core/qr/share.ts هو مُشارِك روابط عام (wa.me/telegram/x/facebook) —
    // لا تتبع ولا قراءة/كتابة لأي جدول. وحدات الحملة/الإحالة/deeplink/consent
    // أُزيلت بموجب P5 PG-55.
    for (const file of ['campaign.ts', 'referral.ts', 'deeplink.ts', 'consent.ts', 'tracking.ts', 'attribution.ts']) {
      expect(fs.existsSync(path.join(SRC, `core/qr/${file}`))).toBe(false);
    }
    const share = codeOnly(read('core/qr/share.ts'));
    for (const token of ['qr_codes', 'placements', 'placement_history', 'analytics_events', 'lookup_scan_context', 'increment_qr_counter', 'scan_count']) {
      expect(share).not.toContain(token);
    }
  });
});

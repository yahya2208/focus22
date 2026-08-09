import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { createSessionService } from '../../core/session/service';
import { createEventPublisher } from '../../core/events';
import { analyzeConsistency } from '../../core/engine/consistency';
import { detectFatigue } from '../../core/engine/fatigue';
import { calculateFocusScore } from '../../core/engine/scoring';
import { getVariantsForModel } from '../../data/phone-variants';

/**
 * P3 Stop-Write Acceptance Gates (المعتمدة 2026-08-07 — مسار الخصوصية):
 * هدف P3 حصراً هو إيقاف إنشاء البيانات المقرّر عدم الاحتفاظ بها، دون أي حذف
 * لبيانات/جداول/Migrations، ودون لمس الكتالوج/المخزون/الإعلانات/WhatsApp.
 *
 *  PG-01  لا signInAsGuest() تلقائياً لمجرد فتح التطبيق
 *  PG-02  لا كتابة sessions / devices / calibrations من شجرة التطبيق
 *  PG-04  لا analytics_events للتتبع (telemetry معطّل، بلا مُرسِل Supabase)
 *  PG-05  لا QR/campaign attribution في مسار الإقلاع
 *  PG-27  لا كاتب مخفي على مسار التشغيل (component → hook → service → provider → Supabase/RPC)
 *  PG-30  اللعبة تعمل  ·  PG-50 الإعلانات  ·  PG-51 المخزون  ·  PG-52 الكتالوج
 *  PG-13  WhatsApp المباشر  ·  PG-14 SSOT الكتالوج  ·  PG-15 تصفح→واتساب  ·  PG-54 لا مسارات ميتة
 *  PG-57  Hard-Stop: لا تعديل على ملفات الكتالوج/المخزون/الإعلانات
 *         (قرار المالك D3 رخّص نزع التتبع فقط من ملفات showroom/whatsapp ضمن P5)
 */

const SRC = path.resolve(__dirname, '../..');
const ROOT = path.resolve(__dirname, '../../..');

function read(rel: string): string {
  return fs.readFileSync(path.join(SRC, rel), 'utf-8');
}

// للفحص السلوكي نستبعد التعليقات حتى لا تكسر البوابات نصوص شرح وثائقية.
function codeOnly(content: string): string {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\*.*$/gm, '')
    .replace(/^\s*\/\/.*$/gm, '');
}

function walkSrc(): Array<{ rel: string; content: string }> {
  const out: Array<{ rel: string; content: string }> = [];
  function walk(dir: string, prefix: string) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === 'node_modules' || entry.name === '__pycache__') continue;
        walk(p, prefix ? `${prefix}/${entry.name}` : entry.name);
      } else if (/\.(tsx?|jsx?)$/.test(entry.name)) {
        out.push({ rel: prefix ? `${prefix}/${entry.name}` : entry.name, content: fs.readFileSync(p, 'utf-8') });
      }
    }
  }
  walk(SRC, '');
  return out;
}

function getChangedFiles(): string[] {
  try {
    const out = execSync('git diff --name-only HEAD', { cwd: ROOT, encoding: 'utf-8' });
    return out.split('\n').map((s) => s.trim()).filter(Boolean);
  } catch {
    return [];
  }
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

const HARD_STOP_PREFIXES = [
  'src/catalog/',
  'src/components/catalog/',
  'src/components/ads/',
  'src/services/inventory-service.ts',
  'src/services/inventory-seed.ts',
  'src/services/price-memory.ts',
  'src/services/ads-service.ts',
];

describe('PG-01: لا signInAsGuest() تلقائياً لمجرد فتح التطبيق', () => {
  it('AuthProvider boot effect لا يستدعي signInAsGuest تلقائياً', () => {
    const auth = codeOnly(read('core/auth/AuthProvider.tsx'));
    expect(auth).not.toMatch(/signInAsGuest\s*\(/);
  });

  it('المسار اليدوي الوحيد المتبقي للدخول كضيف هو LoginScreen (E-8 محفوظ)', () => {
    const callers = walkSrc()
      .filter((f) => f.content.includes('.signInAsGuest('))
      .map((f) => f.rel);
    expect(callers).toEqual(['screens/auth/LoginScreen.tsx']);
  });
});

describe('PG-02: لا كتابة sessions / devices / calibrations من شجرة التطبيق', () => {
  it('App.tsx لا يستورد ولا يثبّت PersistenceProvider', () => {
    const app = read('App.tsx');
    expect(app).not.toContain('PersistenceProvider');
    expect(app).not.toMatch(/from\('sessions'\)/);
    expect(app).not.toMatch(/from\('devices'\)/);
    expect(app).not.toMatch(/from\('calibrations'\)/);
  });

  it('PersistenceProvider.tsx و data-service.ts أُزيلا كلياً (FOCUS v2، 2026-08-08)', () => {
    expect(fs.existsSync(path.join(SRC, 'core/supabase/PersistenceProvider.tsx'))).toBe(false);
    expect(fs.existsSync(path.join(SRC, 'core/supabase/data-service.ts'))).toBe(false);
  });

  it('لا ملف تشغيل (خارج admin/research/BI) يستورد PersistenceProvider', () => {
    const importers = walkSrc()
      .filter((f) => /PersistenceProvider/.test(f.content))
      .map((f) => f.rel);
    expect(importers, `files still referencing PersistenceProvider: ${importers.join(', ')}`).toEqual([]);
  });
});

describe('PG-04: لا analytics_events للتتبع (الـ telemetry أُزيل بالكامل ضمن P5)', () => {
  it('core/telemetry لم يعد موجوداً (أُزيل، وليس معطّلاً)', () => {
    const telemetryExists = fs.existsSync(path.join(SRC, 'core/telemetry/index.ts'));
    expect(telemetryExists).toBe(false);
  });

  it('App.tsx لا يحتوي استدعاءات تتبع في مسار الإقلاع', () => {
    const app = read('App.tsx');
    expect(app).not.toMatch(/telemetry\.track\s*\(/);
    expect(app).not.toContain('setupSessionTelemetry');
    expect(app).not.toContain('app_opened');
    expect(app).not.toContain('getGlobalTelemetry');
  });
});

describe('PG-05: لا QR/campaign attribution في مسار الإقلاع', () => {
  const FORBIDDEN = ['lookupScanContext', 'START_QR_FLOW', 'hasCampaign', 'qr_scanned', 'parseDeepLinkFromCurrentUrl', 'setCampaignId', 'setPlacementId', 'increment_qr_counter'];
  it('App.tsx لا يحتوي أي من أدوات تتبع الحملات', () => {
    const app = codeOnly(read('App.tsx'));
    for (const token of FORBIDDEN) {
      expect(app).not.toContain(token);
    }
    expect(app).not.toMatch(/core\/qr\//);
    expect(app).not.toContain('data-service');
  });
});

describe('PG-27: لا كاتب مخفي على مسار التشغيل (component→hook→service→provider→Supabase/RPC)', () => {
  it('ملفات مسار التشغيل لا تلمس Supabase كتابةً إطلاقاً (.from + insert/update/upsert/delete أو rpc)', () => {
    const writeChain = /\.from\([^)]*\)\s*\.\s*(insert|upsert|update|delete)\b/;
    const rpcCall = /\.rpc\(/;
    const offenders: string[] = [];
    for (const rel of RUNTIME_PATH) {
      let content: string;
      try {
        content = read(rel);
      } catch {
        continue;
      }
      if (writeChain.test(content) || rpcCall.test(content)) {
        offenders.push(rel);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('غلاف الحماية متكامل: telemetry معطّل + لا PersistenceProvider + لا ضيف تلقائي + لا QR', () => {
    // إعادة التحقق السلوكي/المصدر كخط دفاع أخير بعد كل بوابات الكتلة
    const app = codeOnly(read('App.tsx'));
    expect(app).not.toContain('PersistenceProvider');
    expect(app).not.toContain('getGlobalTelemetry');
    expect(app).not.toContain('lookupScanContext');
    expect(codeOnly(read('core/auth/AuthProvider.tsx'))).not.toMatch(/signInAsGuest\s*\(/);
  });
});

describe('PG-30: اللعبة نفسها تعمل (بدون أي تخزين)', () => {
  it('نظام الجلسات في الذاكرة يعمل: start يبث session_created', () => {
    const publisher = createEventPublisher();
    const service = createSessionService(publisher);
    let created: string | null = null;
    publisher.subscribe<{ sessionId: string }>('session_created', (e) => { created = e.payload.sessionId; });
    const id = service.startSession({ gameMode: 'reaction-light' });
    expect(id).toBeTruthy();
    expect(created).toBe(id);
  });

  it('محرك القياس العلمي يعمل (consistency/fatigue/scoring)', () => {
    const rts = [275, 225, 255, 300, 280];
    expect(analyzeConsistency(rts).score).toBeGreaterThanOrEqual(0);
    expect(detectFatigue(rts).score).toBeGreaterThanOrEqual(0);
    const score = calculateFocusScore({ meanCorrectedMs: 260, consistencyScore: 90, fatigueScore: 80, totalRounds: 5 });
    expect(score.focusScore).toBeGreaterThanOrEqual(0);
  });
});

describe('PG-51/52/14: المخزون والكتالوج يعملان', () => {
  it('الكاسكيد Vivo X50 → النسخة 8/128 فقط (SSOT حقيقي، لا تسريب Honor)', () => {
    const variants = getVariantsForModel('X50', 'vivo').map((v) => v.label).sort();
    expect(variants).toEqual(['8/128']);
  });

  it('inventory-service يحافظ على مفاتيح المخزون المحلية', () => {
    const inv = read('services/inventory-service.ts');
    expect(inv).toContain("'catalog_inventory'");
    expect(inv).toContain('catalog_inventory_transactions');
    expect(inv).toContain('catalog_inventory_movements_v2');
  });
});

describe('PG-50: الإعلانات تعمل', () => {
  it('ads-service يحافظ على قراءات from(ads) وصندوق ads-images', () => {
    const ads = read('services/ads-service.ts');
    expect(ads).toContain("from('ads')");
    expect(ads).toContain('ads-images');
  });
});

describe('PG-13/15: WhatsApp المباشر يعمل', () => {
  it('useSmartWhatsApp يحافظ على المسار المباشر لـ wa.me', () => {
    const hook = read('hooks/useSmartWhatsApp.ts');
    expect(hook).toMatch(/wa\.me/);
    expect(hook).toContain('window.open');
  });
});

describe('PG-54: لا مسارات ميتة — خريطة الشاشات سليمة', () => {
  it('App.tsx يحافظ على شاشات التجارة واللعبة والإدارة', () => {
    const app = read('App.tsx');
    for (const screen of ['showroom', 'phone-details', 'home', 'game', 'results', 'landing', 'share', 'business-intelligence', 'research', 'repair-home', 'sticker-studio']) {
      expect(app).toContain(screen);
    }
  });
});

describe('PG-57: Hard-Stop — لا تعديل على الكتالوج/المخزون/الإعلانات', () => {
  it('التغييرات في هذه المرحلة لا تمس أي ملف محمي', () => {
    const changed = getChangedFiles();
    const violations = changed.filter((f) => HARD_STOP_PREFIXES.some((p) => f.startsWith(p)));
    expect(violations, `ملفات محمية تم تعديلها: ${violations.join(', ')}`).toEqual([]);
  });
});

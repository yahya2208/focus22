import { useState, useEffect, useRef, useCallback } from 'react';
import QRCodeLib from 'qrcode';
import type { QRConfig } from './campaign-service';
import { useTranslation } from '../../../hooks/useTranslation';

const CARD: React.CSSProperties = { background: '#1e1e2e', border: '1px solid #333', borderRadius: '12px', padding: '1.25rem' };
const SECTION_TITLE: React.CSSProperties = { color: '#888', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: '0.6rem', marginTop: '1.1rem' };
const LABEL: React.CSSProperties = { color: '#aaa', fontSize: '0.78rem', marginBottom: '0.25rem', display: 'block' };
const btnPrimary: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };
const btnOutline: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: 'transparent', color: '#ccc', border: '1px solid #444', cursor: 'pointer', fontSize: '0.85rem' };
const inputStyle: React.CSSProperties = { padding: '0.5rem', borderRadius: '8px', border: '1px solid #333', background: '#12121a', color: '#f0f0f0', fontSize: '0.85rem', width: '100%', boxSizing: 'border-box' };

interface TemplateDef {
  id: string;
  name: string;
  foreground: string;
  background: string;
  rounded: boolean;
  eyeRounded: boolean;
  frame?: string;
}

const TEMPLATES: TemplateDef[] = [
  { id: 'modern', name: 'Modern', foreground: '#6366f1', background: '#ffffff', rounded: true, eyeRounded: true },
  { id: 'black', name: 'Black', foreground: '#000000', background: '#ffffff', rounded: false, eyeRounded: false },
  { id: 'white', name: 'White', foreground: '#ffffff', background: '#000000', rounded: false, eyeRounded: false },
  { id: 'dark', name: 'Dark', foreground: '#00d4aa', background: '#0a0a0f', rounded: true, eyeRounded: true },
  { id: 'gradient', name: 'Gradient', foreground: '#6366f1', background: '#e0e7ff', rounded: true, eyeRounded: true },
  { id: 'coffee', name: 'Coffee', foreground: '#8B4513', background: '#FFF8DC', rounded: true, eyeRounded: false },
  { id: 'school', name: 'School', foreground: '#1e40af', background: '#dbeafe', rounded: false, eyeRounded: true },
  { id: 'minimal', name: 'Minimal', foreground: '#333333', background: '#ffffff', rounded: false, eyeRounded: false, frame: '__none__' },
  { id: 'restaurant', name: 'Restaurant', foreground: '#dc2626', background: '#fef2f2', rounded: true, eyeRounded: true },
];

interface QRDesignerProps {
  campaignId: string;
  campaignUrl: string;
  qrConfig?: QRConfig;
  onSave?: (config: QRConfig) => void;
}

function buildSvgString(
  campaignUrl: string,
  fg: string,
  bg: string,
  rounded: boolean,
  eyeRounded: boolean,
  frameText: string,
  size: number,
): string {
  const qr = QRCodeLib.create(campaignUrl, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const moduleCount = modules.size;
  const margin = frameText ? 4 : 2;
  const totalSize = moduleCount + margin * 2;
  const cellSize = size / totalSize;

  let rects = '';
  for (let row = 0; row < moduleCount; row++) {
    for (let col = 0; col < moduleCount; col++) {
      if (!modules.get(row, col)) continue;
      const x = (col + margin) * cellSize;
      const y = (row + margin) * cellSize;
      const isFinder =
        (row < 7 && col < 7) ||
        (row < 7 && col >= moduleCount - 7) ||
        (row >= moduleCount - 7 && col < 7);
      const isInner =
        isFinder &&
        row >= 1 && row <= 5 &&
        col >= 1 && col <= 5;
      const isInnerTR =
        isFinder &&
        row >= 1 && row <= 5 &&
        col >= moduleCount - 6 && col <= moduleCount - 2;
      const isInnerBL =
        isFinder &&
        row >= moduleCount - 6 && row <= moduleCount - 2 &&
        col >= 1 && col <= 5;
      const useEyeRounded = isInner || isInnerTR || isInnerBL ? eyeRounded : rounded;

      if (useEyeRounded) {
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" rx="${cellSize * 0.35}" ry="${cellSize * 0.35}" fill="${fg}"/>`;
      } else {
        rects += `<rect x="${x}" y="${y}" width="${cellSize}" height="${cellSize}" fill="${fg}"/>`;
      }
    }
  }

  if (frameText) {
    const bannerH = cellSize * 5;
    const fontSize = Math.round(cellSize * 2.8);
    const totalH = size + bannerH;
    const bgRect = `<rect x="0" y="0" width="${size}" height="${totalH}" fill="${bg}" rx="12"/>`;
    const textEl = `<text x="${size / 2}" y="${bannerH * 0.7}" text-anchor="middle" dominant-baseline="central" font-size="${fontSize}" font-family="Arial,sans-serif" font-weight="bold" fill="${fg}">${escapeXml(frameText)}</text>`;
    const qrGroup = `<g transform="translate(0,${bannerH})">${rects}</g>`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${totalH}" width="${size}" height="${totalH}">${bgRect}${textEl}${qrGroup}</svg>`;
  }

  const bgRect = `<rect x="0" y="0" width="${size}" height="${size}" fill="${bg}" rx="12"/>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${bgRect}${rects}</svg>`;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export function QRDesigner({ campaignId, campaignUrl, qrConfig, onSave }: QRDesignerProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [fg, setFg] = useState(qrConfig?.foreground ?? '#6366f1');
  const [bg, setBg] = useState(qrConfig?.background ?? '#ffffff');
  const [rounded, setRounded] = useState(qrConfig?.rounded ?? true);
  const [eyeRounded, setEyeRounded] = useState(qrConfig?.eyeRounded ?? true);
  const [templateId, setTemplateId] = useState(qrConfig?.template ?? 'modern');
  const [frameMode, setFrameMode] = useState<'none' | 'preset' | 'custom'>(
    qrConfig?.frame === 'preset' ? 'preset' : qrConfig?.frameText ? 'custom' : 'none'
  );
  const [frameText, setFrameText] = useState(qrConfig?.frameText ?? t('campaign.focusTest'));
  const [logoOption, setLogoOption] = useState<'default' | 'upload' | 'none'>(qrConfig?.logoOption ?? 'default');
  const [logoUrl, setLogoUrl] = useState(qrConfig?.logoUrl ?? '');
  const [logoDataUrl, setLogoDataUrl] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);

  const applyTemplate = useCallback((tmpl: TemplateDef) => {
    setTemplateId(tmpl.id);
    setFg(tmpl.foreground);
    setBg(tmpl.background);
    setRounded(tmpl.rounded);
    setEyeRounded(tmpl.eyeRounded);
    if (tmpl.id === 'minimal') {
      setFrameMode('none');
    }
  }, []);

  const handleLogoUpload = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      setLogoDataUrl(result);
      setLogoUrl(result);
      setLogoOption('upload');
    };
    reader.readAsDataURL(file);
  }, []);

  const buildConfig = useCallback((): QRConfig => ({
    template: templateId,
    foreground: fg,
    background: bg,
    rounded,
    eyeRounded,
    frame: frameMode === 'none' ? undefined : frameMode,
    frameText: frameMode === 'none' ? undefined : frameText,
    logoOption,
    logoUrl: logoOption === 'upload' ? logoUrl : undefined,
  }), [templateId, fg, bg, rounded, eyeRounded, frameMode, frameText, logoOption, logoUrl]);

  const renderCanvas = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const qrSize = 512;
    const margin = 0;
    const qrCanvasH = qrSize;
    const bannerH = frameMode !== 'none' && frameText ? 60 : 0;
    const totalH = qrCanvasH + bannerH;
    const padding = 40;
    const exportW = qrSize + padding * 2;
    const exportH = totalH + padding * 2;

    canvas.width = exportW;
    canvas.height = exportH;

    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, exportW, exportH);

    if (bannerH > 0) {
      const radius = 12;
      const bx = padding;
      const by = padding;
      const bw = qrSize;
      const bh = bannerH;
      ctx.beginPath();
      ctx.moveTo(bx + radius, by);
      ctx.lineTo(bx + bw - radius, by);
      ctx.quadraticCurveTo(bx + bw, by, bx + bw, by + radius);
      ctx.lineTo(bx + bw, by + bh - radius);
      ctx.quadraticCurveTo(bx + bw, by + bh, bx + bw - radius, by + bh);
      ctx.lineTo(bx + radius, by + bh);
      ctx.quadraticCurveTo(bx, by + bh, bx, by + bh - radius);
      ctx.lineTo(bx, by + radius);
      ctx.quadraticCurveTo(bx, by, bx + radius, by);
      ctx.closePath();
      ctx.fillStyle = bg;
      ctx.fill();

      ctx.fillStyle = fg;
      ctx.font = 'bold 32px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(frameText, padding + qrSize / 2, padding + bannerH / 2);
    }

    try {
      const dataUrl = await QRCodeLib.toDataURL(campaignUrl, {
        width: qrSize,
        margin: margin,
        color: { dark: fg, light: bg },
        errorCorrectionLevel: 'M',
      });
      const img = new Image();
      img.crossOrigin = 'anonymous';
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load QR image'));
        img.src = dataUrl;
      });
      ctx.drawImage(img, padding, padding + bannerH, qrSize, qrCanvasH);
    } catch {
      ctx.fillStyle = '#666';
      ctx.font = '16px Arial, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('QR generation failed', exportW / 2, exportH / 2);
    }

    if (logoOption !== 'none') {
      const activeLogo = logoOption === 'upload' ? logoDataUrl : null;
      if (activeLogo) {
        try {
          const logoImg = new Image();
          logoImg.crossOrigin = 'anonymous';
          await new Promise<void>((resolve, reject) => {
            logoImg.onload = () => resolve();
            logoImg.onerror = () => reject(new Error('Logo load failed'));
            logoImg.src = activeLogo;
          });
          const logoSize = 80;
          const logoX = padding + (qrSize - logoSize) / 2;
          const logoY = padding + bannerH + (qrCanvasH - logoSize) / 2;
          ctx.fillStyle = bg;
          ctx.beginPath();
          ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 8, 0, Math.PI * 2);
          ctx.fill();
          ctx.drawImage(logoImg, logoX, logoY, logoSize, logoSize);
        } catch {
          // logo load failed silently
        }
      } else {
        const logoSize = 80;
        const logoX = padding + (qrSize - logoSize) / 2;
        const logoY = padding + bannerH + (qrCanvasH - logoSize) / 2;
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.arc(logoX + logoSize / 2, logoY + logoSize / 2, logoSize / 2 + 8, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = fg;
        ctx.font = 'bold 28px Arial, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('F', logoX + logoSize / 2, logoY + logoSize / 2);
      }
    }
  }, [campaignUrl, fg, bg, frameMode, frameText, logoOption, logoDataUrl]);

  useEffect(() => {
    renderCanvas();
  }, [renderCanvas]);

  const handleDownloadPng = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setGenerating(true);
    const link = document.createElement('a');
    link.download = `qr-${campaignId}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
    setGenerating(false);
  }, [campaignId]);

  const handleDownloadSvg = useCallback(() => {
    setGenerating(true);
    const effectiveFrameText = frameMode !== 'none' ? frameText : '';
    const svgStr = buildSvgString(campaignUrl, fg, bg, rounded, eyeRounded, effectiveFrameText, 512);
    const blob = new Blob([svgStr], { type: 'image/svg+xml' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.download = `qr-${campaignId}.svg`;
    link.href = url;
    link.click();
    URL.revokeObjectURL(url);
    setGenerating(false);
  }, [campaignId, campaignUrl, fg, bg, rounded, eyeRounded, frameMode, frameText]);

  const handleSave = useCallback(() => {
    if (onSave) {
      onSave(buildConfig());
    }
  }, [onSave, buildConfig]);

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem', minHeight: '100vh', background: '#12121a', padding: '1.5rem', fontFamily: 'Arial, sans-serif', color: '#f0f0f0' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto', maxHeight: 'calc(100vh - 3rem)' }}>

        <div style={{ ...CARD }}>
          <div style={SECTION_TITLE}>{t('campaign.templates')}</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {TEMPLATES.map((tmpl) => {
              const active = templateId === tmpl.id;
              return (
                <button
                  key={tmpl.id}
                  onClick={() => applyTemplate(tmpl)}
                  style={{
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    gap: '0.35rem',
                    padding: '0.6rem 0.4rem',
                    borderRadius: '10px',
                    border: active ? '2px solid #6366f1' : '1px solid #333',
                    background: active ? '#2a2a3e' : '#12121a',
                    cursor: 'pointer',
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: tmpl.rounded ? '6px' : '2px',
                    background: tmpl.background,
                    border: `2px solid ${tmpl.foreground}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}>
                    <div style={{
                      width: '14px',
                      height: '14px',
                      borderRadius: tmpl.rounded ? '3px' : '0px',
                      background: tmpl.foreground,
                    }} />
                  </div>
                  <span style={{ fontSize: '0.68rem', color: '#aaa', fontWeight: active ? 700 : 400 }}>{tmpl.name}</span>
                </button>
              );
            })}
          </div>
        </div>

        <div style={{ ...CARD }}>
          <div style={SECTION_TITLE}>{t('campaign.foreground')}</div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>{t('campaign.foreground')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="color"
                  value={fg}
                  onChange={(e) => setFg(e.target.value)}
                  style={{ width: '36px', height: '36px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: 'transparent', padding: 0 }}
                />
                <input
                  type="text"
                  value={fg}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setFg(e.target.value); }}
                  style={{ ...inputStyle, width: '90px', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>
            </div>
            <div style={{ flex: 1 }}>
              <label style={LABEL}>{t('campaign.background')}</label>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <input
                  type="color"
                  value={bg}
                  onChange={(e) => setBg(e.target.value)}
                  style={{ width: '36px', height: '36px', border: 'none', borderRadius: '8px', cursor: 'pointer', background: 'transparent', padding: 0 }}
                />
                <input
                  type="text"
                  value={bg}
                  onChange={(e) => { if (/^#[0-9a-fA-F]{6}$/.test(e.target.value)) setBg(e.target.value); }}
                  style={{ ...inputStyle, width: '90px', fontFamily: 'monospace', fontSize: '0.8rem' }}
                />
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...CARD }}>
          <div style={SECTION_TITLE}>{t('campaign.style')}</div>
          <div style={{ display: 'flex', gap: '1.25rem', flexWrap: 'wrap' }}>
            <div>
              <label style={LABEL}>{t('campaign.style')}</label>
              <div style={{ display: 'flex', gap: '0' }}>
                <button
                  onClick={() => setRounded(true)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '8px 0 0 8px',
                    background: rounded ? '#6366f1' : '#1e1e2e',
                    color: rounded ? '#fff' : '#aaa',
                    border: '1px solid #444',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: rounded ? 600 : 400,
                  }}
                >
                  {t('campaign.rounded')}
                </button>
                <button
                  onClick={() => setRounded(false)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '0 8px 8px 0',
                    background: !rounded ? '#6366f1' : '#1e1e2e',
                    color: !rounded ? '#fff' : '#aaa',
                    border: '1px solid #444',
                    borderLeft: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: !rounded ? 600 : 400,
                  }}
                >
                  {t('campaign.square')}
                </button>
              </div>
            </div>
            <div>
              <label style={LABEL}>{t('campaign.eyeStyle')}</label>
              <div style={{ display: 'flex', gap: '0' }}>
                <button
                  onClick={() => setEyeRounded(true)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '8px 0 0 8px',
                    background: eyeRounded ? '#6366f1' : '#1e1e2e',
                    color: eyeRounded ? '#fff' : '#aaa',
                    border: '1px solid #444',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: eyeRounded ? 600 : 400,
                  }}
                >
                  {t('campaign.rounded')}
                </button>
                <button
                  onClick={() => setEyeRounded(false)}
                  style={{
                    padding: '0.4rem 0.9rem',
                    borderRadius: '0 8px 8px 0',
                    background: !eyeRounded ? '#6366f1' : '#1e1e2e',
                    color: !eyeRounded ? '#fff' : '#aaa',
                    border: '1px solid #444',
                    borderLeft: 'none',
                    cursor: 'pointer',
                    fontSize: '0.8rem',
                    fontWeight: !eyeRounded ? 600 : 400,
                  }}
                >
                  {t('campaign.square')}
                </button>
              </div>
            </div>
          </div>
        </div>

        <div style={{ ...CARD }}>
          <div style={SECTION_TITLE}>{t('campaign.frame')}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {([
              { value: 'none' as const, label: t('campaign.frameNone') },
              { value: 'preset' as const, label: t('campaign.focusTest') },
              { value: 'custom' as const, label: t('campaign.frameCustom') },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setFrameMode(opt.value)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  background: frameMode === opt.value ? '#6366f1' : '#1e1e2e',
                  color: frameMode === opt.value ? '#fff' : '#aaa',
                  border: `1px solid ${frameMode === opt.value ? '#6366f1' : '#444'}`,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: frameMode === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {frameMode === 'custom' && (
            <input
              type="text"
              value={frameText}
              onChange={(e) => setFrameText(e.target.value)}
              placeholder="Enter frame text..."
              style={inputStyle}
            />
          )}
        </div>

        <div style={{ ...CARD }}>
          <div style={SECTION_TITLE}>{t('campaign.logo')}</div>
          <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.6rem' }}>
            {([
              { value: 'default' as const, label: t('campaign.logoDefault') },
              { value: 'upload' as const, label: t('campaign.logoUpload') },
              { value: 'none' as const, label: t('campaign.logoNone') },
            ]).map((opt) => (
              <button
                key={opt.value}
                onClick={() => setLogoOption(opt.value)}
                style={{
                  padding: '0.4rem 0.8rem',
                  borderRadius: '8px',
                  background: logoOption === opt.value ? '#6366f1' : '#1e1e2e',
                  color: logoOption === opt.value ? '#fff' : '#aaa',
                  border: `1px solid ${logoOption === opt.value ? '#6366f1' : '#444'}`,
                  cursor: 'pointer',
                  fontSize: '0.78rem',
                  fontWeight: logoOption === opt.value ? 600 : 400,
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {logoOption === 'upload' && (
            <div>
              <input
                type="file"
                accept="image/*"
                onChange={handleLogoUpload}
                style={{ display: 'none' }}
                id="logo-upload"
              />
              <label htmlFor="logo-upload" style={{ ...btnOutline, display: 'inline-block', cursor: 'pointer', fontSize: '0.8rem', padding: '0.4rem 1rem' }}>
                {logoDataUrl ? 'Change Logo' : 'Choose File'}
              </label>
              {logoDataUrl && (
                <div style={{ marginTop: '0.5rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <img src={logoDataUrl} alt="Logo preview" style={{ width: '36px', height: '36px', borderRadius: '6px', objectFit: 'contain' }} />
                  <button
                    onClick={() => { setLogoDataUrl(null); setLogoUrl(''); setLogoOption('default'); }}
                    style={{ ...btnOutline, fontSize: '0.72rem', padding: '0.25rem 0.6rem', color: '#ef4444', borderColor: '#ef4444' }}
                  >
                    Remove
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {onSave && (
          <button onClick={handleSave} style={{ ...btnPrimary, padding: '0.65rem 1.5rem', fontSize: '0.9rem', alignSelf: 'flex-start' }}>
            {t('campaign.save')} {t('campaign.designerTitle')}
          </button>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '1.25rem' }}>
        <div style={{ ...CARD, width: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div style={SECTION_TITLE}>{t('campaign.preview')}</div>
          <div style={{ background: '#0a0a0f', borderRadius: '12px', padding: '1.5rem', display: 'inline-block', marginTop: '0.25rem' }}>
            <canvas
              ref={canvasRef}
              style={{
                maxWidth: '100%',
                height: 'auto',
                borderRadius: '8px',
                imageRendering: 'pixelated',
              }}
            />
          </div>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <button
            onClick={handleDownloadPng}
            disabled={generating}
            style={{
              ...btnPrimary,
              opacity: generating ? 0.6 : 1,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {t('campaign.downloadPNG')}
          </button>
          <button
            onClick={handleDownloadSvg}
            disabled={generating}
            style={{
              ...btnOutline,
              opacity: generating ? 0.6 : 1,
              cursor: generating ? 'not-allowed' : 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            {t('campaign.downloadSVG')}
          </button>
        </div>

        <div style={{ ...CARD, width: '100%' }}>
          <div style={SECTION_TITLE}>{t('campaign.designerTitle')}</div>
          <div style={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#666', lineHeight: 1.6, wordBreak: 'break-all' }}>
            <div>Template: <span style={{ color: '#aaa' }}>{templateId}</span></div>
            <div>FG: <span style={{ color: fg }}>{fg}</span> | BG: <span style={{ color: bg }}>{bg}</span></div>
            <div>{t('campaign.style')}: <span style={{ color: '#aaa' }}>{rounded ? t('campaign.rounded') : t('campaign.square')}</span> | {t('campaign.eyeStyle')}: <span style={{ color: '#aaa' }}>{eyeRounded ? t('campaign.rounded') : t('campaign.square')}</span></div>
            <div>{t('campaign.frame')}: <span style={{ color: '#aaa' }}>{frameMode === 'none' ? t('campaign.frameNone') : frameMode === 'preset' ? t('campaign.focusTest') : frameText}</span></div>
            <div>{t('campaign.logo')}: <span style={{ color: '#aaa' }}>{logoOption}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}

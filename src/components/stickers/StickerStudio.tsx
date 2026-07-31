import { memo, useState, useCallback, useEffect, useMemo } from 'react';
import { useTranslation } from '../../hooks/useTranslation';
import { useThemeColors } from '../../hooks/useThemeColors';
import { Stack, HStack } from '../../design-system/layout';
import type { StickerConfig, StickerContent, StickerType, LayoutMode, StickerTheme } from '../../services/sticker/sticker-types';
import { STICKER_TYPES_CONFIG, LAYOUT_CONFIG, STICKER_THEME_CONFIG } from '../../services/sticker/sticker-types';
import { getTypeTitle, generateAllPages, getContentLabel, getThemeLabel } from '../../services/sticker/sticker-engine';
import { getAllCategories, getWisdomByCategory, CATEGORY_LABELS, type WisdomCategory } from '../../data/wisdom-database';
import { calculateStickerLayout, A4, mmToPx } from '../../services/sticker/sticker-layout';

const STORE_NAME = 'يحي فون';
const STORE_PHONE = '+213551148943';
const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 0; }
  body { margin: 0; padding: 0; }
  #sticker-preview { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
  #sticker-preview > div { margin: 0 !important; box-shadow: none !important; }
  #sticker-preview input[type=range] { display: none !important; }
  #sticker-preview > div > div { box-shadow: none !important; }
  #sticker-toolbar { display: none !important; }
  #sticker-preview .preview-viewport { box-shadow: none !important; border-radius: 0 !important; max-height: none !important; }
  #sticker-preview .preview-page { margin: 0 auto; width: 100% !important; height: 100% !important; }
}
`;

export const StickerStudio = memo(function StickerStudio() {
  const { t, locale, dir } = useTranslation();
  const colors = useThemeColors();
  const lang = (locale === 'tr' ? 'tr' : locale === 'en' ? 'en' : 'ar') as 'ar' | 'en' | 'tr';

  const [config, setConfig] = useState<StickerConfig>({
    type: 'focus_game',
    contentType: 'wisdom',
    quoteMode: 'random',
    stickerMode: 'same',
    copies: 1,
    layout: '3x3',
    colorScheme: 'light',
    theme: 'classic',
    showCropMarks: true,
    showContact: true,
    showQR: true,
  });
  const [pages, setPages] = useState<StickerContent[][]>([]);
  const [generating, setGenerating] = useState(false);
  const [selectedCategory, setSelectedCategory] = useState<WisdomCategory | ''>('');
  const [selectedWisdom, setSelectedWisdom] = useState<string>('');
  const [previewScale, setPreviewScale] = useState(0.35);

  const categories = getAllCategories();

  const generate = useCallback(async () => {
    setGenerating(true);
    const cfg: StickerConfig = {
      ...config,
      quoteMode: config.quoteMode,
      quoteCategory: selectedCategory ? (selectedCategory as WisdomCategory) : undefined,
      quoteId: selectedWisdom || undefined,
    };
    try {
      const result = await generateAllPages(cfg, lang);
      setPages(result);
    } catch {
      setPages([]);
    }
    setGenerating(false);
  }, [config, selectedCategory, selectedWisdom, lang]);

  useEffect(() => { generate(); }, [generate]);

  const updateConfig = useCallback(<K extends keyof StickerConfig>(key: K, value: StickerConfig[K]) => {
    setConfig(prev => ({ ...prev, [key]: value }));
  }, []);

  const categoryWisdom = selectedCategory ? getWisdomByCategory(selectedCategory as WisdomCategory) : [];

  const btnStyle = (active: boolean): React.CSSProperties => ({
    padding: '0.5rem 0.75rem', borderRadius: '10px', border: 'none', cursor: 'pointer',
    fontFamily: 'inherit', fontSize: '0.78rem', fontWeight: active ? 700 : 500,
    background: active ? colors.accent : colors.bgInput,
    color: active ? '#fff' : colors.textSecondary,
    transition: 'all 0.15s ease',
  });

  const labelStyle: React.CSSProperties = {
    display: 'block', fontSize: '0.75rem', fontWeight: 600,
    color: colors.textSecondary, marginBottom: '0.3rem', fontFamily: 'inherit',
  };

  const selectStyle: React.CSSProperties = {
    background: colors.bgInput, border: `1px solid ${colors.border}`,
    color: colors.text, borderRadius: '10px', padding: '0.6rem 0.8rem',
    width: '100%', fontFamily: 'inherit', fontSize: '0.82rem', outline: 'none',
  };

  const MARGIN_MM = 8;
  const GAP_MM = 4;

  const layoutCfg = useMemo(() => {
    const lc = LAYOUT_CONFIG[config.layout];
    return calculateStickerLayout({
      paper: A4,
      rows: lc.rows,
      cols: lc.cols,
      marginMm: MARGIN_MM,
      gapMm: GAP_MM,
    });
  }, [config.layout]);

  const pxAtScale = useMemo(() => {
    const scale = previewScale;
    const a4w = mmToPx(A4.widthMm);
    const a4h = mmToPx(A4.heightMm);
    return {
      pageW: Math.round(a4w * scale),
      pageH: Math.round(a4h * scale),
      margin: Math.round(mmToPx(MARGIN_MM) * scale),
      gap: Math.round(mmToPx(GAP_MM) * scale),
      stickerW: Math.round(mmToPx(layoutCfg.stickerWidthMm) * scale),
      stickerH: Math.round(mmToPx(layoutCfg.stickerHeightMm) * scale),
    };
  }, [previewScale, layoutCfg]);

  const triggerPrint = () => { window.print(); };

  const downloadPDF = useCallback(async () => {
    const DPI = 200;
    const pdfLayout = calculateStickerLayout({
      paper: A4,
      rows: layoutCfg.cells.length > 0 ? Math.max(...layoutCfg.cells.map(c => c.row)) + 1 : 3,
      cols: layoutCfg.cells.length > 0 ? Math.max(...layoutCfg.cells.map(c => c.col)) + 1 : 3,
      marginMm: MARGIN_MM,
      gapMm: GAP_MM,
    });
    const PW = mmToPx(A4.widthMm, DPI);
    const PH = mmToPx(A4.heightMm, DPI);

    const canvas = document.createElement('canvas');
    canvas.width = PW;
    canvas.height = PH * pages.length;
    const ctx = canvas.getContext('2d')!;

    for (let pi = 0; pi < pages.length; pi++) {
      const pageY = pi * PH;
      const themeConfig = STICKER_THEME_CONFIG[config.theme];
      const pageBg = config.colorScheme === 'dark' || config.colorScheme === 'amoled' ? '#1a1a2e' : themeConfig.bg;
      ctx.fillStyle = pageBg;
      ctx.fillRect(0, pageY, PW, PH);

      const page = pages[pi];
      if (!page) continue;
      for (let i = 0; i < page.length; i++) {
        const sticker = page[i];
        if (!sticker) continue;
        const col = i % (Math.max(...pdfLayout.cells.map(c => c.col)) + 1);
        const row = Math.floor(i / (Math.max(...pdfLayout.cells.map(c => c.col)) + 1));
        const cell = pdfLayout.cells[row * (Math.max(...pdfLayout.cells.map(c => c.col)) + 1) + col];
        if (!cell) continue;

        const x = mmToPx(cell.xMm, DPI);
        const y = pageY + mmToPx(cell.yMm, DPI);
        const cw = mmToPx(pdfLayout.stickerWidthMm, DPI);
        const ch = mmToPx(pdfLayout.stickerHeightMm, DPI);

        if (config.showCropMarks) {
          ctx.strokeStyle = '#999';
          ctx.lineWidth = 0.5;
          ctx.setLineDash([4, 3]);
          ctx.strokeRect(x - 0.5, y - 0.5, cw + 1, ch + 1);
          ctx.setLineDash([]);
        }

        const isDark = config.colorScheme === 'dark' || config.colorScheme === 'amoled';
        const isHC = config.colorScheme === 'highcontrast';
        const bgCol = isHC ? '#ffffff' : isDark ? '#1a1a2e' : themeConfig.bg;
        const textCol = isHC ? '#000000' : isDark ? '#f1f5f9' : themeConfig.text;
        const cardBg = isHC ? '#f5f5f5' : isDark ? '#1e1e32' : '#f1f5f9';
        const hdrBg = isHC ? '#e0e0e0' : isDark ? '#2d2d44' : themeConfig.accent;
        const ftrBg = isHC ? '#333' : isDark ? '#0f0f1a' : themeConfig.accent;

        const pad = Math.round(ch * 0.025);
        const hdrH = Math.round(ch * 0.18);
        const qrH = Math.round(ch * 0.32);
        const wisH = Math.round(ch * 0.22);
        const catH = Math.round(ch * 0.08);
        const ftrH = Math.round(ch * 0.11);
        const m = 2;

        ctx.fillStyle = bgCol;
        ctx.beginPath();
        ctx.roundRect(x + m, y + m, cw - m * 2, ch - m * 2, 4);
        ctx.fill();

        ctx.fillStyle = hdrBg;
        ctx.beginPath();
        ctx.roundRect(x + m, y + m, cw - m * 2, hdrH, [4, 4, 0, 0]);
        ctx.fill();

        const headerTitleSize = Math.round(hdrH * 0.28);
        const headerSubSize = Math.round(hdrH * 0.16);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.font = `bold ${headerTitleSize}px ${themeConfig.fontFamily}`;
        ctx.fillText(sticker.icon + ' ' + sticker.title.replace(/^[^\s]+\s/, ''), x + cw / 2, y + m + hdrH * 0.45);
        ctx.font = `${headerSubSize}px ${themeConfig.fontFamily}`;
        ctx.fillStyle = 'rgba(255,255,255,0.8)';
        ctx.fillText(sticker.message.substring(0, 30), x + cw / 2, y + m + hdrH * 0.72);

        if (sticker.qrUrl) {
          const qrImg = new Image();
          qrImg.src = sticker.qrUrl;
          await new Promise(r => { qrImg.onload = r; qrImg.onerror = r; });
          const qrSize = Math.min(qrH * 0.72, cw * 0.55);
          const qrCX = x + cw / 2;
          const qrCY = y + m + hdrH + (qrH - qrSize) / 2;

          ctx.fillStyle = '#ffffff';
          ctx.beginPath();
          ctx.roundRect(qrCX - qrSize / 2 - 6, qrCY - 6, qrSize + 12, qrSize + 12, 8);
          ctx.fill();
          ctx.shadowColor = 'rgba(0,0,0,0.15)';
          ctx.shadowBlur = 8;
          ctx.drawImage(qrImg, qrCX - qrSize / 2, qrCY, qrSize, qrSize);
          ctx.shadowColor = 'transparent';
          ctx.shadowBlur = 0;
        }

        if (sticker.wisdom) {
          const wisCX = x + cw / 2;
          const wisTop = y + m + hdrH + qrH;
          const wisPadH = Math.round(wisH * 0.12);

          ctx.fillStyle = cardBg;
          ctx.beginPath();
          ctx.roundRect(x + m + pad, wisTop + wisPadH * 0.3, cw - m * 2 - pad * 2, wisH - wisPadH * 0.6, 6);
          ctx.fill();

          ctx.strokeStyle = isDark ? '#3d3d56' : '#e2e8f0';
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.roundRect(x + m + pad, wisTop + wisPadH * 0.3, cw - m * 2 - pad * 2, wisH - wisPadH * 0.6, 6);
          ctx.stroke();

          const quoteSize = Math.round(wisH * 0.14);
          ctx.fillStyle = themeConfig.accent;
          ctx.textAlign = 'center';
          ctx.font = `${quoteSize}px serif`;
          ctx.fillText('\u275D', wisCX, wisTop + wisPadH * 0.6);

          const wisSize = Math.round(wisH * 0.17);
          ctx.fillStyle = textCol;
          ctx.font = `500 ${wisSize}px ${themeConfig.fontFamily}`;
          const maxWisW = cw - m * 2 - pad * 4;
          const wisText = sticker.wisdom.length > 50 ? sticker.wisdom.substring(0, 50) + '\u2026' : sticker.wisdom;
          ctx.textAlign = 'left';
          wrapText(ctx, wisText, x + m + pad * 2, wisTop + wisPadH * 1.2, maxWisW, wisSize * 1.3);
        }

        const catCX = x + cw / 2;
        const catTop = y + m + hdrH + qrH + wisH;
        const catSize = Math.round(catH * 0.3);
        ctx.fillStyle = themeConfig.accent;
        ctx.textAlign = 'center';
        ctx.font = `600 ${catSize}px ${themeConfig.fontFamily}`;
        ctx.fillText(sticker.title, catCX, catTop + catH * 0.55);

        ctx.fillStyle = ftrBg;
        ctx.beginPath();
        ctx.roundRect(x + m, y + ch - m - ftrH, cw - m * 2, ftrH, [0, 0, 4, 4]);
        ctx.fill();

        const ftrSize = Math.round(ftrH * 0.2);
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.font = `600 ${ftrSize}px ${themeConfig.fontFamily}`;
        ctx.fillText('\uD83D\uDFE2 ' + STORE_PHONE, x + m + pad, y + ch - m - ftrH + ftrH * 0.6);

        ctx.textAlign = 'right';
        ctx.fillText('\uD83D\uDCCD ' + STORE_NAME, x + cw - m - pad, y + ch - m - ftrH + ftrH * 0.6);
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sticker-studio-${config.type}-${config.theme}-${pages.length}pages.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  }, [pages, config, layoutCfg]);

  const rows = useMemo(() => LAYOUT_CONFIG[config.layout].rows, [config.layout]);
  const cols = useMemo(() => LAYOUT_CONFIG[config.layout].cols, [config.layout]);

  return (
    <div style={{ direction: dir, padding: '1rem 0' }}>
      <style>{PRINT_CSS}</style>

      {/* ── Toolbar ── */}
      <div id="sticker-toolbar" style={{
        background: colors.bgCard, borderRadius: '16px', border: `1px solid ${colors.borderLight}`,
        padding: '1rem', marginBottom: '1rem',
      }}>
        <Stack gap="md">
          <div>
            <label style={labelStyle}>{t('sticker.type')}</label>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {(Object.keys(STICKER_TYPES_CONFIG) as StickerType[]).map(type => (
                <button key={type} onClick={() => updateConfig('type', type)} style={btnStyle(config.type === type)}>
                  {getTypeTitle(type, lang)}
                </button>
              ))}
            </div>
          </div>

          <HStack gap="md" wrap>
            <div>
              <label style={labelStyle}>{t('sticker.copies')}</label>
              <select style={selectStyle} value={config.copies} onChange={e => updateConfig('copies', parseInt(e.target.value))}>
                {[1, 2, 3, 5, 10, 20, 50].map(n => <option key={n} value={n}>{n} {t('sticker.pages')}</option>)}
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('sticker.layout')}</label>
              <select style={selectStyle} value={config.layout} onChange={e => updateConfig('layout', e.target.value as LayoutMode)}>
                <option value="3x3">3 {'\u00D7'} 3 (9 {t('sticker.perPage')})</option>
                <option value="2x3">2 {'\u00D7'} 3 (6 {t('sticker.perPage')})</option>
                <option value="3x4">3 {'\u00D7'} 4 (12 {t('sticker.perPage')})</option>
              </select>
            </div>
            <div>
              <label style={labelStyle}>{t('sticker.theme')}</label>
              <select style={selectStyle} value={config.theme} onChange={e => updateConfig('theme', e.target.value as StickerTheme)}>
                {(Object.keys(STICKER_THEME_CONFIG) as StickerTheme[]).map(th => (
                  <option key={th} value={th}>{getThemeLabel(th, lang)}</option>
                ))}
              </select>
            </div>
          </HStack>

          <div>
            <label style={labelStyle}>{t('sticker.wisdom')}</label>
            <HStack gap="sm">
              <button onClick={() => updateConfig('quoteMode', 'random')} style={btnStyle(config.quoteMode === 'random')}>
                {t('sticker.random')}
              </button>
              <button onClick={() => updateConfig('quoteMode', 'category')} style={btnStyle(config.quoteMode === 'category')}>
                {t('sticker.byCategory')}
              </button>
              <button onClick={() => updateConfig('quoteMode', 'single')} style={btnStyle(config.quoteMode === 'single')}>
                {t('sticker.specific')}
              </button>
            </HStack>
          </div>

          {config.quoteMode === 'category' && (
            <div>
              <label style={labelStyle}>{t('sticker.category')}</label>
              <select style={selectStyle} value={selectedCategory} onChange={e => { setSelectedCategory(e.target.value as WisdomCategory); setSelectedWisdom(''); }}>
                <option value="">{t('sticker.selectCategory')}</option>
                {categories.map(c => {
                  const cl = CATEGORY_LABELS[c];
                  const label = lang === 'en' ? cl.english : lang === 'tr' ? cl.turkish : cl.arabic;
                  return <option key={c} value={c}>{label}</option>;
                })}
              </select>
            </div>
          )}

          {config.quoteMode === 'single' && (
            <div>
              <label style={labelStyle}>{t('sticker.selectWisdom')}</label>
              <select style={selectStyle} value={selectedWisdom} onChange={e => setSelectedWisdom(e.target.value)}>
                <option value="">{t('sticker.selectWisdomPlaceholder')}</option>
                {categoryWisdom.length > 0 ? categoryWisdom.map(w => (
                  <option key={w.id} value={w.id}>
                    {lang === 'en' ? w.english : lang === 'tr' ? w.turkish : w.arabic}
                  </option>
                )) : getAllCategories().map(c => getWisdomByCategory(c)).flat().map(w => (
                  <option key={w.id} value={w.id}>
                    {lang === 'en' ? w.english : lang === 'tr' ? w.turkish : w.arabic}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label style={labelStyle}>{t('sticker.contentType')}</label>
            <HStack gap="sm">
              <button onClick={() => updateConfig('contentType', 'wisdom')} style={btnStyle(config.contentType === 'wisdom')}>
                {getContentLabel('wisdom', lang)}
              </button>
              <button onClick={() => updateConfig('contentType', 'question')} style={btnStyle(config.contentType === 'question')}>
                {getContentLabel('question', lang)}
              </button>
            </HStack>
          </div>

          <div>
            <label style={labelStyle}>{t('sticker.mode')}</label>
            <HStack gap="sm">
              <button onClick={() => updateConfig('stickerMode', 'same')} style={btnStyle(config.stickerMode === 'same')}>
                {t('sticker.sameWisdom')}
              </button>
              <button onClick={() => updateConfig('stickerMode', 'different')} style={btnStyle(config.stickerMode === 'different')}>
                {t('sticker.differentWisdom')}
              </button>
              <button onClick={() => updateConfig('stickerMode', 'mixed')} style={btnStyle(config.stickerMode === 'mixed')}>
                {t('sticker.mixedTypes')}
              </button>
            </HStack>
          </div>

          <HStack gap="sm" wrap>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={config.showCropMarks} onChange={e => updateConfig('showCropMarks', e.target.checked)} />
              {t('sticker.cropMarks')}
            </label>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={config.showContact} onChange={e => updateConfig('showContact', e.target.checked)} />
              {t('sticker.showContact')}
            </label>
            <label style={{ ...labelStyle, display: 'flex', alignItems: 'center', gap: '0.4rem', cursor: 'pointer', margin: 0 }}>
              <input type="checkbox" checked={config.showQR} onChange={e => updateConfig('showQR', e.target.checked)} />
              QR
            </label>
          </HStack>

          <HStack gap="sm" wrap>
            <button onClick={generate} disabled={generating} style={{
              background: colors.accent, color: '#fff', border: 'none', borderRadius: '12px',
              padding: '0.7rem 1.5rem', fontSize: '0.85rem', fontWeight: 600,
              fontFamily: 'inherit', cursor: generating ? 'not-allowed' : 'pointer', opacity: generating ? 0.6 : 1,
              minHeight: '44px',
            }}>
              {generating ? t('sticker.generating') : t('sticker.generate')}
            </button>
          </HStack>
        </Stack>
      </div>

      {/* ── Preview ── */}
      {pages.length > 0 && (
        <div id="sticker-preview">
          {/* Separator */}
          <hr style={{
            border: 'none', borderTop: `2px solid ${colors.borderLight}`, margin: '0 0 1rem',
          }} />

          {pages.map((page, pi) => (
            <div key={pi} style={{ marginBottom: '1.5rem' }}>
              <div style={{
                fontSize: '0.75rem', color: colors.textMuted, marginBottom: '0.4rem',
                fontFamily: 'inherit', textAlign: 'center',
              }}>
                {t('sticker.page')} {pi + 1} / {pages.length}
              </div>

              {/* Scrollable viewport — no transform:scale() */}
              <div className="preview-viewport" style={{
                overflow: 'auto',
                maxHeight: '75vh',
                borderRadius: '8px',
                boxShadow: '0 4px 24px rgba(0,0,0,0.15)',
                background: config.colorScheme === 'dark' || config.colorScheme === 'amoled' ? '#1a1a2e' : '#fff',
              }}>
                <div className="preview-page" style={{
                  width: pxAtScale.pageW + 'px',
                  height: pxAtScale.pageH + 'px',
                  display: 'grid',
                  gridTemplateColumns: `repeat(${cols}, ${pxAtScale.stickerW}px)`,
                  gridTemplateRows: `repeat(${rows}, ${pxAtScale.stickerH}px)`,
                  gap: pxAtScale.gap + 'px',
                  padding: pxAtScale.margin + 'px',
                  boxSizing: 'border-box',
                  alignContent: 'start',
                }}>
                  {page.map((sticker, i) => {
                    const themeConfig = STICKER_THEME_CONFIG[config.theme];
                    const isDark = config.colorScheme === 'dark' || config.colorScheme === 'amoled';
                    const isHC = config.colorScheme === 'highcontrast';
                    const bg = isHC ? '#ffffff' : isDark ? '#1a1a2e' : themeConfig.bg;
                    const tc = isHC ? '#000000' : isDark ? '#f1f5f9' : themeConfig.text;
                    const sc = isHC ? '#333333' : isDark ? '#94a3b8' : themeConfig.text;
                    const cardBg = isHC ? '#f5f5f5' : isDark ? '#1e1e32' : '#f1f5f9';
                    const hdrBg = isHC ? '#e0e0e0' : isDark ? '#2d2d44' : themeConfig.accent;
                    const ftrBg = isHC ? '#333' : isDark ? '#0f0f1a' : themeConfig.accent;

                    const sH = pxAtScale.stickerH;
                    const sW = pxAtScale.stickerW;
                    const hdrH = Math.round(sH * 0.18);
                    const qrH = Math.round(sH * 0.32);
                    const wisH = Math.round(sH * 0.22);
                    const catH = Math.round(sH * 0.08);
                    const ftrH = Math.round(sH * 0.11);
                    const padInner = Math.round(sH * 0.025);

                    return (
                      <div key={i} style={{
                        width: '100%', height: '100%', boxSizing: 'border-box',
                        position: 'relative',
                        ...(config.showCropMarks ? {
                          borderRight: '0.5px dashed #aaa',
                          borderBottom: '0.5px dashed #aaa',
                        } : {}),
                      }}>
                        <div style={{
                          width: '100%', height: '100%', background: bg,
                          borderRadius: Math.max(1, Math.round(sW * 0.008)) + 'px',
                          boxSizing: 'border-box',
                          display: 'flex', flexDirection: 'column', overflow: 'hidden',
                          boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
                        }}>
                          {/* Header */}
                          <div style={{
                            height: hdrH + 'px', background: hdrBg, flexShrink: 0,
                            display: 'flex', flexDirection: 'column',
                            justifyContent: 'center', alignItems: 'center',
                            padding: `0 ${padInner}px`,
                          }}>
                            <div style={{
                              fontSize: Math.round(hdrH * 0.28) + 'px',
                              fontWeight: 700, color: '#fff',
                              fontFamily: themeConfig.fontFamily,
                              textAlign: 'center', lineHeight: 1.1,
                            }}>
                              {sticker.icon} {sticker.title.replace(/^[^\s]+\s/, '')}
                            </div>
                            <div style={{
                              fontSize: Math.round(hdrH * 0.16) + 'px',
                              color: 'rgba(255,255,255,0.8)',
                              fontFamily: themeConfig.fontFamily,
                              marginTop: '1px', lineHeight: 1.1,
                            }}>
                              {sticker.message.substring(0, 30)}
                            </div>
                          </div>

                          {/* QR */}
                          <div style={{
                            height: qrH + 'px', flexShrink: 0,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                            padding: Math.round(qrH * 0.08) + 'px',
                          }}>
                            {sticker.qrUrl ? (
                              <div style={{
                                background: '#fff', borderRadius: Math.max(1, Math.round(sW * 0.01)) + 'px',
                                padding: '1px', boxShadow: '0 1px 4px rgba(0,0,0,0.15)',
                                display: 'flex', justifyContent: 'center', alignItems: 'center',
                                width: '80%', height: '80%',
                              }}>
                                <img src={sticker.qrUrl} alt="QR" style={{
                                  width: '100%', height: '100%', objectFit: 'contain',
                                }} />
                              </div>
                            ) : (
                              <div style={{
                                fontSize: Math.round(qrH * 0.2) + 'px', color: sc,
                                fontFamily: themeConfig.fontFamily, textAlign: 'center',
                              }}>
                                QR
                              </div>
                            )}
                          </div>

                          {/* Wisdom */}
                          {sticker.wisdom && (
                            <div style={{
                              height: wisH + 'px', flexShrink: 0,
                              display: 'flex', justifyContent: 'center', alignItems: 'center',
                              padding: `0 ${padInner}px`,
                            }}>
                              <div style={{
                                background: cardBg, borderRadius: Math.max(1, Math.round(sW * 0.005)) + 'px',
                                padding: `${Math.round(wisH * 0.1)}px ${Math.round(wisH * 0.08)}px`,
                                width: '100%', height: '90%',
                                display: 'flex', flexDirection: 'column',
                                justifyContent: 'center', alignItems: 'center',
                                border: `0.5px solid ${isDark ? '#3d3d56' : '#e2e8f0'}`,
                              }}>
                                <div style={{
                                  fontSize: Math.round(wisH * 0.15) + 'px',
                                  color: themeConfig.accent, lineHeight: 1,
                                }}>
                                  {'\u275D'}
                                </div>
                                <div style={{
                                  fontSize: Math.round(wisH * 0.18) + 'px', color: tc,
                                  fontFamily: themeConfig.fontFamily, fontWeight: 500,
                                  textAlign: 'center', lineHeight: 1.2,
                                  display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
                                  overflow: 'hidden',
                                }}>
                                  {sticker.wisdom}
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Category */}
                          <div style={{
                            height: (sticker.wisdom ? catH : catH + wisH) + 'px', flexShrink: 0,
                            display: 'flex', justifyContent: 'center', alignItems: 'center',
                          }}>
                            <div style={{
                              fontSize: Math.round(catH * 0.3) + 'px', color: themeConfig.accent,
                              fontFamily: themeConfig.fontFamily, fontWeight: 600,
                              padding: `0 ${padInner}px`, textAlign: 'center',
                            }}>
                              {sticker.title}
                            </div>
                          </div>

                          {/* Footer */}
                          <div style={{
                            height: ftrH + 'px', background: ftrBg,
                            marginTop: 'auto', flexShrink: 0,
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            padding: `0 ${Math.round(padInner * 1.5)}px`,
                          }}>
                            <div style={{
                              fontSize: Math.round(ftrH * 0.2) + 'px',
                              color: '#fff', fontFamily: themeConfig.fontFamily, fontWeight: 600,
                            }}>
                              {'\uD83D\uDFE2'} {STORE_PHONE}
                            </div>
                            <div style={{
                              fontSize: Math.round(ftrH * 0.2) + 'px',
                              color: '#fff', fontFamily: themeConfig.fontFamily,
                            }}>
                              {'\uD83D\uDCCD'} {STORE_NAME}
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          ))}

          {/* Zoom + Actions */}
          <div style={{
            marginTop: '0.75rem', marginBottom: '0.5rem',
            display: 'flex', alignItems: 'center', gap: '1rem',
            justifyContent: 'center', flexWrap: 'wrap',
          }}>
            <span style={{ fontSize: '0.75rem', color: colors.textMuted, fontFamily: 'inherit' }}>
              {t('sticker.zoom')}
            </span>
            <input type="range" min={0.25} max={2.0} step={0.05} value={previewScale}
              onChange={e => setPreviewScale(parseFloat(e.target.value))}
              style={{ flex: '0 1 200px', minWidth: '120px' }} />
            <span style={{
              fontSize: '0.7rem', color: colors.textMuted, fontFamily: 'inherit',
              minWidth: '3em', textAlign: 'center',
            }}>
              {Math.round(previewScale * 100)}%
            </span>

            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={downloadPDF} style={{
                background: colors.bgInput, color: colors.text, border: `1px solid ${colors.borderLight}`,
                borderRadius: '12px', padding: '0.6rem 1.2rem', fontSize: '0.8rem',
                fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', minHeight: '40px',
              }}>
                {t('sticker.pdf')}
              </button>
              <button onClick={triggerPrint} style={{
                background: colors.accent, color: '#fff', border: 'none',
                borderRadius: '12px', padding: '0.6rem 1.2rem', fontSize: '0.8rem',
                fontWeight: 600, fontFamily: 'inherit', cursor: 'pointer', minHeight: '40px',
              }}>
                {t('sticker.print')}
              </button>
            </div>
          </div>
        </div>
      )}

      {pages.length === 0 && !generating && (
        <div style={{ textAlign: 'center', padding: '2rem', color: colors.textMuted, fontSize: '0.85rem' }}>
          {t('sticker.noPreview')}
        </div>
      )}
    </div>
  );
});

function wrapText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(' ');
  let line = '';
  for (const word of words) {
    const testLine = line + word + ' ';
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = word + ' ';
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  ctx.fillText(line, x, y);
}

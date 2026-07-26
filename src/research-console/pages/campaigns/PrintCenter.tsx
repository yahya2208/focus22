import { useState, useRef, useMemo } from 'react';
import { useTranslation } from '../../../hooks/useTranslation';
import type { TranslationKey } from '../../../i18n';

type LayoutType = 'single' | '2up' | '4up' | '6up' | '9up' | '12sticker';

interface Props {
  campaignName: string;
  campaignUrl: string;
  qrImage?: string | null;
  logoUrl?: string | null;
}

const LAYOUTS: { id: LayoutType; labelKey: string; cols: number; rows: number }[] = [
  { id: 'single', labelKey: 'campaign.singlePoster', cols: 1, rows: 1 },
  { id: '2up', labelKey: 'campaign.twoPerPage', cols: 2, rows: 1 },
  { id: '4up', labelKey: 'campaign.fourPerPage', cols: 2, rows: 2 },
  { id: '6up', labelKey: 'campaign.sixPerPage', cols: 2, rows: 3 },
  { id: '9up', labelKey: 'campaign.ninePerPage', cols: 3, rows: 3 },
  { id: '12sticker', labelKey: 'campaign.twelveStickers', cols: 3, rows: 4 },
];

const btnSmall: React.CSSProperties = { padding: '0.4rem 0.8rem', borderRadius: '6px', background: '#1e1e2e', color: '#ccc', border: '1px solid #333', cursor: 'pointer', fontSize: '0.78rem' };
const btnPrimary: React.CSSProperties = { padding: '0.5rem 1.25rem', borderRadius: '8px', background: '#6366f1', color: '#fff', border: 'none', cursor: 'pointer', fontWeight: 600, fontSize: '0.85rem' };

function mmToPx(mm: number, dpi = 96): number { return Math.round(mm * dpi / 25.4); }

export function PrintCenter({ campaignName, qrImage, logoUrl }: Props) {
  const { t } = useTranslation();
  const [layout, setLayout] = useState<LayoutType>('6up');
  const previewRef = useRef<HTMLDivElement>(null);
  const selected = LAYOUTS.find(l => l.id === layout)!;

  const renderCard = useMemo(() => (qrSrc: string | null, cardW: number, cardH: number, isSticker: boolean) => (
    <div style={{
      width: cardW, height: cardH, display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', padding: isSticker ? '4px' : '8px',
      boxSizing: 'border-box', borderRight: '1px dashed #ccc', borderBottom: '1px dashed #ccc',
    }}>
      {!isSticker && logoUrl && <img src={logoUrl} alt="" style={{ height: '24px', marginBottom: '4px', objectFit: 'contain' }} />}
      {!isSticker && <p style={{ margin: 0, fontSize: '10px', fontWeight: 'bold', color: '#000' }}>{t('campaign.focusTest')}</p>}
      {qrSrc && <img src={qrSrc} alt="QR" style={{ width: isSticker ? '80%' : '60%', maxWidth: isSticker ? 60 : 120, imageRendering: 'pixelated' }} />}
      {!isSticker && <p style={{ margin: '2px 0 0', fontSize: '8px', color: '#666' }}>{t('campaign.scanMe')}</p>}
      {!isSticker && <p style={{ margin: '1px 0 0', fontSize: '7px', color: '#999' }}>{campaignName}</p>}
    </div>
  ), [campaignName, logoUrl, t]);

  const renderLayout = () => {
    const isSticker = layout === '12sticker';
    const isSingle = layout === 'single';
    const pageW = 595;
    const pageH = 842;
    const padding = 30;
    const cols = selected.cols;
    const rows = selected.rows;
    const cellW = isSingle ? pageW - padding * 2 : Math.floor((pageW - padding * 2) / cols);
    const cellH = isSingle ? pageH - padding * 2 : Math.floor((pageH - padding * 2) / rows);

    return (
      <div ref={previewRef} style={{
        width: pageW, height: pageH, background: '#fff', display: 'flex', flexWrap: 'wrap',
        padding, boxSizing: 'border-box', alignContent: 'flex-start',
      }}>
        {Array.from({ length: cols * rows }).map((_, i) => (
          <div key={i} style={{ width: cellW, height: cellH, boxSizing: 'border-box' }}>
            {renderCard(qrImage ?? null, cellW, cellH, isSticker)}
          </div>
        ))}
      </div>
    );
  };

  const generatePDF = async () => {
    if (!qrImage) return;
    const DPI = 300;
    const PW = 210;
    const PH = 297;
    const canvasW = mmToPx(PW, DPI);
    const canvasH = mmToPx(PH, DPI);
    const canvas = document.createElement('canvas');
    canvas.width = canvasW;
    canvas.height = canvasH;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const padding = mmToPx(10, DPI);
    const cols = selected.cols;
    const rows = selected.rows;
    const cellW = isSingleLayout() ? canvasW - padding * 2 : Math.floor((canvasW - padding * 2) / cols);
    const cellH = isSingleLayout() ? canvasH - padding * 2 : Math.floor((canvasH - padding * 2) / rows);
    const isSticker = layout === '12sticker';

    const qrImg = new Image();
    qrImg.src = qrImage;
    await new Promise<void>((resolve) => { qrImg.onload = () => resolve(); qrImg.onerror = () => resolve(); });

    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const x = padding + c * cellW;
        const y = padding + r * cellH;
        ctx.strokeStyle = '#cccccc';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x, y, cellW, cellH);
        ctx.setLineDash([]);

        const qrSize = isSticker ? Math.min(cellW, cellH) * 0.7 : Math.min(cellW, cellH) * 0.45;
        const qrX = x + (cellW - qrSize) / 2;
        let qrY = y + (cellH - qrSize) / 2;

        if (!isSticker) {
          qrY = y + cellH * 0.35;
          ctx.fillStyle = '#000000';
          ctx.font = `bold ${Math.round(cellH * 0.08)}px Arial`;
          ctx.textAlign = 'center';
          ctx.fillText(t('campaign.focusTest'), x + cellW / 2, y + cellH * 0.15);
          ctx.font = `${Math.round(cellH * 0.05)}px Arial`;
          ctx.fillStyle = '#666666';
          ctx.fillText(t('campaign.scanMe'), x + cellW / 2, qrY + qrSize + cellH * 0.07);
          ctx.font = `${Math.round(cellH * 0.04)}px Arial`;
          ctx.fillStyle = '#999999';
          ctx.fillText(campaignName, x + cellW / 2, qrY + qrSize + cellH * 0.13);
        }

        if (qrImg.complete && qrImg.naturalWidth > 0) {
          ctx.drawImage(qrImg, qrX, qrY, qrSize, qrSize);
        }
      }
    }

    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${campaignName.toLowerCase().replace(/\s+/g, '-')}-${layout}-300dpi.png`;
      a.click();
      URL.revokeObjectURL(url);
    }, 'image/png');
  };

  const isSingleLayout = () => layout === 'single';

  const triggerPrint = () => {
    generatePDF();
  };

  return (
    <div>
      <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{t('campaign.printCenter')}</p>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.4rem', marginBottom: '1rem' }}>
        {LAYOUTS.map(l => (
          <button key={l.id} onClick={() => setLayout(l.id)} style={{
            padding: '0.5rem', borderRadius: '8px', fontSize: '0.78rem',
            background: layout === l.id ? '#6366f1' : '#1e1e2e',
            color: layout === l.id ? '#fff' : '#888',
            border: `1px solid ${layout === l.id ? '#6366f1' : '#333'}`,
            cursor: 'pointer',
          }}>{t(l.labelKey as TranslationKey)}</button>
        ))}
      </div>

      <div style={{ display: 'flex', justifyContent: 'center', overflow: 'auto', background: '#f5f5f5', borderRadius: '8px', padding: '1rem', marginBottom: '1rem', maxHeight: '60vh' }}>
        {renderLayout()}
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        <button onClick={generatePDF} style={btnPrimary} disabled={!qrImage}>{t('campaign.downloadPNG')} (300 DPI)</button>
        <button onClick={triggerPrint} style={btnSmall} disabled={!qrImage}>{t('campaign.downloadSVG')}</button>
      </div>
    </div>
  );
}

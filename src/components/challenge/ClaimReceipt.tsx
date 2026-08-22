import { useCallback, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { useThemeColors } from '../../hooks/useThemeColors';

interface ClaimReceiptProps {
  readonly challengeName: string;
  readonly displayName: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly rank: number;
  readonly claimCode: string;
  readonly claimId: string;
  readonly verificationToken: string;
  readonly issuedAt: string;
  readonly expiresAt: string;
}

const RECEIPT_WIDTH = 800;
const RECEIPT_HEIGHT = 600;
const BG_COLOR = '#ffffff';
const ACCENT = '#3b82f6';
const TEXT_DARK = '#1e1e2e';
const TEXT_MUTED = '#6c6c90';
const BORDER_LIGHT = '#e2e8f0';
const SUCCESS = '#10b981';

export function ClaimReceipt({
  challengeName,
  displayName,
  focusScore,
  grade,
  rank,
  claimCode,
  claimId,
  verificationToken,
  issuedAt,
  expiresAt,
}: ClaimReceiptProps) {
  const colors = useThemeColors();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);

  const drawReceipt = useCallback(async (ctx: CanvasRenderingContext2D) => {
    const w = RECEIPT_WIDTH;
    const h = RECEIPT_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Top accent bar
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, ACCENT);
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, SUCCESS);
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, 6);

    // Border
    ctx.strokeStyle = BORDER_LIGHT;
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, w - 2, h - 2);

    // FOCUS branding
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '600 11px system-ui, -apple-system, sans-serif';
    ctx.letterSpacing = '2px';
    ctx.textAlign = 'center';
    ctx.fillText('FOCUS', w / 2, 36);

    // Title
    ctx.fillStyle = TEXT_DARK;
    ctx.font = '700 22px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('PRIZE CLAIM RECEIPT', w / 2, 66);

    // Subtitle
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '400 12px system-ui, -apple-system, sans-serif';
    ctx.fillText('This document serves as proof of a valid prize claim.', w / 2, 86);

    // Divider
    ctx.strokeStyle = BORDER_LIGHT;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(40, 100);
    ctx.lineTo(w - 40, 100);
    ctx.stroke();

    // Left column — details
    let y = 130;
    const leftX = 50;
    const valueX = 220;

    const drawField = (label: string, value: string, bold = false) => {
      ctx.fillStyle = TEXT_MUTED;
      ctx.font = '500 11px system-ui, -apple-system, sans-serif';
      ctx.textAlign = 'left';
      ctx.fillText(label.toUpperCase(), leftX, y);

      ctx.fillStyle = TEXT_DARK;
      ctx.font = `${bold ? '700' : '400'} 14px system-ui, -apple-system, sans-serif`;
      ctx.fillText(value, valueX, y);
      y += 30;
    };

    drawField('Challenge', challengeName);
    drawField('Winner', displayName);
    drawField('Score', `${focusScore}/100`);
    drawField('Grade', grade, true);
    drawField('Rank', `#${rank}`);
    drawField('Issued', new Date(issuedAt).toLocaleString());
    drawField('Expires', new Date(expiresAt).toLocaleString());

    // Divider before claim code
    y += 5;
    ctx.strokeStyle = BORDER_LIGHT;
    ctx.beginPath();
    ctx.moveTo(40, y);
    ctx.lineTo(w - 40, y);
    ctx.stroke();
    y += 25;

    // Claim code (large, prominent)
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('CLAIM CODE', leftX, y);
    y += 8;

    ctx.fillStyle = ACCENT;
    ctx.font = '800 32px "SF Mono", "Fira Code", monospace';
    ctx.fillText(claimCode, leftX, y + 8);
    y += 35;

    // Claim ID
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 11px system-ui, -apple-system, sans-serif';
    ctx.fillText('CLAIM ID', leftX, y);
    y += 5;

    ctx.fillStyle = TEXT_DARK;
    ctx.font = '400 12px "SF Mono", "Fira Code", monospace';
    ctx.fillText(claimId, leftX, y + 8);
    y += 30;

    // Right column — QR code
    const qrUrl = `#/claim-verify?token=${verificationToken}`;
    const qrDataUrl = await QRCode.toDataURL(qrUrl, {
      width: 160,
      margin: 1,
      color: { dark: TEXT_DARK, light: '#ffffff' },
      errorCorrectionLevel: 'M',
    });

    const qrImg = new Image();
    await new Promise<void>((resolve) => {
      qrImg.onload = () => resolve();
      qrImg.src = qrDataUrl;
    });

    const qrX = w - 210;
    const qrY = 120;
    ctx.drawImage(qrImg, qrX, qrY, 160, 160);

    // QR label
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '500 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Scan to verify', qrX + 80, qrY + 178);

    // Footer
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '400 10px system-ui, -apple-system, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Generated by FOCUS — Focus Assessment & Cognitive Understanding System', w / 2, h - 30);
    ctx.fillText(`Verification URL: ${qrUrl}`, w / 2, h - 14);
  }, [challengeName, displayName, focusScore, grade, rank, claimCode, claimId, verificationToken, issuedAt, expiresAt]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = RECEIPT_WIDTH;
      canvas.height = RECEIPT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      await drawReceipt(ctx);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-claim-${claimCode.toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [drawReceipt, claimCode]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      <canvas
        ref={canvasRef}
        width={RECEIPT_WIDTH}
        height={RECEIPT_HEIGHT}
        style={{ display: 'none' }}
      />
      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          width: '100%', padding: '0.65rem 1rem', borderRadius: '10px',
          border: `1px solid ${colors.accent}`, background: `${colors.accent}18`,
          color: colors.accent, fontSize: '0.8rem', fontWeight: 600,
          fontFamily: 'inherit', cursor: downloading ? 'not-allowed' : 'pointer',
          opacity: downloading ? 0.6 : 1,
        }}
      >
        {downloading ? 'Generating receipt…' : 'Download Claim Receipt'}
      </button>
    </div>
  );
}

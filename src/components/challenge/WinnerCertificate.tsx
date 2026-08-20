import { useCallback, useRef, useState } from 'react';
import { useThemeColors } from '../../hooks/useThemeColors';

interface WinnerCertificateProps {
  readonly challengeName: string;
  readonly displayName: string;
  readonly focusScore: number;
  readonly grade: string;
  readonly submittedAt?: string;
}

const CERT_WIDTH = 800;
const CERT_HEIGHT = 500;
const BG_COLOR = '#ffffff';
const ACCENT = '#3b82f6';
const TEXT_DARK = '#1e1e2e';
const TEXT_MUTED = '#6c6c90';

export function WinnerCertificate({
  challengeName,
  displayName,
  focusScore,
  grade,
  submittedAt,
}: WinnerCertificateProps) {
  const colors = useThemeColors();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [downloading, setDownloading] = useState(false);

  const drawCertificate = useCallback((ctx: CanvasRenderingContext2D) => {
    const w = CERT_WIDTH;
    const h = CERT_HEIGHT;

    ctx.clearRect(0, 0, w, h);

    // Background
    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, w, h);

    // Decorative top bar
    const gradient = ctx.createLinearGradient(0, 0, w, 0);
    gradient.addColorStop(0, '#3b82f6');
    gradient.addColorStop(0.5, '#8b5cf6');
    gradient.addColorStop(1, '#10b981');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, 8);

    // Border
    ctx.strokeStyle = '#e2e8f0';
    ctx.lineWidth = 2;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Inner decorative border
    ctx.strokeStyle = '#cbd5e1';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    ctx.strokeRect(30, 30, w - 60, h - 60);
    ctx.setLineDash([]);

    // Trophy emoji
    ctx.font = '48px serif';
    ctx.textAlign = 'center';
    ctx.fillText('🏆', w / 2, 90);

    // Title
    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 14px sans-serif';
    ctx.letterSpacing = '4px';
    ctx.textAlign = 'center';
    ctx.fillText('CERTIFICATE OF EXCELLENCE', w / 2, 120);

    // "Winner" label
    ctx.fillStyle = TEXT_DARK;
    ctx.font = 'bold 36px sans-serif';
    ctx.letterSpacing = '0px';
    ctx.fillText('Challenge Winner', w / 2, 165);

    // Decorative line
    ctx.strokeStyle = ACCENT;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 2 - 100, 180);
    ctx.lineTo(w / 2 + 100, 180);
    ctx.stroke();

    // "Awarded to"
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '14px sans-serif';
    ctx.fillText('Awarded to', w / 2, 210);

    // Winner name
    ctx.fillStyle = TEXT_DARK;
    ctx.font = 'bold 30px sans-serif';
    const truncatedName = displayName.length > 24 ? displayName.slice(0, 22) + '…' : displayName;
    ctx.fillText(truncatedName, w / 2, 250);

    // Challenge name
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '16px sans-serif';
    const truncatedChallenge = challengeName.length > 40 ? challengeName.slice(0, 38) + '…' : challengeName;
    ctx.fillText(truncatedChallenge, w / 2, 285);

    // Score box
    const boxW = 240;
    const boxH = 60;
    const boxX = w / 2 - boxW / 2;
    const boxY = 305;

    ctx.fillStyle = '#f0f4ff';
    ctx.beginPath();
    ctx.roundRect(boxX, boxY, boxW, boxH, 12);
    ctx.fill();

    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText('FOCUS SCORE', boxX + 20, boxY + 22);

    ctx.fillStyle = TEXT_DARK;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillText(`${focusScore}/100`, boxX + 20, boxY + 50);

    ctx.fillStyle = ACCENT;
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(grade, boxX + boxW - 20, boxY + 50);

    ctx.textAlign = 'center';

    // Date
    ctx.fillStyle = TEXT_MUTED;
    ctx.font = '12px sans-serif';
    if (submittedAt) {
      ctx.fillText(`Completed: ${new Date(submittedAt).toLocaleDateString()}`, w / 2, 400);
    }

    // Footer
    ctx.fillStyle = '#cbd5e1';
    ctx.font = '11px sans-serif';
    ctx.fillText('FOCUS — Focus Assessment & Cognitive Understanding System', w / 2, 440);

    // Bottom bar
    ctx.fillStyle = gradient;
    ctx.fillRect(0, h - 8, w, 8);
  }, [challengeName, displayName, focusScore, grade, submittedAt]);

  const handleDownload = useCallback(async () => {
    setDownloading(true);
    try {
      const canvas = document.createElement('canvas');
      canvas.width = CERT_WIDTH;
      canvas.height = CERT_HEIGHT;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      drawCertificate(ctx);

      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob(resolve, 'image/png'),
      );
      if (!blob) return;

      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `focus-winner-${challengeName.replace(/\s+/g, '-').toLowerCase()}.png`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } finally {
      setDownloading(false);
    }
  }, [drawCertificate, challengeName]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      {/* Hidden canvas for rendering */}
      <canvas
        ref={(el) => {
          (canvasRef as React.MutableRefObject<HTMLCanvasElement | null>).current = el;
          if (el) {
            const ctx = el.getContext('2d');
            if (ctx) drawCertificate(ctx);
          }
        }}
        width={CERT_WIDTH}
        height={CERT_HEIGHT}
        style={{ width: '100%', maxWidth: '400px', borderRadius: '8px', border: `1px solid ${colors.border}` }}
      />

      <button
        type="button"
        onClick={handleDownload}
        disabled={downloading}
        style={{
          padding: '0.6rem 1.4rem', borderRadius: '10px', border: 'none',
          background: colors.accent, color: '#fff',
          fontSize: '0.85rem', fontWeight: 700, fontFamily: 'inherit',
          cursor: downloading ? 'not-allowed' : 'pointer',
          opacity: downloading ? 0.6 : 1,
        }}
      >
        {downloading ? 'Generating…' : 'Download Certificate'}
      </button>
    </div>
  );
}

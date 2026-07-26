import QRCode from 'qrcode';

export interface QRGenerateOptions {
  readonly width?: number;
  readonly margin?: number;
  readonly color?: { readonly dark?: string; readonly light?: string };
  readonly errorCorrectionLevel?: 'L' | 'M' | 'Q' | 'H';
}

export interface QRResult {
  readonly svg: string;
  readonly dataUrl: string;
  readonly width: number;
  readonly height: number;
}

const DEFAULT_OPTIONS: Required<QRGenerateOptions> = {
  width: 256,
  margin: 2,
  color: { dark: '#000000', light: '#ffffff' },
  errorCorrectionLevel: 'M',
};

export async function generateQRSvg(
  data: string,
  options: QRGenerateOptions = {},
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const svg = await QRCode.toString(data, {
    type: 'svg',
    width: opts.width,
    margin: opts.margin,
    color: { dark: opts.color.dark, light: opts.color.light },
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
  return svg;
}

export async function generateQRDataUrl(
  data: string,
  options: QRGenerateOptions = {},
): Promise<string> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const dataUrl = await QRCode.toDataURL(data, {
    width: opts.width,
    margin: opts.margin,
    color: { dark: opts.color.dark, light: opts.color.light },
    errorCorrectionLevel: opts.errorCorrectionLevel,
  });
  return dataUrl;
}

export async function generateQR(
  data: string,
  options: QRGenerateOptions = {},
): Promise<QRResult> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const [svg, dataUrl] = await Promise.all([
    generateQRSvg(data, opts),
    generateQRDataUrl(data, opts),
  ]);
  return { svg, dataUrl, width: opts.width, height: opts.width };
}

export function buildQrUrl(
  baseUrl: string,
  params: Record<string, string>,
): string {
  const url = new URL(baseUrl);
  for (const [key, value] of Object.entries(params)) {
    if (value) url.searchParams.set(key, value);
  }
  return url.toString();
}

export function buildFocusQrUrl(
  baseUrl: string,
  campaignId: string,
  extras?: Record<string, string>,
): string {
  return buildQrUrl(baseUrl, {
    campaign: campaignId,
    ...extras,
  });
}

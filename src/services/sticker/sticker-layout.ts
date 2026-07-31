export interface PaperSpec {
  widthMm: number;
  heightMm: number;
}

export const A4: PaperSpec = { widthMm: 210, heightMm: 297 };

export interface StickerLayoutInput {
  paper: PaperSpec;
  rows: number;
  cols: number;
  marginMm: number;
  gapMm: number;
}

export interface CellCoord {
  col: number;
  row: number;
  xMm: number;
  yMm: number;
}

export interface StickerLayout {
  stickerWidthMm: number;
  stickerHeightMm: number;
  printableWidthMm: number;
  printableHeightMm: number;
  cells: CellCoord[];
}

export function calculateStickerLayout(input: StickerLayoutInput): StickerLayout {
  const { paper, rows, cols, marginMm, gapMm } = input;
  const printableWidthMm = paper.widthMm - marginMm * 2;
  const printableHeightMm = paper.heightMm - marginMm * 2;
  const totalGapW = gapMm * (cols - 1);
  const totalGapH = gapMm * (rows - 1);
  const stickerWidthMm = (printableWidthMm - totalGapW) / cols;
  const stickerHeightMm = (printableHeightMm - totalGapH) / rows;

  const cells: CellCoord[] = [];
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      cells.push({
        col,
        row,
        xMm: marginMm + col * (stickerWidthMm + gapMm),
        yMm: marginMm + row * (stickerHeightMm + gapMm),
      });
    }
  }

  return { stickerWidthMm, stickerHeightMm, printableWidthMm, printableHeightMm, cells };
}

export function mmToPx(mm: number, dpi = 96): number {
  return Math.round(mm * dpi / 25.4);
}

export function stickerLayoutToPx(layout: StickerLayout, dpi = 96): {
  stickerWidthPx: number;
  stickerHeightPx: number;
  marginPx: number;
  gapPx: number;
  cells: { col: number; row: number; xPx: number; yPx: number }[];
} {
  return {
    stickerWidthPx: mmToPx(layout.stickerWidthMm, dpi),
    stickerHeightPx: mmToPx(layout.stickerHeightMm, dpi),
    marginPx: mmToPx(0, dpi),
    gapPx: 0,
    cells: layout.cells.map(c => ({
      col: c.col,
      row: c.row,
      xPx: mmToPx(c.xMm, dpi),
      yPx: mmToPx(c.yMm, dpi),
    })),
  };
}

export function getLayoutConfig(layout: string): { rows: number; cols: number } {
  switch (layout) {
    case '3x4': return { rows: 4, cols: 3 };
    case '2x3': return { rows: 3, cols: 2 };
    case '3x3':
    default: return { rows: 3, cols: 3 };
  }
}

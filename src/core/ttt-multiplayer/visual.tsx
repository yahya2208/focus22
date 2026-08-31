import type { ReactNode } from 'react';
import type { ThemeColors } from '../../hooks/useThemeColors';

/** A crisp SVG glyph for an X or O mark, themed by accent (X) / danger (O). */
export function MarkGlyph({
  mark,
  size,
  colors,
  color,
}: {
  mark: 'X' | 'O';
  size: number;
  colors: ThemeColors;
  color?: string;
}) {
  const stroke = color ?? (mark === 'X' ? colors.accent : colors.danger);
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      {mark === 'X' ? (
        <g stroke={stroke} strokeWidth={4} strokeLinecap="round">
          <line x1={5} y1={5} x2={19} y2={19} />
          <line x1={19} y1={5} x2={5} y2={19} />
        </g>
      ) : (
        <circle
          cx={12}
          cy={12}
          r={7.5}
          stroke={stroke}
          strokeWidth={3.5}
          fill="none"
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}

/** A compact square mini-grid used as Tic Tac Toe iconography (4-in-a-row identity). */
export function GridMotif({
  size,
  accentCell,
  dangerCell,
  colors,
  cell = 12,
  gap = 3,
}: {
  size: number;
  accentCell?: { row: number; col: number };
  dangerCell?: { row: number; col: number };
  colors: ThemeColors;
  cell?: number;
  gap?: number;
}) {
  const cells: ReactNode[] = [];
  for (let r = 0; r < size; r += 1) {
    for (let c = 0; c < size; c += 1) {
      const isAccent = accentCell ? accentCell.row === r && accentCell.col === c : false;
      const isDanger = dangerCell ? dangerCell.row === r && dangerCell.col === c : false;
      cells.push(
        <div
          key={`${r}-${c}`}
          style={{
            width: cell,
            height: cell,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: colors.glass,
            border: `1px solid ${colors.glassBorder}`,
            borderRadius: 3,
            boxSizing: 'border-box',
          }}
        >
          {isAccent ? (
            <MarkGlyph mark="X" size={cell - 2} colors={colors} />
          ) : isDanger ? (
            <MarkGlyph mark="O" size={cell - 2} colors={colors} />
          ) : null}
        </div>,
      );
    }
  }
  return (
    <div
      aria-hidden="true"
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${size}, ${cell}px)`,
        gap,
      }}
    >
      {cells}
    </div>
  );
}
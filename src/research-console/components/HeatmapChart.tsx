interface Props {
  data: number[][];  // data[day][hour] - 7 days x 24 hours
  title?: string;
}

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const HOURS = [0, 3, 6, 9, 12, 15, 18, 21];

function heatColor(value: number, max: number): string {
  if (max === 0 || value === 0) return '#1e1e2e';
  const ratio = value / max;
  if (ratio < 0.25) return '#0e4429';
  if (ratio < 0.5) return '#006d32';
  if (ratio < 0.75) return '#26a641';
  return '#39d353';
}

export function HeatmapChart({ data, title }: Props) {
  const maxVal = Math.max(...data.flat(), 1);
  const cellSize = 28;
  const leftPad = 40;
  const topPad = 24;

  return (
    <div>
      {title && <p style={{ color: '#f0f0f0', fontSize: '0.9rem', fontWeight: 600, margin: '0 0 0.75rem' }}>{title}</p>}
      <div style={{ overflowX: 'auto' }}>
        <svg width={leftPad + 24 * cellSize + 10} height={topPad + 7 * cellSize + 10}>
          {HOURS.map(h => (
            <text key={h} x={leftPad + h * cellSize + cellSize / 2} y={topPad - 6} fill="#888" fontSize="9" textAnchor="middle">{h}:00</text>
          ))}
          {DAYS.map((day, d) => (
            <text key={day} x={leftPad - 6} y={topPad + d * cellSize + cellSize / 2 + 3} fill="#888" fontSize="9" textAnchor="end">{day}</text>
          ))}
          {data.map((row, d) => row.map((val, h) => (
            <rect key={`${d}-${h}`} x={leftPad + h * cellSize + 1} y={topPad + d * cellSize + 1}
              width={cellSize - 2} height={cellSize - 2} rx="3" fill={heatColor(val, maxVal)}>
              <title>{`${DAYS[d]} ${h}:00 — ${val} scans`}</title>
            </rect>
          )))}
        </svg>
      </div>
    </div>
  );
}

import { computeBarChartLayout, type ChartDataPoint, type ChartDimensions } from '../../../core/research/charts';

interface BarChartProps {
  readonly data: readonly ChartDataPoint[];
  readonly title?: string;
  readonly dimensions?: ChartDimensions;
  readonly color?: string;
}

export function BarChart({ data, title, dimensions, color }: BarChartProps) {
  const { bars, maxValue } = computeBarChartLayout(data, dimensions);
  const dims = dimensions ?? { width: 400, height: 250, padding: { top: 20, right: 20, bottom: 40, left: 50 } };

  return (
    <div>
      {title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{title}</h3>}
      <svg width={dims.width} height={dims.height} role="img" aria-label={title ?? 'Bar chart'}>
        {bars.map((bar, i) => (
          <rect
            key={i}
            x={bar.x}
            y={bar.y}
            width={bar.width}
            height={bar.height}
            fill={color ?? bar.color}
            rx={3}
          >
            <title>{`${bar.label}: ${bar.value}`}</title>
          </rect>
        ))}
        {bars.map((bar, i) => (
          <text
            key={`label-${i}`}
            x={bar.x + bar.width / 2}
            y={dims.height - 10}
            textAnchor="middle"
            fill="#888"
            fontSize={10}
          >
            {bar.label.length > 8 ? bar.label.slice(0, 8) + '…' : bar.label}
          </text>
        ))}
        <line x1={dims.padding.left} y1={dims.height - dims.padding.bottom} x2={dims.width - dims.padding.right} y2={dims.height - dims.padding.bottom} stroke="#333" />
        <line x1={dims.padding.left} y1={dims.padding.top} x2={dims.padding.left} y2={dims.height - dims.padding.bottom} stroke="#333" />
        <text x={dims.padding.left - 5} y={dims.padding.top + 10} textAnchor="end" fill="#888" fontSize={10}>{maxValue.toFixed(0)}</text>
        <text x={dims.padding.left - 5} y={dims.height - dims.padding.bottom} textAnchor="end" fill="#888" fontSize={10}>0</text>
      </svg>
    </div>
  );
}

interface LineChartProps {
  readonly data: readonly { timestamp: number; value: number }[];
  readonly title?: string;
  readonly dimensions?: ChartDimensions;
  readonly color?: string;
}

export function LineChart({ data, title, dimensions, color = '#6366f1' }: LineChartProps) {
  const dims = dimensions ?? { width: 400, height: 250, padding: { top: 20, right: 20, bottom: 40, left: 50 } };

  let path = '';
  const chartW = dims.width - dims.padding.left - dims.padding.right;
  const chartH = dims.height - dims.padding.top - dims.padding.bottom;

  if (data.length > 0) {
    const maxVal = Math.max(...data.map((d) => d.value), 1);
    const step = chartW / Math.max(data.length - 1, 1);
    const points = data.map((d, i) => ({
      x: dims.padding.left + step * i,
      y: dims.padding.top + chartH - (d.value / maxVal) * chartH,
    }));
    path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');

    return (
      <div>
        {title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{title}</h3>}
        <svg width={dims.width} height={dims.height} role="img" aria-label={title ?? 'Line chart'}>
          <path d={path} fill="none" stroke={color} strokeWidth={2} />
          {points.map((p, i) => (
            <circle key={i} cx={p.x} cy={p.y} r={3} fill={color}>
              <title>{`${new Date(data[i]!.timestamp).toLocaleDateString()}: ${data[i]!.value}`}</title>
            </circle>
          ))}
          <line x1={dims.padding.left} y1={dims.height - dims.padding.bottom} x2={dims.width - dims.padding.right} y2={dims.height - dims.padding.bottom} stroke="#333" />
          <line x1={dims.padding.left} y1={dims.padding.top} x2={dims.padding.left} y2={dims.height - dims.padding.bottom} stroke="#333" />
        </svg>
      </div>
    );
  }

  return <div>{title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem' }}>{title}</h3>}<p style={{ color: '#888' }}>No data</p></div>;
}

interface PieChartProps {
  readonly data: readonly { label: string; value: number; color?: string }[];
  readonly title?: string;
  readonly size?: number;
}

export function PieChart({ data, title, size = 200 }: PieChartProps) {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div>{title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem' }}>{title}</h3>}<p style={{ color: '#888' }}>No data</p></div>;

  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 10;
  let angle = -Math.PI / 2;
  const defaultColors = ['#6366f1', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

  return (
    <div>
      {title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{title}</h3>}
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <svg width={size} height={size} role="img" aria-label={title ?? 'Pie chart'}>
          {data.map((d, i) => {
            const sliceAngle = (d.value / total) * 2 * Math.PI;
            const x1 = cx + r * Math.cos(angle);
            const y1 = cy + r * Math.sin(angle);
            angle += sliceAngle;
            const x2 = cx + r * Math.cos(angle);
            const y2 = cy + r * Math.sin(angle);
            const largeArc = sliceAngle > Math.PI ? 1 : 0;
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
            return (
              <path key={i} d={path} fill={d.color ?? defaultColors[i % defaultColors.length]}>
                <title>{`${d.label}: ${d.value} (${((d.value / total) * 100).toFixed(1)}%)`}</title>
              </path>
            );
          })}
        </svg>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem' }}>
          {data.map((d, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.8rem', color: '#aaa' }}>
              <div style={{ width: 10, height: 10, borderRadius: 2, background: d.color ?? defaultColors[i % defaultColors.length] }} />
              <span>{d.label}: {d.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

interface HistogramProps {
  readonly values: readonly number[];
  readonly bins?: number;
  readonly title?: string;
  readonly dimensions?: ChartDimensions;
}

export function Histogram({ values, bins = 10, title, dimensions }: HistogramProps) {
  const dims = dimensions ?? { width: 400, height: 250, padding: { top: 20, right: 20, bottom: 40, left: 50 } };
  if (values.length === 0) return <div>{title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem' }}>{title}</h3>}<p style={{ color: '#888' }}>No data</p></div>;

  const min = Math.min(...values);
  const max = Math.max(...values);
  const binSize = (max - min) / bins || 1;
  const binCounts: number[] = new Array(bins).fill(0);
  for (const v of values) {
    let idx = Math.floor((v - min) / binSize);
    if (idx >= bins) idx = bins - 1;
    const count = binCounts[idx];
    if (count !== undefined) binCounts[idx] = count + 1;
  }
  const maxCount = Math.max(...binCounts, 1);
  const chartW = dims.width - dims.padding.left - dims.padding.right;
  const chartH = dims.height - dims.padding.top - dims.padding.bottom;
  const barW = chartW / bins - 2;

  return (
    <div>
      {title && <h3 style={{ color: '#f0f0f0', fontSize: '0.95rem', marginBottom: '0.5rem' }}>{title}</h3>}
      <svg width={dims.width} height={dims.height} role="img" aria-label={title ?? 'Histogram'}>
        {binCounts.map((count, i) => {
          const x = dims.padding.left + (chartW / bins) * i + 1;
          const h = (count / maxCount) * chartH;
          return (
            <rect key={i} x={x} y={dims.padding.top + chartH - h} width={barW} height={h} fill="#6366f1" rx={2}>
              <title>{`${(min + i * binSize).toFixed(0)}-${(min + (i + 1) * binSize).toFixed(0)}: ${count}`}</title>
            </rect>
          );
        })}
        <line x1={dims.padding.left} y1={dims.height - dims.padding.bottom} x2={dims.width - dims.padding.right} y2={dims.height - dims.padding.bottom} stroke="#333" />
      </svg>
    </div>
  );
}

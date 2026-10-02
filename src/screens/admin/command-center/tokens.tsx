import { memo } from 'react';

/**
 * Command Center luxury tokens (G1). Champagne gold is used ONLY as a
 * restrained accent (brand ring, active nav, hero highlight, primary KPI,
 * hairlines, key attention markers). Semantic colors keep their existing
 * meaning (teal = operational, danger = critical). No theme definitions
 * are altered; a future pass may promote these into colors.ts.
 */
export const GOLD = '#D8B46A';
export const GOLD_GLOW = 'rgba(216, 180, 106, 0.16)';
export const GOLD_BORDER = '1px solid rgba(216, 180, 106, 0.35)';
export const LUX_RADIUS = 22;

export type LuxIconName =
  | 'home'
  | 'users'
  | 'wallet'
  | 'cart'
  | 'store'
  | 'team'
  | 'flask'
  | 'chart'
  | 'mail'
  | 'bell'
  | 'clock'
  | 'arrow';

/** Small inline SVG icon set (no emoji, no new dependencies). */
export const LuxIcon = memo(function LuxIcon({
  name,
  size = 18,
  color = 'currentColor',
}: {
  name: LuxIconName;
  size?: number;
  color?: string;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 1.8,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
  };
  switch (name) {
    case 'home':
      return (<svg {...common}><path d="M3 11.5 12 4l9 7.5" /><path d="M5.5 10.5V20h13v-9.5" /></svg>);
    case 'users':
      return (<svg {...common}><circle cx="9" cy="8" r="3.2" /><path d="M2.8 19.5c.8-3 3.2-4.6 6.2-4.6s5.4 1.6 6.2 4.6" /><circle cx="17" cy="9" r="2.4" /><path d="M16.5 14.6c2.3.3 3.9 1.7 4.5 4" /></svg>);
    case 'wallet':
      return (<svg {...common}><rect x="3" y="6.5" width="18" height="12.5" rx="2.5" /><path d="M3 10.5h18" /><circle cx="17.5" cy="14.8" r="1.1" fill={color} stroke="none" /></svg>);
    case 'cart':
      return (<svg {...common}><path d="M3 4.5h2.4l2.3 11h11.2l2.1-7.5H7" /><circle cx="9.5" cy="19.5" r="1.3" /><circle cx="17" cy="19.5" r="1.3" /></svg>);
    case 'store':
      return (<svg {...common}><path d="M4 9.5 5.5 4h13L20 9.5" /><path d="M4 9.5h16V20H4z" /><path d="M9.5 20v-5.5h5V20" /></svg>);
    case 'team':
      return (<svg {...common}><circle cx="8" cy="8.5" r="3" /><circle cx="16.5" cy="9.5" r="2.3" /><path d="M2.5 19.5c.7-2.8 2.9-4.3 5.5-4.3s4.8 1.5 5.5 4.3" /><path d="M14.5 15c2.4.2 4.4 1.6 5 4" /></svg>);
    case 'flask':
      return (<svg {...common}><path d="M9.5 3h5" /><path d="M10.5 3v5.2L5 17.5A1.5 1.5 0 0 0 6.3 20h11.4a1.5 1.5 0 0 0 1.3-2.5L13.5 8.2V3" /><path d="M7.8 14.5h8.4" /></svg>);
    case 'chart':
      return (<svg {...common}><path d="M4 4v15.5h16" /><path d="M8.5 15.5v-4" /><path d="M12.5 15.5V8" /><path d="M16.5 15.5v-6.5" /></svg>);
    case 'mail':
      return (<svg {...common}><rect x="3" y="5.5" width="18" height="13" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg>);
    case 'bell':
      return (<svg {...common}><path d="M6 9.5a6 6 0 0 1 12 0c0 4 1.5 5.5 1.5 5.5h-15C6 13.5 6 13.5 6 9.5" /><path d="M10 19.5a2.2 2.2 0 0 0 4 0" /></svg>);
    case 'clock':
      return (<svg {...common}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3.2 2" /></svg>);
    case 'arrow':
      return (<svg {...common}><path d="M4.5 12h15" /><path d="m13.5 6 6 6-6 6" /></svg>);
    default:
      return null;
  }
});

import { memo } from 'react';

// ============================================================================
// ProduceArtwork — "Verdant Specimen" art direction (single system, 10 keys).
//
// Every vegetable is a premium digital botanical object on the same visual
// grammar, viewBox 0 0 120 90 (matches the card's 4:3 art area):
//   1. Backdrop: one soft radial glow disc (item hue, 14%) + one hairline
//      orbit ring (white, 10%). Same geometry for all ten — the "specimen".
//   2. Silhouette: clean geometric body in a restrained duotone (diagonal
//      linear gradient, muted flesh tones — never pure-saturation fills).
//   3. Light: ONE crescent edge-light upper-left (white, ~30%), shared
//      language instead of pasted highlight blobs.
//   4. Botany: fine organic detail strokes (darker shade, round caps,
//      low opacity) + restrained green calyx/leaf accents only.
// Generous negative space; no emoji, no network, no images dependency.
// Keyed by `source_key` (fallback: `model_id`); legacy staging keys
// ('veg-pepper') alias to their pilot equivalent; unknown keys render the
// seedling placeholder.
// ============================================================================

export type ProduceArtKey =
  | 'veg-potato'
  | 'veg-tomato'
  | 'veg-onion'
  | 'veg-carrot'
  | 'veg-zucchini'
  | 'veg-bell-pepper'
  | 'veg-hot-pepper'
  | 'veg-lettuce'
  | 'veg-beans'
  | 'veg-garlic';

const KNOWN_KEYS: readonly string[] = [
  'veg-potato',
  'veg-tomato',
  'veg-onion',
  'veg-carrot',
  'veg-zucchini',
  'veg-bell-pepper',
  'veg-hot-pepper',
  'veg-lettuce',
  'veg-beans',
  'veg-garlic',
];

/** Legacy staging aliases → pilot keys (same vegetable, older name). */
const ALIASES: Record<string, ProduceArtKey> = {
  'veg-pepper': 'veg-bell-pepper',
};

/** Normalize any product identifier to a known art key, or '' for placeholder. */
export function resolveProduceArtKey(sourceKey?: string | null, modelId?: string | null): ProduceArtKey | '' {
  const raw = [sourceKey ?? '', modelId ?? ''].map((s) => s.trim().toLowerCase());
  // Real rows carry source_key 'pilot:veg-*' with model_id 'veg-*'.
  const candidates = raw.flatMap((s) => [s, s.replace(/^pilot:/, '')]);
  for (const c of candidates) {
    if ((KNOWN_KEYS as readonly string[]).includes(c)) return c as ProduceArtKey;
    const alias: ProduceArtKey | undefined = ALIASES[c];
    if (alias !== undefined) return alias;
  }
  return '';
}

/** Shared specimen backdrop: glow disc + orbit ring in the item hue. */
function Backdrop({ hue }: { hue: string }) {
  return (
    <g>
      <ellipse cx="60" cy="46" rx="41" ry="32" fill={hue} opacity="0.14" />
      <circle cx="60" cy="46" r="35" fill="none" stroke="#ffffff" strokeWidth="1" opacity="0.1" />
    </g>
  );
}

function Potato() {
  return (
    <g>
      <Backdrop hue="#c8a06a" />
      <ellipse cx="60" cy="50" rx="30" ry="23" fill="url(#pa-potato)" transform="rotate(-8 60 50)" />
      <path d="M38 40 C44 34 54 32 64 34" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" transform="rotate(-8 60 50)" />
      <circle cx="52" cy="56" r="1.7" fill="#7a5a30" opacity="0.8" />
      <circle cx="66" cy="48" r="1.7" fill="#7a5a30" opacity="0.8" />
      <circle cx="71" cy="58" r="1.7" fill="#7a5a30" opacity="0.8" />
      <circle cx="58" cy="64" r="1.7" fill="#7a5a30" opacity="0.8" />
      <defs>
        <linearGradient id="pa-potato" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cfa96f" />
          <stop offset="100%" stopColor="#8a6535" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Tomato() {
  return (
    <g>
      <Backdrop hue="#d64545" />
      <circle cx="60" cy="50" r="26" fill="url(#pa-tomato)" />
      <path d="M42 38 C46 32 54 29 62 30" stroke="#ffffff" strokeWidth="3.5" strokeLinecap="round" fill="none" opacity="0.32" />
      <path d="M60 26 L54 16 L60 20 L66 16 L60 26 M48 24 L60 28 L72 24 L60 30 Z" fill="#2f6b2f" />
      <path d="M60 26 C60 21 60 18 60 14" stroke="#2f6b2f" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="pa-tomato" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#d65353" />
          <stop offset="100%" stopColor="#8e1f1f" />
        </linearGradient>
      </defs>
    </g>
  );
}

function DryOnion() {
  return (
    <g>
      <Backdrop hue="#d8a848" />
      <path d="M60 10 C59 19 57 23 56 27 C40 31 31 44 33 59 C35 73 46 81 60 81 C74 81 85 73 87 59 C89 44 80 31 64 27 C63 23 61 19 60 10 Z" fill="url(#pa-onion)" />
      <path d="M50 30 C56 28 64 28 70 30" stroke="#f5d78e" strokeWidth="2" fill="none" opacity="0.7" />
      <path d="M44 40 C40 50 40 60 46 70" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M54 34 C48 44 48 58 52 70 M62 32 C68 42 70 56 67 70 M70 36 C75 46 75 58 72 68" stroke="#8a5a20" strokeWidth="1.5" fill="none" opacity="0.55" />
      <path d="M56 27 C52 22 50 17 50 12 M60 27 C60 21 60 17 60 12 M64 27 C68 22 70 17 70 12" stroke="#a8803c" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85" />
      <defs>
        <linearGradient id="pa-onion" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8bd6a" />
          <stop offset="100%" stopColor="#9a6a24" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Carrot() {
  return (
    <g>
      <Backdrop hue="#c96a28" />
      <path d="M50 32 L76 76 C77 79 74 81 72 79 L42 38 Z" fill="url(#pa-carrot)" />
      <path d="M50 38 L56 50" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.3" />
      <path d="M68 64 L74 62 M64 58 L70 56 M60 52 L66 50" stroke="#7a2f10" strokeWidth="1.8" strokeLinecap="round" opacity="0.6" />
      <path d="M48 32 C44 24 42 18 42 12 M53 32 C53 24 55 18 57 12 M48 32 C51 26 59 26 61 32" stroke="#2f6b2f" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="pa-carrot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#cd7434" />
          <stop offset="100%" stopColor="#8a3d12" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Zucchini() {
  return (
    <g>
      <Backdrop hue="#3f8a4d" />
      <rect x="24" y="40" width="64" height="20" rx="10" fill="url(#pa-zucchini)" transform="rotate(-6 56 50)" />
      <path d="M30 44 L60 41" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" opacity="0.28" transform="rotate(-6 56 50)" />
      <path d="M34 52 L82 47" stroke="#12351c" strokeWidth="1.4" opacity="0.5" transform="rotate(-6 56 50)" />
      <path d="M86 42 L94 38 L95 50 L87 54 Z" fill="#2f6b2f" transform="rotate(-6 90 46)" />
      <defs>
        <linearGradient id="pa-zucchini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3f8a4d" />
          <stop offset="100%" stopColor="#143d1e" />
        </linearGradient>
      </defs>
    </g>
  );
}

function BellPepper() {
  return (
    <g>
      <Backdrop hue="#b03030" />
      <path d="M46 30 C38 32 34 42 35 54 C36 68 44 78 52 78 L56 78 C58 80 62 80 64 78 L68 78 C76 78 84 68 85 54 C86 42 82 32 74 30 C70 29 68 30 66 30 L64 28 L56 28 L54 30 C52 30 50 29 46 30 Z" fill="url(#pa-bell)" />
      <path d="M52 34 C49 46 49 60 52 72 M60 32 C60 46 60 62 60 74 M68 34 C71 46 71 60 68 72" stroke="#5e1414" strokeWidth="2" fill="none" opacity="0.6" />
      <path d="M44 42 C46 36 51 33 57 33" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M54 28 L56 18 L60 22 L64 18 L66 28 Z" fill="#2f6b2f" />
      <path d="M60 22 C60 17 60 14 60 11" stroke="#2f6b2f" strokeWidth="4.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="pa-bell" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b84040" />
          <stop offset="100%" stopColor="#5e1414" />
        </linearGradient>
      </defs>
    </g>
  );
}

function HotPepper() {
  return (
    <g>
      <Backdrop hue="#c23b2a" />
      <path d="M40 26 C56 24 74 34 80 52 C84 66 80 78 70 82 C62 85 52 78 47 64 C42 50 36 34 40 26 Z" fill="url(#pa-hot)" />
      <path d="M48 32 C60 33 71 41 75 54" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M72 78 C70 80 68 81 66 81" stroke="#5e0e04" strokeWidth="2.5" strokeLinecap="round" fill="none" />
      <path d="M40 26 L30 20 L36 17 L48 24 Z" fill="#2f6b2f" />
      <path d="M36 20 C33 16 32 13 33 10" stroke="#2f6b2f" strokeWidth="3.5" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="pa-hot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c74832" />
          <stop offset="100%" stopColor="#6e1408" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Lettuce() {
  return (
    <g>
      <Backdrop hue="#7cb85a" />
      <path d="M60 78 C50 78 41 70 38 58 L40 52 C36 44 38 34 46 28 L52 22 L58 28 L64 20 L70 28 L78 26 C86 32 88 44 84 54 L86 60 C83 70 70 78 60 78 Z" fill="url(#pa-lettuce)" />
      <path d="M52 30 C58 34 62 42 62 52 M68 30 C62 36 60 44 61 54" stroke="#2f6b2f" strokeWidth="1.8" fill="none" opacity="0.55" />
      <path d="M44 48 C48 44 54 42 60 43" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.28" />
      <path d="M60 76 L60 60" stroke="#e8f5d8" strokeWidth="2.5" strokeLinecap="round" opacity="0.6" />
      <defs>
        <linearGradient id="pa-lettuce" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#82bd60" />
          <stop offset="100%" stopColor="#2f6b2f" />
        </linearGradient>
      </defs>
    </g>
  );
}

function GreenBeans() {
  return (
    <g>
      <Backdrop hue="#5da24a" />
      <path d="M44 20 C47 38 47 58 42 76" stroke="#3f7a30" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M62 16 C65 36 65 58 60 78" stroke="#4c8a3a" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M80 22 C81 40 79 60 74 76" stroke="#3f7a30" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M44 38 M62 34 M80 40" stroke="#2c5a24" strokeWidth="8" strokeLinecap="round" fill="none" opacity="0.35" />
      <path d="M44 26 C45 40 45 56 43 70" stroke="#ffffff" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.3" />
      <circle cx="42" cy="78" r="2" fill="#2f6b2f" />
      <circle cx="60" cy="80" r="2" fill="#2f6b2f" />
      <circle cx="74" cy="78" r="2" fill="#2f6b2f" />
      <defs>
        <linearGradient id="pa-beans" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#63a84e" />
          <stop offset="100%" stopColor="#2c5a24" />
        </linearGradient>
      </defs>
    </g>
  );
}

function DryGarlic() {
  return (
    <g>
      <Backdrop hue="#b8a894" />
      <path d="M60 10 C59 18 57 23 55 27 C42 31 34 44 36 59 C38 73 48 81 60 81 C72 81 82 73 84 59 C86 44 78 31 65 27 C63 23 61 18 60 10 Z" fill="url(#pa-garlic)" />
      <path d="M52 32 C48 42 48 56 52 68 M60 30 C60 42 60 56 60 70 M68 32 C72 42 72 56 68 68" stroke="#7a6a58" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M46 36 C49 30 55 28 61 29" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.4" />
      <path d="M57 27 C55 20 55 15 56 10 M63 27 C65 20 65 15 64 10" stroke="#9a8a72" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.85" />
      <path d="M54 81 L53 84 M60 81 L60 84 M66 81 L67 84" stroke="#8a7a64" strokeWidth="1.5" strokeLinecap="round" opacity="0.7" />
      <defs>
        <linearGradient id="pa-garlic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e2d7c6" />
          <stop offset="100%" stopColor="#968a76" />
        </linearGradient>
      </defs>
    </g>
  );
}

function SeedlingPlaceholder() {
  return (
    <g>
      <Backdrop hue="#7cb85a" />
      <path d="M60 76 L60 52" stroke="#2f6b2f" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 60 C48 58 42 50 42 40 C52 42 58 48 60 60 Z" fill="#4c8a3a" opacity="0.85" />
      <path d="M60 54 C72 52 78 44 78 34 C68 36 62 42 60 54 Z" fill="#63a84e" opacity="0.85" />
      <circle cx="60" cy="78" r="2.5" fill="#2f6b2f" />
    </g>
  );
}

const ART: Record<ProduceArtKey, () => React.ReactElement> = {
  'veg-potato': Potato,
  'veg-tomato': Tomato,
  'veg-onion': DryOnion,
  'veg-carrot': Carrot,
  'veg-zucchini': Zucchini,
  'veg-bell-pepper': BellPepper,
  'veg-hot-pepper': HotPepper,
  'veg-lettuce': Lettuce,
  'veg-beans': GreenBeans,
  'veg-garlic': DryGarlic,
};

/**
 * Deterministic vegetable artwork. `artKey` resolves via resolveProduceArtKey;
 * unknown keys render the seedling placeholder (never emoji, never network).
 */
export const ProduceArtwork = memo(function ProduceArtwork({ artKey }: { artKey: ProduceArtKey | '' }) {
  const Art = artKey ? ART[artKey] : SeedlingPlaceholder;
  return (
    <svg
      viewBox="0 0 120 90"
      role="img"
      aria-hidden="true"
      data-art={artKey || 'placeholder'}
      style={{ width: '72%', height: 'auto', maxHeight: '100%', display: 'block' }}
    >
      <Art />
    </svg>
  );
});

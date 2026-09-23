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
      <Backdrop hue="#b98a5e" />
      <path d="M60 12 C59 20 58 24 58 28 C42 32 34 44 36 58 C38 72 48 80 60 80 C72 80 82 72 84 58 C86 44 78 32 62 28 C62 24 61 20 60 12 Z" fill="url(#pa-onion)" />
      <path d="M46 36 C42 46 42 58 48 68" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.28" />
      <path d="M56 34 C50 44 50 58 54 70 M64 34 C70 44 70 58 66 70" stroke="#6e4530" strokeWidth="1.6" fill="none" opacity="0.55" />
      <path d="M58 28 C54 24 52 20 52 16 M62 28 C66 24 68 20 68 16" stroke="#8a6a45" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <defs>
        <linearGradient id="pa-onion" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c49a6c" />
          <stop offset="100%" stopColor="#7a4a34" />
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
      <path d="M60 28 C46 28 38 40 40 54 C42 68 49 78 60 78 C71 78 78 68 80 54 C82 40 74 28 60 28 Z" fill="url(#pa-bell)" />
      <path d="M60 28 C57 42 57 60 60 76 M49 32 C46 44 46 60 49 72 M71 32 C74 44 74 60 71 72" stroke="#5e1414" strokeWidth="1.8" fill="none" opacity="0.55" />
      <path d="M48 40 C51 34 57 32 63 33" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M60 28 C60 22 61 18 63 14" stroke="#2f6b2f" strokeWidth="4.5" strokeLinecap="round" fill="none" />
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
      <path d="M44 30 C58 30 74 40 78 58 C80 68 76 78 68 80 C60 82 50 74 46 60 C43 48 40 36 44 30 Z" fill="url(#pa-hot)" />
      <path d="M50 36 C60 38 70 46 73 58" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.3" />
      <path d="M44 30 L36 24 L42 22 L50 28 Z" fill="#2f6b2f" />
      <path d="M42 24 C40 20 40 17 41 14" stroke="#2f6b2f" strokeWidth="3" strokeLinecap="round" fill="none" />
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
      <path d="M60 22 C76 26 84 40 80 56 C77 68 68 76 60 76 C52 76 43 68 40 56 C36 40 44 26 60 22 Z" fill="url(#pa-lettuce)" />
      <path d="M60 28 C70 32 76 42 74 54 M60 28 C50 32 44 42 46 54" stroke="#2f6b2f" strokeWidth="1.8" fill="none" opacity="0.55" />
      <path d="M60 30 L60 72" stroke="#e8f5d8" strokeWidth="2" strokeLinecap="round" opacity="0.5" />
      <path d="M48 34 C52 30 58 28 64 29" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.3" />
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
      <path d="M44 20 C46 38 46 58 42 76" stroke="#3f7a30" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M62 16 C64 36 64 58 60 78" stroke="#4c8a3a" strokeWidth="7" strokeLinecap="round" fill="none" />
      <path d="M80 22 C80 40 78 60 74 76" stroke="#3f7a30" strokeWidth="7" strokeLinecap="round" fill="none" />
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
      <path d="M60 14 C59 22 57 26 55 30 C42 34 34 46 36 60 C38 73 48 81 60 81 C72 81 82 73 84 60 C86 46 78 34 65 30 C63 26 61 22 60 14 Z" fill="url(#pa-garlic)" />
      <path d="M52 34 C48 44 48 58 52 70 M60 32 C60 44 60 58 60 72 M68 34 C72 44 72 58 68 70" stroke="#7a6a58" strokeWidth="1.5" fill="none" opacity="0.6" />
      <path d="M46 38 C49 32 55 30 61 31" stroke="#ffffff" strokeWidth="2.5" strokeLinecap="round" fill="none" opacity="0.35" />
      <path d="M57 30 C55 24 55 20 56 16 M63 30 C65 24 65 20 64 16" stroke="#8a7a64" strokeWidth="2" strokeLinecap="round" fill="none" opacity="0.8" />
      <defs>
        <linearGradient id="pa-garlic" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ddd2c4" />
          <stop offset="100%" stopColor="#8f8578" />
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

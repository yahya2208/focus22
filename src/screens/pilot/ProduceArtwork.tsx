import { memo } from 'react';

// ============================================================================
// ProduceArtwork — hand-drawn inline SVG art for the eight family-store
// vegetables, plus a generic leafy placeholder for unknown keys.
//
// Keyed deterministically by `source_key` (fallback: `model_id`).
// Pure rendering: no hooks, no network, no dependency on `inventory_images`
// (phones keep their own bucket-backed gallery untouched elsewhere).
// viewBox 0 0 120 90 matches the card's 4:3 art area, so no layout shift.
// ============================================================================

export type ProduceArtKey =
  | 'veg-tomato'
  | 'veg-potato'
  | 'veg-onion'
  | 'veg-carrot'
  | 'veg-cucumber'
  | 'veg-pepper'
  | 'veg-zucchini'
  | 'veg-eggplant';

const KNOWN_KEYS: readonly string[] = [
  'veg-tomato',
  'veg-potato',
  'veg-onion',
  'veg-carrot',
  'veg-cucumber',
  'veg-pepper',
  'veg-zucchini',
  'veg-eggplant',
];

/** Normalize any product identifier to a known art key, or '' for placeholder. */
export function resolveProduceArtKey(sourceKey?: string | null, modelId?: string | null): ProduceArtKey | '' {
  const raw = [sourceKey ?? '', modelId ?? ''].map((s) => s.trim().toLowerCase());
  // Real staging rows carry source_key 'pilot:veg-*' with model_id 'veg-*'.
  const candidates = raw.flatMap((s) => [s, s.replace(/^pilot:/, '')]);
  for (const c of candidates) {
    if ((KNOWN_KEYS as readonly string[]).includes(c)) return c as ProduceArtKey;
  }
  return '';
}

function Tomato() {
  return (
    <g>
      <ellipse cx="60" cy="52" rx="30" ry="26" fill="url(#pa-tomato)" />
      <ellipse cx="50" cy="43" rx="10" ry="7" fill="#ffffff" opacity="0.35" />
      <path d="M60 26 L60 18 M60 26 L48 20 M60 26 L72 20" stroke="#2f9e44" strokeWidth="4" strokeLinecap="round" fill="none" />
      <path d="M48 24 Q60 34 72 24 Q60 28 48 24" fill="#40c057" />
      <defs>
        <radialGradient id="pa-tomato" cx="0.4" cy="0.35" r="0.9">
          <stop offset="0%" stopColor="#ff8787" />
          <stop offset="55%" stopColor="#fa5252" />
          <stop offset="100%" stopColor="#c92a2a" />
        </radialGradient>
      </defs>
    </g>
  );
}

function Potato() {
  return (
    <g>
      <ellipse cx="60" cy="52" rx="32" ry="24" fill="url(#pa-potato)" transform="rotate(-8 60 52)" />
      <ellipse cx="50" cy="44" rx="11" ry="6" fill="#ffffff" opacity="0.28" transform="rotate(-8 50 44)" />
      <circle cx="52" cy="58" r="1.6" fill="#a0793f" />
      <circle cx="66" cy="50" r="1.6" fill="#a0793f" />
      <circle cx="72" cy="60" r="1.6" fill="#a0793f" />
      <circle cx="58" cy="66" r="1.6" fill="#a0793f" />
      <defs>
        <radialGradient id="pa-potato" cx="0.4" cy="0.35" r="0.9">
          <stop offset="0%" stopColor="#e5c07b" />
          <stop offset="55%" stopColor="#c69a5b" />
          <stop offset="100%" stopColor="#97742f" />
        </radialGradient>
      </defs>
    </g>
  );
}

function Onion() {
  return (
    <g>
      <path d="M60 14 C58 22 57 26 57 30 C40 34 32 46 34 58 C36 72 48 80 60 80 C72 80 84 72 86 58 C88 46 80 34 63 30 C63 26 62 22 60 14 Z" fill="url(#pa-onion)" />
      <path d="M48 40 C44 50 44 60 50 68" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" fill="none" opacity="0.35" />
      <path d="M57 30 C50 32 44 36 41 42" stroke="#e599f7" strokeWidth="2" fill="none" opacity="0.6" />
      <defs>
        <radialGradient id="pa-onion" cx="0.42" cy="0.4" r="0.85">
          <stop offset="0%" stopColor="#eebefa" />
          <stop offset="55%" stopColor="#cc5de8" />
          <stop offset="100%" stopColor="#862e9c" />
        </radialGradient>
      </defs>
    </g>
  );
}

function Carrot() {
  return (
    <g>
      <path d="M52 34 L78 78 C79 81 76 83 74 81 L44 40 Z" fill="url(#pa-carrot)" />
      <ellipse cx="56" cy="44" rx="5" ry="3" fill="#ffffff" opacity="0.3" transform="rotate(38 56 44)" />
      <path d="M70 66 L76 64 M66 60 L72 58 M62 54 L68 52" stroke="#a61e4d" strokeWidth="2" strokeLinecap="round" />
      <path d="M50 34 C46 26 44 20 44 14 M54 34 C54 26 56 20 58 14 M50 34 C52 28 60 28 62 34" stroke="#2f9e44" strokeWidth="4" strokeLinecap="round" fill="none" />
      <defs>
        <linearGradient id="pa-carrot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#ffa94d" />
          <stop offset="60%" stopColor="#fd7e14" />
          <stop offset="100%" stopColor="#d9480f" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Cucumber() {
  return (
    <g>
      <rect x="26" y="40" width="68" height="24" rx="12" fill="url(#pa-cucumber)" />
      <rect x="32" y="44" width="56" height="5" rx="2.5" fill="#ffffff" opacity="0.25" />
      <circle cx="40" cy="54" r="1.6" fill="#d3f9d8" opacity="0.8" />
      <circle cx="52" cy="56" r="1.6" fill="#d3f9d8" opacity="0.8" />
      <circle cx="64" cy="54" r="1.6" fill="#d3f9d8" opacity="0.8" />
      <circle cx="76" cy="56" r="1.6" fill="#d3f9d8" opacity="0.8" />
      <path d="M94 46 C98 44 100 44 102 46 L102 58 C100 60 98 60 94 58 Z" fill="#2f9e44" />
      <defs>
        <linearGradient id="pa-cucumber" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#69db7c" />
          <stop offset="55%" stopColor="#37b24d" />
          <stop offset="100%" stopColor="#1e6f32" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Pepper() {
  return (
    <g>
      <path d="M60 30 C44 30 36 42 38 56 C40 70 48 80 60 80 C72 80 80 70 82 56 C84 42 76 30 60 30 Z" fill="url(#pa-pepper)" />
      <path d="M60 30 C56 44 56 62 60 78 M48 34 C44 46 44 62 48 74 M72 34 C76 46 76 62 72 74" stroke="#a61e4d" strokeWidth="2" fill="none" opacity="0.55" />
      <ellipse cx="50" cy="44" rx="5" ry="8" fill="#ffffff" opacity="0.3" transform="rotate(-12 50 44)" />
      <path d="M60 30 C60 24 61 20 63 16" stroke="#2f9e44" strokeWidth="5" strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id="pa-pepper" cx="0.42" cy="0.35" r="0.9">
          <stop offset="0%" stopColor="#ff8787" />
          <stop offset="55%" stopColor="#e03131" />
          <stop offset="100%" stopColor="#9d1c1c" />
        </radialGradient>
      </defs>
    </g>
  );
}

function Zucchini() {
  return (
    <g>
      <rect x="24" y="42" width="66" height="20" rx="10" fill="url(#pa-zucchini)" transform="rotate(-6 57 52)" />
      <rect x="30" y="45" width="54" height="4" rx="2" fill="#ffffff" opacity="0.25" transform="rotate(-6 57 47)" />
      <path d="M88 44 L96 40 L97 52 L89 56 Z" fill="#94d82d" transform="rotate(-6 92 48)" />
      <path d="M96 40 L100 34" stroke="#2f9e44" strokeWidth="3" strokeLinecap="round" />
      <defs>
        <linearGradient id="pa-zucchini" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#8ce99a" />
          <stop offset="55%" stopColor="#40c057" />
          <stop offset="100%" stopColor="#237a35" />
        </linearGradient>
      </defs>
    </g>
  );
}

function Eggplant() {
  return (
    <g>
      <path d="M38 62 C38 46 52 36 68 36 C84 36 92 46 90 56 C88 68 74 78 58 78 C46 78 38 72 38 62 Z" fill="url(#pa-eggplant)" />
      <ellipse cx="56" cy="52" rx="9" ry="6" fill="#ffffff" opacity="0.3" transform="rotate(-18 56 52)" />
      <path d="M68 36 C64 30 58 28 52 30 L46 24 C54 20 64 24 70 32 Z" fill="#40c057" />
      <path d="M46 24 C44 20 44 17 45 14" stroke="#2f9e44" strokeWidth="4" strokeLinecap="round" fill="none" />
      <defs>
        <radialGradient id="pa-eggplant" cx="0.4" cy="0.35" r="0.9">
          <stop offset="0%" stopColor="#b197fc" />
          <stop offset="55%" stopColor="#7048e8" />
          <stop offset="100%" stopColor="#3d1e96" />
        </radialGradient>
      </defs>
    </g>
  );
}

function PlaceholderLeaf() {
  return (
    <g>
      <path d="M60 18 C84 30 90 54 60 76 C30 54 36 30 60 18 Z" fill="url(#pa-leaf)" />
      <path d="M60 24 L60 70" stroke="#2f9e44" strokeWidth="3" strokeLinecap="round" />
      <path d="M60 40 L72 34 M60 52 L74 46 M60 40 L48 34 M60 52 L46 46" stroke="#2f9e44" strokeWidth="2" strokeLinecap="round" opacity="0.7" />
      <defs>
        <linearGradient id="pa-leaf" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#8ce99a" />
          <stop offset="100%" stopColor="#2b8a3e" />
        </linearGradient>
      </defs>
    </g>
  );
}

const ART: Record<ProduceArtKey, () => React.ReactElement> = {
  'veg-tomato': Tomato,
  'veg-potato': Potato,
  'veg-onion': Onion,
  'veg-carrot': Carrot,
  'veg-cucumber': Cucumber,
  'veg-pepper': Pepper,
  'veg-zucchini': Zucchini,
  'veg-eggplant': Eggplant,
};

/**
 * Deterministic vegetable artwork. `artKey` resolves via resolveProduceArtKey;
 * unknown keys render the leafy placeholder (never emoji, never network).
 */
export const ProduceArtwork = memo(function ProduceArtwork({ artKey }: { artKey: ProduceArtKey | '' }) {
  const Art = artKey ? ART[artKey] : PlaceholderLeaf;
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

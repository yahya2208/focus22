# 08 — Hardcoded Values Inventory

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Hardcoded Colors (383 hex + 7 rgba = 390 total)

### By Frequency

| Color | Count | Semantic Role | Should Be Token? |
|-------|-------|--------------|-------------------|
| `#f0f0f0` | 42 | Primary text | ✅ `text` |
| `#12121a` | 40 | Card/surface bg | ✅ `bgCard` |
| `#6366f1` | 35 | Primary accent (indigo) | ✅ `accent` |
| `#888` | 33 | Muted text | ✅ `textMuted` |
| `#22c55e` | 29 | Success green | ✅ `success` |
| `#f59e0b` | 20 | Warning amber | ✅ `warning` |
| `#ccc` | 20 | Light text | ✅ `textSecondary` |
| `#fff` | 19 | White | ✅ `text` (dark) |
| `#666` | 17 | Dim text | ✅ `textMuted` |
| `#1e1e2e` | 17 | Border/elevated | ✅ `border` |
| `#aaa` | 14 | Label text | ✅ `textSecondary` |
| `#ef4444` | 11 | Error red | ✅ `danger` |
| `#3b82f6` | 10 | Info blue | ✅ `info` |
| `#333` | 9 | Border subtle | ✅ `border` |
| `#ffffff` | 7 | White (QR) | ✅ `text` |
| `#555` | 4 | Disabled text | ✅ `textMuted` |
| `#1a1a2e` | 4 | Selected row | ✅ `bgHover` |
| `#f97316` | 3 | Orange | ✅ `accent` |
| `#8b5cf6` | 3 | Purple | ✅ `accent` |
| `#444` | 3 | Disabled border | ✅ `border` |
| `#0a0a0f` | 3 | Deep bg | ✅ `bg` |
| `#ec4899` | 2 | Pink | ✅ `accent` |
| `#a855f7` | 2 | Violet | ✅ `accent` |
| `#16162a` | 2 | Hover row | ✅ `bgHover` |
| `#000000` | 2 | Black | ✅ `bg` |
| `#f5f5f5` | 1 | Print bg | ✅ `bg` |
| `#000` | 1 | Print text | ✅ `text` |

### Hardcoded rgba (7 occurrences)

| File:Line | Value | Should Be Token? |
|-----------|-------|-------------------|
| `Button.tsx:91` | `rgba(255,255,255,0.3)` | ✅ `glass` |
| `ResearchLayout.tsx:108` | `rgba(0,0,0,0.6)` | ✅ `overlay` |
| `CampaignWizard.tsx:122` | `rgba(0,0,0,0.7)` | ✅ `overlay` |
| `GameScreen.tsx:114` | `rgba(255,255,255,0.35)` | ✅ `glass` |
| `GameScreen.tsx:124` | `rgba(255,255,255,0.4)` | ✅ `glass` |
| `GameScreen.tsx:132` | `rgba(255,255,255,0.15)` | ✅ `glass` |
| `SettingsScreen.tsx:35` | `rgba(0,0,0,0.15)` | ✅ `shadow` |

**All 390 hardcoded colors should become theme tokens.**

## 2. Hardcoded Border Radius (138+ occurrences, 12 unique values)

| Value | Count | Token? |
|-------|-------|--------|
| `12px` | 43 | `radius.lg` |
| `8px` | 40 | `radius.md` |
| `14px` | 8 | `radius.md` (merge) |
| `16px` | 9 | `radius.xl` |
| `20px` | 12 | `radius.xl` (merge) |
| `4px` | 16 | `radius.sm` |
| `6px` | 13 | `radius.sm` (merge) |
| `10px` | 2 | `radius.md` |
| `9999px` | 4 | `radius.pill` |
| `50%` | 1 | `radius.circle` |
| `2px` | 4 | `radius.xs` |
| `8px 8px 0 0` | 1 | Compound (keep inline) |
| `8px 0 0 8px` | 2 | Compound (keep inline) |
| `0 8px 8px 0` | 2 | Compound (keep inline) |

**Recommended tokens**: `xs(2px)`, `sm(4px)`, `md(8px)`, `lg(12px)`, `xl(16px)`, `2xl(20px)`, `pill(9999px)`, `circle(50%)`

## 3. Hardcoded Transitions (27 occurrences, 15 unique)

| Transition | Count | Token? |
|------------|-------|--------|
| `all 0.2s ease` | 3 | `transition.normal` |
| `all 0.15s` | 3 | `transition.fast` |
| `all 0.2s cubic-bezier(0.22, 1, 0.36, 1)` | 2 | `transition.smooth` |
| `stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)` | 2 | `transition.slow` |
| `background 0.1s` | 2 | `transition.fast` |
| `width 0.3s` | 2 | `transition.normal` |
| Other (9 unique) | 9 | Various |

**Recommended tokens**: `fast(0.15s)`, `normal(0.2s)`, `slow(0.3s)`, `slower(0.5s)`

## 4. Z-Index (9 occurrences, 5 unique values)

| Value | Layer | Token? |
|-------|-------|--------|
| `1` | Content | `zIndex.content` |
| `5-10` | Game elements | `zIndex.game` |
| `20` | Game interaction | `zIndex.gameHigh` |
| `90` | Overlay | `zIndex.overlay` |
| `100` | Sidebar | `zIndex.sidebar` |
| `200` | Modal | `zIndex.modal` |

## 5. Duplicate Style Objects

| Pattern | Files | Should Extract? |
|---------|-------|-----------------|
| `STATUS_COLORS` map | 2 | ✅ Shared utility |
| `btnPrimary` style | 4 | ✅ Use Button component |
| `btnSmall` style | 3 | ✅ Use Button component |
| `inputStyle` | 2 | ✅ Shared input styles |
| Card container | 30+ | ✅ Use Card component |

## 6. Summary

| Category | Unique Values | Should Tokenize |
|----------|---------------|-----------------|
| Colors | 30+ hex/rgba | All → theme tokens |
| Border radius | 12 | 8 tokens |
| Transitions | 15 | 4 tokens |
| Z-index | 5 | 6 tokens |
| Duplicate styles | 5 patterns | Extract to shared |

**Total hardcoded values requiring tokenization**: ~390 colors + 138 radius + 27 transitions + 9 z-index = **564+ values**

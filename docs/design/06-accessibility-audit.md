# 06 — Accessibility Audit

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## Scorecard

| Category | Score | Grade |
|----------|-------|-------|
| ARIA attributes | 57 uses | **B** |
| ARIA roles | 11 types | **B** |
| Keyboard navigation | 2 `tabIndex` | **F** |
| Keyboard handlers | 0 `onKeyDown` | **F** |
| Image alt text | 6/6 | **A-** |
| Form labels (`htmlFor`) | 9/29 | **D** |
| Focus management | 1 `autoFocus` | **F** |
| `prefers-reduced-motion` | Setting exists, unused | **F** |
| `prefers-contrast` | Setting exists, unused | **F** |
| Focus visibility | 0 | **F** |
| Landmarks / skip links | `<main>` ×1, 0 skip | **D-** |
| Screen reader text | 0 | **F** |
| Color contrast | Mixed | **C-** |
| **Overall** | | **D** |

---

## 1. ARIA Attributes (57 total)

| Attribute | Count | Quality |
|-----------|-------|---------|
| `aria-label` | 45 | Good — buttons, inputs, navs, SVGs |
| `aria-valuenow/min/max` | 6 | Good — ProgressRing, CalibrationScreen |
| `aria-live` | 2 | Good — CalibrationScreen (polite), CountdownScreen (assertive) |
| `aria-selected` | 1 | Good — CoachScreen tab |
| `aria-expanded` | 1 | Good — HomeScreen menu |
| `aria-current` | 1 | Good — ResearchLayout nav |
| `aria-atomic` | 1 | Good — CountdownScreen |

**Missing**: `aria-describedby`, `aria-hidden`, `aria-controls`, `aria-labelledby`

## 2. ARIA Roles (11 types)

| Role | Count | Quality |
|------|-------|---------|
| `img` | 4 | Good — Charts |
| `progressbar` | 2 | Good — ProgressRing, Calibration |
| `timer` | 1 | Good — Countdown |
| `tab/tablist/tabpanel` | 3 | Good — CoachScreen |
| `status` | 1 | Good — CalibrationScreen |
| `button` | 1 | **Problem** — div with role="button" but no onKeyDown |
| `region` | 1 | Good — Card |
| `alert` | 1 | Good — ErrorBoundary |
| `application` | 1 | **Controversial** — GameScreen uses role="application" |

## 3. Keyboard Navigation

### tabIndex Usage (2 total)
- `ResearchLayout.tsx:187` — `tabIndex={onClick ? 0 : undefined}` on `role="button"` div
- `GameScreen.tsx:269` — `tabIndex={0}` on game area

### onKeyDown/onKeyUp Usage
**Zero.** No keyboard event handlers exist anywhere.

### Critical Issue
The `role="button"` div in ResearchLayout has `tabIndex={0}` but **no `onKeyDown` handler** — it's focusable but not operable via keyboard. Pressing Enter/Space does nothing.

## 4. Form Accessibility

| Screen | `<label>` count | `htmlFor` count | Pass? |
|--------|-----------------|-----------------|-------|
| AdminSetupScreen | 3 | 3 | ✅ |
| LoginScreen | 2 | 2 | ✅ |
| RegisterScreen | 3 | 3 | ✅ |
| QRDesigner | 1 | 1 | ✅ |
| CampaignWizard | 10 | 0 | ❌ |
| PhoneServicesScreen | 2 | 0 | ❌ |
| SettingsScreen | 2 | 0 | ❌ |

**20 of 29 labels lack `htmlFor`/`id` association.**

## 5. Focus Management

| Pattern | Count | Verdict |
|---------|-------|---------|
| `autoFocus` | 1 | CampaignWizard only |
| `.focus()` calls | 0 | No programmatic focus |
| Focus ring styles | 0 | **No visible focus indicators** |
| Focus trapping | 0 | No modal focus trapping |
| Focus restoration | 0 | No post-navigation focus |

## 6. Color Contrast (WCAG 2.1 AA)

### Midnight Theme (default dark)

| Token | Color | Ratio on bg | WCAG |
|-------|-------|-------------|------|
| `text` | `#f0f0f6` | ~17:1 | ✅ AAA |
| `textSecondary` | `#a8a8c0` | ~7.3:1 | ✅ AAA |
| `textMuted` | `#6868a0` | **~3.5:1** | ❌ FAIL AA |
| `textFaint` | `#3c3c68` | **~1.8:1** | ❌ FAIL AAA |

### Research Console

| Color | Ratio on `#0a0a0f` | WCAG |
|-------|---------------------|------|
| `#888` | ~4.5:1 | ⚠️ Borderline AA |
| `#666` | **~2.5:1** | ❌ FAIL |

## 7. Semantic HTML

| Pattern | Count | Issue |
|---------|-------|-------|
| `<nav>` as page wrapper | 15 | **Misused** — should be `<main>` |
| `<main>` | 1 | ResearchLayout only |
| `<header>` | 0 | None |
| `<footer>` | 0 | None |
| Skip links | 0 | None |
| Screen reader text | 0 | No `sr-only` patterns |

## 8. Settings That Exist But Are Unused

| Setting | UI Toggle | Consumed by UI? |
|---------|-----------|-----------------|
| `reducedMotion` | ✅ SettingsScreen | ❌ No |
| `highContrast` | ✅ SettingsScreen | ❌ No |

## 9. Top Priority Fixes (Phase-2)

1. **Add `onKeyDown` to `role="button"` div** — keyboard unreachable
2. **Add `:focus-visible` styles** — no focus indicators
3. **Replace `<nav>` with `<main>`** in 15 screens
4. **Wire up `reducedMotion`** — toggle exists, nothing consumes it
5. **Add `htmlFor`/`id`** to CampaignWizard and PhoneServices forms
6. **Add `aria-hidden="true"`** to decorative SVGs and emoji
7. **Fix `textMuted` contrast** — currently fails WCAG AA

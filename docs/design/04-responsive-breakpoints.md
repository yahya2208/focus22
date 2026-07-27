# 04 — Responsive Breakpoints & Adaptive Design

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Current State

| Metric | Value |
|--------|-------|
| `@media` queries | **0** |
| CSS files | **0** (all inline styles) |
| Breakpoint hooks | **1** (`useIsMobile` in ResearchLayout) |
| `window.innerWidth` checks | **1** (ResearchLayout) |
| `clamp()` usage | **0** |
| Viewport units | **1** (`100dvh` in HomeScreen) |
| Container queries | **0** |

## 2. The Single Breakpoint

| Hook | File | Breakpoint | Usage |
|------|------|------------|-------|
| `useIsMobile()` | `ResearchLayout.tsx:29-41` | `< 768px` | Sidebar → drawer toggle |

This is the **only responsive logic** in the entire codebase. It:
1. Seeds state from `window.innerWidth < 768`
2. Listens to `window.matchMedia('(max-width: 677px)')` for live updates
3. Only used in `ResearchLayout.tsx`

## 3. Container Width Analysis

### Consumer Screens (22 screens)

All use `maxWidth: '480px'` — a mobile phone width. This means:
- On desktop: content is centered in a 480px column
- On tablet: content fills up to 480px
- On phone: content fills the screen

**No screen adapts padding, font size, or layout based on screen width.**

### Research Console (12+ screens)

Uses `width: '100%'` with sidebar layout. Only screen with adaptive behavior:
- Desktop (≥768px): Collapsible sidebar (240px / 60px)
- Mobile (<768px): Fixed drawer with overlay

## 4. Typography Responsiveness

**None.** All 37 font sizes are fixed `rem`/`px` values. No:
- `clamp()` for fluid typography
- `vw`/`vh` units for font sizes
- Media query font size adjustments
- Container query font size adjustments

## 5. Spacing Responsiveness

**None.** All spacing values are fixed `rem`/`px`. No adaptive padding or gaps.

## 6. Image Responsiveness

**Minimal.** QR images use `maxWidth: '100%'` in some contexts. No `srcset`, no responsive image patterns.

## 7. Touch Target Sizing

Not explicitly managed. Button sizes via the `size` prop:
- `sm`: padding `0.4rem 0.8rem`
- `md`: padding `0.5rem 1rem`
- `lg`: padding `0.6rem 1.2rem`
- `xl`: padding `1.5rem 2.5rem`

Minimum recommended touch target: 44×44px (WCAG). Some `sm` buttons may be too small.

## 8. Assessment

| Question | Answer |
|----------|--------|
| Mobile-first? | **No** |
| Desktop-first? | **No** |
| Desktop-only? | **Effectively yes** — 480px container works on mobile by accident |
| Responsive typography? | **No** |
| Responsive spacing? | **No** |
| Responsive images? | **No** |
| Breakpoint system? | **None** (single 768px in research console) |

## 9. Phase-2 Implications

The app is currently a **mobile-width app displayed on desktop**. For the FOCUS Design Language v1:

1. **Keep 480px as the mobile design target** — it works
2. **Add tablet/desktop layouts** for research console and admin screens
3. **Consider fluid typography** with `clamp()` for the shared design system
4. **Don't over-engineer** — the primary use case is phone-based reaction testing

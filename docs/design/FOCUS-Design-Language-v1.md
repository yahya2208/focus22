# FOCUS Design Language Specification v1

> Version 1.2 | 2026-07-28 | Phase-1C — Design Specification & Approval Gate
>
> **Status**: ✅ APPROVED — Official Engineering Charter
>
> This document is the **permanent design authority** for FOCUS. All code, all PRs, all design decisions
> must comply with this document. No exceptions. No "just this once."
>
> Approved by product owner on 2026-07-28. Effective immediately.

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [FOCUS Experience Rules](#2-focus-experience-rules)
3. [Visual Identity](#3-visual-identity)
4. [Moodboard](#4-moodboard)
5. [Anti-Patterns](#5-anti-patterns)
6. [Color Philosophy](#6-color-philosophy)
7. [Typography Philosophy](#7-typography-philosophy)
8. [Surface & Depth Philosophy](#8-surface--depth-philosophy)
9. [Component Philosophy](#9-component-philosophy)
10. [Layout Philosophy](#10-layout-philosophy)
11. [Motion Philosophy](#11-motion-philosophy)
12. [Accessibility Target](#12-accessibility-target)
13. [RTL Philosophy](#13-rtl-philosophy)
14. [Scientific Data Visualization](#14-scientific-data-visualization)
15. [Empty States](#15-empty-states)
16. [Error UX](#16-error-ux)
17. [Success UX](#17-success-ux)
18. [Phone Services Design Rules](#18-phone-services-design-rules)
19. [AI Components Rules](#19-ai-components-rules)
20. [Mobile-First Rules](#20-mobile-first-rules)
21. [Performance Budget](#21-performance-budget)
22. [Future Scalability](#22-future-scalability)
23. [Definition of Done](#23-definition-of-done)
24. [Implementation Priorities](#24-implementation-priorities)

---

## 1. Design Principles

These principles govern every design decision in FOCUS. When in doubt, refer here.

### 1.1 Less UI, More Focus

Every pixel on screen competes for attention. The user's attention belongs to their cognitive data, not to chrome, decorations, or UI flourishes. Remove anything that doesn't directly serve comprehension.

### 1.2 Content Before Decoration

A number is more important than its card. A score is more important than its ring. A trend is more important than its chart. Build from content outward — never from decoration inward.

### 1.3 Every Pixel Must Have Purpose

If an element doesn't communicate information, guide action, or provide feedback — it doesn't exist. No decorative gradients. No ornamental borders. No visual filler.

### 1.4 No Decorative Elements Without Function

A glow means "this is important." A gradient means "this is the primary action." A color means "this is the status." If an element has no functional meaning, remove it.

### 1.5 Performance Is Part of Design

A 60fps animation is design. A 300ms delay is design. A 817KB bundle is design. Performance is not a technical concern — it's a visual experience concern. Slow is ugly.

### 1.6 Accessibility Is Not Optional

Every component ships keyboard-navigable, screen-reader-compatible, and reduced-motion-resilient. Accessibility is not a Phase-3 concern — it's a Phase-2A concern.

### 1.7 Consistency Before Creativity

A consistent interface is a learnable interface. Every screen should feel like the same product. Creative variation at the screen level is welcome; creative variation at the component level is forbidden.

---

## 2. FOCUS Experience Rules

These rules define how the user should **feel** when using FOCUS.

### 2.1 Calm

The user should feel calm. The interface should never feel busy, urgent, or overwhelming. Deep backgrounds, generous spacing, minimal chrome. FOCUS is not a game — it's a scientific instrument that happens to be engaging.

### 2.2 Focused

Nothing should steal attention from the test results. The data is the protagonist. If the user is looking at their score, nothing else on screen should compete for their eyes.

### 2.3 Trustworthy

The interface must feel scientifically credible. Not clinical or cold — but precise, measured, and reliable. Numbers should be exact. Typography should be clean. No playful fonts, no comic sans energy, no "fun" dashboard vibes.

### 2.4 Respectful of Data

Reaction times are measured in milliseconds. Consistency is measured in percentages. Fatigue is measured in slopes. These are precise measurements — the interface must treat them with precision. No rounding that loses information. No vague labels. Exact values, always.

### 2.5 Responsive to the Moment

The game screen should feel intense. The results screen should feel reflective. The coach screen should feel supportive. Each screen has an emotional register — the design should match it without being theatrical.

### 2.6 Scientific, Not Corporate

The research console is a scientific tool, not a corporate dashboard. It should feel like a lab instrument — precise, dark, data-dense — not like a Salesforce admin panel.

---

## 3. Visual Identity

### 3.1 What FOCUS Is

**FOCUS is a Cognitive Intelligence Platform.**

It measures human cognitive performance — reaction time, consistency, and fatigue — through a gamified scientific protocol. It is used by researchers studying cognitive decline, and by individuals tracking their own mental sharpness.

### 3.2 What FOCUS Is NOT

- ❌ An admin dashboard
- ❌ A project management tool
- ❌ A data analytics platform (the research console is a tool, not the product)
- ❌ A social media app
- ❌ A game (the game is a measurement instrument)

### 3.3 Personality Traits

| Trait | Description | Example |
|-------|-------------|---------|
| **Scientific** | Data-driven, precise, trustworthy | Tabular numbers, exact measurements, clean typography |
| **Premium** | High-quality, polished, intentional | Generous whitespace, smooth transitions, refined surfaces |
| **Focused** | Minimal chrome, maximum concentration | The game screen has almost no UI — just the lamp |
| **Warm** | Approachable, not intimidating | AI Coach tone, achievement celebrations, friendly onboarding |
| **Accessible** | Works for everyone, everywhere | RTL support, keyboard navigation, reduced motion |

---

## 4. Moodboard

### 4.1 References

| Reference | What We Take | What We Don't Take |
|-----------|-------------|-------------------|
| **Apple Health** | Data visualization clarity, card-based layouts, ring progress indicators, warm health-app tone | The pastel palette (too soft for scientific precision), the information density (too cluttered) |
| **Linear** | Dark theme philosophy, minimal chrome, keyboard-first navigation, speed perception | The purple-heavy palette (too branded), the developer-tools complexity, the glassmorphism-everywhere approach |
| **Arc Browser** | Glass effects used selectively, playful micro-interactions, sidebar navigation pattern | The overwhelming customization, the browser-specific patterns, glass on every surface |
| **Notion** | Clean typography hierarchy, consistent spacing system, content-first layout | The light theme dominance (we're primarily dark), the infinite canvas approach |
| **Raycast** | Command palette interaction model, instant feedback, minimal UI chrome | The developer-tools aesthetic (too technical for consumers) |
| **Stripe Dashboard** | Data table design, financial-grade precision, clear information hierarchy | The corporate color palette, the density (too much data per screen) |

### 4.2 Design DNA

```
FOCUS = Apple Health's warmth + Linear's minimalism + Stripe's precision
        + Arc's selective glass (not everywhere)
```

---

## 5. Anti-Patterns

These patterns are **forbidden** in FOCUS. If you see them in code review, reject the PR.

### 5.1 Visual Anti-Patterns

| # | Anti-Pattern | Why |
|---|-------------|-----|
| 1 | ❌ **Pure black backgrounds** (`#000000`, `#050505`) | Harsh on eyes, feels unfinished. Use deep navy/charcoal instead. |
| 2 | ❌ **Strong drop shadows** (`0 8px 32px rgba(0,0,0,0.5)`) | Heavy, dated, corporate. Use subtle shadows or glass depth instead. |
| 3 | ❌ **Glass on every surface** | Glass is for specific contexts (see Section 8).滥用 destroys depth hierarchy. |
| 4 | ❌ **Gradient on every button** | Gradients are for the primary CTA only. All other buttons are solid or glass. |
| 5 | ❌ **More than one accent color per screen** | Primary accent is the only brand color. Success/warning/danger are status colors, not accents. |
| 6 | ❌ **Inconsistent borders** | All card borders use the same token. No mixing 1px solid with 2px solid on similar elements. |
| 7 | ❌ **Random spacing** | All spacing uses the spacing scale. No `padding: '13px'` or `gap: '17px'`. |
| 8 | ❌ **Cards with different sizes without reason** | Cards in the same context must have consistent padding and radius. |
| 9 | ❌ **Scroll inside scroll** | No nested scrollable areas. If content is long, the page scrolls — not a card within a page. |
| 10 | ❌ **Fixed heights on content containers** | Content determines height. Never set `height: 300px` on a content area. Use `minHeight` if needed. |
| 11 | ❌ **Overflow hidden that hides data** | If content overflows, the user must be able to scroll to it. Never clip data silently. |
| 12 | ❌ **Decorative glow on non-primary elements** | Glow means "this is the most important thing on screen." Use it for the CTA and the score ring only. |

### 5.2 Layout Anti-Patterns

| # | Anti-Pattern | Why |
|---|-------------|-----|
| 13 | ❌ **Edge-to-edge content without padding** | Minimum 16px horizontal padding on every screen. |
| 14 | ❌ **Cards touching screen edges** | Cards must have at least 16px clearance from screen edges. |
| 15 | ❌ **Multiple primary actions per screen** | One screen = one primary action. Everything else is secondary or ghost. |
| 16 | ❌ **Dense data tables on mobile** | Research console tables on mobile: horizontal scroll with sticky first column. |

### 5.3 Typography Anti-Patterns

| # | Anti-Pattern | Why |
|---|-------------|-----|
| 17 | ❌ **More than 3 font sizes per screen** | Screens should use 3-5 of the 10 type scale tokens, not all of them. |
| 18 | ❌ **Italic text** | Scientific platforms don't italicize. Emphasis through weight. |
| 19 | ❌ **Text below 10px** | Nothing smaller than `overline` (10px). If it's too small to read, it's too small to exist. |
| 20 | ❌ **Font weight 900** | Maximum weight is 800 (extrabold). 900 is too heavy for screen text. |

---

## 6. Color Philosophy

### 6.1 Core Principle

> **Color is functional, not decorative.**
> Every color in FOCUS communicates: status, category, hierarchy, or theme identity.

### 6.2 Color Roles

| Role | Purpose | Usage |
|------|---------|-------|
| **Background** | The canvas | Page background, deepest layer. **Never pure black.** |
| **Surface** | Elevated containers | Cards, panels, sidebar |
| **Surface Hover** | Interactive surface states | Card hover, row hover, selected state |
| **Border** | Separation and structure | Card borders, input borders, dividers |
| **Text Primary** | Headings, values, scores | The most important text on screen |
| **Text Secondary** | Labels, descriptions | Supporting text, not dominant |
| **Text Muted** | Tertiary information | Timestamps, footnotes, disabled text |
| **Accent** | Primary action, brand identity | CTAs, active states, links, score rings |
| **Accent Muted** | Accent background tint | Selected pill backgrounds, accent-tinted cards |
| **Success** | Positive outcomes | Good scores, completed states, positive trends |
| **Warning** | Caution, attention needed | Medium scores, pending states, neutral trends |
| **Danger** | Errors, negative outcomes | Bad scores, errors, destructive actions, negative trends |
| **Shadow** | Depth and elevation | Subtle drop shadows |

### 6.3 No Pure Black Rule

**`#000000` and `#050505` are forbidden as background colors.**

Dark backgrounds must be visually comfortable for extended use. Pure black on screens causes:
- Excessive contrast with white text (causes eye strain)
- OLED smearing on scroll
- "Unfinished" or "terminal" aesthetic

**Approved dark backgrounds:**

| Theme | Background | Character |
|-------|-----------|-----------|
| Midnight | `#0a0f1a` | Deep navy — comfortable, scientific |
| Ocean | `#0a192f` | Ocean dark — calm, professional |
| Emerald | `#0a1f1a` | Forest dark — natural, focused |
| Carbon | `#111111` | Charcoal — neutral, data-focused |
| Purple | `#1a0a2e` | Deep violet — creative, premium |
| Sunrise | `#1a0f0a` | Warm dark — approachable, warm |

**Light theme background:** `#f8f9fa` (off-white, not pure white `#ffffff`)

### 6.4 Unified Palette

The current 7 themes share identical semantic colors (danger, success, warning) and similar surface/text colors. The **only variation** is the accent color and background tint.

**Decision**: Keep 7 themes, but unify the token structure. Every theme must define the same 25 tokens.

#### Default Dark Theme (Midnight)

```
Background:      #0a0f1a          (deep navy, never #000000)
Surface:         rgba(255, 255, 255, 0.035)
Surface Hover:   rgba(255, 255, 255, 0.08)
Border:          rgba(255, 255, 255, 0.08)
Border Focus:    rgba(59, 130, 246, 0.5)

Text Primary:    #f0f0f6
Text Secondary:  rgba(255, 255, 255, 0.65)
Text Muted:      rgba(255, 255, 255, 0.45)

Accent:          #3b82f6
Accent Light:    #60a5fa
Accent Muted:    rgba(59, 130, 246, 0.15)

Success:         #22c55e
Success Muted:   rgba(34, 197, 94, 0.15)
Warning:         #f59e0b
Warning Muted:   rgba(245, 158, 11, 0.15)
Danger:          #ef4444
Danger Muted:    rgba(239, 68, 68, 0.15)

Shadow:          rgba(0, 0, 0, 0.3)
Overlay:         rgba(0, 0, 0, 0.6)
```

#### Light Theme

```
Background:      #f8f9fa          (off-white, never #ffffff)
Surface:         rgba(0, 0, 0, 0.02)
Surface Hover:   rgba(0, 0, 0, 0.04)
Border:          rgba(0, 0, 0, 0.08)
Border Focus:    rgba(37, 99, 235, 0.3)

Text Primary:    #1a1a2e
Text Secondary:  rgba(0, 0, 0, 0.6)
Text Muted:      rgba(0, 0, 0, 0.4)

Accent:          #2563eb
Accent Light:    #3b82f6
Accent Muted:    rgba(37, 99, 235, 0.1)

Success:         #16a34a
Success Muted:   rgba(22, 163, 74, 0.1)
Warning:         #d97706
Warning Muted:   rgba(217, 119, 6, 0.1)
Danger:          #dc2626
Danger Muted:    rgba(220, 38, 38, 0.1)

Shadow:          rgba(0, 0, 0, 0.08)
Overlay:         rgba(0, 0, 0, 0.3)
```

### 6.5 Research Console Colors

The research console currently uses hardcoded colors (`#12121a`, `#6366f1`, `#888`, etc.) that don't match any theme.

**Decision**: The research console will use the same theme tokens as the consumer app. The indigo accent (`#6366f1`) becomes the `accent` token for a dedicated "Research" theme or uses the current theme's accent.

### 6.6 Color Usage Rules

1. **Maximum 2 accent colors per screen.** Primary accent + one status color (success/warning/danger) if needed.
2. **Never use color alone to convey meaning.** Always pair with icon, text, or shape.
3. **Muted variants for backgrounds only.** Never use muted colors for text on dark backgrounds (contrast failure).
4. **Status colors are universal.** Success = green, Warning = amber, Danger = red — same across all themes.
5. **Accent is thematic.** Each theme has its own accent. The accent communicates "this is FOCUS" in that theme's voice.

---

## 7. Typography Philosophy

### 7.1 Core Principle

> **Typography is the primary information hierarchy.**
> Size, weight, and spacing — not color — should differentiate text levels.

### 7.2 Font Selection

Four fonts were evaluated for FOCUS:

| Criterion | Inter | IBM Plex Sans | Geist | Plus Jakarta Sans |
|-----------|-------|---------------|-------|-------------------|
| **Long reading** | Excellent — tall x-height, wide apertures | Very good — vertical breathing room | Decent at large sizes, tight at 14px | Good — warm humanist feel |
| **Number rendering** | Excellent — tabular numbers default | Good — `tnum` OpenType feature | Good — supports `tnum` | Good — tabular figures via feature |
| **Table readability** | Best in class — default tabular figures | Strong — needs explicit `tnum` | Decent but tight | Acceptable — geometric, less dense |
| **Scientific feel** | Neutral/utilitarian — lets data speak | Distinctive — corporate/clinical | Modern/tech-forward | Warm/approachable — less clinical |
| **Arabic support** | ❌ None — pair with Tajawal | ✅ **Native** — IBM Plex Sans Arabic | ❌ None — Latin only | ❌ None — Latin only |
| **Weight range** | 9 (100–900) | 7 (100–700) | 9 (100–900) | 7 (200–800) |
| **Variable font** | Yes (~30KB) | Yes (~20KB Latin) | Yes (~30KB) | Yes (~25KB) |
| **License** | OFL | OFL | OFL | OFL |
| **npm** | `@fontsource/inter` | `@ibm/plex-sans` + `@ibm/plex-sans-arabic` | `geist` | `@fontsource/plus-jakarta-sans` |

### 7.3 Recommendation: IBM Plex Sans + IBM Plex Sans Arabic

**Primary choice: IBM Plex Sans**

**Rationale:**

1. **Native Arabic is the deciding factor.** FOCUS is trilingual (EN/TR/AR). Only Plex has a first-party Arabic variant designed by the same team with matching metrics, weight range, and design language. Inter, Geist, and Plus Jakarta Sans all require pairing a separate Arabic font — which introduces inconsistency in stroke weight and x-height perception.

2. **Professional/data-driven feel.** Plex was designed for IBM's enterprise ecosystem — dashboards, data tools, clinical systems. It has a slightly narrower default spacing that gives text a compressed, data-dense feel. This is exactly what a cognitive measurement platform needs.

3. **Tabular numbers.** Plex supports `tnum` — add `font-variant-numeric: tabular-nums` to data tables and timers. Not as "baked in" as Inter's default, but a one-line CSS fix.

4. **Full superfamily.** Plex Mono and Plex Serif are designed to pair perfectly — useful for code output or printed reports.

5. **Performance.** Arabic variant ships as pre-split woff2 subsets via npm.

**Fallback: Inter + Tajawal** (if Arabic quality of Plex is unacceptable after testing)

### 7.4 Font Stack

```css
font-family: 'IBM Plex Sans', system-ui, -apple-system, sans-serif;

/* Arabic */
font-family: 'IBM Plex Sans Arabic', 'IBM Plex Sans', system-ui, sans-serif;
```

### 7.5 Type Scale (10 sizes)

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `display` | 2rem (32px) | 800 | Score rings, hero numbers |
| `h1` | 1.375rem (22px) | 700 | Screen titles |
| `h2` | 1.125rem (18px) | 700 | Section headings |
| `body` | 0.875rem (14px) | 400 | Body text, descriptions |
| `body-strong` | 0.875rem (14px) | 600 | Emphasized body text |
| `label` | 0.75rem (12px) | 600 | Card labels, input labels |
| `caption` | 0.6875rem (11px) | 500 | Timestamps, footnotes |
| `overline` | 0.625rem (10px) | 600 | Section headers, overline text |
| `stat` | 1.125rem (18px) | 800 | Stat values, numbers in cards |
| `score` | 2rem (32px) | 800 | Score display, game time |

**10 sizes on a near-modular scale (base 14px, ratio ~1.25). Replaces the current 37 arbitrary sizes.**

### 7.6 Letter Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | -0.02em | Headlines, display text |
| `normal` | 0 | Body text |
| `wide` | 0.05em | Labels, overlines |
| `wider` | 0.1em | Section headers, uppercase labels |

### 7.7 Line Height Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | 1.2 | Headlines, display text |
| `normal` | 1.5 | Body text |
| `relaxed` | 1.6 | Long-form text, AI summaries |

### 7.8 Typography Rules

1. **Tabular numbers for all numeric data.** `font-variant-numeric: tabular-nums` on every number.
2. **Uppercase for overlines only.** `text-transform: uppercase` + `letter-spacing: 0.1em` for section headers.
3. **Maximum 2 weights per element.** Regular (400) and Semibold (600) for body. Bold (700) and Extrabold (800) for headings.
4. **No italic.** Scientific platforms don't italicize. Emphasis through weight, not style.
5. **Minimum 10px.** Nothing below `overline` size. Print center QR labels are an exception.
6. **Maximum weight 800.** No weight 900 anywhere in the codebase.

---

## 8. Surface & Depth Philosophy

### 8.1 Core Principle

> **Depth is hierarchical, not decorative.**
> Surfaces exist to organize information into layers. Each layer has a specific purpose.

### 8.2 Surface Levels

| Level | Token | Purpose | Visual Treatment |
|-------|-------|---------|-----------------|
| **Base** | `bg` | Page background | Solid color (never pure black) |
| **Raised** | `surface` | Cards, panels, sidebar | Subtle elevation from base |
| **Overlay** | `overlay` | Modals, drawers, dropdowns | Floating above content |

### 8.3 Glass Effect — Usage Rules

Glass (backdrop-filter: blur + translucent background) is a **specific tool**, not a default.

#### Where Glass IS Used

| Context | Reason |
|---------|--------|
| **Cards on dark backgrounds** | Creates depth hierarchy without heavy shadows |
| **HUD elements in game** | Minimal chrome, translucent so game is visible behind |
| **Modals and overlays** | Shows context behind the modal, maintains spatial awareness |
| **Sticky headers** | Content scrolls behind, header remains readable |
| **Toast notifications** | Transient, floating above content |

#### Where Glass is NOT Used

| Context | Why | What to Use Instead |
|---------|-----|-------------------|
| **Research console cards** | Data-dense content needs solid readability | Solid surface with subtle border |
| **Input fields** | Text must be perfectly readable | Solid background (`surface`) |
| **Tables** | Dense data needs zero visual noise | Solid background, alternating rows |
| **Sidebar (research console)** | Navigation must be instantly readable | Solid background |
| **Small text containers** | Blur behind small text reduces readability | Solid background |
| **Charts and graphs** | Data visualization needs crisp edges | Solid background |
| **Buttons** | Interactive elements need clear boundaries | Solid or gradient (see 8.4) |

#### Glass Application Rules

1. **Blur value**: `blur(20px)` — never more, never less.
2. **Background opacity**: Dark themes: `rgba(255, 255, 255, 0.035)`. Light themes: `rgba(255, 255, 255, 0.7)`.
3. **Border**: Always paired with `1px solid border` token.
4. **Performance**: Glass is expensive. Maximum 3 glass surfaces visible simultaneously.
5. **Fallback**: If `backdrop-filter` is unsupported, fall back to solid `surface` color.

### 8.4 Button Surface Rules

| Variant | Surface | When to Use |
|---------|---------|-------------|
| **Primary** | Solid accent color (no gradient by default) | Main CTA on screen (one per screen max) |
| **Primary Gradient** | `linear-gradient(135deg, accent, accentLight)` | Hero CTA only (Start button, Save & Exit) |
| **Secondary** | Solid `surface` with border | Secondary actions (Cancel, Back, Filter) |
| **Ghost** | Transparent, no border | Tertiary actions (Discard, Skip, Less important) |
| **Danger** | Solid `danger` color | Destructive actions (Delete, Discard session) |
| **Success** | Solid `success` color | Positive actions (Save, Confirm, Submit) |

**Gradient is reserved for ONE button per screen — the primary hero CTA.** All other primary buttons use solid accent.

### 8.5 Glow Rules

Glow (`box-shadow: 0 0 Npx accent`) is an **exception effect**, not a default.

| Where Glow IS Used | Where Glow is NOT Used |
|--------------------|-----------------------|
| Score ring on Home screen (hero element) | Every card |
| Start button (hero CTA) | Navigation items |
| Game lamp (the measurement instrument) | Research console anything |
| New best time celebration (temporary) | Buttons in forms |
| Achievement unlock (temporary) | Input focus states |

**Rules:**
1. Maximum 2 glowing elements per screen.
2. Glow color must match accent token.
3. Glow fades after 2 seconds (except game lamp).
4. Never combine glow + gradient on the same element.
5. Research console: zero glow. Scientific tools don't glow.

### 8.6 Blur Rules

Blur (`backdrop-filter: blur()`) is **optional, not default.**

- **Consumer screens**: Blur is permitted on glass surfaces (cards, modals, HUD).
- **Research console**: Blur is forbidden. All surfaces are solid.
- **Game screen**: Blur is permitted on HUD pills only.
- **Fallback**: Every blurred element must have a solid color fallback for browsers without `backdrop-filter` support.

### 8.7 Shadow Rules

| Level | Shadow | Usage |
|-------|--------|-------|
| **None** | No shadow | Default for most elements |
| **Subtle** | `0 1px 3px rgba(0,0,0,0.12)` | Cards, inputs |
| **Medium** | `0 4px 12px rgba(0,0,0,0.15)` | Elevated cards, dropdowns |
| **Strong** | `0 8px 24px rgba(0,0,0,0.2)` | Modals, overlays |

**Never use shadow stronger than "Medium" on consumer screens.** Shadows are depth cues, not decoration.

---

## 9. Component Philosophy

### 9.1 Core Principle

> **Components are building blocks, not pages.**
> Each component does one thing well. Composition creates pages.

### 9.2 Component Inventory

#### Foundation Components (Phase-2A)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Container** | Centered content wrapper | `sm` (400px), `md` (480px), `lg` (640px), `full` (100%) |
| **Stack** | Vertical/horizontal spacing | `direction`, `gap` (xs/sm/md/lg) |
| **Grid** | Responsive grid | `columns`, `gap` |
| **Divider** | Horizontal separator | `soft` (border), `strong` (bg) |

#### Surface Components (Phase-2B)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Card** | Container | `solid` (default), `glass` (selective), `interactive` (hoverable) |
| **Card.Header** | Card header with title + action | — |
| **Card.Body** | Card content area | — |
| **Card.Footer** | Card footer with actions | — |
| **Surface** | Background surface | `base`, `raised`, `overlay` |

#### Input Components (Phase-2B)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Button** | Action trigger | `primary`, `primary-gradient`, `secondary`, `ghost`, `danger`, `success` × `sm`, `md`, `lg` |
| **Input** | Text input | `default`, `error`, `disabled` |
| **Select** | Dropdown select | `default`, `multi` |
| **Checkbox** | Toggle option | `default`, `indeterminate` |
| **Pill** | Selectable pill (for filters, tabs) | `default`, `selected`, `accent` |
| **Slider** | Range input | `default`, `labeled` |

#### Data Display Components (Phase-2B)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Stat** | Number + label display | `default`, `accent`, `compact` |
| **Stat.Grid** | 2×2 or 3×3 stat layout | `2col`, `3col` |
| **Badge** | Status indicator | `success`, `warning`, `danger`, `info`, `neutral` |
| **Progress** | Linear progress bar | `default`, `striped` |
| **ProgressRing** | Circular progress | `sm`, `md`, `lg` |
| **Tag** | Category label | `default`, `accent`, `outline` |

#### Navigation Components (Phase-2B)

| Component | Description | Variants |
|-----------|-------------|----------|
| **ScreenHeader** | Page title + optional back/actions | `default`, `with-back` |
| **Tabs** | Horizontal tab bar | `pills`, `underline` |
| **Sidebar** | Side navigation (research console) | `expanded`, `collapsed`, `drawer` |

#### Feedback Components (Phase-2C)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Modal** | Overlay dialog | `default`, `fullscreen` |
| **Toast** | Temporary notification | `success`, `warning`, `error`, `info` |
| **EmptyState** | No data placeholder | `default`, `with-action` |
| **LoadingState** | Loading indicator | `spinner`, `skeleton` |

#### Chart Components (Phase-2C — keep existing)

| Component | Description |
|-----------|-------------|
| **BarChart** | Vertical bar chart |
| **LineChart** | Line chart with dots |
| **PieChart** | Donut/pie chart |
| **Histogram** | Distribution chart |
| **HeatmapChart** | Grid heatmap |
| **FunnelChart** | Funnel visualization |

### 9.3 Component Rules

1. **Every component accepts `className` and `style` overrides.** For escape hatches.
2. **Every interactive component uses `forwardRef`.** For focus management and testing.
3. **Every component supports `data-testid`.** For test selectors.
4. **No component hardcodes colors.** All colors come from theme tokens via `useThemeColors()`.
5. **No component hardcodes spacing.** All spacing uses spacing tokens.
6. **No component uses fixed heights for content.** Use `minHeight` only when necessary.
7. **No component hides overflow silently.** If content overflows, provide scrolling.
8. **Composition over configuration.** Prefer `Card.Header` + `Card.Body` over a single `Card` with 10 props.

### 9.4 Card Design (The Core Element)

The card is the most used component in FOCUS. Every screen uses cards.

```
Card (solid — default for most contexts):
  background: surface
  border: 1px solid border
  border-radius: radius.lg (16px)
  padding: xl (20px)

Card (glass — selective use only):
  background: glass
  border: 1px solid border
  border-radius: radius.lg (16px)
  padding: xl (20px)
  backdrop-filter: blur(20px)

Card (interactive — hoverable cards):
  inherits from solid or glass
  cursor: pointer
  transition: border-color 0.2s smooth, transform 0.2s smooth

Card:hover (interactive):
  border-color: accent (muted)
  transform: translateY(-1px)
```

### 9.5 Button Design

```
Button (primary — solid):
  background: accent
  color: #ffffff
  border-radius: radius.lg (16px)
  font-weight: 600
  transition: all 0.2s smooth

Button:hover (primary):
  background: accentLight
  transform: translateY(-1px)

Button (primary-gradient — hero CTA only):
  background: linear-gradient(135deg, accent, accentLight)
  color: #ffffff
  border-radius: radius.xl (20px)
  box-shadow: 0 4px 16px accentMuted

Button:hover (primary-gradient):
  transform: translateY(-1px)
  box-shadow: 0 8px 24px accentMuted

Button (secondary):
  background: surface
  border: 1px solid border
  color: textPrimary

Button (ghost):
  background: transparent
  color: textSecondary

Button (danger):
  background: danger
  color: #ffffff

Button (success):
  background: success
  color: #ffffff
```

### 9.6 Game UI

The game screen is sacred. It must remain minimal.

```
Game Screen Rules:
- No borders, no cards, no chrome
- Background: theme bg (solid, no glass)
- HUD: solid surface pills, minimal, top corners
- Game element (lamp): centered, the ONLY glowing element
- Hit feedback: solid surface pill, center, temporary
- No navigation during game
- No settings during game
- Full concentration mode
- Lamp glow is the only glow on screen
```

### 9.7 Phone Services

Phone Services is a guided wizard, not a dashboard.

```
Phone Services Rules:
- Stepper progress at top (thin line, accent fill)
- One question per screen
- Pill selectors for options
- Price estimation in accent-tinted card (solid, not glass)
- Back/Next navigation at bottom
- Success state with checkmark animation
```

### 9.8 Research Console

The research console is a scientific instrument.

```
Research Console Rules:
- All surfaces are solid (no glass, no blur)
- No glow anywhere
- No gradient buttons
- Data tables with solid backgrounds
- Sidebar: solid background, no glass
- Charts: solid backgrounds, crisp edges
- Feels like a lab tool, not a consumer app
- Same theme tokens as consumer app, different surface treatment
```

---

## 10. Layout Philosophy

### 10.1 Core Principle

> **Mobile-first, centered, consistent.**
> Every consumer screen is a 480px column. The research console is a desktop tool.

### 10.2 Grid System

#### Consumer Screens (22 screens)

```
Container:
  max-width: 480px
  margin: 0 auto
  padding: 0 xl (20px)
  min-height: 100dvh

Inner spacing:
  gap: xl (20px) between sections
  gap: md (12px) between items within a section
```

#### Research Console

```
Desktop (≥768px):
  Sidebar: 240px (expanded) / 60px (collapsed)
  Content: flex-1, padding 24px

Mobile (<768px):
  Sidebar: 260px drawer with overlay
  Content: full width, padding 16px
  Header: fixed top bar with hamburger
```

### 10.3 Breakpoints

| Token | Min-width | Usage |
|-------|-----------|-------|
| `mobile` | 0px | Default (consumer screens) |
| `tablet` | 768px | Research console sidebar toggle |
| `desktop` | 1024px | Research console expanded sidebar |
| `wide` | 1280px | Research console wide content |

**Decision**: Consumer screens don't need breakpoints. They're always 480px. Only the research console adapts.

### 10.4 Spacing Scale (4px grid)

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Tight gaps, icon margins |
| `sm` | 8px | Compact gaps, inline spacing |
| `md` | 12px | Card internal spacing |
| `lg` | 16px | Standard spacing, card padding |
| `xl` | 20px | Section spacing, large card padding |
| `2xl` | 24px | Section gaps |
| `3xl` | 32px | Large section gaps |
| `4xl` | 40px | Page-level spacing |
| `5xl` | 48px | Hero spacing |

**All spacing values must be multiples of 4px.** No `padding: '13px'` or `gap: '17px'`.

### 10.5 Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Badges, small indicators |
| `sm` | 8px | Inputs, small buttons |
| `md` | 12px | Default card radius |
| `lg` | 16px | Buttons, interactive cards |
| `xl` | 20px | Large cards, modals, hero CTAs |
| `pill` | 9999px | Pills, badges, tags |
| `circle` | 50% | Circular elements (avatars, rings) |

### 10.6 Z-Index Scale

| Token | Value | Usage |
|-------|-------|-------|
| `base` | 0 | Default layer |
| `raised` | 10 | Elevated cards |
| `dropdown` | 100 | Dropdowns, popovers |
| `sticky` | 200 | Sticky headers |
| `overlay` | 300 | Backdrop overlays |
| `modal` | 400 | Modals, dialogs |
| `toast` | 500 | Toast notifications |
| `tooltip` | 600 | Tooltips |
| `game` | 700 | Game UI elements |

### 10.7 Layout Rules

1. **One primary action per screen.** Home = Start button. Results = Save. Game = Tap lamp.
2. **Generous whitespace.** Minimum 16px between any two elements.
3. **No edge-to-edge content.** Always 20px horizontal padding.
4. **Cards don't touch edges.** Minimum 16px from screen edge to card.
5. **No fixed heights on content.** Content determines container height. Use `minHeight` only for empty states.
6. **No overflow hiding data.** If content is taller than expected, the user scrolls. Never `overflow: hidden` on content containers.
7. **No scroll inside scroll.** One scroll context per screen. If the page scrolls, don't put a scrollable card inside it.

---

## 11. Motion Philosophy

### 11.1 Core Principle

> **Motion communicates state change, not decoration.**
> Every animation must answer: "What changed?" If nothing changed, don't animate.

### 11.2 Duration Limit

**No animation may exceed 300ms — except game-specific animations.**

| Context | Maximum Duration |
|---------|-----------------|
| Hover states | 150ms |
| Focus states | 100ms |
| Button press | 100ms |
| Page transitions | 300ms |
| Card reveals | 300ms |
| Progress rings | 300ms |
| Toast appear/disappear | 300ms |
| Modal appear/disappear | 300ms |
| **Game lamp animations** | **500ms (exception)** |
| **Game shatter effects** | **500ms (exception)** |

### 11.3 Easing Curves

| Token | Value | Usage |
|-------|-------|-------|
| `standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default interaction (buttons, inputs) |
| `smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page transitions, progress, reveals |
| `bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Celebrations, achievements (rare) |

### 11.4 Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `instant` | 100ms | Background color changes, focus |
| `fast` | 150ms | Input focus, button press, hover |
| `normal` | 200ms | Button transitions, hover states |
| `slow` | 300ms | Page transitions, card reveals, max for non-game |

### 11.5 Motion Tokens

| Token | Properties |
|-------|-----------|
| `hover` | `transform: translateY(-1px); transition: transform 150ms smooth` |
| `press` | `transform: translateY(0); transition: transform 100ms standard` |
| `focus` | `outline: 2px solid accent; outline-offset: 2px` (instant, no transition) |
| `page-enter` | `opacity: 0 → 1; transform: translateY(8px) → 0; 200ms smooth` |
| `page-exit` | `opacity: 1 → 0; 150ms standard` |
| `scale-in` | `transform: scale(0.95) → 1; opacity: 0 → 1; 200ms smooth` |

### 11.6 Game-Specific Motion

The game has its own motion language — more dramatic, more feedback-heavy.

| Animation | Duration | Easing | Purpose |
|-----------|----------|--------|---------|
| `lampAppear` | 200ms | bounce | New lamp appears |
| `lampPulse` | 1500ms | ease-in-out (infinite) | Lamp breathing |
| `lampShatter` | 500ms | standard | Lamp destroyed on hit |
| `rtPop` | 300ms | bounce | Reaction time display |
| `bestPulse` | 300ms | standard | New best time celebration |
| `crackSpread` | 500ms | standard | SVG crack lines |
| `shardFly` | 500ms | standard | Particle effects |

### 11.7 Reduced Motion

When `settings.reducedMotion = true` OR `prefers-reduced-motion: reduce`:

```
All transitions: 0ms (instant)
All animations: paused or removed
Transforms: disabled (no translateY, scale)
Progress rings: snap to final value (no stroke animation)
Game: lamp appears/disappears without animation
Achievements: no stagger, no shimmer, no pop
Page transitions: instant switch
```

### 11.8 Motion Rules

1. **No animation on page load.** Content appears immediately. Animations are for state changes only.
2. **Maximum 3 concurrent animations.** No screen should have more than 3 things animating at once.
3. **Stagger only for lists.** Achievement badges, stat cards — 50ms delay per item, max 8 items.
4. **No infinite animations except game lamp.** Everything else must end.
5. **No animation on text.** Text fades in with its container. Never animate text independently.
6. **300ms is the hard limit** for all non-game animations.

---

## 12. Accessibility Target

### 12.1 Core Principle

> **Accessibility is not a feature. It's a requirement.**
> WCAG AA compliance is the minimum. Keyboard-first is the default.

### 12.2 WCAG 2.1 AA Compliance

| Criterion | Target | Current State |
|-----------|--------|---------------|
| 1.1.1 Non-text Content | All images have descriptive alt | ✅ 6/6 |
| 1.3.1 Info and Relationships | Semantic HTML, proper headings | ❌ `<nav>` misused |
| 1.4.1 Use of Color | Color not sole indicator | ⚠️ Partial |
| 1.4.3 Contrast Minimum | 4.5:1 normal, 3:1 large | ❌ `textMuted` fails |
| 1.4.4 Resize Text | 200% zoom without loss | ⚠️ Untested |
| 2.1.1 Keyboard | All functionality via keyboard | ❌ 0 keyboard handlers |
| 2.1.2 No Keyboard Trap | Tab through all focusable items | ⚠️ Untested |
| 2.4.1 Bypass Blocks | Skip navigation links | ❌ None |
| 2.4.3 Focus Order | Logical tab order | ❌ No focus management |
| 2.4.7 Focus Visible | Visible focus indicator | ❌ None |
| 3.3.2 Labels or Instructions | All inputs labeled | ❌ 20/29 labels |
| 4.1.2 Name, Role, Value | ARIA for custom components | ⚠️ Partial |

### 12.3 Keyboard-First Design

**Every interactive element must be operable via keyboard.**

| Element | Keyboard Interaction |
|---------|---------------------|
| Button | Enter/Space to activate |
| Link | Enter to navigate |
| Input | Tab to focus, type to enter |
| Select | Tab to focus, Arrow keys to navigate, Enter to select |
| Checkbox | Space to toggle |
| Tab | Arrow keys to switch, Tab to move to content |
| Modal | Tab trapped inside, Escape to close |
| Game | Space/Enter to tap lamp (in addition to click/touch) |

### 12.4 Focus Management Rules

1. **Focus visible always.** `outline: 2px solid accent; outline-offset: 2px` on `:focus-visible`.
2. **Focus restored after modal.** When a modal closes, focus returns to the triggering element.
3. **Focus moved after navigation.** When a new screen loads, focus moves to the screen title.
4. **Focus trapped in modals.** Tab cycles through focusable elements inside the modal only.
5. **No focus on disabled elements.** `tabIndex={-1}` for disabled buttons/inputs.

### 12.5 Screen Reader Support

| Pattern | Implementation |
|---------|---------------|
| Page titles | `<h1>` on every screen, unique per screen |
| Landmarks | `<main>` for content, `<nav>` for navigation only |
| Live regions | `aria-live="polite"` for score updates, `aria-live="assertive"` for errors |
| Descriptions | `aria-describedby` for complex inputs |
| Hidden decorative | `aria-hidden="true"` for decorative SVGs and emoji |

### 12.6 High Contrast Mode

When `settings.highContrast = true` OR `prefers-contrast: more`:

```
Borders: 2px solid (instead of 1px)
Text: increased weight (+100)
Accent: brighter variant
Background: deeper (but never pure black)
Surfaces: more opaque (less transparency)
Focus ring: 3px solid (instead of 2px)
```

### 12.7 Accessibility Checklist (Per Component)

Every component must pass:

- [ ] Keyboard operable (Enter/Space for interactive)
- [ ] Focus visible (`:focus-visible` outline)
- [ ] Screen reader accessible (role, label, description)
- [ ] Color contrast ≥ 4.5:1
- [ ] Reduced motion respected
- [ ] Touch target ≥ 44×44px
- [ ] No content loss at 200% zoom
- [ ] No fixed heights that clip content
- [ ] No overflow hidden that hides data

---

## 13. RTL Philosophy

### 13.1 Core Principle

> **RTL is not "flip everything."**
> RTL is a layout direction, not a mirror. Some things flip, some don't.

### 13.2 What Flips in RTL

| Element | LTR | RTL |
|---------|-----|-----|
| Text alignment | Left | Right |
| Horizontal padding | `paddingLeft` / `paddingRight` | Flipped via logical properties |
| Margins | `marginLeft` / `marginRight` | Flipped via logical properties |
| Flex direction | `row` | `row-reverse` (for icon+text) |
| Icons with text | Icon left of text | Icon right of text |
| Back arrow | ← | → |
| Navigation items | Left-aligned | Right-aligned |
| Sidebar | Left side | Right side |
| Progress bars | Fill left-to-right | Fill right-to-left |
| Charts (bar) | Bars grow right | Bars grow left |
| Tables | Text left | Text right |

### 13.3 What Does NOT Flip in RTL

| Element | Reason |
|---------|--------|
| Score ring | Circular, no direction |
| Game lamp | Position is absolute, not directional |
| Progress ring | Circular, no direction |
| Clock/time | Universal direction |
| Numbers | Arabic numerals (0-9) are always LTR |
| Charts (pie/donut) | Circular, no direction |
| Video/media controls | Universal |
| Phone number input | Always LTR |
| QR codes | Always LTR |

### 13.4 Layout Behavior

#### Consumer Screens (480px container)

```
RTL:
  direction: rtl
  text-align: right
  Container: same (480px, centered)
  Cards: same layout, text right-aligned
  Icons: flipped to right side of text
  Back button: → instead of ←
  Score ring: unchanged (circular)
```

#### Research Console

```
RTL:
  Sidebar: moves to RIGHT side
  Content: moves to LEFT side
  Sidebar toggle: ← instead of →
  Table columns: first column on right
  Charts: bars grow left
  Filter bar: inputs right-aligned
  Dashboard header: title right, actions left
```

### 13.5 Implementation Approach

1. **CSS Logical Properties.** Use `margin-inline-start` instead of `margin-left`. Use `padding-inline-end` instead of `padding-right`. This handles RTL automatically.
2. **`dir="rtl"` on `<html>`.** The entire app flips with one attribute.
3. **No hardcoded left/right.** Every `marginLeft` must become `marginInlineStart`. Every `paddingRight` must become `paddingInlineEnd`.
4. **Exception: game coordinates.** Game lamp positions use percentage-based absolute positioning. These don't flip — the lamp appears at the same visual position regardless of direction.

### 13.6 RTL Testing Checklist

- [ ] All text right-aligned
- [ ] All icons on correct side
- [ ] Sidebar on right (research console)
- [ ] Back arrow points right
- [ ] Progress bars fill right-to-left
- [ ] Tables right-aligned
- [ ] No horizontal overflow
- [ ] No layout breaking
- [ ] Game still works correctly
- [ ] Score ring unchanged

---

## 14. Scientific Data Visualization

### 14.1 Core Principle

> **Charts are scientific instruments, not decorations.**
> Every chart must communicate data accurately, readably, and honestly.

### 14.2 Color Rules for Charts

| Rule | Detail |
|------|--------|
| **Maximum 5 colors** per chart | More than 5 becomes unreadable |
| **Use theme tokens** | `accent`, `success`, `warning`, `danger`, `textMuted` — not custom hex |
| **Sequential data** | Use lightness gradient of one color (e.g., accent light → accent dark) |
| **Categorical data** | Use distinct hues from the theme palette |
| **Never use red/green alone** | Always pair with shape, label, or pattern for colorblind users |

### 14.3 Chart Color Palette

```
Primary:    accent
Secondary:  accentLight
Tertiary:   textSecondary
Success:    success
Warning:    warning
Danger:     danger
Muted:      textMuted
```

**Maximum 3 colors for a single data series.** Use muted variants for secondary data.

### 14.4 Axis Rules

| Rule | Detail |
|------|--------|
| **Y-axis starts at zero** | Unless explicitly noted otherwise (with annotation) |
| **Axis labels** | Always present — never裸 axes |
| **Grid lines** | `border` token color, 1px, dashed. Never solid black. |
| **Tick labels** | `caption` size, `textMuted` color |
| **Units** | Always shown on axis label, not on every tick (e.g., "Time (ms)" not "100ms, 200ms, ...") |

### 14.5 Number Display in Charts

| Rule | Detail |
|------|--------|
| **Tabular numbers** | `font-variant-numeric: tabular-nums` on all chart text |
| **Decimal precision** | Reaction times: 0 decimal places (ms). Scores: 0 decimal places. Percentages: 1 decimal place. |
| **Thousands separator** | Use locale-appropriate separator (1,000 vs 1.000) |
| **No scientific notation** | Always display as regular numbers |

### 14.6 Highlighting Important Values

| Method | When to Use |
|--------|-------------|
| **Bold weight** | The most important number on screen (e.g., current score) |
| **Accent color** | Best score, target achieved, positive trend |
| **Danger color** | Worst score, threshold exceeded, negative trend |
| **Larger size** | Primary metric vs secondary metrics |
| **Icon** | Trend direction (↑↓→) next to the value |

**Never use:**
- ❌ Arrows pointing at values (clutter)
- ❌ Callout boxes around numbers (heavy)
- ❌ Animated number counting (distracting, accessibility issue)
- ❌ Color alone — always pair with icon or text label

### 14.7 Forbidden in Charts

| Anti-Pattern | Why |
|-------------|-----|
| ❌ 3D effects | Distorts data perception |
| ❌ Exploded pie charts | Misrepresents proportions |
| ❌ Gradient fills on bars | Makes exact values hard to read |
| ❌ Pie charts with >5 slices | Use bar chart instead |
| ❌ Truncated axes without annotation | Misleading |
| ❌ Animated chart transitions | Distracting, accessibility issue |
| ❌ Tooltips as primary data | Data must be visible without interaction |
| ❌ Dual Y-axes | Confusing, often misleading |

### 14.8 Chart Sizing

| Context | Minimum Width | Minimum Height |
|---------|--------------|----------------|
| Inline stat chart | 80px | 40px |
| Card chart | 200px | 120px |
| Full-width chart | 320px | 200px |

**Never set fixed heights on chart containers.** Charts determine their own height based on data and width.

---

## 15. Empty States

### 15.1 Core Principle

> **Every screen must have a designed state for "nothing here yet."**
> An empty page is a broken experience.

### 15.2 Required Empty States

Every screen must handle these 5 states:

| State | Visual | Action |
|-------|--------|--------|
| **No data** | Illustration/icon + "No data yet" message | Primary CTA to create first item |
| **Loading** | Skeleton or spinner + "Loading..." | None (automatic) |
| **Error** | Error icon + friendly message + retry button | Retry action |
| **No results** | Search icon + "No results found" | Clear filters / try different query |
| **No connection** | WiFi icon + "No internet connection" | Retry button + offline indicator |

### 15.3 Empty State Design Rules

1. **Center-aligned.** Empty states are centered vertically and horizontally.
2. **Icon/illustration first.** 48-64px icon at top, muted color.
3. **Message second.** `body` size, `textSecondary` color. Friendly, not technical.
4. **Action third.** Primary or secondary button if the user can take action.
5. **No decoration.** Empty states are functional, not decorative.
6. **Maximum 2 lines of text.** If you need more, the message is too complex.

### 15.4 Empty State Template

```
[Icon: 48px, textMuted]

[Title: h2, textPrimary]
"No sessions yet" / "No results found" / "Connection lost"

[Description: body, textSecondary, max 2 lines]
"Start your first focus session to see your results here."

[Action: Button, primary or secondary]
"Start Session" / "Try Again" / "Clear Filters"
```

---

## 16. Error UX

### 16.1 Core Principle

> **Errors are moments of friction. Handle them with care.**
> The user didn't cause the error — the system did. Be helpful, not blaming.

### 16.2 Error Display Rules

| Rule | Detail |
|------|--------|
| **Short message** | Maximum 1 sentence. No paragraphs. |
| **Non-technical** | "Something went wrong" not "TypeError: Cannot read property 'map' of undefined" |
| **Actionable** | If retry is possible, show retry button. If not, explain what to do next. |
| **No internal details** | Never show stack traces, API errors, or debug info to users |
| **Non-blocking when possible** | Use toast for recoverable errors. Use full-page only for fatal errors. |

### 16.3 Error Hierarchy

| Level | Presentation | Example |
|-------|-------------|---------|
| **Inline** | Red text below the input/form | "Email is already registered" |
| **Toast** | Temporary notification, auto-dismiss (5s) | "Failed to save. Tap to retry." |
| **Modal** | Overlay with message + action | "Session failed to save" + Retry / Go Home |
| **Full page** | Dedicated error screen | Fatal app error + Restart button |

### 16.4 Error Message Tone

| ❌ Don't Say | ✅ Say Instead |
|-------------|---------------|
| "Error 500: Internal Server Error" | "Something went wrong" |
| "Failed to fetch" | "Couldn't load data" |
| "Invalid input" | "Please check your input" |
| "Unauthorized" | "Please sign in again" |
| "Network error" | "No internet connection" |
| "Timeout" | "Taking too long. Try again?" |

### 16.5 Error Recovery

| Error Type | Recovery |
|-----------|----------|
| **Network error** | Retry button + offline indicator |
| **Auth error** | Redirect to login + preserve form data |
| **Validation error** | Highlight field + inline message |
| **Save error** | Retry button + "Your changes are saved locally" |
| **Fatal error** | Restart button + "Contact support if this persists" |

---

## 17. Success UX

### 17.1 Core Principle

> **Success should be felt, not just displayed.**
> A brief moment of positive feedback confirms the action worked.

### 17.2 Success Feedback Types

| Action Type | Feedback | Duration |
|-------------|----------|----------|
| **Quick action** (toggle, save setting) | Checkmark icon appears + fades | 1.5s |
| **Form submission** | Toast "Saved successfully" | 3s |
| **Multi-step flow** (wizard) | Success screen with checkmark animation | Until user dismisses |
| **First-time action** | Success + brief celebration (confetti or glow) | 2s |
| **Score/game result** | Results screen (no toast — the screen IS the success) | Persistent |

### 17.3 Success Design Rules

1. **Green for success.** `success` token color for checkmarks, badges, and positive states.
2. **Brief animation.** Checkmark scales in (200ms bounce). No long celebrations.
3. **Auto-dismiss toasts.** Success toasts auto-dismiss after 3 seconds.
4. **Don't interrupt flow.** After saving a setting, show toast — don't navigate away.
5. **Navigate after completion.** After a multi-step wizard, navigate to the result or parent screen.

### 17.4 Success After Phone Services Flow

```
1. User completes final step
2. Success screen appears (full screen, centered)
3. Green checkmark circle (64px, scale-in animation)
4. "Request Submitted" (h1)
5. "We'll get back to you within 24 hours" (body, textSecondary)
6. "New Request" button (secondary) — starts over
7. "Back to Home" link — navigates to home
```

---

## 18. Phone Services Design Rules

### 18.1 Core Principle

> **Phone Services is part of FOCUS, not an external tool.**
> The user must never feel they left the FOCUS platform.

### 18.2 Identity Rules

| Rule | Detail |
|------|--------|
| **Same theme** | Uses the same theme tokens as the rest of FOCUS |
| **Same components** | Uses Button, Card, Input, Pill from the design system |
| **Same colors** | No custom colors. Accent = accent token. Status = status tokens. |
| **Same typography** | Same font, same scale, same weights |
| **Same animations** | Same easing curves, same durations (≤300ms) |
| **Same container** | 480px max-width, same padding |

### 18.3 Flow Rules

| Rule | Detail |
|------|--------|
| **Minimum steps** | Every flow must be completable in ≤5 steps |
| **Progress visible** | Stepper bar at top, always showing current position |
| **Back always available** | User can go back to any previous step |
| **Summary before submit** | Show a summary card before the final "Submit" action |
| **Confirmation** | Success screen after submission (see Section 17.4) |

### 18.4 Visual Treatment

```
Phone Services Screen:
- Same background as Home screen
- Same card style (solid, not glass — data entry context)
- Pill selectors for options (same as settings toggles)
- Price estimation in accent-tinted card (solid surface + accent border)
- Stepper: thin line (3px), accent fill for completed, border for pending
- Back/Next buttons: secondary + primary, same as form navigation
```

### 18.5 What Phone Services Is NOT

- ❌ An e-commerce checkout (no cart, no payment processing)
- ❌ A separate app (no separate navigation, no "back to FOCUS" link needed)
- ❌ A complex configurator (keep it simple, max 5 steps)
- ❌ A data-heavy dashboard (minimal data, maximum guidance)

---

## 19. AI Components Rules

### 19.1 Core Principle

> **AI should feel like a knowledgeable assistant, not a black box.**
> Be transparent about confidence, show reasoning, and always let the user decide.

### 19.2 AI Card Design

```
AI Card:
  background: surface (solid)
  border: 1px solid border
  border-radius: radius.lg (16px)
  padding: xl (20px)
  Icon: Robot emoji in 28x28 accent-tinted circle (top-left)
  Title: "AI Summary" / "Recommendation" (h2)
  Body: body text, textSecondary, 1.6 line-height
```

### 19.3 Confidence Display

| Confidence Level | Visual | Color | Text |
|-----------------|--------|-------|------|
| **High** (>80%) | Solid badge | `success` | "High confidence" |
| **Medium** (50-80%) | Solid badge | `warning` | "Medium confidence" |
| **Low** (<50%) | Solid badge | `danger` | "Low confidence" |

**Badge placement:** Inline with the AI card title, right-aligned.

### 19.4 Recommendation Display

```
Recommendation Card:
  Icon: Lightbulb in 28x28 accent-tinted circle
  Title: "Recommendations" (h2)
  Tier label: Accent-colored uppercase overline
  List: Bullet points, body size, textSecondary
  Each item: max 2 lines, actionable language
```

### 19.5 AI Color Usage

| Context | Color | Reason |
|---------|-------|--------|
| AI card background | `surface` | Neutral, readable |
| AI icon background | `accentMuted` | Brand identity, not status |
| High confidence | `success` | Positive signal |
| Medium confidence | `warning` | Caution |
| Low confidence | `danger` | Uncertainty |
| AI text | `textSecondary` | Body text, not dominant |
| Trend arrows | `success`/`danger` | Up = good (green), Down = bad (red) |

### 19.6 AI Rules

1. **Never show AI as omniscient.** Always show confidence level.
2. **Never auto-apply AI suggestions.** Show them, let the user decide.
3. **Plain language.** No jargon, no technical terms. "Your consistency improved" not "CV decreased by 12%."
4. **Evidence-based.** Every recommendation must reference specific data points.
5. **Brevity.** Maximum 3 recommendations per screen. Quality over quantity.

---

## 20. Mobile-First Rules

### 20.1 Core Principle

> **Every component is designed for mobile first, then expanded for larger screens.**
> Desktop-first design is forbidden.

### 20.2 Mobile-First Rules

| Rule | Detail |
|------|--------|
| **Design mobile first** | Every component starts at mobile width (480px or less) |
| **Expand, don't shrink** | Desktop is mobile + more space. Never mobile = desktop - space. |
| **No fixed widths that break mobile** | Every container must work at 320px minimum |
| **Touch targets ≥ 44px** | All interactive elements must be tappable on mobile |
| **Thumb-friendly zones** | Primary actions in bottom 60% of screen |
| **No hover-dependent UI** | Hover is enhancement, not requirement. Core functionality works without hover. |

### 20.3 Consumer Screens

Consumer screens are **mobile-only**. The 480px container is the design target. No responsive adaptation needed — the container handles it.

### 20.4 Research Console

The research console adapts at breakpoints:

| Breakpoint | Behavior |
|-----------|----------|
| < 768px | Sidebar → drawer, full-width content, reduced padding |
| ≥ 768px | Sidebar visible, content fills remaining space |
| ≥ 1024px | Sidebar collapsible, content gets more space |
| ≥ 1280px | Wide content mode for data tables |

### 20.5 Forbidden

| Anti-Pattern | Why |
|-------------|-----|
| ❌ `min-width` on containers | Breaks mobile |
| ❌ Fixed pixel widths > 480px on consumer screens | Doesn't fit mobile |
| ❌ Hover-only interactions | Inaccessible on touch |
| ❌ Desktop layout that "shrinks" to mobile | Usually breaks |
| ❌ Hidden content on mobile without alternative | Data must be accessible |

---

## 21. Performance Budget

### 21.1 Core Principle

> **Performance is a design decision.**
> A slow interface is a broken interface. Speed is part of the visual experience.

### 21.2 Bundle Size Budget

| Resource | Current | Target | Maximum |
|----------|---------|--------|---------|
| JavaScript (total) | 817KB | 400KB | 500KB |
| JavaScript (gzipped) | 223KB | 150KB | 200KB |
| CSS | 0KB (inline) | 0KB | 10KB |
| Fonts | ~0KB (system) | ~60KB (IBM Plex) | 100KB |
| **Total** | **~817KB** | **~460KB** | **~610KB** |

### 21.3 Runtime Performance Budget

| Metric | Target | Maximum |
|--------|--------|---------|
| First Contentful Paint | < 1.0s | < 1.5s |
| Largest Contentful Paint | < 2.0s | < 3.0s |
| Time to Interactive | < 2.0s | < 3.5s |
| Cumulative Layout Shift | < 0.05 | < 0.1 |
| Total Blocking Time | < 100ms | < 200ms |

### 21.4 Component Performance Rules

| Rule | Detail |
|------|--------|
| **No heavy dependencies** | Every new npm package must be justified. Check bundle impact before adding. |
| **Lazy load infrequent screens** | Research console, Phone Services, Achievements — use `React.lazy()` |
| **Memoize expensive computations** | Score calculations, chart data transforms — use `useMemo` |
| **No unnecessary re-renders** | Use `React.memo` for components that receive stable props |
| **Image optimization** | Use WebP/AVIF. Never serve uncompressed PNGs > 100KB. |
| **Font subsetting** | Only load glyphs needed for EN/TR/AR. Don't load full Unicode. |

### 21.5 Visual Effect Performance

| Effect | Performance Cost | When Allowed |
|--------|-----------------|--------------|
| `backdrop-filter: blur()` | High (GPU) | Max 3 simultaneous, solid fallback |
| `box-shadow` | Medium | Subtle only, max 2 per element |
| `transform` | Low | Preferred for animations |
| `opacity` | Low | Preferred for fades |
| `transition` | Low | Standard for interactions |
| `@keyframes` | Low-Medium | Game only, max 3 concurrent |
| Canvas/WebGL | High | Only for complex visualizations (charts) |

### 21.6 Weak Device Rules

When `settings.reducedMotion = true` OR device is detected as low-performance:

```
Disable: backdrop-filter blur
Disable: box-shadow glow effects
Disable: all @keyframes animations
Reduce: transition durations to 0ms
Simplify: chart rendering (fewer data points)
Prefer: solid surfaces over glass
```

### 21.7 Performance Review Checklist

Every PR that adds a new component or feature must answer:

- [ ] What is the bundle size impact? (Check with `pnpm build`)
- [ ] Does it add a new npm dependency? If so, what's the size?
- [ ] Does it use `backdrop-filter`? If so, is there a solid fallback?
- [ ] Does it animate? If so, is the animation under 300ms?
- [ ] Does it render a list? If so, is it virtualized for >50 items?
- [ ] Does it fetch data? If so, does it handle loading and error states?

---

## 22. Future Scalability

### 22.1 Core Principle

> **Every new component must be built with the system, not outside it.**
> Ad-hoc solutions technical debt. The design system is the only way forward.

### 22.2 New Component Rules

| Rule | Detail |
|------|--------|
| **Use existing tokens** | No new colors, spacing, or typography without updating the token system first |
| **Use existing components** | Compose from Button, Card, Input, etc. Don't create new primitives without justification |
| **Follow variant pattern** | New components must accept `variant` and `size` props where applicable |
| **Include accessibility** | Keyboard, screen reader, focus, contrast — from day one |
| **Include RTL** | CSS Logical Properties from day one |
| **Include test ID** | `data-testid` prop from day one |
| **Include documentation** | JSDoc + usage example in component file |

### 22.3 Adding New Tokens

If a new token is needed:

1. **Check if an existing token works.** Most needs are covered by the 25 color tokens, 10 type sizes, 9 spacing values.
2. **If truly new:** Add to the token system in `tokens.ts`. Document the usage. Update this specification.
3. **Never add tokens in component files.** Tokens live in the design system, not in components.

### 22.4 Adding New Screens

If a new screen is added:

1. **Use the Container component.** 480px max-width for consumer, responsive for research console.
2. **Use ScreenHeader.** Consistent title + optional back button.
3. **Use existing components.** Card, Button, Input, Tabs — don't reinvent.
4. **Handle all 5 states.** Loading, empty, error, no data, success (see Sections 15-17).
5. **Add to navigation.** Update ScreenMap, navigation graph, and translation keys.

### 22.5 Technical Debt Budget

| Metric | Maximum |
|--------|---------|
| Inline styles per file | 0 (except game-specific) |
| Hardcoded colors per file | 0 |
| Hardcoded spacing per file | 0 |
| TODO/FIXME comments | 0 (resolve or create issue) |
| Unused imports | 0 |

---

## 23. Definition of Done

### 23.1 Core Principle

> **Every PR must meet these standards. No exceptions. No "we'll fix it later."**
> "Later" never comes. Quality is enforced at merge time.

### 23.2 PR Checklist (Mandatory)

Every Pull Request must pass ALL of the following:

#### Design Compliance

- [ ] Uses design tokens (no hardcoded colors)
- [ ] Uses spacing tokens (no hardcoded spacing)
- [ ] Uses typography tokens (no new font sizes or weights)
- [ ] Uses border-radius tokens (no custom radius)
- [ ] Uses transition tokens (no custom durations > 300ms)
- [ ] No pure black backgrounds (`#000000`, `#050505`)
- [ ] No glass on research console surfaces
- [ ] No glow on non-primary elements
- [ ] No gradient on non-hero buttons

#### Accessibility

- [ ] Keyboard operable (Enter/Space for interactive elements)
- [ ] Focus visible (`:focus-visible` outline)
- [ ] Screen reader accessible (role, label, description where needed)
- [ ] Color contrast ≥ 4.5:1 (normal text) / ≥ 3:1 (large text)
- [ ] Touch target ≥ 44×44px
- [ ] No content loss at 200% zoom
- [ ] No fixed heights on content containers
- [ ] No overflow hidden that hides data

#### RTL

- [ ] Uses CSS Logical Properties (no `margin-left`, no `padding-right`)
- [ ] RTL tested in Arabic
- [ ] No directional assumptions in layout

#### Quality

- [ ] `pnpm lint` passes (0 warnings)
- [ ] `pnpm test` passes (all tests green)
- [ ] `pnpm build` passes (build succeeds)
- [ ] No new TypeScript errors
- [ ] No new console.error calls
- [ ] No new `any` types

#### Performance

- [ ] Bundle size impact documented (check `pnpm build` output)
- [ ] No new npm dependencies without justification
- [ ] No `backdrop-filter` without solid fallback
- [ ] No animations > 300ms (except game)
- [ ] No unnecessary re-renders

#### Documentation

- [ ] Component has JSDoc with usage example
- [ ] New translation keys added to all 3 locales (EN, TR, AR)
- [ ] New screens added to navigation graph

### 23.3 PR Size Limit

| Metric | Maximum |
|--------|---------|
| Files changed | 5 per PR |
| Lines added | 500 per PR |
| Lines removed | Unlimited |
| New components | 1 per PR |
| New screens | 1 per PR |
| New tokens | Update spec first, then implement |

### 23.4 Merge Requirements

| Requirement | Detail |
|-------------|--------|
| **All checks green** | Lint, test, build must pass |
| **Design review** | PR must be reviewed for design token compliance |
| **Accessibility review** | PR must be reviewed for keyboard/screen reader support |
| **No force merge** | Even by admins. Quality gates are non-negotiable. |

---

## 24. Implementation Priorities

### 24.1 Phase-2 Execution Order

After this document is approved, Phase-2 proceeds in this exact order:

| Step | Phase | Files | Description |
|------|-------|-------|-------------|
| 1 | **2A: Tokens** | 3-5 new/modified | Design token system, unified theme provider, reducedMotion wiring |
| 2 | **2B: Layout** | 2-3 new | Container, Stack, Grid components |
| 3 | **2C: Components** | 6-8 new | Button, Card, Input, Select, Badge, Tabs, ScreenHeader |
| 4 | **2D: Accessibility** | 5-10 modified | Focus indicators, keyboard handlers, semantic HTML, form labels |
| 5 | **2E: Home Screen** | 1-2 modified | First screen migrated to new system |
| 6 | **2F: Game UI** | 1-2 modified | Game screen migrated (minimal changes) |
| 7 | **2G: Results + Coach** | 2-3 modified | Data-rich screens migrated |
| 8 | **2H: Research Console** | 10-15 modified | Largest migration — all dashboards |
| 9 | **2I: Phone Services** | 1-2 modified | Wizard migrated |
| 10 | **2J: Remaining** | 5-8 modified | Settings, Achievements, Auth, etc. |

### 24.2 Migration Rules

1. **One screen at a time.** Never migrate 2 screens in one commit.
2. **Build must pass after every step.** `pnpm lint && pnpm test && pnpm build` green.
3. **No visual regression.** The migrated screen must look identical (or better) than before.
4. **Old tokens remain until all consumers migrate.** Don't delete tokens early.
5. **New components coexist with old.** Old inline styles remain until the screen is migrated.
6. **Backward compatibility during migration.** Current UI must stay functional throughout. No PR may break the app or disable users.

### 24.3 What "Done" Looks Like

Phase-2 is complete when:

- [ ] All 25 design tokens defined and documented
- [ ] All 15+ shared components built with variant/size props
- [ ] All 22 consumer screens migrated to design system
- [ ] All 12+ research console screens migrated
- [ ] `reducedMotion` setting works
- [ ] `highContrast` setting works
- [ ] Keyboard navigation works on all screens
- [ ] Focus indicators visible on all interactive elements
- [ ] RTL works correctly in all 3 languages
- [ ] Zero hardcoded colors remaining
- [ ] Zero inline style objects remaining (except game-specific)
- [ ] Zero `#000000` or `#050505` backgrounds
- [ ] Zero `overflow: hidden` on content containers
- [ ] Zero fixed heights on content areas
- [ ] Bundle size < 500KB (from 817KB)
- [ ] All 613 tests pass
- [ ] Lighthouse accessibility score ≥ 90

---

## Appendix A: Token Reference Card

### Colors (25 tokens per theme)

```
bg, bgSurface, bgHover, bgInput
text, textSecondary, textMuted
accent, accentLight, accentMuted
border, borderFocus
success, successMuted
warning, warningMuted
danger, dangerMuted
shadow, overlay
ring, ringFocus
```

### Typography (10 sizes × 3 properties)

```
display:   2rem / 800 / -0.02em
h1:        1.375rem / 700 / -0.01em
h2:        1.125rem / 700 / 0
body:      0.875rem / 400 / 0
body-s:    0.875rem / 600 / 0
label:     0.75rem / 600 / 0.05em
caption:   0.6875rem / 500 / 0
overline:  0.625rem / 600 / 0.1em
stat:      1.125rem / 800 / 0
score:     2rem / 800 / -0.02em
```

### Spacing (9 values on 4px grid)

```
xs: 4px    sm: 8px    md: 12px
lg: 16px   xl: 20px   2xl: 24px
3xl: 32px  4xl: 40px  5xl: 48px
```

### Border Radius (7 values)

```
xs: 4px     sm: 8px      md: 12px     lg: 16px
xl: 20px    pill: 9999px  circle: 50%
```

### Transitions (3 curves × 4 durations)

```
Curves:    standard | smooth | bounce
Durations: fast(150ms) | normal(200ms) | slow(300ms)
```

### Z-Index (9 levels)

```
base(0) | raised(10) | dropdown(100) | sticky(200) | overlay(300)
modal(400) | toast(500) | tooltip(600) | game(700)
```

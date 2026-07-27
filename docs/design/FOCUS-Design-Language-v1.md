# FOCUS Design Language Specification v1

> Version 1.0 | 2026-07-28 | Phase-1C — Design Specification & Approval Gate
>
> **Status**: Awaiting Approval
>
> This document defines the visual identity, design principles, and implementation rules for FOCUS v3.
> It is a **decision document**, not an analysis. Every section contains final decisions.
> No code changes until this document is approved by the product owner.

---

## Table of Contents

1. [Visual Identity](#1-visual-identity)
2. [Moodboard](#2-moodboard)
3. [Color Philosophy](#3-color-philosophy)
4. [Typography Philosophy](#4-typography-philosophy)
5. [Component Philosophy](#5-component-philosophy)
6. [Layout Philosophy](#6-layout-philosophy)
7. [Motion Philosophy](#7-motion-philosophy)
8. [Accessibility Target](#8-accessibility-target)
9. [RTL Philosophy](#9-rtl-philosophy)
10. [Implementation Priorities](#10-implementation-priorities)

---

## 1. Visual Identity

### 1.1 What FOCUS Is

**FOCUS is a Cognitive Intelligence Platform.**

It measures human cognitive performance — reaction time, consistency, and fatigue — through a gamified scientific protocol. It is used by researchers studying cognitive decline, and by individuals tracking their own mental sharpness.

### 1.2 What FOCUS Is NOT

- ❌ An admin dashboard
- ❌ A project management tool
- ❌ A data analytics platform (the research console is a tool, not the product)
- ❌ A social media app
- ❌ A game (the game is a measurement instrument)

### 1.3 Personality Traits

| Trait | Description | Example |
|-------|-------------|---------|
| **Scientific** | Data-driven, precise, trustworthy | Tabular numbers, exact measurements, clinical typography |
| **Premium** | High-quality, polished, intentional | Glassmorphism, smooth animations, generous whitespace |
| **Focused** | Minimal chrome, maximum concentration | The game screen has almost no UI — just the lamp |
| **Warm** | Approachable, not intimidating | AI Coach tone, achievement celebrations, friendly onboarding |
| **Accessible** | Works for everyone, everywhere | RTL support, keyboard navigation, reduced motion |

### 1.4 Design Principles

1. **Data is the hero.** Numbers, scores, and measurements should be the largest, boldest elements on every screen.
2. **Glass over flat.** Depth through transparency, not through heavy shadows.
3. **Restraint over decoration.** Every element must earn its place. If it doesn't help the user understand their cognition, remove it.
4. **Consistent, not identical.** Each screen has a purpose, but all screens share the same visual language.
5. **Accessible by default.** Not an afterthought. Built into every component from day one.

---

## 2. Moodboard

### 2.1 References

| Reference | What We Take | What We Don't Take |
|-----------|-------------|-------------------|
| **Apple Health** | Data visualization clarity, card-based layouts, ring progress indicators, warm health-app tone | The pastel palette (too soft for scientific precision), the information density (too cluttered) |
| **Linear** | Dark theme philosophy, minimal chrome, keyboard-first navigation, glassmorphism depth, speed perception | The purple-heavy palette (too branded), the developer-tools complexity |
| **Arc Browser** | Glass effects with vibrant accents, playful micro-interactions, sidebar navigation pattern, spatial awareness | The overwhelming customization options, the browser-specific patterns |
| **Notion** | Clean typography hierarchy, consistent spacing system, content-first layout, block-based composition | The light theme dominance (we're primarily dark), the infinite canvas approach |
| **Raycast** | Command palette interaction model, instant feedback, minimal UI chrome, keyboard shortcuts | The developer-tools aesthetic (too technical for consumers) |
| **Stripe Dashboard** | Data table design, financial-grade precision, professional glass cards, clear information hierarchy | The corporate color palette, the density (too much data per screen) |

### 2.2 Design DNA

```
FOCUS = Apple Health's warmth + Linear's minimalism + Arc's glass effects + Stripe's precision
```

### 2.3 Anti-Patterns (What We Reject)

- ❌ Admin dashboard aesthetics (dense tables, sidebar nav with icons-only, data overload)
- ❌ Bootstrap/Tailwind default styling (generic, no personality)
- ❌ Flat design without depth (no glass effects, no layering)
- ❌ Neon/glowing everything (restrained use of glow only for primary actions)
- ❌ Information overload per screen (one primary action per screen)
- ❌ Color without meaning (every color must convey status, category, or hierarchy)

---

## 3. Color Philosophy

### 3.1 Core Principle

> **Color is functional, not decorative.**
> Every color in FOCUS communicates: status, category, hierarchy, or theme identity.

### 3.2 Color Roles

| Role | Purpose | Usage |
|------|---------|-------|
| **Background** | The canvas | Page background, deepest layer |
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
| **Glass** | Translucent surface | Glassmorphism cards, overlays, modals |
| **Shadow** | Depth and elevation | Drop shadows, glow effects |

### 3.3 Unified Palette

The current 7 themes share identical semantic colors (danger, success, warning) and similar surface/text colors. The **only variation** is the accent color and background tint.

**Decision**: Keep 7 themes, but unify the token structure. Every theme must define the same 25 tokens.

#### Default Dark Theme (Midnight)

```
Background:      #0a0f1a
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

Glass:           rgba(255, 255, 255, 0.05)
Shadow:          rgba(0, 0, 0, 0.3)
Overlay:         rgba(0, 0, 0, 0.6)
```

#### Light Theme

```
Background:      #f8f9fa
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

Glass:           rgba(255, 255, 255, 0.7)
Shadow:          rgba(0, 0, 0, 0.08)
Overlay:         rgba(0, 0, 0, 0.3)
```

### 3.4 Research Console Colors

The research console currently uses hardcoded colors (`#12121a`, `#6366f1`, `#888`, etc.) that don't match any theme.

**Decision**: The research console will use the same theme tokens as the consumer app. The indigo accent (`#6366f1`) becomes the `accent` token for a dedicated "Research" theme or uses the current theme's accent.

### 3.5 Color Usage Rules

1. **Maximum 3 accent colors per screen.** Primary accent, plus success/warning/danger as needed.
2. **Never use color alone to convey meaning.** Always pair with icon, text, or shape.
3. **Muted variants for backgrounds only.** Never use muted colors for text on dark backgrounds (contrast failure).
4. **Glass for elevation, not color.** Depth comes from transparency + blur, not from different background colors.

---

## 4. Typography Philosophy

### 4.1 Core Principle

> **Typography is the primary information hierarchy.**
> Size, weight, and spacing — not color — should differentiate text levels.

### 4.2 Font Stack

```css
font-family: 'Inter', system-ui, -apple-system, sans-serif;
```

**Decision**: Add Inter as the primary font. It's designed for screens, has tabular numbers, and supports all 3 languages (Latin + Arabic). Falls back to system-ui if Inter fails to load.

**Rationale**: system-ui works but has no personality. Inter gives FOCUS a consistent, modern identity across platforms. It's free, open-source, and optimized for small sizes.

### 4.3 Type Scale (10 sizes)

| Token | Size | Weight | Usage |
|-------|------|--------|-------|
| `display` | 2rem (32px) | 800 | Score rings, hero numbers |
| `h1` | 1.375rem (22px) | 700 | Screen titles |
| `h2` | 1.125rem (18px) | 700 | Section headings |
| `body` | 0.875rem (14px) | 400 | Body text, descriptions |
| `body-strong` | 0.875rem (14px) | 600 | Emphasized body text |
| `label` | 0.75rem (12px) | 600 | Card labels, input labels |
| `caption` | 0.6875rem (11px) | 500 | Timestamps, footnotes, micro text |
| `overline` | 0.625rem (10px) | 600 | Section headers, overline text |
| `stat` | 1.125rem (18px) | 800 | Stat values, numbers in cards |
| `score` | 2rem (32px) | 800 | Score display, game time |

**Rationale**: 10 sizes on a near-modular scale (base 14px, ratio ~1.25). Replaces the current 37 arbitrary sizes.

### 4.4 Letter Spacing Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | -0.02em | Headlines, display text |
| `normal` | 0 | Body text |
| `wide` | 0.05em | Labels, overlines |
| `wider` | 0.1em | Section headers, uppercase labels |

### 4.5 Line Height Tokens

| Token | Value | Usage |
|-------|-------|-------|
| `tight` | 1.2 | Headlines, display text |
| `normal` | 1.5 | Body text |
| `relaxed` | 1.6 | Long-form text, AI summaries |

### 4.6 Typography Rules

1. **Tabular numbers for all numeric data.** `font-variant-numeric: tabular-nums` on every number.
2. **Uppercase for overlines only.** `text-transform: uppercase` + `letter-spacing: 0.1em` for section headers.
3. **Maximum 2 weights per element.** Regular (400) and Semibold (600) for body. Bold (700) and Extrabold (800) for headings.
4. **No italic.** Scientific platforms don't italicize. Emphasis through weight, not style.
5. **Minimum 11px.** Nothing below `caption` size. Print center QR labels are an exception.

---

## 5. Component Philosophy

### 5.1 Core Principle

> **Components are building blocks, not pages.**
> Each component does one thing well. Composition creates pages.

### 5.2 Component Inventory

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
| **Card** | Glassmorphism container | `glass`, `solid`, `elevated`, `interactive` |
| **Card.Header** | Card header with title + action | — |
| **Card.Body** | Card content area | — |
| **Card.Footer** | Card footer with actions | — |
| **Surface** | Background surface | `base`, `raised`, `overlay` |

#### Input Components (Phase-2B)

| Component | Description | Variants |
|-----------|-------------|----------|
| **Button** | Action trigger | `primary`, `secondary`, `ghost`, `danger` × `sm`, `md`, `lg` |
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

### 5.3 Component Rules

1. **Every component accepts `className` and `style` overrides.** For escape hatches.
2. **Every interactive component uses `forwardRef`.** For focus management and testing.
3. **Every component supports `data-testid`.** For test selectors.
4. **No component hardcodes colors.** All colors come from theme tokens via `useThemeColors()`.
5. **No component hardcodes spacing.** All spacing uses spacing tokens.
6. **Composition over configuration.** Prefer `Card.Header` + `Card.Body` over a single `Card` with 10 props.

### 5.4 Card Design (The Core Element)

The card is the most used component in FOCUS. Every screen uses cards.

```
Card (glass variant):
  background: glass
  border: 1px solid border
  border-radius: 20px
  padding: 1.25rem
  backdrop-filter: blur(20px)

Card:hover (interactive variant):
  border-color: accent (muted)
  transform: translateY(-1px)
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1)
```

### 5.5 Button Design

```
Button (primary):
  background: linear-gradient(135deg, accent, accentLight)
  color: #ffffff
  border-radius: 16px
  font-weight: 600
  box-shadow: 0 4px 16px accentMuted
  transition: all 0.2s cubic-bezier(0.22, 1, 0.36, 1)

Button:hover (primary):
  transform: translateY(-1px)
  box-shadow: 0 8px 24px accentMuted

Button:active (primary):
  transform: translateY(0)

Button (secondary):
  background: glass
  border: 1px solid border
  backdrop-filter: blur(12px)

Button (ghost):
  background: transparent
  color: textSecondary

Button (danger):
  background: danger
  color: #ffffff
```

### 5.6 Game UI

The game screen is sacred. It must remain minimal.

```
Game Screen Rules:
- No borders, no cards, no chrome
- Background: theme bg (solid, no glass)
- HUD: glass pills, minimal, top corners
- Game element (lamp): centered, glowing, animated
- Hit feedback: glass pill, center, temporary
- No navigation during game
- No settings during game
- Full concentration mode
```

### 5.7 Phone Services

Phone Services is a guided wizard, not a dashboard.

```
Phone Services Rules:
- Stepper progress at top (thin line, accent fill)
- One question per screen
- Pill selectors for options
- Price estimation in accent-tinted card
- Back/Next navigation at bottom
- Success state with checkmark animation
```

---

## 6. Layout Philosophy

### 6.1 Core Principle

> **Mobile-first, centered, consistent.**
> Every consumer screen is a 480px column. The research console is a desktop tool.

### 6.2 Grid System

#### Consumer Screens (22 screens)

```
Container:
  max-width: 480px
  margin: 0 auto
  padding: 0 1.25rem (20px)
  min-height: 100dvh

Inner spacing:
  gap: 1.25rem (20px) between sections
  gap: 0.75rem (12px) between items within a section
```

#### Research Console

```
Desktop (≥768px):
  Sidebar: 240px (expanded) / 60px (collapsed)
  Content: flex-1, padding 1.5rem

Mobile (<768px):
  Sidebar: 260px drawer with overlay
  Content: full width, padding 1rem
  Header: fixed top bar with hamburger
```

### 6.3 Breakpoints

| Token | Min-width | Usage |
|-------|-----------|-------|
| `mobile` | 0px | Default (consumer screens) |
| `tablet` | 768px | Research console sidebar toggle |
| `desktop` | 1024px | Research console expanded sidebar |
| `wide` | 1280px | Research console wide content |

**Decision**: Consumer screens don't need breakpoints. They're always 480px. Only the research console adapts.

### 6.4 Spacing Scale (8px grid)

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

**Decision**: All spacing values must be multiples of 4px. The core scale is 4/8/12/16/20/24/32/40/48.

### 6.5 Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `xs` | 4px | Badges, small elements |
| `sm` | 8px | Inputs, small buttons |
| `md` | 12px | Default card radius |
| `lg` | 16px | Buttons, medium cards |
| `xl` | 20px | Large cards, modals |
| `2xl` | 24px | Hero elements, CTAs |
| `pill` | 9999px | Pills, badges, tags |
| `circle` | 50% | Circular elements |

### 6.6 Z-Index Scale

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

### 6.7 Layout Rules

1. **One primary action per screen.** Home = Start button. Results = Save. Game = Tap lamp.
2. **Generous whitespace.** Minimum 16px between any two elements.
3. **No edge-to-edge content.** Always 20px horizontal padding.
4. **Cards don't touch edges.** Minimum 16px from screen edge to card.
5. **Fixed header heights.** 56px for mobile headers, 64px for desktop.

---

## 7. Motion Philosophy

### 7.1 Core Principle

> **Motion communicates state change, not decoration.**
> Every animation must answer: "What changed?" If nothing changed, don't animate.

### 7.2 Easing Curves

| Token | Value | Usage |
|-------|-------|-------|
| `standard` | `cubic-bezier(0.4, 0, 0.2, 1)` | Default interaction (buttons, inputs) |
| `smooth` | `cubic-bezier(0.22, 1, 0.36, 1)` | Page transitions, progress, reveals |
| `bounce` | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Celebrations, achievements |

### 7.3 Duration Scale

| Token | Value | Usage |
|-------|-------|-------|
| `instant` | 100ms | Background color changes |
| `fast` | 150ms | Input focus, button press |
| `normal` | 200ms | Button transitions, hover states |
| `slow` | 300ms | Card hover, page transitions |
| `slower` | 500ms | Progress rings, reveals |

### 7.4 Motion Tokens

| Token | Properties |
|-------|-----------|
| `hover` | `transform: translateY(-1px); transition: transform 0.2s smooth` |
| `press` | `transform: translateY(0); transition: transform 0.1s standard` |
| `focus` | `outline: 2px solid accent; outline-offset: 2px` |
| `page-enter` | `opacity: 0 → 1; transform: translateY(8px) → 0; 0.3s smooth` |
| `page-exit` | `opacity: 1 → 0; 0.2s standard` |
| `scale-in` | `transform: scale(0.95) → 1; opacity: 0 → 1; 0.2s smooth` |
| `slide-up` | `transform: translateY(16px) → 0; opacity: 0 → 1; 0.3s smooth` |

### 7.5 Game-Specific Motion

The game has its own motion language — more dramatic, more feedback-heavy.

| Animation | Duration | Easing | Purpose |
|-----------|----------|--------|---------|
| `lampAppear` | 200ms | bounce | New lamp appears |
| `lampPulse` | 1500ms | ease-in-out (infinite) | Lamp breathing |
| `lampShatter` | 500ms | standard | Lamp destroyed on hit |
| `rtPop` | 300ms | bounce | Reaction time display |
| `bestPulse` | 400ms | standard | New best time celebration |
| `crackSpread` | 500ms | standard | SVG crack lines |
| `shardFly` | 500ms | standard | Particle effects |

### 7.6 Reduced Motion

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

### 7.7 Motion Rules

1. **No animation on page load.** Content appears immediately. Animations are for state changes only.
2. **Maximum 3 concurrent animations.** No screen should have more than 3 things animating at once.
3. **Stagger only for lists.** Achievement badges, stat cards, session lists — 50ms delay per item, max 8 items.
4. **No infinite animations except game.** The lamp pulse is the only infinite animation. Everything else must end.
5. **No animation on text.** Text fades in with its container. Never animate text color, size, or position independently.

---

## 8. Accessibility Target

### 8.1 Core Principle

> **Accessibility is not a feature. It's a requirement.**
> WCAG AA compliance is the minimum. Keyboard-first is the default.

### 8.2 WCAG 2.1 AA Compliance

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

### 8.3 Keyboard-First Design

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

### 8.4 Focus Management Rules

1. **Focus visible always.** `outline: 2px solid accent; outline-offset: 2px` on `:focus-visible`.
2. **Focus restored after modal.** When a modal closes, focus returns to the triggering element.
3. **Focus moved after navigation.** When a new screen loads, focus moves to the screen title.
4. **Focus trapped in modals.** Tab cycles through focusable elements inside the modal only.
5. **No focus on disabled elements.** `tabIndex={-1}` for disabled buttons/inputs.

### 8.5 Screen Reader Support

| Pattern | Implementation |
|---------|---------------|
| Page titles | `<h1>` on every screen, unique per screen |
| Landmarks | `<main>` for content, `<nav>` for navigation only |
| Live regions | `aria-live="polite"` for score updates, `aria-live="assertive"` for errors |
| Descriptions | `aria-describedby` for complex inputs |
| Hidden decorative | `aria-hidden="true"` for decorative SVGs and emoji |

### 8.6 High Contrast Mode

When `settings.highContrast = true` OR `prefers-contrast: more`:

```
Borders: 2px solid (instead of 1px)
Text: increased weight (+100)
Accent: brighter variant
Background: deeper dark
Glass: reduced transparency (more opaque)
Focus ring: 3px solid (instead of 2px)
```

### 8.7 Accessibility Checklist (Per Component)

Every component must pass:

- [ ] Keyboard operable (Enter/Space for interactive)
- [ ] Focus visible (`:focus-visible` outline)
- [ ] Screen reader accessible (role, label, description)
- [ ] Color contrast ≥ 4.5:1
- [ ] Reduced motion respected
- [ ] Touch target ≥ 44×44px
- [ ] No content loss at 200% zoom

---

## 9. RTL Philosophy

### 9.1 Core Principle

> **RTL is not "flip everything."**
> RTL is a layout direction, not a mirror. Some things flip, some don't.

### 9.2 What Flips in RTL

| Element | LTR | RTL |
|---------|-----|-----|
| Text alignment | Left | Right |
| Horizontal padding | `paddingLeft` / `paddingRight` | Flipped |
| Margins | `marginLeft` / `marginRight` | Flipped |
| Flex direction | `row` | `row-reverse` (for icon+text) |
| Icons with text | Icon left of text | Icon right of text |
| Back arrow | ← | → |
| Navigation items | Left-aligned | Right-aligned |
| Sidebar | Left side | Right side |
| Progress bars | Fill left-to-right | Fill right-to-left |
| Charts (bar) | Bars grow right | Bars grow left |
| Tables | Text left | Text right |

### 9.3 What Does NOT Flip in RTL

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

### 9.4 Layout Behavior

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
  Button gradients: unchanged
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

### 9.5 Implementation Approach

1. **CSS Logical Properties.** Use `margin-inline-start` instead of `margin-left`. Use `padding-inline-end` instead of `padding-right`. This handles RTL automatically.
2. **`dir="rtl"` on `<html>`.** The entire app flips with one attribute.
3. **No hardcoded left/right.** Every `marginLeft` must become `marginInlineStart`. Every `paddingRight` must become `paddingInlineEnd`.
4. **Exception: game coordinates.** Game lamp positions use percentage-based absolute positioning. These don't flip — the lamp appears at the same visual position regardless of direction.

### 9.6 RTL Testing Checklist

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

## 10. Implementation Priorities

### 10.1 Phase-2 Execution Order

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

### 10.2 Migration Rules

1. **One screen at a time.** Never migrate 2 screens in one commit.
2. **Build must pass after every step.** `pnpm lint && pnpm test && pnpm build` green.
3. **No visual regression.** The migrated screen must look identical (or better) than before.
4. **Old tokens remain until all consumers migrate.** Don't delete tokens early.
5. **New components coexist with old.** Old inline styles remain until the screen is migrated.

### 10.3 What "Done" Looks Like

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
glass, shadow, overlay
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

### Border Radius (8 values)

```
xs: 4px     sm: 8px      md: 12px     lg: 16px
xl: 20px    2xl: 24px    pill: 9999px  circle: 50%
```

### Transitions (3 curves × 4 durations)

```
Curves:   standard | smooth | bounce
Durations: fast(150ms) | normal(200ms) | slow(300ms) | slower(500ms)
```

### Z-Index (9 levels)

```
base(0) | raised(10) | dropdown(100) | sticky(200) | overlay(300)
modal(400) | toast(500) | tooltip(600) | game(700)
```

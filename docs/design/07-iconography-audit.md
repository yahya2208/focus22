# 07 — Iconography Audit

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Icon Libraries

**None installed.** No lucide-react, heroicons, react-icons, @phosphor-icons, tabler-icons, or material-icons in `package.json`.

## 2. Icon Inventory

### Inline SVGs (15 total)

| Component | File | SVG Purpose | Accessible? |
|-----------|------|-------------|-------------|
| ProgressRing | `ProgressRing.tsx:36` | Circular progress | ✅ `aria-valuenow/min/max` |
| BarChart | `Charts.tsx:17` | Bar chart | ✅ `role="img"` + `aria-label` |
| LineChart | `Charts.tsx:78` | Line chart | ✅ `role="img"` + `aria-label` |
| PieChart | `Charts.tsx:115` | Pie chart | ✅ `role="img"` + `aria-label` |
| Histogram | `Charts.tsx:174` | Histogram | ✅ `role="img"` + `aria-label` |
| HeatmapChart | `HeatmapChart.tsx:28` | Heatmap grid | ❌ No |
| Download icon | `QRDesigner.tsx:599` | Download button | ❌ No (has `aria-label` on parent) |
| Upload icon | `QRDesigner.tsx:616` | Upload button | ❌ No (has `aria-label` on parent) |
| Session sparkline | `SessionsDashboard.tsx:185` | Sparkline | ❌ No |
| Countdown ring | `CountdownScreen.tsx:44` | Countdown timer | ✅ `role="timer"` + `aria-live` |
| Game crosshair | `GameScreen.tsx:398` | Crosshair target | ❌ No (game element) |
| Home progress | `HomeScreen.tsx:52` | Progress ring | ✅ `aria-label` on parent |
| Results progress | `ResultsScreen.tsx:76` | Progress ring | ✅ `aria-label` on parent |
| QR download | `QRDesigner.tsx:599` | Download button | ❌ No |
| QR upload | `QRDesigner.tsx:616` | Upload button | ❌ No |

**Accessible**: 8/15 (53%)

### Emoji (10 instances)

| Emoji | Usage | Files | Accessible? |
|-------|-------|-------|-------------|
| 🟢 | "Buy New" | HomeScreen, PhoneServicesScreen | ❌ No `aria-label` |
| 🔵 | "Buy Used" | HomeScreen, PhoneServicesScreen | ❌ No `aria-label` |
| 🟠 | "Sell" | HomeScreen, PhoneServicesScreen | ❌ No `aria-label` |
| 🟣 | "Exchange" | HomeScreen, PhoneServicesScreen | ❌ No `aria-label` |

**Accessible**: 0/10 (0%)

## 3. Icon Usage Summary

| Type | Count | Accessible |
|------|-------|------------|
| Inline SVGs | 15 | 8 (53%) |
| Emoji | 10 | 0 (0%) |
| Library icons | 0 | N/A |
| **Total** | **25** | **8 (32%)** |

## 4. Icon Style

- **No consistent icon size** — SVGs are ad-hoc dimensions
- **No consistent icon color** — each SVG uses its own `fill`/`stroke`
- **No icon components** — SVGs are inline in render functions
- **No icon tokens** — no size, color, or weight system

## 5. Assessment

| Metric | Value |
|--------|-------|
| Icon library | None |
| Total icon usages | 25 |
| Accessible icons | 32% |
| Consistent sizing | No |
| Consistent coloring | No |
| Icon components | No |

## 6. Phase-2 Implications

1. **Install an icon library** (lucide-react recommended — lightweight, consistent)
2. **Replace inline SVGs** with library icons where possible
3. **Keep data visualization SVGs** (charts, progress rings) — these are custom
4. **Add `aria-hidden="true"`** to decorative emoji or replace with icon components
5. **Create icon tokens**: size (sm/md/lg), color (inherit/primary/secondary/muted)

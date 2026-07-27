# 05 — Animation & Transition System

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Transition Values (27 occurrences)

| Transition | Count | Files |
|------------|-------|-------|
| `all 0.2s ease` | 3 | Button, Settings, various |
| `all 0.15s` | 3 | Input fields, buttons |
| `all 0.2s cubic-bezier(0.22, 1, 0.36, 1)` | 2 | Smooth transitions |
| `stroke-dashoffset 0.8s cubic-bezier(0.22, 1, 0.36, 1)` | 2 | Progress rings |
| `background 0.1s` | 2 | Hover states |
| `width 0.3s` | 2 | Progress bars |
| `stroke-dashoffset 0.5s ease` | 1 | ProgressRing default |
| `stroke-dashoffset 0.3s ease-out` | 1 | Calibration progress |
| `width 0.6s cubic-bezier(0.22,1,0.36,1)` | 1 | Achievement bars |
| `width 0.5s ease` | 1 | FunnelChart |
| `width 0.2s` | 1 | Width transition |
| `width 0.1s` | 1 | Fast width |
| `transform 0.1s` | 1 | Fast transform |
| `background 0.3s ease` | 1 | Background transition |
| `box-shadow 0.3s ease` | 1 | Card hover |

## 2. Keyframe Animations

| Animation | File | Purpose |
|-----------|------|---------|
| `spin` | `Button.tsx:94` | Loading spinner (`0.6s linear infinite`) |
| `badgePop` | `AchievementsScreen.tsx:10` | Achievement badge reveal |
| `shimmer` | `AchievementsScreen.tsx:11` | Achievement shimmer effect |

## 3. Easing Curves

| Curve | Value | Usage |
|-------|-------|-------|
| Standard | `cubic-bezier(0.4, 0, 0.2, 1)` | Material Design default (buttons, inputs) |
| Smooth/decelerate | `cubic-bezier(0.22, 1, 0.36, 1)` | Progress rings, achievement bars, page transitions |
| Bounce/overshoot | `cubic-bezier(0.34, 1.56, 0.64, 1)` | Rare (playful elements) |
| `ease` | Browser default | Fallback in many transitions |
| `ease-out` | Browser default | Calibration progress |
| `linear` | Browser default | Loading spinner |

## 4. Duration Scale

| Duration | Category | Usage |
|----------|----------|-------|
| 0.1s | Instant | Background hover, fast width |
| 0.15s | Fast | Input focus, button press |
| 0.2s | Normal | Button transitions, transforms |
| 0.3s | Medium | Card hover, box-shadow, width |
| 0.5s | Slow | Progress rings, page transitions |
| 0.6s | Slower | Loading spinner, achievement bars |
| 0.8s | Slowest | Progress ring (smooth) |

## 5. Motion Sensitivity

### App Setting
- `settings.reducedMotion` — exists in Settings UI with toggle
- **NOT consumed by any component** — animations run unconditionally

### CSS Media Query
- `prefers-reduced-motion` — **0 usages** (no CSS files)

### Affected Animations

| Animation | Impact | Can be disabled? |
|-----------|--------|-----------------|
| Button spin | Low | No |
| Progress ring stroke | Medium | No |
| Card box-shadow | Low | No |
| Achievement badge pop | Medium | No |
| Achievement shimmer | Medium | No |
| FunnelChart width | Low | No |
| ResearchLayout sidebar | Low | No |
| Game screen transitions | High | No |

## 6. Assessment

| Metric | Value |
|--------|-------|
| Unique transitions | 15 |
| Unique keyframes | 3 |
| Unique easing curves | 3 |
| Reduced motion support | **No** (setting exists, unused) |
| Consistent duration scale | **No** — ad-hoc values |
| Consistent easing | **Partial** — two main curves used |

## 7. Phase-2 Implications

1. **Create animation tokens**: `duration.fast/normal/slow`, `easing.standard/smooth/bounce`
2. **Wire up `reducedMotion`** — the UI toggle exists, just needs consumption
3. **Reduce transition variety** — 15 unique values → 3-4 tokenized curves
4. **Keep the two main easing curves** — they work well for the aesthetic

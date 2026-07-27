# 09 — Component Variants & Patterns

> Generated 2026-07-28 | Phase-1B Audit | FOCUS v3

---

## 1. Components with Variant/Size Props

| Component | Variant Prop | Size Prop | File |
|-----------|-------------|-----------|------|
| `Button` | `primary \| secondary \| danger \| ghost` | `sm \| md \| lg \| xl` | `Button.tsx` |

**Only 1 of 5 shared components has a variant system.**

## 2. Component Inventory

### Shared Components (5)

| Component | Props | Variants | Sizes | forwardRef | memo |
|-----------|-------|----------|-------|------------|------|
| `Button` | variant, size, loading, disabled, onClick, children | 4 | 4 | ❌ | ❌ |
| `Card` | children, style | 0 | 0 | ❌ | ❌ |
| `ProgressRing` | progress, size, strokeWidth, color | 0 | 1 (size) | ❌ | ❌ |
| `ProtectedRoute` | allowedRoles | 0 | 0 | ❌ | ❌ |
| `HomeMenu` | none | 0 | 0 | ❌ | ❌ |

### Design System Components (3)

| Component | Purpose |
|-----------|---------|
| `ThemeProvider` | Theme context + provider |
| `useTheme` | Theme hook (context-based) |
| `ThemeId` type | Type union for theme IDs |

### Screen Components (22)

All screens are self-contained — no shared layout components, no shared header/footer patterns.

### Research Console Components (12+)

| Component | Purpose |
|-----------|---------|
| `ResearchLayout` | Sidebar + main content layout |
| `ResearchConsole` | Route management |
| `DevicesDashboard` | Device analytics |
| `LiveDashboard` | Real-time data |
| `OverviewDashboard` | Overview stats |
| `ScientificDashboard` | Scientific data |
| `SessionsDashboard` | Session analytics |
| `SurveysDashboard` | Survey data |
| `SystemDashboard` | System health |
| `UsersDashboard` | User analytics |
| `AcquisitionDashboard` | Acquisition funnel |
| `CampaignsDashboard` | Campaign management |
| `CampaignDetailView` | Campaign detail |
| `CampaignAnalytics` | Campaign analytics |
| `CampaignWizard` | Campaign creation |
| `PrintCenter` | QR printing |
| `QRDesigner` | QR customization |

## 3. Style Duplication Analysis

### Identical Card Container (30+ instances)

```typescript
{
  background: '#12121a',
  border: '1px solid #1e1e2e',
  borderRadius: '12px',
  padding: '1rem'
}
```

Found in every research console dashboard page. Should be a `Card` component with theme tokens.

### Identical Button Styles (4+ instances)

```typescript
{
  background: '#6366f1',
  color: '#fff',
  border: 'none',
  borderRadius: '8px',
  padding: '0.5rem 1rem',
  cursor: 'pointer',
  fontSize: '0.85rem',
  fontWeight: '600'
}
```

Found in CampaignsDashboard, CampaignWizard, PrintCenter, QRDesigner. Should use `Button` component.

### Identical Input Styles (2+ instances)

```typescript
{
  width: '100%',
  padding: '0.5rem 0.75rem',
  background: '#1e1e2e',
  border: '1px solid #333',
  borderRadius: '8px',
  color: '#f0f0f0',
  fontSize: '0.85rem',
  outline: 'none'
}
```

Found in CampaignWizard, QRDesigner. Should be a shared `Input` component.

## 4. Missing Component Patterns

| Pattern | Status | Recommendation |
|---------|--------|----------------|
| `Input` | ❌ Missing | Create with label, error, helper text |
| `Select` | ❌ Missing | Create with consistent styling |
| `Modal` | ❌ Missing | Create with focus trapping |
| `Badge` | ❌ Missing | Create with variant (success/warning/danger/info) |
| `Tabs` | ❌ Missing | Create with accessible tablist pattern |
| `Tooltip` | ❌ Missing | Create with aria-describedby |
| `Container` | ❌ Missing | Create with 480px max-width default |
| `ScreenHeader` | ❌ Missing | Create with title + optional back button |
| `EmptyState` | ❌ Missing | Create with icon + message + action |
| `LoadingState` | ❌ Missing | Create with spinner + message |

## 5. Component API Issues

| Issue | Count | Example |
|-------|-------|---------|
| No `forwardRef` | 5/5 | Button, Card, ProgressRing |
| No `className` prop | 5/5 | Can't apply external styles |
| No `as` prop | 5/5 | Can't render as different element |
| No `data-testid` | 5/5 | Can't target in tests |
| No `id` prop forwarding | 5/5 | Can't link to labels |

## 6. Phase-2 Implications

1. **Create missing shared components**: Input, Select, Modal, Badge, Tabs, Tooltip
2. **Add variant/size props** to all shared components
3. **Add `forwardRef`** to all shared components
4. **Extract duplicated styles** into shared component variants
5. **Replace 30+ inline card containers** with `Card` component using theme tokens
6. **Replace 4+ inline button styles** with `Button` component

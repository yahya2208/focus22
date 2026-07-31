# Coding Guidelines

These rules must be followed by all contributors to maintain consistency, quality, and performance.

## 1. TypeScript First

- All files must be `.ts` or `.tsx` (never `.js` or `.jsx`)
- Define interfaces for all data structures; prefer `interface` over `type` for object shapes
- Use `readonly` for immutable properties on interfaces
- Avoid `any` — use `unknown` when the type is not known
- Use strict null checks — no implicit `undefined`

```typescript
// Good
interface UserProfile {
  readonly id: string;
  readonly displayName: string | null;
}

// Bad
type UserProfile = {
  id: string;
  displayName: any;
}
```

## 2. Internationalization (i18n)

- **Every user-facing string** must use the `t()` function from `useTranslation()`
- Never hardcode strings in JSX, including punctuation
- Add new keys to `src/i18n/translations/ar.ts`, `en.ts`, `tr.ts`, `fr.ts`
- Use descriptive key paths: `'repair.status.pending'`, `'game.results.grade'`

```typescript
// Good
const { t } = useTranslation();
return <div>{t('repair.request.submit')}</div>;

// Bad
return <div>إرسال طلب التصليح</div>;
```

## 3. Theme Colors — No Hardcoded Colors

- All colors must come from `useThemeColors()` hook
- The only exception is `canvas` elements which may use literal color values
- Use semantic color names: `colors.text`, `colors.accent`, `colors.bgCard`, `colors.border`, `colors.success`/`danger`/`warning`/`info`

```typescript
// Good
const colors = useThemeColors();
return <div style={{ color: colors.text, background: colors.bg }} />;

// Bad
return <div style={{ color: '#333', background: '#fff' }} />;
```

## 4. React.memo for Components

- Wrap all non-trivial components with `React.memo()`
- Especially important for list items, cards, and components that receive object props
- Use `useMemo` for expensive computations

```typescript
// Good
export const ProductCard = React.memo(function ProductCard({ product }: Props) {
  return <div>{product.name}</div>;
});
```

## 5. CSS Grid for Layouts

- Use `display: 'grid'` with `gridTemplateColumns` for grid layouts
- Use `flex` for linear arrangements (rows/columns)
- Avoid complex float or positioning-based layouts

```typescript
// Good
<div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
```

## 6. mm for Print Dimensions

- When specifying print-related dimensions, use `mm` units
- Sticker layouts and print previews must use millimeter values

## 7. No console.log in Production

- All `console.log` must be guarded with `if (import.meta.env.DEV)`
- `console.warn` and `console.error` are allowed for error states but should be minimized
- Telemetry should use the `getGlobalTelemetry().track()` system, not console

```typescript
// Good
if (import.meta.env.DEV) console.log('[CatalogService] index rebuilt');

// Bad
console.log('Index rebuilt');
```

## 8. Clean Up Intervals/Listeners in useEffect

- Every `setInterval`, `addEventListener`, and `subscribe()` call must be cleaned up
- Return a cleanup function from `useEffect`
- Use `useRef` for mutable values that the cleanup needs to access

```typescript
// Good
useEffect(() => {
  const timer = setInterval(tick, 1000);
  window.addEventListener('resize', handleResize);
  return () => {
    clearInterval(timer);
    window.removeEventListener('resize', handleResize);
  };
}, []);
```

## 9. Composition Over Large Components

- If a component exceeds ~200 lines, split it into smaller sub-components
- Extract reusable UI patterns into `components/shared/`
- Screens should compose components, not contain complex logic
- Services and business logic belong in `services/` or `core/`, not in components

## 10. Service Pattern

- Services are pure TypeScript modules with zero React imports
- Services export functions or objects, not classes (prefer functional where possible)
- Data access is abstracted behind service interfaces
- Services handle their own localStorage read/write

```typescript
// Good
export const InventoryService = {
  addStock(brand, model, variant, qty): InventoryRecord { ... },
  getAll(): InventoryRecord[] { ... },
};

// Avoid class services unless stateful
```

## 11. File Organization

- One component per file (except small utilities)
- Co-locate styles with the component (inline styles in the component file)
- Co-locate tests in `__tests__/` directories adjacent to source
- Index files re-export public API

## 12. Import Order

Group imports in this order, separated by blank lines:

1. React/third-party libraries
2. Core modules (`core/`)
3. Services (`services/`)
4. Components (`components/`)
5. Screens (`screens/`)
6. Store/hooks
7. Types
8. Assets/JSON

## 13. Naming Conventions

- **Components**: PascalCase, descriptive (`CatalogInventoryScreen`, `RepairRequestForm`)
- **Files**: kebab-case for directories, PascalCase for component files
- **Functions**: camelCase, verb-prefixed (`createSession`, `loadInventory`)
- **Services**: Noun-based object (`PriceMemory`, `InventoryService`, `PhonePopularity`)
- **Types/Interfaces**: PascalCase, prefixed for clarity (`CatalogBrand`, `RepairRequest`, `LiveSession`)

## 14. Avoid Dead Code

- Remove unused imports
- Remove commented-out code (we have git history)
- Remove unused functions
- Run the linter before committing: `pnpm lint`

## 15. Type Safety for Events

When publishing or subscribing to domain events, use typed payloads:

```typescript
publisher.publish<SessionCreatedPayload>('session_created', {
  sessionId,
  gameMode: params.gameMode,
  campaignId: params.campaignId,
  createdAt: now,
}, 'session-service');
```

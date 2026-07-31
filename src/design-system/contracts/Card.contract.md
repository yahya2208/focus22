# Card Component Contract

## Props
| Prop      | Type                                                           | Default     | Description                     |
|-----------|----------------------------------------------------------------|-------------|---------------------------------|
| variant   | `'surface' \| 'glass' \| 'outlined' \| 'elevated' \| 'interactive'` | `'surface'` | Visual container variant        |
| padding   | `SpacingToken \| string`                                       | `'lg'`      | Inner padding                   |
| shadow    | `ShadowToken \| string`                                        | —           | Custom shadow override          |
| radius    | `string`                                                       | —           | Custom radius override          |
| hoverable | `boolean`                                                      | `false`     | Enables hover lift effect       |
| onClick   | `() => void`                                                   | —           | Makes card clickable            |
| children  | `ReactNode`                                                    | —           | Card content                    |

## Variants
- `surface` — Surface background, default border
- `glass` — Glass/transparent with backdrop blur
- `outlined` — Transparent background, subtle border
- `elevated` — Surface background, no border, elevation shadow
- `interactive` — Hover state by default with lift + shadow

## States
- **Normal** — Recipe provides background, border, padding, radius
- **Hover** — `hoverable` or `interactive`: lift transform + shadow change
- **Focus** — Native div focus handled via `tabIndex` when clickable

## Accessibility
- When `onClick` provided: `role="button"`, `tabIndex={0}`, keyboard handler
- `onKeyDown` handles `Enter`/`Space`

## RTL
- No RTL-specific styling needed (padding is symmetrical)

## Examples
```tsx
// Basic surface card
<Card variant="surface">Content</Card>

// Clickable glass card
<Card variant="glass" hoverable onClick={handleSelect}>Select me</Card>

// Elevated card with custom shadow
<Card variant="elevated" shadow="lg">Featured content</Card>
```

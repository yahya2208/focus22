# Input Component Contract

## Props
| Prop     | Type                         | Default   | Description                   |
|----------|------------------------------|-----------|-------------------------------|
| radius   | `RadiusToken \| string`      | `'md'`    | Border radius                 |
| error    | `boolean`                    | `false`   | Shows error border color      |
| ...rest  | `InputHTMLAttributes`        | —         | Native HTML input attributes  |

## States
- **Normal** — `InputRecipe` provides background, border, text color
- **Focus** — Focus ring (2px border + offset), border changes to `focusRing`
- **Error** — Red border via `status.error`
- **Disabled** — Opacity 0.5, `not-allowed` cursor

## Accessibility
- Native `<input>` element
- Placeholder inherits `placeholderColor` from recipe
- Error state visual only (use `aria-invalid` for screen readers)

## RTL
- Inherits direction from parent
- Padding is symmetrical

## Keyboard
- Standard input keyboard interaction
- Focus ring on `Tab`

## Examples
```tsx
// Default
<Input placeholder="Enter name" />

// With error
<Input error placeholder="Required" aria-invalid="true" />

// Disabled
<Input disabled value="Read only" />
```

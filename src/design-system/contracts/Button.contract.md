# Button Component Contract

## Props
| Prop         | Type                                                   | Default     | Description                    |
|-------------|--------------------------------------------------------|-------------|--------------------------------|
| variant     | `'primary' \| 'secondary' \| 'ghost' \| 'outline' \| 'danger' \| 'success' \| 'warning' \| 'link'` | `'primary'` | Visual style variant           |
| size        | `'xs' \| 'sm' \| 'md' \| 'lg' \| 'xl'`                | `'md'`      | Size preset                    |
| loading     | `boolean`                                              | `false`     | Shows spinner, disables click  |
| fullWidth   | `boolean`                                              | `false`     | Stretches to container width   |
| icon        | `ReactNode`                                            | —           | Icon element                   |
| iconPosition| `'left' \| 'right'`                                    | `'left'`    | Icon side relative to text     |
| disabled    | `boolean`                                              | —           | Native disabled attribute      |
| children    | `ReactNode`                                            | —           | Button label                   |
| ...rest     | `ButtonHTMLAttributes`                                 | —           | Native HTML button attrs       |

## Variants
- `primary` — Solid accent background, inverse text
- `secondary` — Surface background, default border
- `ghost` — Transparent background, secondary text
- `outline` — Transparent, accent border + text
- `danger` — Error background
- `success` — Success background
- `warning` — Warning background
- `link` — No border/background, accent text, underlined

## Sizes
- `xs` — 32px height
- `sm` — 36px
- `md` — 44px (default)
- `lg` — 48px
- `xl` — 56px

## States
- **Normal** — Uses `ButtonRecipe` for variant colors
- **Hover** — Recipe provides `hoverBg` + `hoverBorder`
- **Focus** — `2px solid focusRing` outline + 2px offset
- **Active** — Inherits hover background
- **Disabled** — Opacity 0.5, `not-allowed` cursor, no hover effects
- **Loading** — Spinner replaces icon, `aria-busy="true"`, clicks disabled

## Accessibility
- Native `<button>` element
- `aria-busy="true"` when loading
- `disabled` attribute when disabled/loading
- Focus visible ring via `onFocus`/`onBlur`
- Inherits font family

## RTL
- No RTL-specific logic needed (gap + padding-inline handles direction)
- `iconPosition` respects layout direction

## Keyboard
- `Enter`/`Space` triggers click (native button behavior)
- `Tab` reaches button (when not disabled)

## Examples
```tsx
// Primary action
<Button variant="primary" onClick={handleSave}>Save</Button>

// With icon and loading
<Button variant="secondary" icon={<SearchIcon />} loading>Searching...</Button>

// Full-width ghost button
<Button variant="ghost" fullWidth>Cancel</Button>
```

# State Management

FOCUS uses a **React Context + useReducer** pattern. There is no external state management library (no Redux, no Zustand, no Jotai).

## Architecture

### 1. Global Navigation State (`src/store/navigation.tsx`)

The only globally-shared state is the app navigation and session flow state.

```typescript
interface AppState {
  screen: ScreenName;              // current screen name
  currentScreen: ScreenName;       // duplicate of screen (for compatibility)
  selectedGame: string | null;     // selected game mode
  calibrationProfile: CalibrationProfile | null;  // device calibration
  currentSession: {                // active game session
    id: string;
    gameMode: string;
  } | null;
  results: {                       // latest game results
    rawRts: readonly number[];
    correctedRts: readonly number[];
    calibration: CalibrationProfile;
    totalRounds: number;
    validRounds: number;
    sessionStart?: number;
    sessionEnd?: number;
  } | null;
  sessions: SessionRecord[];       // session history (in-memory only)
  isQrFlow: boolean;               // QR campaign flow active
  campaignId: string | null;       // active campaign
}
```

**Actions:**

| Action | Effect |
|--------|--------|
| `NAVIGATE` | Sets `screen` and `currentScreen` to target |
| `SELECT_GAME` | Sets `selectedGame` |
| `SET_CALIBRATION` | Stores calibration profile |
| `SET_RESULTS` | Stores game results |
| `START_SESSION` | Creates `currentSession` with id + gameMode |
| `SAVE_SESSION` | Pushes current results to `sessions[]` |
| `SESSION_SAVED` | Clears `currentSession` |
| `RESET` | Returns to `initialState` |
| `START_QR_FLOW` | Resets, sets `isQrFlow: true`, navigates to `game-intro` |

**Provider/Consumer:**

```typescript
// Provider — wraps the entire app
<AppProvider>
  <App />
</AppProvider>

// Hooks — used in screens/components
const dispatch = useAppDispatch();
const { currentScreen, calibrationProfile } = useAppState();
```

### 2. Settings State (`src/hooks/useSettings.tsx`)

A separate context for app settings (theme, language, motion):

```typescript
interface AppSettings {
  theme: 'system' | 'midnight' | 'ocean' | 'emerald' | 'carbon' | 'purple' | 'sunrise' | 'light';
  reducedMotion: boolean;
  highContrast: boolean;
  language: string;
}
```

- Backed by localStorage (`focus_settings` key)
- Change notifications via a listener set (not React Context updates alone)
- Writes to localStorage trigger all listeners, including the React state setter
- The `useSettingsContext()` hook provides `{ settings, update }`

### 3. Auth State (`src/core/auth/AuthProvider.tsx`)

Manages authentication state:
- Supabase auth session
- User role (guest, user, researcher, admin, super_admin)
- Research role (none, viewer, analyst, research_admin, super_admin)
- Guest user creation on first visit

### 4. Theme State (`src/design-system/use-theme.tsx`)

Derived from settings:
- Reads `settings.theme` from SettingsContext
- Maps theme name to color tokens
- Provides `ThemeProvider` + `useTheme()` hook
- 7 available themes: midnight, ocean, emerald, carbon, purple, sunrise, light

### 5. Translation State (`src/hooks/useTranslation.tsx`)

Derived from settings:
- Reads `settings.language` from SettingsContext
- Loads translation object from `src/i18n/translations/`
- Provides `useTranslation()` hook → `{ t, locale, dir }`
- Supports: Arabic (`ar`), English (`en`), Turkish (`tr`), French (`fr`)
- RTL detection based on locale

## State vs Local vs Derived

| Category | Where | What |
|----------|-------|------|
| **Navigation** | AppState (Context) | Current screen, calibration, session, results |
| **Settings** | SettingsContext | Theme, language, motion preferences |
| **Auth** | AuthContext | User, role, session |
| **Theme** | Derived from settings | Color tokens |
| **Translation** | Derived from settings | Translation function, locale, dir |
| **Device profile** | Core module (`core/device`) | Browser, OS, screen, CPU |
| **Inventory** | localStorage + service | Stock records, movements, timeline |
| **Price memory** | localStorage + service | Price history, summaries, alerts |
| **Session history** | localStorage + service | Past game sessions |
| **Achievements** | localStorage + service | Unlocked achievements |
| **Repair data** | localStorage + service | Requests, quotes, courier jobs |
| **Popularity** | localStorage + service | Search/select/purchase events |
| **Sticker data** | localStorage + service | Sticker configurations |
| **UI state** | Component `useState` | Form inputs, selected items, toggles |
| **Research filters** | Component `useState` | Date range, device, campaign filters |

## Why Not Redux?

- The app has relatively simple global state (navigation + session flow)
- Context + useReducer provides sufficient type safety with less boilerplate
- Per-domain state (inventory, pricing, repair) is managed by service modules with localStorage backing
- Component-local state handles most UI interactions
- Avoids dependency on external state libraries for a team that may not be familiar with them

## Best Practices

1. **Screen components read from AppState, don't write directly** — use `dispatch()` with typed actions
2. **Service modules are pure TypeScript** — no React imports in core/services
3. **localStorage is the source of truth** for domain data (inventory, prices, repairs)
4. **React state is the source of truth** for UI state and navigation
5. **Settings changes propagate via listeners** — not just React re-renders

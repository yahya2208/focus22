# Session Lifecycle

The **game/test session** is the core user flow — a short cognitive test that measures reaction time, consistency, and fatigue.

## Flow Diagram

```
ConsentScreen → CalibrationScreen → CountdownScreen
  → GameIntroScreen → GameScreen (7 rounds) → ResultsScreen
```

## Detailed Steps

### 1. Consent (`ConsentScreen`)

- Displays terms of use (Arabic)
- User must accept before proceeding
- On acceptance → dispatches consent event
- On decline → navigates to home

### 2. Calibration (`CalibrationScreen`)

- Measures display latency using a series of visual cues
- Calculates: `refreshRate`, `displayLagMs`, `inputLagMs`, `confidence`
- Calls `runSilentCalibration()` in the background as well, which can auto-calibrate on app start
- On completion → dispatches `SET_CALIBRATION` with `CalibrationProfile`
- Calibration profile is cached and reused for 30 days (in Supabase `calibrations` table)

### 3. Countdown (`CountdownScreen`)

- 3-2-1 countdown before the game starts
- Brief visual preparation

### 4. Game Intro (`GameIntroScreen`)

- Shows game instructions
- For QR/campaign flows, displays campaign info

### 5. Game (`GameScreen`)

- **7 rounds** of the "lamp test"
- Each round: a visual stimulus (lamp) appears → user clicks as fast as possible
- Engine (`src/core/engine/reaction.ts`) captures raw reaction times
- Raw RTs are corrected using the calibration profile (subtracting display lag + input lag)
- `src/core/engine/consistency.ts` detects outliers
- `src/core/engine/fatigue.ts` tracks reaction time degradation across rounds
- Each round tracks: `round_started`, `lamp_appeared`, `lamp_clicked`, `miss_click`

### 6. Results (`ResultsScreen`)

- Calculates final score via `calculateFocusScore()` in `src/core/engine/scoring.ts`
- Scoring formula:
  ```
  focusScore = rtScore * 0.40 + consistencyScore * 0.35 + fatigueScore * 0.25
  ```
- Produces grade: A (≥85), B (≥70), C (≥55), D (≥40), F (<40)
- Session is saved to localStorage history
- Achievements are checked and unlocked
- Telemetry events: `results_viewed`, `share_clicked`

## Session Service (`src/core/session/service.ts`)

The `SessionService` manages the game session lifecycle:

```typescript
interface SessionService {
  startSession(params: SessionStartParams): string;   // returns sessionId
  completeSession(sessionId: string, results: SessionResults): void;
  abandonSession(sessionId: string, reason: EndedReason): void;
}
```

**Ended reasons**: `'completed' | 'abandoned' | 'browser_closed' | 'timeout' | 'crash' | 'admin_closed' | 'network_lost'`

## Persistence (`src/core/supabase/PersistenceProvider.tsx`)

The `PersistenceProvider` component at the app root listens to domain events and syncs to Supabase:

1. **Session Created**: Creates a row in `sessions` table with status `'running'`, starts a 30-second ping interval to update `last_activity_at`
2. **Session Completed**: Calculates all scientific results (mean, median, consistency, fatigue, focus score), upserts the session row with full measurements
3. **Session Abandoned**: Updates session status to `'completed'` with the ended reason
4. **Browser Close**: On `beforeunload`, sends a beacon + fetch to mark session as `'browser_closed'`
5. **Stale Cleanup**: Every 5 minutes, auto-closes sessions that have been `'running'` with no activity for 5+ minutes

## Session State Machine (`src/core/session/index.ts`)

```typescript
VALID_TRANSITIONS:
  draft    → ['running', 'failed']
  running  → ['paused', 'completed', 'failed']
  paused   → ['running', 'failed']
  completed → ['archived', 'synced']
  archived → []
  synced   → ['archived']
  failed   → ['draft']
```

## LocalStorage

Completed sessions are saved to localStorage for offline history viewing:

```
Key: 'focus_sessions' (via loadSessionHistory / saveSessionHistory)
```

Each session record includes: `id`, `gameMode`, `timestamp`, `rawRts`, `correctedRts`, `totalRounds`, `validRounds`, `score`.

## Replay / History

The `HistoryScreen` loads past sessions from localStorage and displays them in a list. Each entry shows: date, score, grade, average reaction time, consistency rating. Users can tap to see detailed breakdown.

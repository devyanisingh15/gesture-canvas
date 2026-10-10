# Gesture Canvas

A multiplayer drawing game you play with your webcam and index finger. Players join a room, a wheel picks a prompt, everyone draws it in the air, and the most accurate drawing wins.

Done so far:

- **Phase 1, UI.** Every screen is built from the Figma Make prototype and runs on mock data.
- **Phase 2, hand tracking.** The drawing screen uses your webcam and MediaPipe hand tracking. Raise your index finger (other fingers curled) to draw; lower it or move your hand out of frame to lift the pen.
- **Phase 3, drawing engine.** Finger strokes are stored as vector data and rendered to a high-DPI `<canvas>` with smoothed curves, undo and clear.
- **Phase 4, game engine.** Real games: create a room, friends join with its code, ready up, and the server runs every round (wheel, reveal, drawing timer, scoring, results) through a typed state machine. Games live in memory on the Next.js server for now.

Supabase persistence and the real drawing evaluator come in later phases. Until then a placeholder scores drawings by how much of the canvas they use, not by what they show.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm test           # unit tests (Vitest)
npm run build
```

To play, open `/create` in one tab and `/join` in another (each tab is its own player). Live games run at `/room/<code>`. Open `/screens` for an index of every screen on mock data. The camera only works on `localhost` or over HTTPS.

`npm install` copies the MediaPipe WASM runtime into `public/mediapipe/wasm` (ignored by git). The hand model is committed at `public/models/hand_landmarker.task`, so nothing is fetched from a CDN at runtime. To serve them from elsewhere, set `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH` and `NEXT_PUBLIC_HAND_MODEL_PATH`.

## Screens

The `/game/*` routes show each screen on mock data for design review. The live game at `/room/<code>` renders the same screen components from server state.

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Create Game | `/create` |
| Join Game | `/join` |
| Live game (all phases) | `/room/<code>` |
| Lobby | `/game/lobby` |
| Wheel Spin | `/game/wheel` |
| Target Reveal | `/game/reveal` |
| Gameplay | `/game/draw` |
| Time's Up | `/game/times-up` |
| AI Evaluation | `/game/evaluating` |
| Round Results | `/game/results` |
| Final Results | `/game/final` |
| Camera Permission | `/game/camera` |
| Gesture Detection Error | `/game/gesture-error` |
| Player Disconnected | `/game/disconnected` |

## Layout

```
src/
  app/                 Next.js routes (one per screen)
  components/
    ui/                Design primitives: Button, Badge, Card, Avatar, Modal, ProgressBar, Logo, Wordmark
    forms/             TextField, Segmented, AvatarPicker
    game/              GameHeader, PlayerCard, GameLobby, GameWheel, TargetReveal, DrawingCanvas,
                       GestureIndicator, GameTimer, EvaluationPanel, ScoreCard, Leaderboard,
                       WinnerCard, CameraPermissionModal, CameraPreview, AccuracyBadge
    landing/           Hero, HeroGameCard, HowItWorks
    layout/            AppShell, SiteHeader, BackLink
    gesture/           CameraPreview (live feed + hand skeleton), GestureCursor, GestureStatus
    states/            StateScreen (error and interruption states)
    art/               Prompt line art and decorations
  components/screens/  Full screens (wheel, draw, time's up, evaluating, results, final) shared by
                       the live game and the /game/* previews
  features/game/       Types, prompt list, prompt art, client/server protocol
  features/game/engine/  Pure game state machine, types and selectors
  features/evaluation/ DrawingEvaluator interface and the placeholder scorer
  server/game/         GameService, GameRepository (in-memory) and API helpers
  app/api/games/       HTTP + Server-Sent Events API over the GameService
  features/gesture/    Landmark math (index finger detection), coordinate mapping, One Euro smoothing
  hooks/               useCamera, useHandTracking, useGestureDrawing, useGame, useCountdown
  services/            camera.ts (webcam), handTracking.ts (MediaPipe), gameClient.ts (game backend)
  mocks/               Mock data for the /game/* previews
```

Design tokens (colors, fonts, radii, shadows, animations) live in `src/app/globals.css` under `@theme`. Use the tokens rather than raw values.

## Drawing data

The drawing is vector data, separate from the canvas that renders it (`src/features/drawing`):

```ts
type Point = { x: number; y: number; timestamp: number }; // x, y normalized 0..1; timestamp in epoch ms
type Stroke = { id: string; points: Point[]; color?: string; width?: number };
type Drawing = { strokes: Stroke[] };
```

- `drawingReducer` handles stroke start, continue and end, plus undo and clear. It is pure and unit-tested.
- `serializeDrawing` / `parseDrawing` convert to and from versioned JSON for saving or sending to the server.
- `StrokeRenderer` draws strokes onto a canvas sized to its container and device pixel ratio. Finished strokes are cached on an offscreen layer, so each camera frame only redraws the stroke in progress. Because points are normalized, the drawing re-renders exactly at any size.

## Supabase

When the two variables below are set, **Create Game** stores the game in Supabase and opens its lobby at `/lobby/<code>`. Without them, games run in memory as before (`/room/<code>`). Joining and playing through Supabase come next.

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase dashboard → Project Settings → API). Only the publishable key is used; never put a secret or `service_role` key in a `NEXT_PUBLIC_` variable.
2. Restart `npm run dev` and open `/api/health/supabase`. `{"ok":true,"project":"…"}` means the URL and key work.
3. Apply the migrations in `supabase/migrations/` in order (`supabase db push`, or paste each into the SQL Editor).
4. Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Each browser signs in as a guest, and that identity is the player.

How Create Game works: the form calls the `create_game` database function (`src/services/supabaseGames.ts`). It runs as the signed-in guest, picks an unused 6-character room code, and inserts the game (`LOBBY`, round 0 of the chosen rounds) and the host's player row in one transaction. Submitting twice within 30 seconds returns the same game. The tab keeps `{ gameId, playerId, roomCode }` in `sessionStorage`.

| File | Use from |
| --- | --- |
| `src/lib/supabase/client.ts` → `getSupabaseBrowserClient()` | Client Components and browser code |
| `src/lib/supabase/server.ts` → `createSupabaseServerClient()` | Server Components, Route Handlers, Server Actions (one per request) |
| `src/lib/supabase/env.ts` | Reads and checks the variables; throws a clear error naming any that are missing |

## Game engine

The server decides the phase; clients only send commands and render what they receive.

```
LOBBY → STARTING → WHEEL_SPINNING → TARGET_REVEALED → DRAWING → TIME_UP → EVALUATING → ROUND_RESULTS
                         ▲                                                                   │
                         └────────────────────── next round ─────────────────────────────────┤
                                                                                             ▼
                                                                                      FINAL_RESULTS
```

| Phase | Ends when |
| --- | --- |
| LOBBY | Host presses Start (2+ players, everyone ready) |
| STARTING | 3 s |
| WHEEL_SPINNING | 6 s (a prompt is picked at random, no repeats within a game) |
| TARGET_REVEALED | 5 s |
| DRAWING | The game's drawing time, or the host ends the round |
| TIME_UP | Every connected player has handed in their drawing, or 3 s |
| EVALUATING | Every drawing is scored (at least 4.5 s; missing scores count as 0 after 20 s) |
| ROUND_RESULTS | Host presses Next Round, or 30 s |
| FINAL_RESULTS | Never |

The host can also end the game early, and a game in progress ends if fewer than 2 players remain. If the host leaves, the next player to have joined becomes host.

How it is split, so each part can be replaced:

- **Engine** (`features/game/engine`). `createGame`, `addPlayer` and `applyEvent(game, event, { now, random })` are pure functions over the `Game` type. Illegal moves throw a `GameError` with a code (`NOT_HOST`, `WRONG_PHASE`, `PLAYERS_NOT_READY`, and so on). Time and randomness are injected, so tests drive the clock.
- **Service** (`server/game/gameService.ts`). Stores games through a `GameRepository`, issues each player a secret session token, runs commands one at a time per game, ticks the clock every 250 ms, scores drawings through a `DrawingEvaluator`, tracks who is connected (with a few seconds' grace for reloads) and pushes every change to subscribers.
- **API** (`app/api/games`). `POST /api/games` creates, `POST /api/games/:code/join` joins, `POST /api/games/:code/commands` sends a command, `GET /api/games/:code/events` streams state as Server-Sent Events.
- **Client** (`services/gameClient.ts`, `hooks/useGame.ts`). A `GameClient` interface with an HTTP implementation. `useGame` keeps the latest state and the server clock offset, so every player's countdown matches.

Moving to Supabase means a `GameRepository` backed by Postgres, the clock and scoring in a server function, and a `GameClient` that uses Supabase Realtime instead of Server-Sent Events. The engine and the screens stay as they are. Games in memory only live as long as the server process, so this version needs a single long-running server (`npm run dev` or `npm start`), not serverless hosting.

## How hand tracking fits together

```
useCamera ──► <video> ──► useHandTracking ──► HandFrame per camera frame
 (stream,       (CameraPreview)   (MediaPipe,        │
  permission,                     index finger,      ├─► GestureCursor   (DOM-positioned, no re-render)
  cleanup)                        smoothing)         ├─► CameraPreview   (skeleton overlay)
                                                     └─► useGestureDrawing ──► strokes ──► DrawingCanvas
```

The camera, the tracker and the drawing are separate: `useGestureDrawing` only listens to hand frames, and `DrawingCanvas` only renders strokes. Brief tracking dropouts (under 4 frames) are smoothed over; after that the hand counts as gone, the pen lifts and the status shows "Hand not detected".

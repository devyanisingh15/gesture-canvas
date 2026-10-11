# Gesture Canvas

A multiplayer drawing game you play with your webcam and index finger. Players join a room, a wheel picks a prompt, everyone draws it in the air, and the most accurate drawing wins.

Done so far:

- **Phase 1, UI.** Every screen is built from the Figma Make prototype and runs on mock data.
- **Phase 2, hand tracking.** The drawing screen uses your webcam and MediaPipe hand tracking. Raise your index finger (other fingers curled) to draw; lower it or move your hand out of frame to lift the pen.
- **Phase 3, drawing engine.** Finger strokes are stored as vector data and rendered to a high-DPI `<canvas>` with smoothed curves, undo and clear.
- **Phase 4, game engine.** Real games: create a room, friends join with its code, ready up, and the server runs every round (wheel, reveal, drawing timer, scoring, results) through a typed state machine. Games live in memory on the Next.js server for now.

Drawings are scored on the server by a swappable evaluator. The MVP one is deterministic and scores the drawing's geometry against the prompt; it doesn't recognise objects (see [Scoring a drawing](#scoring-a-drawing)).

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
    gesture/           CameraPreview (live feed + hand skeleton), GestureCursor, GestureStatus, HandTrackingDebug
    states/            StateScreen (error and interruption states)
    art/               Prompt line art and decorations
  components/screens/  Full screens (wheel, draw, time's up, evaluating, results, final) shared by
                       the live game and the /game/* previews
  features/game/       Types, prompt list, prompt art, client/server protocol
  features/game/engine/  Pure game state machine, types and selectors
  features/evaluation/ DrawingEvaluator interface and the MVP geometry evaluator
  server/game/         GameService, GameRepository (in-memory) and API helpers
  app/api/games/       HTTP + Server-Sent Events API over the GameService
  features/gesture/    Landmark math (index finger detection), coordinate mapping, One Euro smoothing
  hooks/               useHandInput, useCamera, useHandTracking, useGestureDrawing, useGame, useCountdown
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

- `DrawingEngine` (`features/drawing/engine.ts`) holds the drawing outside React: stroke begin, add point and end, plus undo, clear and load. Points are clamped to the drawing area and near-duplicates skipped. It is plain TypeScript and unit-tested.
- `serializeDrawing` / `parseDrawing` convert to and from versioned JSON for saving or sending to the server.
- `StrokeRenderer` draws strokes onto a canvas sized to its container and device pixel ratio. Finished strokes are cached on an offscreen layer, so each camera frame only redraws the stroke in progress. Because points are normalized, the drawing re-renders exactly at any size.

## Supabase

When the two variables below are set, **Create Game** and **Join Game** store games and players in Supabase and open the lobby at `/lobby/<code>`. Without them, games run in memory as before (`/room/<code>`). The lobby is live, and the whole game (wheel, reveal, drawing, scoring, results, final results) runs from state stored in Postgres.

1. Copy `.env.example` to `.env.local` and set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (Supabase dashboard → Project Settings → API). Only the publishable key is used; never put a secret or `service_role` key in a `NEXT_PUBLIC_` variable.
2. Restart `npm run dev` and open `/api/health/supabase`. `{"ok":true,"project":"…"}` means the URL and key work.
3. Apply the migrations in `supabase/migrations/` in order (`supabase db push`, or paste each into the SQL Editor).
4. Turn on **Authentication → Sign In / Providers → Allow anonymous sign-ins**. Each browser signs in as a guest, and that identity is the player.
5. For scoring, set `SUPABASE_SECRET_KEY` on the server (Project Settings → API keys → secret key; never a `NEXT_PUBLIC_` variable). The app server uses it only to store round scores, which players can't write. Without it, games still run and every round scores 0.

How Create Game works: the form calls the `create_game` database function (`src/services/supabaseGames.ts`). It runs as the signed-in guest, picks an unused 6-character room code, and inserts the game (`LOBBY`, round 0 of the chosen rounds) and the host's player row in one transaction. Submitting twice within 30 seconds returns the same game. The tab keeps `{ gameId, playerId, roomCode }` in `sessionStorage`.

How Join Game works: the form trims and upper-cases the code, then calls `join_game`. Under a lock on the game it checks the room exists, is still in `LOBBY`, has fewer than 6 players and doesn't already have that name (ignoring case), then adds the player. Each failure has its own error code, shown as a message on the right field. A guest who is already in the room gets their existing seat back instead of a second one.

How the live lobby works (`src/services/lobbyRealtime.ts`): each game has one **private** Realtime channel, `game:<game id>`. RLS policies on `realtime.messages` let only that game's players join it. On it:
- **Presence**: each open lobby tracks its player id, so everyone sees who is online. A dropped connection shows that player as Offline; supabase-js rejoins automatically and they come back.
- **A "lobby" broadcast with no data**, sent after the host starts. Joins and leaves are already signalled by Presence. On any signal, clients re-read `games` and `players` through RLS, so nothing on the channel is trusted.
- **A heartbeat every 20 s** (`touch_seat`) stamps `players.last_seen_at` with the database clock.

Starting and leaving are database functions: `start_game` refuses anyone but the host and needs 2 players seen in the last minute; `leave_game` frees the seat and hands host to the next player (the last one out deletes the game). Nothing per-frame (camera, hand landmarks, strokes) goes over Realtime.

**Game state.** `src/features/game/state.ts` is the one definition of the phases, the legal transitions and how long each lasts. The database mirrors it (`supabase/migrations/20261010040000_game_state_machine.sql`), and `src/features/game/state.test.ts` fails if the two drift apart. The database is the authority: players can only call `start_game` (host), `advance_game(game, version)` ("this phase's time is up", refused until it is, by the database clock) and `host_advance(game, version)` (end drawing early or skip the results wait). Every change locks the game row and bumps `state_version`, so when every browser's timer fires at once exactly one transition happens; a trigger refuses any status change outside the transition table. Screens are chosen in one place, `src/components/screens/GamePhaseScreen.tsx`, for both backends.

**The prompt wheel.** The database picks each round's prompt (`private.start_round`): one of the ten MVP prompts not used yet this game, stored in `rounds.prompt` in the same transaction that enters `WHEEL_SPINNING`. Browsers never pick one. The wheel only animates to the stored prompt (`src/features/game/wheel.ts`), timed from the server's phase start: everyone lands at spin start + 4.2 s, a player who reloads mid-spin spins for the time left, and one who arrives after the spin sees it already landed. If writing the round fails, nothing changes and the browsers' timers keep retrying (backing off up to 5 s) until it goes through.

**Timed rounds.** A game defaults to 5 rounds of 45 seconds' drawing, for 2 to 6 players (`DEFAULT_ROUNDS`, `DEFAULT_DRAW_SECONDS` in `state.ts`). The database sets each round's start and end time; browsers never time a round themselves. `useServerCountdown` (`src/hooks/useCountdown.ts`) shows 45, 44, … 1, then "Time's up", from the database's `ends_at` on the database's clock (`ServerClock` in `src/features/game/clock.ts` estimates it from every read), so every player's countdown turns over together even when their computer's clock is wrong. At zero:
1. Drawing input stops (the countdown reaches 0).
2. The browser hands in the drawing (`submit_drawing`), retrying if the connection drops. The database accepts it only until `ends_at` plus 3 s, by its own clock. While drawing, the drawing stays on the device (a copy in localStorage), so a refresh or reconnect before the deadline brings the canvas back. Nothing is sent to Supabase until the hand-in.
3. The database moves to TIME_UP, then EVALUATING.
4. Any player's browser asks `POST /api/rounds/:id/evaluate`. The app server checks with the database that the player is in the game, scores every drawing with the evaluation service, and stores the scores once with the secret key (`record_scores`).
5. The database moves to ROUND_RESULTS as soon as the evaluating screen has had its 4.5 s (or after 20 s with zeros, if no server scored the round).

**Handing in a drawing** (`supabase/migrations/20261011030000_secure_drawing_submission.sql`). `submit_drawing(round, drawing)` is the only way a drawing reaches the `drawings` table; players can't insert, update or delete rows directly. The database never takes the player, game, score or game state from the browser:
- **Who:** the caller's own seat in the round's game, from their sign-in. There is no player argument, so nobody can hand in for someone else (GC005 otherwise).
- **Which and when:** the game's current round, until `ends_at` + 3 s by the database clock (GC010 otherwise).
- **What:** the payload is validated (`private.validated_drawing`) and stored with only the known fields. It allows up to 200 strokes, 2 to 1000 points per stroke, 4000 points and 256 KB in all. Coordinates must be numbers in 0..1. Timestamps must be plausible, in order within a stroke, and spread over no longer than the round plus 2 minutes. Color and width are checked too. Anything else is refused with GC012, naming the problem.
- **Once:** one drawing per player per round. Sending the identical drawing again (a retry) returns the first hand-in; a different one is refused (GC011).

The browser shapes and checks the drawing with the same limits before sending (`src/features/drawing/validation.ts`; its test fails if the SQL limits drift). Scores are written only by the app server with the secret key.

### Scoring a drawing

The evaluation service (`src/server/evaluation/evaluationService.ts`) is the only place drawings become scores. It runs on the app server, never in the browser:

- **In:** the round's prompt and each player's stored drawing, both read from the database (`evaluation_batch`). The browser only names the round.
- **Evaluate:** the drawing is validated again, then given to a `DrawingEvaluator` (`src/features/evaluation/types.ts`): `evaluate({ prompt, drawing })` → `{ score, breakdown: { structure, completeness, composition }, feedback? }`, each 0–100. Whatever an evaluator returns is clamped to whole numbers 0–100 (`normalizeResult`). No drawing, an invalid one, an evaluator error or a drawing that takes over 8 s scores 0, so one bad drawing can't hold up the round.
- **Out:** `record_scores` stores each player's score and breakdown (with the feedback and the evaluator's id) in `scores`, once per round. The database keeps only those fields, clamps the numbers and cuts feedback to 280 characters.
- **When:** only while the game is in EVALUATING, which starts after the round's end time plus the hand-in grace. Before that, `evaluation_batch` returns nothing and `record_scores` does nothing. A hand-in still being saved holds the round until it's stored, so the evaluator sees every accepted drawing.
- **Who:** players can read scores once a round is complete. They can't insert, update or delete scores, or call `record_scores` or `evaluation_batch`; only the secret key can.

The MVP evaluator (`src/features/evaluation/mvpEvaluator.ts`, id `mvp-geometry-v1`) measures the strokes (how many, ink, closed loops, straight lines, rays, size, position, proportions) and compares them with what a drawing of the prompt usually has, such as two wheels on a wide car or rays around a sun. Structure counts 50% of the total, completeness and composition 25% each. The same drawing always gets the same score. It doesn't recognise objects, so a different drawing with similar geometry can score well.

To use another evaluator (computer vision, an AI model), implement `DrawingEvaluator`, add it to `src/server/evaluation/evaluators.ts` and set `DRAWING_EVALUATOR` to its id on the server. Read any API key it needs from a server environment variable, never a `NEXT_PUBLIC_` one. The game, the database and the screens stay as they are.

### Results and the leaderboard

When a round's scores are in, the database moves it to ROUND_RESULTS and marks the round COMPLETED. Only then do its drawings and scores become visible to players (row-level security), so nothing is revealed early.

- **Round results** show the prompt, your drawing and score breakdown, everyone else's drawing and score, and the leaderboard: each player's total, this round's points and rank change. The host's Next Round button (or the 30 s timer) moves everyone on; other players see the countdown.
- **Final results** show the final leaderboard and the winner. When the top totals tie, every player on that total is shown as a winner.
- **Totals come from the database.** `public.get_standings(game)` sums each player's stored scores over completed rounds and ranks them. `get_game_state` includes it, so every player gets the same leaderboard with each state change (Realtime tells clients to re-read), including after a refresh or reconnect. The browser only displays it (`leaderboard()` in `src/features/game/engine/selectors.ts`).
- **Ties:** equal totals share a rank (1, 1, 3). Among them the earlier joiner is listed first, then the lower player id, so the same scores always give the same order.
- In-memory games (no Supabase) follow the same rules on the game server (`src/server/game/view.ts`, `src/features/game/standings.ts`): until a round's results show, each player is sent only their own drawing and no scores.

To test the database functions locally: `psql -d <throwaway db> -q -t -A -f supabase/tests/game_functions_test.sql` (and `lobby_test.sql`, `state_machine_test.sql`, `wheel_test.sql`, `timed_rounds_test.sql`, `drawing_submission_test.sql`, `evaluation_test.sql`, `standings_test.sql`; `race_test.sh` fires simultaneous transitions from parallel connections) after the stub and the migrations (see `supabase/tests/rls_test.sql` for the setup).

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
useHandInput ─ useCamera ──► <video> ──► useHandTracking ──► HandFrame per camera frame
 (permission,   (stream,     (CameraPreview) (MediaPipe,          │
  page-hide      cleanup)                    HandFrameProcessor:  ├─► GestureCursor     (DOM-positioned, no re-render)
  cleanup)                                   gesture, confidence, ├─► CameraPreview     (skeleton overlay)
                                             smoothing)           ├─► HandTrackingDebug (?debug=hand)
                                                                  └─► useGestureDrawing ──► DrawingEngine ──► DrawingCanvas
```

`useHandInput()` is the one hook a screen needs. It returns `{ isCameraReady, isTracking, handDetected, isDrawingGesture, indexFingerPosition, error }` plus `subscribe` for per-frame updates and `start`/`stop`/`retry`. It asks for the camera only when the page calls `start()` (or straight away if the browser already allowed it), and stops the stream when the screen unmounts or the page is left. Video frames are read in the browser and dropped: nothing from the camera is uploaded or stored.

The pen is down only while the index finger is up (middle finger curled), the model is confident (score ≥ 0.6) and the fingertip is inside the camera image. Brief tracking dropouts (under 4 frames) are smoothed over; after that the hand counts as gone, the pen lifts and the status shows "Hand not detected". If the model keeps failing, or the browser has no WebGL, the screen says so and offers Retry.

React state only changes when a flag flips (hand found, pen up/down). The fingertip, landmarks and the stroke in progress go straight to the DOM and canvas: `DrawingCanvas` paints from the engine at most once per animation frame, and the page only re-renders when a stroke starts or ends.

**Debug view:** add `?debug=hand` to the drawing screen's URL to show the fingertip position, gesture, confidence and tracking frame rate over the canvas. It stays on in that browser until `?debug=off`.

# Gesture Canvas

A multiplayer drawing game you play with your webcam and index finger. Players join a room, a wheel picks a prompt, everyone draws it in the air, and the most accurate drawing wins.

Done so far:

- **Phase 1, UI.** Every screen is built from the Figma Make prototype and runs on mock data.
- **Phase 2, hand tracking.** The drawing screen uses your webcam and MediaPipe hand tracking. Raise your index finger (other fingers curled) to draw; lower it or move your hand out of frame to lift the pen.

Multiplayer (Supabase) and drawing evaluation come in later phases.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Open `/screens` for an index of every screen. The camera only works on `localhost` or over HTTPS.

`npm install` copies the MediaPipe WASM runtime into `public/mediapipe/wasm` (ignored by git). The hand model is committed at `public/models/hand_landmarker.task`, so nothing is fetched from a CDN at runtime. To serve them from elsewhere, set `NEXT_PUBLIC_MEDIAPIPE_WASM_PATH` and `NEXT_PUBLIC_HAND_MODEL_PATH`.

## Screens

| Screen | Route |
| --- | --- |
| Landing | `/` |
| Create Game | `/create` |
| Join Game | `/join` (the preview room code is `PX7K2Q`) |
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
  features/game/       Types, state machine phases, prompt list, prompt art, route map
  features/gesture/    Landmark math (index finger detection), coordinate mapping, One Euro smoothing
  hooks/               useCamera, useHandTracking, useGestureDrawing, useCountdown
  services/            camera.ts (webcam access), handTracking.ts (MediaPipe HandLandmarker)
  mocks/               Mock room, players, drawings and scores (Phase 1 only)
```

Design tokens (colors, fonts, radii, shadows, animations) live in `src/app/globals.css` under `@theme`. Use the tokens rather than raw values.

Strokes are stored as structured data (`{ id, color, width, points: [{ x, y, t }] }`) with coordinates normalized to 0–1, so the same data drives the live canvas, thumbnails and (later) evaluation.

## How hand tracking fits together

```
useCamera ──► <video> ──► useHandTracking ──► HandFrame per camera frame
 (stream,       (CameraPreview)   (MediaPipe,        │
  permission,                     index finger,      ├─► GestureCursor   (DOM-positioned, no re-render)
  cleanup)                        smoothing)         ├─► CameraPreview   (skeleton overlay)
                                                     └─► useGestureDrawing ──► strokes ──► DrawingCanvas
```

The camera, the tracker and the drawing are separate: `useGestureDrawing` only listens to hand frames, and `DrawingCanvas` only renders strokes. Brief tracking dropouts (under 4 frames) are smoothed over; after that the hand counts as gone, the pen lifts and the status shows "Hand not detected".

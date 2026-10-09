# Gesture Canvas

A multiplayer drawing game you play with your webcam and index finger. Players join a room, a wheel picks a prompt, everyone draws it in the air, and the most accurate drawing wins.

This is **Phase 1: the UI**. Every screen is built from the Figma Make prototype and runs on mock data. Hand tracking (MediaPipe), multiplayer (Supabase) and drawing evaluation come in later phases.

## Run it

```bash
npm install
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Open `/screens` for an index of every screen.

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
    states/            StateScreen (error and interruption states)
    art/               Prompt line art and decorations
  features/game/       Types, state machine phases, prompt list, prompt art, route map
  hooks/               useCountdown
  mocks/               Mock room, players, drawings and scores (Phase 1 only)
```

Design tokens (colors, fonts, radii, shadows, animations) live in `src/app/globals.css` under `@theme`. Use the tokens rather than raw values.

Strokes are stored as structured data (`{ id, color, width, points: [{ x, y, t }] }`) with coordinates normalized to 0–1, so the same data drives the live canvas, thumbnails and (later) evaluation.

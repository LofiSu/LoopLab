# LoopLab

LoopLab is an open-source platform for understanding, evaluating, and improving AI agent behavior through trajectory analysis, rubric-based assessment, LLM-as-judge evaluation, human review, and training feedback loops.

## Stack

- Bun runtime
- Hono API server
- SQLite persistence through `bun:sqlite`
- React + Vite frontend
- Lucide icons

## Core workflows

- Capture and inspect AI agent trajectories
- Score trajectories with rubric dimensions
- Track LLM-as-judge outputs and calibration notes
- Route failures and regressions to human review
- Convert review findings into training feedback loops

## Getting started

```bash
bun install
bun run dev
```

The API runs on `http://localhost:3000` and the React app runs on `http://localhost:5173`.

## Production build

```bash
bun run build
bun run start
```

After building, the Hono server serves the compiled frontend from `dist`.

## Data

The app creates `looplab.sqlite` automatically on first start and seeds a few trajectory evaluations so the interface is immediately usable.

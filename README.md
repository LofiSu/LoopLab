# TraceHub

TraceHub is an open-source harness evaluation and trajectory intelligence platform for understanding, testing, and improving AI agents.

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

The app creates `tracehub.sqlite` automatically on first start and seeds a few trajectory evaluations so the interface is immediately usable.

## Packaging notes

TraceHub is an open-source platform in this LoopLab repository for understanding and evaluating AI agent loops. Each trajectory records an agent, a dataset, rubric text, an integer score from 0 to 100, and an assessment of pass, watch, fail, or regression. Status moves through captured, evaluating, human review, feedback loop, and improved. Reviewers can attach events for the trajectory, the rubric, an LLM judge (including calibration notes), human review, and training feedback. The app is a Bun and Hono API on SQLite with a React and Vite interface. On first start it creates `tracehub.sqlite` and seeds a few evaluations. The API can also preview and import trajectory JSON at `/api/datapipe/preview` and `/api/datapipe/import`.

Suggested GitHub topics:

- ai-agents
- agent-evaluation
- llm
- human-in-the-loop
- sqlite
- bun
- hono
- react
- typescript


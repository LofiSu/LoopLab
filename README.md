# LoopLab

LoopLab is a Bun + React + Hono + SQLite workspace for tracking operational loops, traces, incidents, and workflow investigations.

## Stack

- Bun runtime
- Hono API server
- SQLite persistence through `bun:sqlite`
- React + Vite frontend
- Lucide icons

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

The app creates `looplab.sqlite` automatically on first start and seeds a few traces so the interface is immediately usable.

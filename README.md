# TraceHub

TraceHub is a local review app for AI agent trajectories. It keeps each run's agent, dataset, rubric, score, and assessment in one queue, with human-review and training-feedback notes on that run.

## Review queue

Create, edit, and delete trajectory evaluations. Search by title, agent, dataset, reviewer, summary, or rubric, and filter by status. Overview counts follow the current view: average rubric score, human-review queue, regressions, and feedback-loop runs.

Each trajectory stores:

- Title, agent, dataset, and reviewer
- Status: `captured`, `evaluating`, `human_review`, `feedback_loop`, or `improved`
- Assessment: `pass`, `watch`, `fail`, or `regression`
- An integer rubric score from 0 to 100
- Summary, rubric text, the judge model name, and a training feedback note

Reviewers add timeline events of kind `trajectory`, `rubric`, `judge`, `human`, or `training`. Each event has a label, detail, and source. Judge output and review notes live in that detail text. TraceHub stores the judge model name with the evaluation.

## Stack

- [Bun](https://bun.sh) runtime
- [Hono](https://hono.dev) API
- SQLite through `bun:sqlite`
- [React](https://react.dev) and [Vite](https://vite.dev)

## Requirements

Install [Bun](https://bun.sh). The API and the SQLite database both run on the Bun runtime.

## Getting started

```bash
bun install
bun run dev
```

The API listens on `http://localhost:3000`. The React app listens on `http://localhost:5173` and proxies `/api` to the API.

```bash
bun run typecheck
```

## Configuration

| Variable | Default | Role |
| --- | --- | --- |
| `PORT` | `3000` | API listen port |
| `TRACEHUB_DB` | `tracehub.sqlite` | SQLite database path |
| `VITE_API_TARGET` | `http://localhost:3000` | Vite dev proxy target for `/api` |

## Production

```bash
bun run build
bun run start
```

`bun run build` compiles the frontend into `dist`. When `dist` is present, `bun run start` serves it from the Hono server.

## Data

On startup, TraceHub opens the SQLite file. If the trajectories table is empty, it inserts three sample evaluations so the queue is usable.

## Import

`POST /api/datapipe/preview` normalizes trajectory JSON and returns the items and warnings. `POST /api/datapipe/import` writes those trajectories and their events.

The body may be one object, an array of objects, or an object with a `trajectories`, `traces`, `runs`, `trials`, or `jobs` array. A body with nothing to import returns `400`.

## HTTP API

- `GET /api/health`
- `GET /api/trajectories` and `GET /api/traces`, with optional `q` and `status` query parameters (`status` uses the stored status values above; `all` is the default)
- `POST /api/trajectories`
- `GET`, `PATCH`, and `DELETE /api/trajectories/:id`
- `POST /api/trajectories/:id/events`
- `POST /api/datapipe/preview` and `POST /api/datapipe/import`

`GET /api/traces` returns the same payload as `GET /api/trajectories`.

## License

[MIT](LICENSE)

import { existsSync } from "node:fs";
import { Hono } from "hono";
import { serveStatic } from "hono/bun";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import {
  createEvent,
  createTrajectory,
  deleteTrajectory,
  getTrajectory,
  listEvents,
  listTrajectories,
  updateTrajectory,
  type Assessment,
  type EvaluationEventInput,
  type EvaluationStatus,
  type EventKind,
  type TrajectoryInput
} from "./db";

const statuses = new Set<EvaluationStatus>(["captured", "evaluating", "human_review", "feedback_loop", "improved"]);
const assessments = new Set<Assessment>(["pass", "watch", "fail", "regression"]);
const eventKinds = new Set<EventKind>(["trajectory", "rubric", "judge", "human", "training"]);

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "LoopLab" }));

app.get("/api/trajectories", (c) => {
  const search = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "all";
  return c.json({ trajectories: listTrajectories(search, status) });
});

app.post("/api/trajectories", async (c) => {
  const input = await c.req.json<TrajectoryInput>();
  const error = validateTrajectory(input);
  if (error) {
    return c.json({ error }, 400);
  }

  return c.json({ trajectory: createTrajectory(input) }, 201);
});

app.get("/api/trajectories/:id", (c) => {
  const id = Number(c.req.param("id"));
  const trajectory = getTrajectory(id);
  if (!trajectory) {
    return c.json({ error: "Trajectory not found" }, 404);
  }

  return c.json({ trajectory, events: listEvents(id) });
});

app.patch("/api/trajectories/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const input = await c.req.json<Partial<TrajectoryInput>>();
  const error = validateTrajectory(input, true);
  if (error) {
    return c.json({ error }, 400);
  }

  const trajectory = updateTrajectory(id, input);
  if (!trajectory) {
    return c.json({ error: "Trajectory not found" }, 404);
  }

  return c.json({ trajectory });
});

app.delete("/api/trajectories/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!deleteTrajectory(id)) {
    return c.json({ error: "Trajectory not found" }, 404);
  }

  return c.json({ ok: true });
});

app.post("/api/trajectories/:id/events", async (c) => {
  const id = Number(c.req.param("id"));
  if (!getTrajectory(id)) {
    return c.json({ error: "Trajectory not found" }, 404);
  }

  const input = await c.req.json<EvaluationEventInput>();
  const error = validateEvent(input);
  if (error) {
    return c.json({ error }, 400);
  }

  return c.json({ event: createEvent(id, input), trajectory: getTrajectory(id) }, 201);
});

app.get("/api/traces", (c) => {
  const search = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "all";
  return c.json({ trajectories: listTrajectories(search, status) });
});

if (existsSync("dist")) {
  app.use("*", serveStatic({ root: "./dist" }));
  app.get("*", serveStatic({ path: "./dist/index.html" }));
}

const port = Number(process.env.PORT ?? 3000);

Bun.serve({
  port,
  fetch: app.fetch
});

console.log(`LoopLab API running on http://localhost:${port}`);

function validateTrajectory(input: Partial<TrajectoryInput>, partial = false) {
  const required: Array<keyof TrajectoryInput> = [
    "title",
    "agent",
    "dataset",
    "reviewer",
    "status",
    "assessment",
    "score",
    "summary",
    "rubric",
    "judgeModel",
    "feedbackLoop"
  ];

  for (const key of required) {
    if (!partial && input[key] === undefined) {
      return `${key} is required`;
    }
  }

  for (const key of ["title", "agent", "dataset", "reviewer", "summary", "rubric", "judgeModel", "feedbackLoop"] as Array<
    keyof TrajectoryInput
  >) {
    const value = input[key];
    if (value !== undefined && String(value).trim().length === 0) {
      return `${key} cannot be empty`;
    }
  }

  if (input.status !== undefined && !statuses.has(input.status)) {
    return "status is invalid";
  }

  if (input.assessment !== undefined && !assessments.has(input.assessment)) {
    return "assessment is invalid";
  }

  if (input.score !== undefined && (!Number.isInteger(input.score) || input.score < 0 || input.score > 100)) {
    return "score must be an integer between 0 and 100";
  }

  return null;
}

function validateEvent(input: Partial<EvaluationEventInput>) {
  if (!input.kind || !eventKinds.has(input.kind)) {
    return "kind is invalid";
  }

  for (const key of ["label", "detail", "source"] as Array<keyof EvaluationEventInput>) {
    if (!input[key] || String(input[key]).trim().length === 0) {
      return `${key} is required`;
    }
  }

  return null;
}

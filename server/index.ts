import { existsSync } from "node:fs";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { serveStatic } from "hono/bun";
import {
  createEvent,
  createTrace,
  deleteTrace,
  getTrace,
  listEvents,
  listTraces,
  updateTrace,
  type TraceEventInput,
  type TraceInput,
  type TraceSeverity,
  type TraceStatus
} from "./db";

const statuses = new Set<TraceStatus>(["open", "watching", "blocked", "resolved"]);
const severities = new Set<TraceSeverity>(["low", "medium", "high", "critical"]);

const app = new Hono();

app.use("*", logger());
app.use("/api/*", cors());

app.get("/api/health", (c) => c.json({ ok: true, service: "LoopLab" }));

app.get("/api/traces", (c) => {
  const search = c.req.query("q") ?? "";
  const status = c.req.query("status") ?? "all";
  return c.json({ traces: listTraces(search, status) });
});

app.post("/api/traces", async (c) => {
  const input = await c.req.json<TraceInput>();
  const error = validateTrace(input);
  if (error) {
    return c.json({ error }, 400);
  }

  return c.json({ trace: createTrace(input) }, 201);
});

app.get("/api/traces/:id", (c) => {
  const id = Number(c.req.param("id"));
  const trace = getTrace(id);
  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json({ trace, events: listEvents(id) });
});

app.patch("/api/traces/:id", async (c) => {
  const id = Number(c.req.param("id"));
  const input = await c.req.json<Partial<TraceInput>>();
  const error = validateTrace(input, true);
  if (error) {
    return c.json({ error }, 400);
  }

  const trace = updateTrace(id, input);
  if (!trace) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json({ trace });
});

app.delete("/api/traces/:id", (c) => {
  const id = Number(c.req.param("id"));
  if (!deleteTrace(id)) {
    return c.json({ error: "Trace not found" }, 404);
  }

  return c.json({ ok: true });
});

app.post("/api/traces/:id/events", async (c) => {
  const id = Number(c.req.param("id"));
  if (!getTrace(id)) {
    return c.json({ error: "Trace not found" }, 404);
  }

  const input = await c.req.json<TraceEventInput>();
  const error = validateEvent(input);
  if (error) {
    return c.json({ error }, 400);
  }

  return c.json({ event: createEvent(id, input), trace: getTrace(id) }, 201);
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

function validateTrace(input: Partial<TraceInput>, partial = false) {
  const required: Array<keyof TraceInput> = ["title", "service", "owner", "status", "severity", "summary"];

  for (const key of required) {
    if (!partial && !input[key]) {
      return `${key} is required`;
    }
  }

  for (const key of ["title", "service", "owner", "summary"] as Array<keyof TraceInput>) {
    const value = input[key];
    if (value !== undefined && String(value).trim().length === 0) {
      return `${key} cannot be empty`;
    }
  }

  if (input.status !== undefined && !statuses.has(input.status)) {
    return "status is invalid";
  }

  if (input.severity !== undefined && !severities.has(input.severity)) {
    return "severity is invalid";
  }

  return null;
}

function validateEvent(input: Partial<TraceEventInput>) {
  for (const key of ["label", "detail", "source"] as Array<keyof TraceEventInput>) {
    if (!input[key] || String(input[key]).trim().length === 0) {
      return `${key} is required`;
    }
  }

  return null;
}

import { Database } from "bun:sqlite";

export type TraceStatus = "open" | "watching" | "blocked" | "resolved";
export type TraceSeverity = "low" | "medium" | "high" | "critical";

export type Trace = {
  id: number;
  title: string;
  service: string;
  owner: string;
  status: TraceStatus;
  severity: TraceSeverity;
  summary: string;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  lastEventAt: string | null;
};

export type TraceEvent = {
  id: number;
  traceId: number;
  label: string;
  detail: string;
  source: string;
  createdAt: string;
};

export type TraceInput = {
  title: string;
  service: string;
  owner: string;
  status: TraceStatus;
  severity: TraceSeverity;
  summary: string;
};

export type TraceEventInput = {
  label: string;
  detail: string;
  source: string;
};

const db = new Database(process.env.LOOPLAB_DB ?? "looplab.sqlite");

db.exec(`
  PRAGMA journal_mode = WAL;

  CREATE TABLE IF NOT EXISTS traces (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    service TEXT NOT NULL,
    owner TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('open', 'watching', 'blocked', 'resolved')),
    severity TEXT NOT NULL CHECK (severity IN ('low', 'medium', 'high', 'critical')),
    summary TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS trace_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trace_id INTEGER NOT NULL REFERENCES traces(id) ON DELETE CASCADE,
    label TEXT NOT NULL,
    detail TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_traces_status ON traces(status);
  CREATE INDEX IF NOT EXISTS idx_traces_severity ON traces(severity);
  CREATE INDEX IF NOT EXISTS idx_trace_events_trace_id ON trace_events(trace_id);
`);

const traceCount = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM traces").get()?.count ?? 0;

if (traceCount === 0) {
  const insertTrace = db.query<unknown, [string, string, string, TraceStatus, TraceSeverity, string]>(`
    INSERT INTO traces (title, service, owner, status, severity, summary)
    VALUES (?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.query<unknown, [number, string, string, string]>(`
    INSERT INTO trace_events (trace_id, label, detail, source)
    VALUES (?, ?, ?, ?)
  `);

  const seed = [
    {
      trace: [
        "Checkout latency spike",
        "payments-api",
        "Mina Chen",
        "blocked",
        "critical",
        "P95 latency crossed 2.4s after the latest gateway routing change."
      ] as [string, string, string, TraceStatus, TraceSeverity, string],
      events: [
        ["Alert fired", "Synthetic checkout probe failed in us-east-1.", "Datadog"],
        ["Owner paged", "Payments on-call acknowledged and started rollback review.", "PagerDuty"],
        ["Dependency found", "Gateway retries are amplifying card network timeouts.", "LoopLab"]
      ]
    },
    {
      trace: [
        "Missing webhook deliveries",
        "events-worker",
        "Ari Singh",
        "watching",
        "high",
        "A small customer segment has delayed webhook delivery after queue compaction."
      ] as [string, string, string, TraceStatus, TraceSeverity, string],
      events: [
        ["Customer report", "Enterprise support linked three affected workspaces.", "Zendesk"],
        ["Queue inspected", "Compaction lag peaked at 18 minutes and is recovering.", "Worker logs"]
      ]
    },
    {
      trace: [
        "Audit export validation",
        "compliance-ui",
        "Noah Park",
        "open",
        "medium",
        "New CSV export path needs validation before the compliance release."
      ] as [string, string, string, TraceStatus, TraceSeverity, string],
      events: [
        ["Release candidate", "Build 2026.07.05-rc1 is ready for export verification.", "CI"]
      ]
    }
  ];

  db.transaction(() => {
    for (const item of seed) {
      insertTrace.run(...item.trace);
      const id = Number(db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get()?.id);
      for (const event of item.events) {
        insertEvent.run(id, event[0], event[1], event[2]);
      }
    }
  })();
}

const traceSelect = `
  SELECT
    traces.id,
    traces.title,
    traces.service,
    traces.owner,
    traces.status,
    traces.severity,
    traces.summary,
    traces.created_at AS createdAt,
    traces.updated_at AS updatedAt,
    COUNT(trace_events.id) AS eventCount,
    MAX(trace_events.created_at) AS lastEventAt
  FROM traces
  LEFT JOIN trace_events ON trace_events.trace_id = traces.id
`;

export function listTraces(search = "", status = "all") {
  const filters: string[] = [];
  const values: string[] = [];

  if (status !== "all") {
    filters.push("traces.status = ?");
    values.push(status);
  }

  if (search.trim()) {
    filters.push("(traces.title LIKE ? OR traces.service LIKE ? OR traces.owner LIKE ? OR traces.summary LIKE ?)");
    const term = `%${search.trim()}%`;
    values.push(term, term, term, term);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return db
    .query<Trace, string[]>(`
      ${traceSelect}
      ${where}
      GROUP BY traces.id
      ORDER BY
        CASE traces.severity
          WHEN 'critical' THEN 0
          WHEN 'high' THEN 1
          WHEN 'medium' THEN 2
          ELSE 3
        END,
        traces.updated_at DESC
    `)
    .all(...values);
}

export function getTrace(id: number) {
  return db
    .query<Trace, [number]>(`
      ${traceSelect}
      WHERE traces.id = ?
      GROUP BY traces.id
    `)
    .get(id);
}

export function createTrace(input: TraceInput) {
  const result = db
    .query<unknown, [string, string, string, TraceStatus, TraceSeverity, string]>(`
      INSERT INTO traces (title, service, owner, status, severity, summary)
      VALUES (?, ?, ?, ?, ?, ?)
    `)
    .run(input.title, input.service, input.owner, input.status, input.severity, input.summary);

  return getTrace(Number(result.lastInsertRowid));
}

export function updateTrace(id: number, input: Partial<TraceInput>) {
  const current = getTrace(id);
  if (!current) {
    return null;
  }

  const next = {
    title: input.title ?? current.title,
    service: input.service ?? current.service,
    owner: input.owner ?? current.owner,
    status: input.status ?? current.status,
    severity: input.severity ?? current.severity,
    summary: input.summary ?? current.summary
  };

  db.query<unknown, [string, string, string, TraceStatus, TraceSeverity, string, number]>(`
    UPDATE traces
    SET title = ?, service = ?, owner = ?, status = ?, severity = ?, summary = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(next.title, next.service, next.owner, next.status, next.severity, next.summary, id);

  return getTrace(id);
}

export function deleteTrace(id: number) {
  return db.query<unknown, [number]>("DELETE FROM traces WHERE id = ?").run(id).changes > 0;
}

export function listEvents(traceId: number) {
  return db
    .query<TraceEvent, [number]>(`
      SELECT id, trace_id AS traceId, label, detail, source, created_at AS createdAt
      FROM trace_events
      WHERE trace_id = ?
      ORDER BY created_at DESC, id DESC
    `)
    .all(traceId);
}

export function createEvent(traceId: number, input: TraceEventInput) {
  const result = db.transaction(() => {
    const insert = db
      .query<unknown, [number, string, string, string]>(`
        INSERT INTO trace_events (trace_id, label, detail, source)
        VALUES (?, ?, ?, ?)
      `)
      .run(traceId, input.label, input.detail, input.source);

    db.query<unknown, [number]>("UPDATE traces SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(traceId);
    return insert;
  })();

  return db
    .query<TraceEvent, [number]>(`
      SELECT id, trace_id AS traceId, label, detail, source, created_at AS createdAt
      FROM trace_events
      WHERE id = ?
    `)
    .get(Number(result.lastInsertRowid));
}

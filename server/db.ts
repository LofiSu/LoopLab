import { Database } from "bun:sqlite";

export type EvaluationStatus = "captured" | "evaluating" | "human_review" | "feedback_loop" | "improved";
export type Assessment = "pass" | "watch" | "fail" | "regression";
export type EventKind = "trajectory" | "rubric" | "judge" | "human" | "training";

export type Trajectory = {
  id: number;
  title: string;
  agent: string;
  dataset: string;
  reviewer: string;
  status: EvaluationStatus;
  assessment: Assessment;
  score: number;
  summary: string;
  rubric: string;
  judgeModel: string;
  feedbackLoop: string;
  createdAt: string;
  updatedAt: string;
  eventCount: number;
  lastEventAt: string | null;
};

export type EvaluationEvent = {
  id: number;
  trajectoryId: number;
  kind: EventKind;
  label: string;
  detail: string;
  source: string;
  createdAt: string;
};

export type TrajectoryInput = {
  title: string;
  agent: string;
  dataset: string;
  reviewer: string;
  status: EvaluationStatus;
  assessment: Assessment;
  score: number;
  summary: string;
  rubric: string;
  judgeModel: string;
  feedbackLoop: string;
};

export type EvaluationEventInput = {
  kind: EventKind;
  label: string;
  detail: string;
  source: string;
};

const db = new Database(process.env.TRACEHUB_DB ?? "tracehub.sqlite");

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS trajectories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    agent TEXT NOT NULL,
    dataset TEXT NOT NULL,
    reviewer TEXT NOT NULL,
    status TEXT NOT NULL CHECK (status IN ('captured', 'evaluating', 'human_review', 'feedback_loop', 'improved')),
    assessment TEXT NOT NULL CHECK (assessment IN ('pass', 'watch', 'fail', 'regression')),
    score INTEGER NOT NULL CHECK (score >= 0 AND score <= 100),
    summary TEXT NOT NULL,
    rubric TEXT NOT NULL,
    judge_model TEXT NOT NULL,
    feedback_loop TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS evaluation_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    trajectory_id INTEGER NOT NULL REFERENCES trajectories(id) ON DELETE CASCADE,
    kind TEXT NOT NULL CHECK (kind IN ('trajectory', 'rubric', 'judge', 'human', 'training')),
    label TEXT NOT NULL,
    detail TEXT NOT NULL,
    source TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );

  CREATE INDEX IF NOT EXISTS idx_trajectories_status ON trajectories(status);
  CREATE INDEX IF NOT EXISTS idx_trajectories_assessment ON trajectories(assessment);
  CREATE INDEX IF NOT EXISTS idx_trajectories_score ON trajectories(score);
  CREATE INDEX IF NOT EXISTS idx_evaluation_events_trajectory_id ON evaluation_events(trajectory_id);
`);

const trajectoryCount = db.query<{ count: number }, []>("SELECT COUNT(*) AS count FROM trajectories").get()?.count ?? 0;

if (trajectoryCount === 0) {
  const insertTrajectory = db.query<
    unknown,
    [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string]
  >(`
    INSERT INTO trajectories
      (title, agent, dataset, reviewer, status, assessment, score, summary, rubric, judge_model, feedback_loop)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertEvent = db.query<unknown, [number, EventKind, string, string, string]>(`
    INSERT INTO evaluation_events (trajectory_id, kind, label, detail, source)
    VALUES (?, ?, ?, ?, ?)
  `);

  const seed = [
    {
      trajectory: [
        "Refund policy negotiation drift",
        "support-resolution-agent",
        "enterprise-support-evals-2026-07",
        "Mina Chen",
        "human_review",
        "regression",
        61,
        "The agent resolved the customer request but invented a non-existent refund exception after tool retrieval returned ambiguous policy context.",
        "Policy grounding, tool citation accuracy, escalation judgment, customer tone",
        "gpt-4.1 judge v3",
        "Add hard-negative examples for unsupported exceptions and route low-confidence policy answers to a human reviewer."
      ] as [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string],
      events: [
        ["trajectory", "Trajectory imported", "18-turn conversation captured with tool calls, retrieval snippets, and final customer response.", "LangSmith export"],
        ["judge", "LLM judge flagged hallucination", "Rubric failed citation accuracy because the cited refund exception does not exist in the source policy.", "gpt-4.1 judge v3"],
        ["human", "Reviewer confirmed regression", "Human review agreed with judge finding and marked this as a training feedback candidate.", "Mina Chen"]
      ] as Array<[EventKind, string, string, string]>
    },
    {
      trajectory: [
        "SQL analyst task decomposition",
        "analytics-copilot",
        "warehouse-agent-bench",
        "Ari Singh",
        "feedback_loop",
        "watch",
        78,
        "The agent produced correct SQL after two retries, but spent extra tokens exploring unrelated schemas before selecting the right table.",
        "Task planning, schema selection, query correctness, cost efficiency",
        "claude-sonnet judge v2",
        "Compress schema exploration policy and retrain on compact plan-first examples."
      ] as [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string],
      events: [
        ["trajectory", "Run clustered", "Trajectory grouped with seven similar inefficient schema exploration runs.", "TraceHub clustering"],
        ["rubric", "Rubric score computed", "Correctness passed, but cost efficiency scored 52 due to unnecessary schema calls.", "Rubric engine"],
        ["training", "Feedback loop opened", "Converted reviewer notes into a candidate instruction patch and replay set.", "Training queue"]
      ] as Array<[EventKind, string, string, string]>
    },
    {
      trajectory: [
        "Calendar scheduling recovery",
        "executive-assistant-agent",
        "calendar-recovery-suite",
        "Noah Park",
        "improved",
        "pass",
        92,
        "The agent recovered from an unavailable slot, asked one concise clarification, and completed booking with verified attendees.",
        "Goal completion, tool recovery, minimal clarification, final state verification",
        "gpt-4.1 judge v3",
        "Keep in regression pack as a high-quality demonstration trajectory."
      ] as [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string],
      events: [
        ["trajectory", "Replay passed", "The run passed deterministic checks for attendee list, timezone, and final calendar state.", "Replay harness"],
        ["judge", "Judge score accepted", "LLM-as-judge score matched human reviewer score within tolerance.", "Judge calibration"],
        ["training", "Promoted to demo set", "Trajectory added as a positive example for recovery behavior.", "Dataset curation"]
      ] as Array<[EventKind, string, string, string]>
    }
  ];

  db.transaction(() => {
    for (const item of seed) {
      insertTrajectory.run(...item.trajectory);
      const id = Number(db.query<{ id: number }, []>("SELECT last_insert_rowid() AS id").get()?.id);
      for (const event of item.events) {
        insertEvent.run(id, event[0], event[1], event[2], event[3]);
      }
    }
  })();
}

const trajectorySelect = `
  SELECT
    trajectories.id,
    trajectories.title,
    trajectories.agent,
    trajectories.dataset,
    trajectories.reviewer,
    trajectories.status,
    trajectories.assessment,
    trajectories.score,
    trajectories.summary,
    trajectories.rubric,
    trajectories.judge_model AS judgeModel,
    trajectories.feedback_loop AS feedbackLoop,
    trajectories.created_at AS createdAt,
    trajectories.updated_at AS updatedAt,
    COUNT(evaluation_events.id) AS eventCount,
    MAX(evaluation_events.created_at) AS lastEventAt
  FROM trajectories
  LEFT JOIN evaluation_events ON evaluation_events.trajectory_id = trajectories.id
`;

export function listTrajectories(search = "", status = "all") {
  const filters: string[] = [];
  const values: string[] = [];

  if (status !== "all") {
    filters.push("trajectories.status = ?");
    values.push(status);
  }

  if (search.trim()) {
    filters.push(`(
      trajectories.title LIKE ?
      OR trajectories.agent LIKE ?
      OR trajectories.dataset LIKE ?
      OR trajectories.reviewer LIKE ?
      OR trajectories.summary LIKE ?
      OR trajectories.rubric LIKE ?
    )`);
    const term = `%${search.trim()}%`;
    values.push(term, term, term, term, term, term);
  }

  const where = filters.length ? `WHERE ${filters.join(" AND ")}` : "";
  return db
    .query<Trajectory, string[]>(`
      ${trajectorySelect}
      ${where}
      GROUP BY trajectories.id
      ORDER BY
        CASE trajectories.assessment
          WHEN 'regression' THEN 0
          WHEN 'fail' THEN 1
          WHEN 'watch' THEN 2
          ELSE 3
        END,
        trajectories.updated_at DESC
    `)
    .all(...values);
}

export function getTrajectory(id: number) {
  return db
    .query<Trajectory, [number]>(`
      ${trajectorySelect}
      WHERE trajectories.id = ?
      GROUP BY trajectories.id
    `)
    .get(id);
}

export function createTrajectory(input: TrajectoryInput) {
  const result = db
    .query<unknown, [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string]>(`
      INSERT INTO trajectories
        (title, agent, dataset, reviewer, status, assessment, score, summary, rubric, judge_model, feedback_loop)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    .run(
      input.title,
      input.agent,
      input.dataset,
      input.reviewer,
      input.status,
      input.assessment,
      input.score,
      input.summary,
      input.rubric,
      input.judgeModel,
      input.feedbackLoop
    );

  return getTrajectory(Number(result.lastInsertRowid));
}

export function updateTrajectory(id: number, input: Partial<TrajectoryInput>) {
  const current = getTrajectory(id);
  if (!current) {
    return null;
  }

  const next = {
    title: input.title ?? current.title,
    agent: input.agent ?? current.agent,
    dataset: input.dataset ?? current.dataset,
    reviewer: input.reviewer ?? current.reviewer,
    status: input.status ?? current.status,
    assessment: input.assessment ?? current.assessment,
    score: input.score ?? current.score,
    summary: input.summary ?? current.summary,
    rubric: input.rubric ?? current.rubric,
    judgeModel: input.judgeModel ?? current.judgeModel,
    feedbackLoop: input.feedbackLoop ?? current.feedbackLoop
  };

  db.query<unknown, [string, string, string, string, EvaluationStatus, Assessment, number, string, string, string, string, number]>(`
    UPDATE trajectories
    SET
      title = ?,
      agent = ?,
      dataset = ?,
      reviewer = ?,
      status = ?,
      assessment = ?,
      score = ?,
      summary = ?,
      rubric = ?,
      judge_model = ?,
      feedback_loop = ?,
      updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
  `).run(
    next.title,
    next.agent,
    next.dataset,
    next.reviewer,
    next.status,
    next.assessment,
    next.score,
    next.summary,
    next.rubric,
    next.judgeModel,
    next.feedbackLoop,
    id
  );

  return getTrajectory(id);
}

export function deleteTrajectory(id: number) {
  return db.query<unknown, [number]>("DELETE FROM trajectories WHERE id = ?").run(id).changes > 0;
}

export function listEvents(trajectoryId: number) {
  return db
    .query<EvaluationEvent, [number]>(`
      SELECT
        id,
        trajectory_id AS trajectoryId,
        kind,
        label,
        detail,
        source,
        created_at AS createdAt
      FROM evaluation_events
      WHERE trajectory_id = ?
      ORDER BY created_at DESC, id DESC
    `)
    .all(trajectoryId);
}

export function createEvent(trajectoryId: number, input: EvaluationEventInput) {
  const result = db.transaction(() => {
    const insert = db
      .query<unknown, [number, EventKind, string, string, string]>(`
        INSERT INTO evaluation_events (trajectory_id, kind, label, detail, source)
        VALUES (?, ?, ?, ?, ?)
      `)
      .run(trajectoryId, input.kind, input.label, input.detail, input.source);

    db.query<unknown, [number]>("UPDATE trajectories SET updated_at = CURRENT_TIMESTAMP WHERE id = ?").run(trajectoryId);
    return insert;
  })();

  return db
    .query<EvaluationEvent, [number]>(`
      SELECT
        id,
        trajectory_id AS trajectoryId,
        kind,
        label,
        detail,
        source,
        created_at AS createdAt
      FROM evaluation_events
      WHERE id = ?
    `)
    .get(Number(result.lastInsertRowid));
}

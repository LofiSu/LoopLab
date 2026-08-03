import {
  createEvent,
  createTrajectory,
  type Assessment,
  type EvaluationEventInput,
  type EvaluationStatus,
  type EventKind,
  type Trajectory,
  type TrajectoryInput
} from "./db";

type JsonRecord = Record<string, unknown>;

export type DatapipeNormalizedItem = {
  trajectory: TrajectoryInput;
  events: EvaluationEventInput[];
  warnings: string[];
};

export type DatapipeImportResult = DatapipeNormalizedItem & {
  saved: Trajectory | null;
};

const statusValues = new Set<EvaluationStatus>(["captured", "evaluating", "human_review", "feedback_loop", "improved"]);
const assessmentValues = new Set<Assessment>(["pass", "watch", "fail", "regression"]);
const eventKindValues = new Set<EventKind>(["trajectory", "rubric", "judge", "human", "training"]);

export function previewDatapipePayload(payload: unknown) {
  return readItems(payload).map(normalizeItem);
}

export function importDatapipePayload(payload: unknown) {
  return previewDatapipePayload(payload).map((item) => {
    const saved = createTrajectory(item.trajectory);
    if (!saved) {
      return { ...item, saved: null };
    }

    for (const event of item.events) {
      createEvent(saved.id, event);
    }

    return { ...item, saved };
  });
}

function readItems(payload: unknown): JsonRecord[] {
  if (Array.isArray(payload)) {
    return payload.filter(isRecord);
  }

  if (!isRecord(payload)) {
    return [];
  }

  for (const key of ["trajectories", "traces", "runs", "trials", "jobs"]) {
    const value = payload[key];
    if (Array.isArray(value)) {
      return value.filter(isRecord);
    }
  }

  return [payload];
}

function normalizeItem(input: JsonRecord): DatapipeNormalizedItem {
  const warnings: string[] = [];
  const source = text(input.source) || detectSource(input);
  const metadata = record(input.metadata) ?? record(input.extra) ?? {};
  const judge = record(input.judge) ?? record(input.evaluation) ?? {};
  const humanReview = record(input.humanReview) ?? record(input.review) ?? {};
  const feedback = record(input.feedback) ?? record(input.feedbackLoop) ?? {};
  const rubricItems = readRubricItems(input);
  const eventInputs = readEventInputs(input, source, warnings);
  const score = readScore(input, judge, rubricItems);
  const status = readStatus(input, humanReview, feedback, score);
  const assessment = readAssessment(input, judge, status, score);
  const title = firstText(
    input.title,
    input.name,
    input.task,
    input.prompt,
    metadata.title,
    metadata.task,
    "Untitled trajectory"
  );

  const trajectory: TrajectoryInput = {
    title: title.slice(0, 180),
    agent: firstText(input.agent, input.agentName, input.model, metadata.agent, metadata.model, "unknown-agent"),
    dataset: firstText(input.dataset, input.benchmark, input.suite, metadata.dataset, metadata.benchmark, "ad-hoc-import"),
    reviewer: firstText(humanReview.reviewer, input.reviewer, metadata.reviewer, "unassigned"),
    status,
    assessment,
    score,
    summary: readSummary(input, judge, eventInputs),
    rubric: readRubric(input, rubricItems),
    judgeModel: firstText(judge.model, judge.judgeModel, input.judgeModel, metadata.judgeModel, "manual-or-external-judge"),
    feedbackLoop: readFeedbackLoop(input, feedback, assessment)
  };

  if (eventInputs.length === 0) {
    warnings.push("No events were found; created a synthetic import event.");
    eventInputs.push({
      kind: "trajectory",
      label: "Trajectory imported",
      detail: trajectory.summary,
      source
    });
  }

  if (title === "Untitled trajectory") {
    warnings.push("No title/name/task field was found; using Untitled trajectory.");
  }

  return {
    trajectory,
    events: eventInputs,
    warnings
  };
}

function detectSource(input: JsonRecord) {
  if (Array.isArray(input.spans) || input.session_id || input.trace_id) {
    return "OpenAI traces export";
  }
  if (input.run_type || input.parent_run_id || input.child_runs) {
    return "LangSmith export";
  }
  if (input.job || input.trial || input.workspace || input.harness) {
    return "Harbor job export";
  }
  return "Datapipe JSON import";
}

function readRubricItems(input: JsonRecord) {
  const rubric = input.rubric ?? input.rubrics ?? input.scores ?? input.metrics;
  if (Array.isArray(rubric)) {
    return rubric.filter(isRecord);
  }
  if (isRecord(rubric)) {
    return Object.entries(rubric).map(([name, value]) => (isRecord(value) ? { name, ...value } : { name, score: value }));
  }
  return [];
}

function readEventInputs(input: JsonRecord, source: string, warnings: string[]) {
  const rawEvents = [
    ...arrayRecords(input.events),
    ...arrayRecords(input.messages),
    ...arrayRecords(input.turns),
    ...arrayRecords(input.steps),
    ...arrayRecords(input.spans),
    ...arrayRecords(input.trajectory)
  ];

  const events = rawEvents.map((event, index) => normalizeEvent(event, index, source));
  const skippedEvents = events.filter((event) => event.detail.trim().length === 0).length;
  const judge = record(input.judge) ?? record(input.evaluation);
  const humanReview = record(input.humanReview) ?? record(input.review);
  const feedback = record(input.feedback) ?? record(input.feedbackLoop);

  if (judge && Object.keys(judge).length > 0) {
    events.push({
      kind: "judge",
      label: firstText(judge.label, judge.finding, "Judge evaluation"),
      detail: firstText(judge.reasoning, judge.summary, judge.output, stringifyCompact(judge)),
      source: firstText(judge.model, input.judgeModel, "external judge")
    });
  }

  if (humanReview && Object.keys(humanReview).length > 0) {
    events.push({
      kind: "human",
      label: firstText(humanReview.label, humanReview.decision, "Human review"),
      detail: firstText(humanReview.notes, humanReview.summary, stringifyCompact(humanReview)),
      source: firstText(humanReview.reviewer, "human reviewer")
    });
  }

  if (feedback && Object.keys(feedback).length > 0) {
    events.push({
      kind: "training",
      label: firstText(feedback.label, feedback.action, "Training feedback"),
      detail: firstText(feedback.recommendation, feedback.notes, feedback.summary, stringifyCompact(feedback)),
      source: "Datapipe feedback loop"
    });
  }

  const valid = events.filter((event) => event.detail.trim().length > 0);
  if (skippedEvents > 0) {
    warnings.push("Some empty events were skipped during normalization.");
  }
  return valid;
}

function normalizeEvent(event: JsonRecord, index: number, fallbackSource: string): EvaluationEventInput {
  const role = text(event.role) || text(event.type) || text(event.kind) || text(event.name);
  const kind = readEventKind(event.kind, role);
  return {
    kind,
    label: firstText(event.label, event.name, event.role, event.type, `Step ${index + 1}`),
    detail: firstText(event.detail, event.content, event.text, event.message, event.input, event.output, stringifyCompact(event)),
    source: firstText(event.source, event.tool, event.model, event.provider, fallbackSource)
  };
}

function readScore(input: JsonRecord, judge: JsonRecord, rubricItems: JsonRecord[]) {
  const direct = number(input.score) ?? number(input.rubricScore) ?? number(judge.score) ?? number(judge.total);
  if (direct !== null) {
    return clampScore(direct);
  }

  const scores = rubricItems.map((item) => number(item.score) ?? number(item.value)).filter((value): value is number => value !== null);
  if (scores.length > 0) {
    return clampScore(Math.round(scores.reduce((sum, value) => sum + value, 0) / scores.length));
  }

  return 70;
}

function readStatus(input: JsonRecord, humanReview: JsonRecord, feedback: JsonRecord, score: number): EvaluationStatus {
  const direct = text(input.status);
  if (direct && statusValues.has(direct as EvaluationStatus)) {
    return direct as EvaluationStatus;
  }
  if (Object.keys(feedback).length > 0) {
    return "feedback_loop";
  }
  if (Object.keys(humanReview).length > 0 || score < 70) {
    return "human_review";
  }
  return "captured";
}

function readAssessment(input: JsonRecord, judge: JsonRecord, status: EvaluationStatus, score: number): Assessment {
  const direct = text(input.assessment) ?? text(judge.assessment) ?? text(judge.verdict);
  if (direct && assessmentValues.has(direct as Assessment)) {
    return direct as Assessment;
  }
  if (score < 65 || status === "human_review") {
    return "regression";
  }
  if (score < 80) {
    return "watch";
  }
  return "pass";
}

function readEventKind(value: unknown, role: string | null): EventKind {
  const direct = text(value);
  if (direct && eventKindValues.has(direct as EventKind)) {
    return direct as EventKind;
  }
  if (role?.includes("judge") || role?.includes("eval")) {
    return "judge";
  }
  if (role?.includes("human") || role?.includes("review")) {
    return "human";
  }
  if (role?.includes("rubric") || role?.includes("metric")) {
    return "rubric";
  }
  return "trajectory";
}

function readSummary(input: JsonRecord, judge: JsonRecord, events: EvaluationEventInput[]) {
  return firstText(
    input.summary,
    input.description,
    judge.summary,
    judge.reasoning,
    events[0]?.detail,
    "Imported trajectory awaiting evaluation."
  ).slice(0, 600);
}

function readRubric(input: JsonRecord, rubricItems: JsonRecord[]) {
  const direct = text(input.rubric);
  if (direct) {
    return direct;
  }

  const labels = rubricItems.map((item) => firstText(item.name, item.label, item.dimension, "")).filter(Boolean);
  return labels.length > 0 ? labels.join(", ") : "Goal completion, tool use, factuality, safety, efficiency";
}

function readFeedbackLoop(input: JsonRecord, feedback: JsonRecord, assessment: Assessment) {
  const direct = firstText(input.feedbackLoop, feedback.recommendation, feedback.notes, feedback.summary, "");
  if (direct) {
    return direct;
  }
  if (assessment === "pass") {
    return "Keep as a passing reference trajectory or demo-set candidate.";
  }
  return "Route to review, add failing examples to the regression set, and replay after prompt or policy changes.";
}

function arrayRecords(value: unknown) {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function record(value: unknown) {
  return isRecord(value) ? value : null;
}

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function firstText(...values: unknown[]) {
  for (const value of values) {
    const next = text(value);
    if (next) {
      return next;
    }
  }
  return "";
}

function text(value: unknown) {
  if (typeof value === "string" && value.trim()) {
    return value.trim();
  }
  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  return null;
}

function number(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() && Number.isFinite(Number(value))) {
    return Number(value);
  }
  return null;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function stringifyCompact(value: unknown) {
  try {
    return JSON.stringify(value, null, 2).slice(0, 1200);
  } catch {
    return String(value);
  }
}

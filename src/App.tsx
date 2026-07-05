import {
  Activity,
  Brain,
  CheckCircle2,
  CircleDot,
  Database,
  Filter,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Target,
  Trash2,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createEvent,
  createTrajectory,
  deleteTrajectory,
  fetchTrajectory,
  fetchTrajectories,
  updateTrajectory,
  type EventPayload,
  type TrajectoryPayload
} from "./api";
import type { Assessment, EvaluationEvent, EvaluationStatus, EventKind, Trajectory } from "./types";

const statusLabels: Record<EvaluationStatus, string> = {
  captured: "Captured",
  evaluating: "Evaluating",
  human_review: "Human review",
  feedback_loop: "Feedback loop",
  improved: "Improved"
};

const assessmentLabels: Record<Assessment, string> = {
  pass: "Pass",
  watch: "Watch",
  fail: "Fail",
  regression: "Regression"
};

const kindLabels: Record<EventKind, string> = {
  trajectory: "Trajectory",
  rubric: "Rubric",
  judge: "LLM judge",
  human: "Human review",
  training: "Training"
};

const emptyTrajectory: TrajectoryPayload = {
  title: "",
  agent: "",
  dataset: "",
  reviewer: "",
  status: "captured",
  assessment: "watch",
  score: 70,
  summary: "",
  rubric: "",
  judgeModel: "",
  feedbackLoop: ""
};

const emptyEvent: EventPayload = {
  kind: "trajectory",
  label: "",
  detail: "",
  source: ""
};

export default function App() {
  const [trajectories, setTrajectories] = useState<Trajectory[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Trajectory | null>(null);
  const [events, setEvents] = useState<EvaluationEvent[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [trajectoryForm, setTrajectoryForm] = useState<TrajectoryPayload>(emptyTrajectory);
  const [editForm, setEditForm] = useState<TrajectoryPayload>(emptyTrajectory);
  const [eventForm, setEventForm] = useState<EventPayload>(emptyEvent);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadTrajectories();
  }, [search, status]);

  useEffect(() => {
    if (selectedId) {
      void loadTrajectory(selectedId);
    }
  }, [selectedId]);

  const metrics = useMemo(() => {
    const reviewQueue = trajectories.filter((trajectory) => trajectory.status === "human_review").length;
    const regressions = trajectories.filter((trajectory) => trajectory.assessment === "regression").length;
    const averageScore = trajectories.length
      ? Math.round(trajectories.reduce((total, trajectory) => total + trajectory.score, 0) / trajectories.length)
      : 0;
    return { reviewQueue, regressions, averageScore };
  }, [trajectories]);

  async function loadTrajectories() {
    setLoading(true);
    try {
      const data = await fetchTrajectories(search, status);
      setTrajectories(data.trajectories);
      setError("");
      if (!selectedId && data.trajectories.length > 0) {
        setSelectedId(data.trajectories[0].id);
      }
      if (selectedId && !data.trajectories.some((trajectory) => trajectory.id === selectedId)) {
        setSelectedId(data.trajectories[0]?.id ?? null);
        setSelected(null);
        setEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trajectories");
    } finally {
      setLoading(false);
    }
  }

  async function loadTrajectory(id: number) {
    try {
      const data = await fetchTrajectory(id);
      setSelected(data.trajectory);
      setEditForm(toPayload(data.trajectory));
      setEvents(data.events);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trajectory");
    }
  }

  async function submitTrajectory(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await createTrajectory(trajectoryForm);
      setTrajectoryForm(emptyTrajectory);
      setSelectedId(data.trajectory.id);
      await loadTrajectories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trajectory");
    }
  }

  async function submitEvent(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    try {
      await createEvent(selected.id, eventForm);
      setEventForm(emptyEvent);
      await loadTrajectory(selected.id);
      await loadTrajectories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add evaluation event");
    }
  }

  async function changeStatus(nextStatus: EvaluationStatus) {
    if (!selected) {
      return;
    }

    try {
      const data = await updateTrajectory(selected.id, { status: nextStatus });
      setSelected(data.trajectory);
      await loadTrajectories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update status");
    }
  }

  async function submitEdit(event: FormEvent) {
    event.preventDefault();
    if (!selected) {
      return;
    }

    try {
      const data = await updateTrajectory(selected.id, editForm);
      setSelected(data.trajectory);
      setEditForm(toPayload(data.trajectory));
      setEditing(false);
      await loadTrajectories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update trajectory");
    }
  }

  async function removeSelected() {
    if (!selected) {
      return;
    }

    try {
      await deleteTrajectory(selected.id);
      setSelected(null);
      setSelectedId(null);
      setEvents([]);
      await loadTrajectories();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trajectory");
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Brain size={22} />
          </div>
          <div>
            <h1>LoopLab</h1>
            <p>Agent trajectory evaluation loops</p>
          </div>
        </div>

        <div className="metric-grid">
          <Metric icon={<Target size={18} />} label="Avg score" value={metrics.averageScore} />
          <Metric icon={<CircleDot size={18} />} label="Review" value={metrics.reviewQueue} />
          <Metric icon={<Activity size={18} />} label="Regressions" value={metrics.regressions} />
        </div>

        <div className="toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search agents, datasets, rubrics" />
          </label>
          <label className="select-box">
            <Filter size={17} />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All workflow stages</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="trace-list" aria-busy={loading}>
          {trajectories.map((trajectory) => (
            <button
              className={`trace-card ${selectedId === trajectory.id ? "active" : ""}`}
              key={trajectory.id}
              onClick={() => setSelectedId(trajectory.id)}
              type="button"
            >
              <span className={`severity-dot ${trajectory.assessment}`} />
              <span className="trace-card-main">
                <strong>{trajectory.title}</strong>
                <small>{trajectory.agent} / {trajectory.dataset}</small>
              </span>
              <span className={`status-pill ${trajectory.status}`}>{trajectory.score}</span>
            </button>
          ))}
          {!loading && trajectories.length === 0 ? <div className="empty-state">No trajectories match this view.</div> : null}
        </div>
      </aside>

      <section className="workspace">
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="detail">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <div className="eyebrow">{selected.agent}</div>
                  <h2>{selected.title}</h2>
                  <p>{selected.summary}</p>
                </div>
                <div className="detail-badges">
                  <span className={`severity-badge ${selected.assessment}`}>{assessmentLabels[selected.assessment]}</span>
                  <span className={`status-pill ${selected.status}`}>{statusLabels[selected.status]}</span>
                </div>
              </div>

              <div className="insight-grid">
                <Insight label="Rubric score" value={`${selected.score}/100`} />
                <Insight label="Dataset" value={selected.dataset} />
                <Insight label="Judge model" value={selected.judgeModel} />
                <Insight label="Reviewer" value={selected.reviewer} />
              </div>

              <div className="action-row">
                <button onClick={() => setEditing(true)} type="button">
                  <Pencil size={16} />
                  Edit
                </button>
                <button className="danger-action" onClick={() => void removeSelected()} type="button">
                  <Trash2 size={16} />
                  Delete
                </button>
              </div>

              {editing ? (
                <TrajectoryForm
                  actionLabel="Save"
                  form={editForm}
                  onCancel={() => setEditing(false)}
                  onChange={setEditForm}
                  onSubmit={submitEdit}
                  showCancel
                />
              ) : null}

              <div className="status-row">
                {(Object.keys(statusLabels) as EvaluationStatus[]).map((item) => (
                  <button
                    className={selected.status === item ? "selected" : ""}
                    key={item}
                    onClick={() => void changeStatus(item)}
                    type="button"
                  >
                    {item === "improved" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
                    {statusLabels[item]}
                  </button>
                ))}
              </div>

              <div className="content-grid">
                <section className="panel timeline-panel">
                  <div className="panel-title">
                    <Database size={18} />
                    <h3>Evaluation timeline</h3>
                  </div>
                  <div className="timeline">
                    {events.map((item) => (
                      <article className="event-item" key={item.id}>
                        <time>{formatDate(item.createdAt)}</time>
                        <h4>{item.label}</h4>
                        <p>{item.detail}</p>
                        <span>{kindLabels[item.kind]} / {item.source}</span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">
                    <Send size={18} />
                    <h3>Add assessment event</h3>
                  </div>
                  <form className="stack-form" onSubmit={submitEvent}>
                    <select value={eventForm.kind} onChange={(event) => setEventForm({ ...eventForm, kind: event.target.value as EventKind })}>
                      {Object.entries(kindLabels).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                    <input value={eventForm.label} onChange={(event) => setEventForm({ ...eventForm, label: event.target.value })} placeholder="Event label" />
                    <input value={eventForm.source} onChange={(event) => setEventForm({ ...eventForm, source: event.target.value })} placeholder="Source" />
                    <textarea value={eventForm.detail} onChange={(event) => setEventForm({ ...eventForm, detail: event.target.value })} placeholder="Assessment detail" />
                    <button className="primary-action" type="submit">
                      <Plus size={17} />
                      Add event
                    </button>
                  </form>
                </section>
              </div>

              <section className="loop-panel">
                <div>
                  <h3>Rubric</h3>
                  <p>{selected.rubric}</p>
                </div>
                <div>
                  <h3>Training feedback loop</h3>
                  <p>{selected.feedbackLoop}</p>
                </div>
              </section>
            </>
          ) : (
            <div className="blank-detail">Select or create a trajectory to begin.</div>
          )}
        </section>

        <section className="create-panel">
          <div className="panel-title">
            <Plus size={18} />
            <h3>New trajectory evaluation</h3>
          </div>
          <TrajectoryForm actionLabel="Create trajectory" form={trajectoryForm} onChange={setTrajectoryForm} onSubmit={submitTrajectory} />
        </section>
      </section>
    </main>
  );
}

function TrajectoryForm({
  actionLabel,
  form,
  onCancel,
  onChange,
  onSubmit,
  showCancel = false
}: {
  actionLabel: string;
  form: TrajectoryPayload;
  onCancel?: () => void;
  onChange: (form: TrajectoryPayload) => void;
  onSubmit: (event: FormEvent) => void;
  showCancel?: boolean;
}) {
  return (
    <form className={showCancel ? "edit-form" : "create-form"} onSubmit={onSubmit}>
      <input value={form.title} onChange={(event) => onChange({ ...form, title: event.target.value })} placeholder="Trajectory title" />
      <input value={form.agent} onChange={(event) => onChange({ ...form, agent: event.target.value })} placeholder="Agent" />
      <input value={form.dataset} onChange={(event) => onChange({ ...form, dataset: event.target.value })} placeholder="Dataset or eval suite" />
      <input value={form.reviewer} onChange={(event) => onChange({ ...form, reviewer: event.target.value })} placeholder="Reviewer" />
      <select value={form.status} onChange={(event) => onChange({ ...form, status: event.target.value as EvaluationStatus })}>
        {Object.entries(statusLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <select value={form.assessment} onChange={(event) => onChange({ ...form, assessment: event.target.value as Assessment })}>
        {Object.entries(assessmentLabels).map(([value, label]) => (
          <option key={value} value={value}>
            {label}
          </option>
        ))}
      </select>
      <input
        max="100"
        min="0"
        onChange={(event) => onChange({ ...form, score: Number(event.target.value) })}
        placeholder="Score"
        type="number"
        value={form.score}
      />
      <input value={form.judgeModel} onChange={(event) => onChange({ ...form, judgeModel: event.target.value })} placeholder="LLM judge model" />
      <textarea value={form.summary} onChange={(event) => onChange({ ...form, summary: event.target.value })} placeholder="Trajectory summary" />
      <textarea value={form.rubric} onChange={(event) => onChange({ ...form, rubric: event.target.value })} placeholder="Rubric dimensions" />
      <textarea value={form.feedbackLoop} onChange={(event) => onChange({ ...form, feedbackLoop: event.target.value })} placeholder="Training feedback loop" />
      <div className="form-actions">
        {showCancel ? (
          <button className="secondary-action" onClick={onCancel} type="button">
            <X size={16} />
            Cancel
          </button>
        ) : null}
        <button className="primary-action" type="submit">
          <Save size={16} />
          {actionLabel}
        </button>
      </div>
    </form>
  );
}

function Insight({ label, value }: { label: string; value: string }) {
  return (
    <div className="insight">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function toPayload(trajectory: Trajectory): TrajectoryPayload {
  return {
    title: trajectory.title,
    agent: trajectory.agent,
    dataset: trajectory.dataset,
    reviewer: trajectory.reviewer,
    status: trajectory.status,
    assessment: trajectory.assessment,
    score: trajectory.score,
    summary: trajectory.summary,
    rubric: trajectory.rubric,
    judgeModel: trajectory.judgeModel,
    feedbackLoop: trajectory.feedbackLoop
  };
}

function Metric({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <div className="metric">
      {icon}
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

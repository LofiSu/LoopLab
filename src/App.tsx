import {
  Activity,
  AlertTriangle,
  CheckCircle2,
  CircleDot,
  Clock,
  Database,
  Filter,
  Pencil,
  Plus,
  Save,
  Search,
  Send,
  Trash2,
  X
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  createEvent,
  createTrace,
  deleteTrace,
  fetchTrace,
  fetchTraces,
  updateTrace,
  type EventPayload,
  type TracePayload
} from "./api";
import type { Trace, TraceEvent, TraceSeverity, TraceStatus } from "./types";

const statusLabels: Record<TraceStatus, string> = {
  open: "Open",
  watching: "Watching",
  blocked: "Blocked",
  resolved: "Resolved"
};

const severityLabels: Record<TraceSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical"
};

const emptyTrace: TracePayload = {
  title: "",
  service: "",
  owner: "",
  status: "open",
  severity: "medium",
  summary: ""
};

const emptyEvent: EventPayload = {
  label: "",
  detail: "",
  source: ""
};

export default function App() {
  const [traces, setTraces] = useState<Trace[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Trace | null>(null);
  const [events, setEvents] = useState<TraceEvent[]>([]);
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [traceForm, setTraceForm] = useState<TracePayload>(emptyTrace);
  const [editForm, setEditForm] = useState<TracePayload>(emptyTrace);
  const [eventForm, setEventForm] = useState<EventPayload>(emptyEvent);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    void loadTraces();
  }, [search, status]);

  useEffect(() => {
    if (selectedId) {
      void loadTrace(selectedId);
    }
  }, [selectedId]);

  const metrics = useMemo(() => {
    const active = traces.filter((trace) => trace.status !== "resolved").length;
    const critical = traces.filter((trace) => trace.severity === "critical").length;
    const blocked = traces.filter((trace) => trace.status === "blocked").length;
    return { active, critical, blocked };
  }, [traces]);

  async function loadTraces() {
    setLoading(true);
    try {
      const data = await fetchTraces(search, status);
      setTraces(data.traces);
      setError("");
      if (!selectedId && data.traces.length > 0) {
        setSelectedId(data.traces[0].id);
      }
      if (selectedId && !data.traces.some((trace) => trace.id === selectedId)) {
        setSelectedId(data.traces[0]?.id ?? null);
        setSelected(null);
        setEvents([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load traces");
    } finally {
      setLoading(false);
    }
  }

  async function loadTrace(id: number) {
    try {
      const data = await fetchTrace(id);
      setSelected(data.trace);
      setEditForm(toPayload(data.trace));
      setEvents(data.events);
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load trace");
    }
  }

  async function submitTrace(event: FormEvent) {
    event.preventDefault();
    try {
      const data = await createTrace(traceForm);
      setTraceForm(emptyTrace);
      setSelectedId(data.trace.id);
      await loadTraces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create trace");
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
      await loadTrace(selected.id);
      await loadTraces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add event");
    }
  }

  async function changeStatus(nextStatus: TraceStatus) {
    if (!selected) {
      return;
    }

    try {
      const data = await updateTrace(selected.id, { status: nextStatus });
      setSelected(data.trace);
      await loadTraces();
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
      const data = await updateTrace(selected.id, editForm);
      setSelected(data.trace);
      setEditForm(toPayload(data.trace));
      setEditing(false);
      await loadTraces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update trace");
    }
  }

  async function removeSelected() {
    if (!selected) {
      return;
    }

    try {
      await deleteTrace(selected.id);
      setSelected(null);
      setSelectedId(null);
      setEvents([]);
      await loadTraces();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete trace");
    }
  }

  return (
    <main className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Activity size={22} />
          </div>
          <div>
            <h1>LoopLab</h1>
            <p>Incident and workflow trace center</p>
          </div>
        </div>

        <div className="metric-grid">
          <Metric icon={<CircleDot size={18} />} label="Active" value={metrics.active} />
          <Metric icon={<AlertTriangle size={18} />} label="Critical" value={metrics.critical} />
          <Metric icon={<Clock size={18} />} label="Blocked" value={metrics.blocked} />
        </div>

        <div className="toolbar">
          <label className="search-box">
            <Search size={17} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search traces" />
          </label>
          <label className="select-box">
            <Filter size={17} />
            <select value={status} onChange={(event) => setStatus(event.target.value)}>
              <option value="all">All statuses</option>
              {Object.entries(statusLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="trace-list" aria-busy={loading}>
          {traces.map((trace) => (
            <button
              className={`trace-card ${selectedId === trace.id ? "active" : ""}`}
              key={trace.id}
              onClick={() => setSelectedId(trace.id)}
              type="button"
            >
              <span className={`severity-dot ${trace.severity}`} />
              <span className="trace-card-main">
                <strong>{trace.title}</strong>
                <small>{trace.service} / {trace.owner}</small>
              </span>
              <span className={`status-pill ${trace.status}`}>{statusLabels[trace.status]}</span>
            </button>
          ))}
          {!loading && traces.length === 0 ? <div className="empty-state">No traces match this view.</div> : null}
        </div>
      </aside>

      <section className="workspace">
        {error ? <div className="error-banner">{error}</div> : null}

        <section className="detail">
          {selected ? (
            <>
              <div className="detail-header">
                <div>
                  <div className="eyebrow">{selected.service}</div>
                  <h2>{selected.title}</h2>
                  <p>{selected.summary}</p>
                </div>
                <div className="detail-badges">
                  <span className={`severity-badge ${selected.severity}`}>{severityLabels[selected.severity]}</span>
                  <span className={`status-pill ${selected.status}`}>{statusLabels[selected.status]}</span>
                </div>
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
                <form className="edit-form" onSubmit={submitEdit}>
                  <input value={editForm.title} onChange={(event) => setEditForm({ ...editForm, title: event.target.value })} placeholder="Title" />
                  <input value={editForm.service} onChange={(event) => setEditForm({ ...editForm, service: event.target.value })} placeholder="Service" />
                  <input value={editForm.owner} onChange={(event) => setEditForm({ ...editForm, owner: event.target.value })} placeholder="Owner" />
                  <select value={editForm.severity} onChange={(event) => setEditForm({ ...editForm, severity: event.target.value as TraceSeverity })}>
                    {Object.entries(severityLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <select value={editForm.status} onChange={(event) => setEditForm({ ...editForm, status: event.target.value as TraceStatus })}>
                    {Object.entries(statusLabels).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                  <textarea value={editForm.summary} onChange={(event) => setEditForm({ ...editForm, summary: event.target.value })} placeholder="Summary" />
                  <div className="form-actions">
                    <button className="secondary-action" onClick={() => setEditing(false)} type="button">
                      <X size={16} />
                      Cancel
                    </button>
                    <button className="primary-action" type="submit">
                      <Save size={16} />
                      Save
                    </button>
                  </div>
                </form>
              ) : null}

              <div className="status-row">
                {(Object.keys(statusLabels) as TraceStatus[]).map((item) => (
                  <button
                    className={selected.status === item ? "selected" : ""}
                    key={item}
                    onClick={() => void changeStatus(item)}
                    type="button"
                  >
                    {item === "resolved" ? <CheckCircle2 size={16} /> : <CircleDot size={16} />}
                    {statusLabels[item]}
                  </button>
                ))}
              </div>

              <div className="content-grid">
                <section className="panel timeline-panel">
                  <div className="panel-title">
                    <Database size={18} />
                    <h3>Timeline</h3>
                  </div>
                  <div className="timeline">
                    {events.map((item) => (
                      <article className="event-item" key={item.id}>
                        <time>{formatDate(item.createdAt)}</time>
                        <h4>{item.label}</h4>
                        <p>{item.detail}</p>
                        <span>{item.source}</span>
                      </article>
                    ))}
                  </div>
                </section>

                <section className="panel">
                  <div className="panel-title">
                    <Send size={18} />
                    <h3>Add event</h3>
                  </div>
                  <form className="stack-form" onSubmit={submitEvent}>
                    <input value={eventForm.label} onChange={(event) => setEventForm({ ...eventForm, label: event.target.value })} placeholder="Event label" />
                    <input value={eventForm.source} onChange={(event) => setEventForm({ ...eventForm, source: event.target.value })} placeholder="Source" />
                    <textarea value={eventForm.detail} onChange={(event) => setEventForm({ ...eventForm, detail: event.target.value })} placeholder="What changed?" />
                    <button className="primary-action" type="submit">
                      <Plus size={17} />
                      Add event
                    </button>
                  </form>
                </section>
              </div>
            </>
          ) : (
            <div className="blank-detail">Select or create a trace to begin.</div>
          )}
        </section>

        <section className="create-panel">
          <div className="panel-title">
            <Plus size={18} />
            <h3>New trace</h3>
          </div>
          <form className="create-form" onSubmit={submitTrace}>
            <input value={traceForm.title} onChange={(event) => setTraceForm({ ...traceForm, title: event.target.value })} placeholder="Title" />
            <input value={traceForm.service} onChange={(event) => setTraceForm({ ...traceForm, service: event.target.value })} placeholder="Service" />
            <input value={traceForm.owner} onChange={(event) => setTraceForm({ ...traceForm, owner: event.target.value })} placeholder="Owner" />
            <select value={traceForm.severity} onChange={(event) => setTraceForm({ ...traceForm, severity: event.target.value as TraceSeverity })}>
              {Object.entries(severityLabels).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
            <textarea value={traceForm.summary} onChange={(event) => setTraceForm({ ...traceForm, summary: event.target.value })} placeholder="Summary" />
            <button className="primary-action" type="submit">
              <Plus size={17} />
              Create trace
            </button>
          </form>
        </section>
      </section>
    </main>
  );
}

function toPayload(trace: Trace): TracePayload {
  return {
    title: trace.title,
    service: trace.service,
    owner: trace.owner,
    status: trace.status,
    severity: trace.severity,
    summary: trace.summary
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

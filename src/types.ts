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

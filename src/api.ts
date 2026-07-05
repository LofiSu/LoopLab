import type { Trace, TraceEvent, TraceSeverity, TraceStatus } from "./types";

export type TracePayload = {
  title: string;
  service: string;
  owner: string;
  status: TraceStatus;
  severity: TraceSeverity;
  summary: string;
};

export type EventPayload = {
  label: string;
  detail: string;
  source: string;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    },
    ...init
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error ?? "Request failed");
  }

  return data;
}

export function fetchTraces(search: string, status: string) {
  const params = new URLSearchParams();
  if (search) {
    params.set("q", search);
  }
  if (status !== "all") {
    params.set("status", status);
  }

  return request<{ traces: Trace[] }>(`/api/traces?${params}`);
}

export function fetchTrace(id: number) {
  return request<{ trace: Trace; events: TraceEvent[] }>(`/api/traces/${id}`);
}

export function createTrace(payload: TracePayload) {
  return request<{ trace: Trace }>("/api/traces", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTrace(id: number, payload: Partial<TracePayload>) {
  return request<{ trace: Trace }>(`/api/traces/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteTrace(id: number) {
  return request<{ ok: true }>(`/api/traces/${id}`, {
    method: "DELETE"
  });
}

export function createEvent(traceId: number, payload: EventPayload) {
  return request<{ trace: Trace; event: TraceEvent }>(`/api/traces/${traceId}/events`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

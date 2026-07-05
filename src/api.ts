import type { Assessment, EvaluationEvent, EvaluationStatus, EventKind, Trajectory } from "./types";

export type TrajectoryPayload = {
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

export type EventPayload = {
  kind: EventKind;
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

export function fetchTrajectories(search: string, status: string) {
  const params = new URLSearchParams();
  if (search) {
    params.set("q", search);
  }
  if (status !== "all") {
    params.set("status", status);
  }

  return request<{ trajectories: Trajectory[] }>(`/api/trajectories?${params}`);
}

export function fetchTrajectory(id: number) {
  return request<{ trajectory: Trajectory; events: EvaluationEvent[] }>(`/api/trajectories/${id}`);
}

export function createTrajectory(payload: TrajectoryPayload) {
  return request<{ trajectory: Trajectory }>("/api/trajectories", {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export function updateTrajectory(id: number, payload: Partial<TrajectoryPayload>) {
  return request<{ trajectory: Trajectory }>(`/api/trajectories/${id}`, {
    method: "PATCH",
    body: JSON.stringify(payload)
  });
}

export function deleteTrajectory(id: number) {
  return request<{ ok: true }>(`/api/trajectories/${id}`, {
    method: "DELETE"
  });
}

export function createEvent(trajectoryId: number, payload: EventPayload) {
  return request<{ trajectory: Trajectory; event: EvaluationEvent }>(`/api/trajectories/${trajectoryId}/events`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

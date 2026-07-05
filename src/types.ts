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

export type JsonPrimitive = boolean | number | string | null;
export type JsonValue = JsonPrimitive | JsonObject | JsonValue[];

export interface JsonObject {
  [key: string]: JsonValue;
}

export type SourceType = "terraform_plan" | "kubernetes_diff" | "deployment_event" | "alert_event";

export type EventKind = "change" | "deployment" | "alert" | "rollback";
export type MutationAction = "create" | "update" | "delete" | "replace";

export interface EvidenceRef {
  sourceName: string;
  pointer: string;
  observedAt: string;
}

export interface ResourceMutation {
  resourceId: string;
  action: MutationAction;
  before: JsonObject | null;
  after: JsonObject | null;
  changedFields: string[];
  evidence: EvidenceRef;
}

export interface TimelineEvent {
  id: string;
  at: string;
  sourceType: SourceType;
  kind: EventKind;
  title: string;
  summary: string;
  resourceIds: string[];
  mutations: ResourceMutation[];
  evidence: EvidenceRef[];
  attributes: JsonObject;
}

export interface ResourceNode {
  id: string;
  eventIds: string[];
  sourceTypes: SourceType[];
}

export interface ResourceEdge {
  source: string;
  target: string;
  weight: number;
  eventIds: string[];
}

export interface ResourceGraph {
  nodes: ResourceNode[];
  edges: ResourceEdge[];
}

export type ResourceRelation = "direct" | "graph" | "namespace" | "none";

export interface ResourceAffinity {
  value: number;
  relation: ResourceRelation;
}

export interface SuspicionDimensions {
  temporalProximity: number;
  resourceAffinity: number;
  mutationRisk: number;
  resourceRelation: ResourceRelation;
}

export interface SuspicionHypothesis {
  id: string;
  rank: number;
  classification: "inference";
  alertEventId: string;
  candidateEventId: string;
  score: number;
  dimensions: SuspicionDimensions;
  rationale: string[];
  limitations: string[];
  evidence: EvidenceRef[];
}

export interface TimelineBounds {
  start: string;
  end: string;
}

export interface AnalysisResult {
  generatedAt: string;
  events: TimelineEvent[];
  graph: ResourceGraph;
  hypotheses: SuspicionHypothesis[];
  bounds: TimelineBounds | null;
}

export interface ResourceSnapshot {
  resourceId: string;
  state: JsonObject;
  lastEventId: string | null;
  changedAt: string | null;
}

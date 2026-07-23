import { z } from "zod";
import { redactObject } from "./redaction";
import type {
  EvidenceRef,
  JsonObject,
  MutationAction,
  ResourceMutation,
  TimelineEvent,
} from "./types";

export type ImportErrorCode = "INVALID_JSON" | "INVALID_SCHEMA" | "UNSUPPORTED_FORMAT";

export class ImportError extends Error {
  readonly code: ImportErrorCode;
  readonly sourceName: string;

  constructor(code: ImportErrorCode, sourceName: string, message: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
    this.sourceName = sourceName;
  }
}

export interface ImportContext {
  sourceName: string;
  recordedAt?: string;
}

const jsonRecord = z.record(z.string(), z.unknown());
const timestamp = z.string().min(1);

const terraformPlanSchema = z
  .object({
    format_version: z.string().min(1),
    terraform_version: z.string().optional(),
    timestamp: timestamp.optional(),
    infra_rewind: z
      .object({
        id: z.string().min(1).optional(),
        recorded_at: timestamp.optional(),
        actor: z.string().min(1).optional(),
      })
      .optional(),
    resource_changes: z.array(
      z.object({
        address: z.string().min(1),
        mode: z.string().optional(),
        type: z.string().min(1),
        name: z.string().min(1),
        provider_name: z.string().optional(),
        change: z.object({
          actions: z.array(z.string()).min(1),
          before: jsonRecord.nullable(),
          after: jsonRecord.nullable(),
        }),
      }),
    ),
  })
  .passthrough();

const kubernetesDiffSchema = z
  .object({
    apiVersion: z.literal("infra-rewind/v1"),
    kind: z.literal("KubernetesDiff"),
    id: z.string().min(1),
    timestamp,
    actor: z.string().min(1).optional(),
    changes: z.array(
      z.object({
        resource: z.object({
          apiVersion: z.string().min(1),
          kind: z.string().min(1),
          namespace: z.string().min(1).optional(),
          name: z.string().min(1),
        }),
        action: z.enum(["create", "update", "delete", "replace"]),
        before: jsonRecord.nullable(),
        after: jsonRecord.nullable(),
      }),
    ),
  })
  .passthrough();

const operationSchema = z.object({
  id: z.string().min(1),
  type: z.enum(["deployment", "rollback"]),
  timestamp,
  title: z.string().min(1),
  environment: z.string().min(1),
  status: z.string().min(1),
  revision: z.string().min(1),
  resources: z.array(z.string().min(1)).min(1),
  actor: z.string().min(1).optional(),
  details: jsonRecord.optional(),
});

const operationsSchema = z.object({
  schema: z.literal("infra-rewind/operations@1"),
  events: z.array(operationSchema),
});

const alertSchema = z.object({
  id: z.string().min(1),
  timestamp,
  title: z.string().min(1),
  status: z.string().min(1),
  severity: z.string().min(1),
  signal: z.string().min(1),
  value: z.union([z.number(), z.string()]),
  threshold: z.union([z.number(), z.string()]),
  resources: z.array(z.string().min(1)).min(1),
  description: z.string().optional(),
  details: jsonRecord.optional(),
});

const alertsSchema = z.object({
  schema: z.literal("infra-rewind/alerts@1"),
  alerts: z.array(alertSchema),
});

function normalizeTimestamp(value: string, context: ImportContext): string {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    throw new ImportError(
      "INVALID_SCHEMA",
      context.sourceName,
      `Invalid timestamp "${value}" in ${context.sourceName}.`,
    );
  }
  return parsed.toISOString();
}

function deterministicHash(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function normalizeAction(actions: string[]): MutationAction | null {
  if (actions.includes("delete") && actions.includes("create")) {
    return "replace";
  }
  if (actions.includes("delete")) {
    return "delete";
  }
  if (actions.includes("create")) {
    return "create";
  }
  if (actions.includes("update")) {
    return "update";
  }
  return null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function changedPaths(before: unknown, after: unknown, prefix = ""): string[] {
  if (Object.is(before, after)) {
    return [];
  }

  if (isRecord(before) && isRecord(after)) {
    const paths = new Set([...Object.keys(before), ...Object.keys(after)]);
    return [...paths]
      .sort()
      .flatMap((key) =>
        changedPaths(before[key], after[key], prefix.length > 0 ? `${prefix}.${key}` : key),
      );
  }

  if (
    Array.isArray(before) &&
    Array.isArray(after) &&
    JSON.stringify(before) === JSON.stringify(after)
  ) {
    return [];
  }

  return [prefix || "$"];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort();
}

function evidence(sourceName: string, pointer: string, observedAt: string): EvidenceRef {
  return { sourceName, pointer, observedAt };
}

function parseTerraform(value: unknown, context: ImportContext): TimelineEvent[] {
  const result = terraformPlanSchema.safeParse(value);
  if (!result.success) {
    throw schemaError(context, result.error);
  }

  const plan = result.data;
  const rawTimestamp = plan.timestamp ?? plan.infra_rewind?.recorded_at ?? context.recordedAt;
  if (!rawTimestamp) {
    throw new ImportError(
      "INVALID_SCHEMA",
      context.sourceName,
      "Terraform plan has no timestamp; provide timestamp, infra_rewind.recorded_at, or adapter recordedAt.",
    );
  }

  const at = normalizeTimestamp(rawTimestamp, context);
  const mutations: ResourceMutation[] = [];
  for (const [index, resource] of plan.resource_changes.entries()) {
    const action = normalizeAction(resource.change.actions);
    if (!action) {
      continue;
    }
    const ref = evidence(context.sourceName, `/resource_changes/${index}`, at);
    mutations.push({
      resourceId: `tf:${resource.address}`,
      action,
      before: resource.change.before ? redactObject(resource.change.before) : null,
      after: resource.change.after ? redactObject(resource.change.after) : null,
      changedFields: changedPaths(resource.change.before, resource.change.after),
      evidence: ref,
    });
  }

  const resourceIds = unique(mutations.map((mutation) => mutation.resourceId));
  const attributes: JsonObject = {
    formatVersion: plan.format_version,
    mutatingResourceCount: mutations.length,
  };
  if (plan.terraform_version) {
    attributes.terraformVersion = plan.terraform_version;
  }
  if (plan.infra_rewind?.actor) {
    attributes.actor = plan.infra_rewind.actor;
  }

  const id =
    plan.infra_rewind?.id ??
    `terraform-${deterministicHash(`${context.sourceName}:${at}:${JSON.stringify(plan.resource_changes)}`)}`;
  const eventEvidence = mutations.map((mutation) => mutation.evidence);
  return [
    {
      id,
      at,
      sourceType: "terraform_plan",
      kind: "change",
      title: `Terraform plan: ${mutations.length} mutating resource${mutations.length === 1 ? "" : "s"}`,
      summary:
        mutations.length === 0
          ? "The plan contains no create, update, delete, or replacement actions."
          : `${mutations.length} mutating action${mutations.length === 1 ? "" : "s"} observed across ${resourceIds.length} resource${resourceIds.length === 1 ? "" : "s"}.`,
      resourceIds,
      mutations,
      evidence: eventEvidence.length > 0 ? eventEvidence : [evidence(context.sourceName, "/", at)],
      attributes,
    },
  ];
}

function kubernetesResourceId(resource: {
  kind: string;
  namespace?: string | undefined;
  name: string;
}): string {
  const namespace = resource.namespace ?? "default";
  return `k8s:${namespace}/${resource.kind.toLowerCase()}/${resource.name}`;
}

function parseKubernetes(value: unknown, context: ImportContext): TimelineEvent[] {
  const result = kubernetesDiffSchema.safeParse(value);
  if (!result.success) {
    throw schemaError(context, result.error);
  }

  const diff = result.data;
  const at = normalizeTimestamp(diff.timestamp, context);
  const mutations = diff.changes.map((change, index): ResourceMutation => {
    const ref = evidence(context.sourceName, `/changes/${index}`, at);
    return {
      resourceId: kubernetesResourceId(change.resource),
      action: change.action,
      before: change.before ? redactObject(change.before) : null,
      after: change.after ? redactObject(change.after) : null,
      changedFields: changedPaths(change.before, change.after),
      evidence: ref,
    };
  });
  const resourceIds = unique(mutations.map((mutation) => mutation.resourceId));
  const attributes: JsonObject = {
    apiVersion: diff.apiVersion,
    changeCount: mutations.length,
  };
  if (diff.actor) {
    attributes.actor = diff.actor;
  }

  return [
    {
      id: diff.id,
      at,
      sourceType: "kubernetes_diff",
      kind: "change",
      title: `Kubernetes diff: ${mutations.length} resource change${mutations.length === 1 ? "" : "s"}`,
      summary: `${mutations.length} desired-state mutation${mutations.length === 1 ? "" : "s"} observed.`,
      resourceIds,
      mutations,
      evidence:
        mutations.length > 0
          ? mutations.map((mutation) => mutation.evidence)
          : [evidence(context.sourceName, "/", at)],
      attributes,
    },
  ];
}

function parseOperations(value: unknown, context: ImportContext): TimelineEvent[] {
  const result = operationsSchema.safeParse(value);
  if (!result.success) {
    throw schemaError(context, result.error);
  }

  return result.data.events.map((operation, index) => {
    const at = normalizeTimestamp(operation.timestamp, context);
    const attributes: JsonObject = {
      environment: operation.environment,
      status: operation.status,
      revision: operation.revision,
      ...redactObject(operation.details ?? {}),
    };
    if (operation.actor) {
      attributes.actor = operation.actor;
    }
    return {
      id: operation.id,
      at,
      sourceType: "deployment_event",
      kind: operation.type,
      title: operation.title,
      summary: `${operation.type === "rollback" ? "Rollback" : "Deployment"} ${operation.revision} reported ${operation.status} in ${operation.environment}.`,
      resourceIds: unique(operation.resources),
      mutations: [],
      evidence: [evidence(context.sourceName, `/events/${index}`, at)],
      attributes,
    };
  });
}

function parseAlerts(value: unknown, context: ImportContext): TimelineEvent[] {
  const result = alertsSchema.safeParse(value);
  if (!result.success) {
    throw schemaError(context, result.error);
  }

  return result.data.alerts.map((alert, index) => {
    const at = normalizeTimestamp(alert.timestamp, context);
    const attributes: JsonObject = {
      status: alert.status,
      severity: alert.severity,
      signal: alert.signal,
      value: alert.value,
      threshold: alert.threshold,
      ...redactObject(alert.details ?? {}),
    };
    if (alert.description) {
      attributes.description = alert.description;
    }
    return {
      id: alert.id,
      at,
      sourceType: "alert_event",
      kind: "alert",
      title: alert.title,
      summary: `${alert.signal} measured ${String(alert.value)} against threshold ${String(alert.threshold)} (${alert.status}).`,
      resourceIds: unique(alert.resources),
      mutations: [],
      evidence: [evidence(context.sourceName, `/alerts/${index}`, at)],
      attributes,
    };
  });
}

function schemaError(context: ImportContext, error: z.ZodError): ImportError {
  const detail = error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "$"}: ${issue.message}`)
    .join("; ");
  return new ImportError(
    "INVALID_SCHEMA",
    context.sourceName,
    `Invalid ${context.sourceName}: ${detail}`,
  );
}

export function parseEvidenceDocument(input: string, context: ImportContext): TimelineEvent[] {
  let value: unknown;
  try {
    value = JSON.parse(input) as unknown;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new ImportError(
      "INVALID_JSON",
      context.sourceName,
      `Could not parse ${context.sourceName}: ${detail}`,
    );
  }

  if (isRecord(value) && "resource_changes" in value && "format_version" in value) {
    return parseTerraform(value, context);
  }
  if (isRecord(value) && value.kind === "KubernetesDiff") {
    return parseKubernetes(value, context);
  }
  if (isRecord(value) && value.schema === "infra-rewind/operations@1") {
    return parseOperations(value, context);
  }
  if (isRecord(value) && value.schema === "infra-rewind/alerts@1") {
    return parseAlerts(value, context);
  }

  throw new ImportError(
    "UNSUPPORTED_FORMAT",
    context.sourceName,
    `Unsupported evidence format in ${context.sourceName}.`,
  );
}

import { describe, expect, it } from "vitest";
import { ImportError, parseEvidenceDocument } from "../../src/core/parser";

const terraformPlan = {
  format_version: "1.2",
  terraform_version: "1.9.8",
  timestamp: "2026-07-18T09:00:00.000Z",
  resource_changes: [
    {
      address: "aws_ecs_service.api",
      mode: "managed",
      type: "aws_ecs_service",
      name: "api",
      provider_name: "registry.terraform.io/hashicorp/aws",
      change: {
        actions: ["update"],
        before: {
          desired_count: 6,
          task_definition: "api:41",
          environment: { API_TOKEN: ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_") },
        },
        after: {
          desired_count: 2,
          task_definition: "api:42",
          environment: { API_TOKEN: ["ghp", "abcdefghijklmnopqrstuvwxyz123456"].join("_") },
        },
      },
    },
  ],
};

describe("parseEvidenceDocument", () => {
  it("normalizes a Terraform plan into an observed change with redacted state", () => {
    const events = parseEvidenceDocument(JSON.stringify(terraformPlan), {
      sourceName: "terraform-plan.json",
    });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      at: "2026-07-18T09:00:00.000Z",
      sourceType: "terraform_plan",
      kind: "change",
      resourceIds: ["tf:aws_ecs_service.api"],
    });
    expect(events[0]?.mutations[0]).toMatchObject({
      action: "update",
      changedFields: ["desired_count", "task_definition"],
    });
    expect(events[0]?.mutations[0]?.after).toMatchObject({
      desired_count: 2,
      environment: { API_TOKEN: "[REDACTED]" },
    });
    expect(events[0]?.evidence[0]?.pointer).toBe("/resource_changes/0");
  });

  it("normalizes Kubernetes, deployment, rollback, and alert documents", () => {
    const kubernetes = parseEvidenceDocument(
      JSON.stringify({
        apiVersion: "infra-rewind/v1",
        kind: "KubernetesDiff",
        id: "k8s-capacity",
        timestamp: "2026-07-18T09:04:00Z",
        changes: [
          {
            resource: {
              apiVersion: "apps/v1",
              kind: "Deployment",
              namespace: "payments",
              name: "api",
            },
            action: "update",
            before: { spec: { replicas: 6 } },
            after: { spec: { replicas: 2 } },
          },
        ],
      }),
      { sourceName: "kubernetes-diff.json" },
    );
    const operations = parseEvidenceDocument(
      JSON.stringify({
        schema: "infra-rewind/operations@1",
        events: [
          {
            id: "deploy-42",
            type: "deployment",
            timestamp: "2026-07-18T09:06:00Z",
            title: "Deploy api:42",
            environment: "production",
            status: "succeeded",
            revision: "api:42",
            resources: ["k8s:payments/deployment/api"],
          },
          {
            id: "rollback-41",
            type: "rollback",
            timestamp: "2026-07-18T09:25:00Z",
            title: "Rollback to api:41",
            environment: "production",
            status: "succeeded",
            revision: "api:41",
            resources: ["k8s:payments/deployment/api"],
          },
        ],
      }),
      { sourceName: "deployments.json" },
    );
    const alerts = parseEvidenceDocument(
      JSON.stringify({
        schema: "infra-rewind/alerts@1",
        alerts: [
          {
            id: "alert-errors",
            timestamp: "2026-07-18T09:11:00Z",
            title: "API error rate",
            status: "firing",
            severity: "critical",
            signal: "http_5xx_rate",
            value: 0.19,
            threshold: 0.05,
            resources: ["k8s:payments/deployment/api"],
          },
        ],
      }),
      { sourceName: "alerts.json" },
    );

    expect(kubernetes[0]?.resourceIds).toEqual(["k8s:payments/deployment/api"]);
    expect(operations.map((event) => event.kind)).toEqual(["deployment", "rollback"]);
    expect(alerts[0]).toMatchObject({
      kind: "alert",
      sourceType: "alert_event",
      attributes: { severity: "critical", signal: "http_5xx_rate" },
    });
  });

  it("uses an adapter-provided timestamp when a Terraform plan has none", () => {
    const withoutTimestamp = { ...terraformPlan };
    delete (withoutTimestamp as Partial<typeof terraformPlan>).timestamp;

    const events = parseEvidenceDocument(JSON.stringify(withoutTimestamp), {
      sourceName: "plan.json",
      recordedAt: "2026-07-18T08:59:59Z",
    });

    expect(events[0]?.at).toBe("2026-07-18T08:59:59.000Z");
  });

  it("normalizes create, replace, and delete actions while ignoring read-only entries", () => {
    const plan = {
      ...terraformPlan,
      infra_rewind: { id: "mixed-plan", actor: "release-bot" },
      resource_changes: [
        {
          address: "aws_sqs_queue.new",
          type: "aws_sqs_queue",
          name: "new",
          change: { actions: ["create"], before: null, after: { name: "new" } },
        },
        {
          address: "aws_sqs_queue.replaced",
          type: "aws_sqs_queue",
          name: "replaced",
          change: {
            actions: ["delete", "create"],
            before: { mode: "standard" },
            after: { mode: "fifo" },
          },
        },
        {
          address: "aws_sqs_queue.old",
          type: "aws_sqs_queue",
          name: "old",
          change: { actions: ["delete"], before: { name: "old" }, after: null },
        },
        {
          address: "aws_sqs_queue.same",
          type: "aws_sqs_queue",
          name: "same",
          change: { actions: ["no-op"], before: { name: "same" }, after: { name: "same" } },
        },
      ],
    };

    const [event] = parseEvidenceDocument(JSON.stringify(plan), { sourceName: "mixed.json" });
    expect(event?.id).toBe("mixed-plan");
    expect(event?.mutations.map((mutation) => mutation.action)).toEqual([
      "create",
      "replace",
      "delete",
    ]);
    expect(event?.attributes.actor).toBe("release-bot");
  });

  it("preserves a no-op plan as an observed event without inventing mutations", () => {
    const plan = {
      ...terraformPlan,
      resource_changes: [
        {
          address: "aws_sqs_queue.same",
          type: "aws_sqs_queue",
          name: "same",
          change: { actions: ["read"], before: { name: "same" }, after: { name: "same" } },
        },
      ],
    };
    const [event] = parseEvidenceDocument(JSON.stringify(plan), { sourceName: "no-op.json" });
    expect(event?.mutations).toEqual([]);
    expect(event?.resourceIds).toEqual([]);
    expect(event?.evidence[0]?.pointer).toBe("/");
  });

  it("defaults Kubernetes namespaces and redacts optional operation and alert details", () => {
    const [kubernetes] = parseEvidenceDocument(
      JSON.stringify({
        apiVersion: "infra-rewind/v1",
        kind: "KubernetesDiff",
        id: "default-namespace",
        timestamp: "2026-07-18T09:04:00Z",
        actor: "platform-team",
        changes: [
          {
            resource: { apiVersion: "v1", kind: "ConfigMap", name: "flags" },
            action: "create",
            before: null,
            after: { data: { mode: "safe" } },
          },
        ],
      }),
      { sourceName: "k8s.json" },
    );
    const [operation] = parseEvidenceDocument(
      JSON.stringify({
        schema: "infra-rewind/operations@1",
        events: [
          {
            id: "deploy",
            type: "deployment",
            timestamp: "2026-07-18T09:06:00Z",
            title: "Deploy",
            environment: "production",
            status: "failed",
            revision: "api:43",
            actor: "operator",
            resources: ["k8s:default/configmap/flags"],
            details: { api_key: "private" },
          },
        ],
      }),
      { sourceName: "operations.json" },
    );
    const [alert] = parseEvidenceDocument(
      JSON.stringify({
        schema: "infra-rewind/alerts@1",
        alerts: [
          {
            id: "alert",
            timestamp: "2026-07-18T09:07:00Z",
            title: "Flag load failed",
            status: "firing",
            severity: "warning",
            signal: "flag_load_errors",
            value: "high",
            threshold: "zero",
            resources: ["k8s:default/configmap/flags"],
            description: "Synthetic fixture",
            details: { cookie: "private" },
          },
        ],
      }),
      { sourceName: "alerts.json" },
    );

    expect(kubernetes?.resourceIds).toEqual(["k8s:default/configmap/flags"]);
    expect(kubernetes?.attributes.actor).toBe("platform-team");
    expect(operation?.attributes).toMatchObject({ actor: "operator", api_key: "[REDACTED]" });
    expect(alert?.attributes).toMatchObject({
      description: "Synthetic fixture",
      cookie: "[REDACTED]",
    });
  });

  it.each([
    [
      "invalid timestamp",
      JSON.stringify({ ...terraformPlan, timestamp: "not-a-timestamp" }),
      "INVALID_SCHEMA",
    ],
    ["invalid Kubernetes schema", JSON.stringify({ kind: "KubernetesDiff" }), "INVALID_SCHEMA"],
    [
      "invalid operation schema",
      JSON.stringify({ schema: "infra-rewind/operations@1", events: [{}] }),
      "INVALID_SCHEMA",
    ],
    [
      "invalid alert schema",
      JSON.stringify({ schema: "infra-rewind/alerts@1", alerts: [{}] }),
      "INVALID_SCHEMA",
    ],
  ])("rejects %s through schema validation", (_label, input, code) => {
    expect(() => parseEvidenceDocument(input, { sourceName: "invalid.json" })).toThrowError(
      expect.objectContaining({ code }),
    );
  });

  it.each([
    ["malformed JSON", "{", "INVALID_JSON"],
    ["unsupported JSON", '{"hello":"world"}', "UNSUPPORTED_FORMAT"],
    [
      "missing timestamp",
      JSON.stringify({ ...terraformPlan, timestamp: undefined }),
      "INVALID_SCHEMA",
    ],
  ])("rejects %s with a typed import error", (_label, input, code) => {
    expect(() => parseEvidenceDocument(input, { sourceName: "bad-input.json" })).toThrowError(
      ImportError,
    );

    try {
      parseEvidenceDocument(input, { sourceName: "bad-input.json" });
    } catch (error) {
      expect(error).toMatchObject({ code });
    }
  });
});

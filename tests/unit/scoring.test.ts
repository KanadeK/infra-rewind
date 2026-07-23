import { describe, expect, it } from "vitest";
import { buildResourceGraph } from "../../src/core/graph";
import { scoreSuspects } from "../../src/core/scoring";
import type { TimelineEvent } from "../../src/core/types";

function event(
  value: Pick<TimelineEvent, "id" | "at" | "kind" | "resourceIds"> & Partial<TimelineEvent>,
): TimelineEvent {
  return {
    sourceType: value.kind === "alert" ? "alert_event" : "kubernetes_diff",
    title: value.id,
    summary: value.id,
    mutations: [],
    evidence: [
      {
        sourceName: `${value.id}.json`,
        pointer: "/",
        observedAt: value.at,
      },
    ],
    attributes: {},
    ...value,
  };
}

describe("scoreSuspects", () => {
  it("ranks a related change above an unrelated concurrent change", () => {
    const events = [
      event({
        id: "related-scale-down",
        at: "2026-07-18T09:04:00Z",
        kind: "change",
        resourceIds: ["k8s:payments/deployment/api"],
        mutations: [
          {
            resourceId: "k8s:payments/deployment/api",
            action: "update",
            before: { replicas: 6 },
            after: { replicas: 2 },
            changedFields: ["replicas"],
            evidence: {
              sourceName: "related.json",
              pointer: "/",
              observedAt: "2026-07-18T09:04:00Z",
            },
          },
        ],
      }),
      event({
        id: "unrelated-label",
        at: "2026-07-18T09:05:00Z",
        kind: "change",
        resourceIds: ["k8s:catalog/configmap/search-labels"],
        mutations: [
          {
            resourceId: "k8s:catalog/configmap/search-labels",
            action: "update",
            before: { label: "blue" },
            after: { label: "green" },
            changedFields: ["label"],
            evidence: {
              sourceName: "unrelated.json",
              pointer: "/",
              observedAt: "2026-07-18T09:05:00Z",
            },
          },
        ],
      }),
      event({
        id: "api-errors",
        at: "2026-07-18T09:11:00Z",
        kind: "alert",
        resourceIds: ["k8s:payments/deployment/api"],
      }),
    ];

    const hypotheses = scoreSuspects(events, buildResourceGraph(events));
    expect(hypotheses.map((item) => item.candidateEventId)).toEqual([
      "related-scale-down",
      "unrelated-label",
    ]);
    expect(hypotheses[0]?.score).toBeGreaterThanOrEqual(90);
    expect(hypotheses[0]?.dimensions.resourceRelation).toBe("direct");
    expect(hypotheses[1]?.score).toBeLessThan(30);
    expect(hypotheses[1]).toMatchObject({
      classification: "inference",
      dimensions: { resourceRelation: "none" },
    });
  });

  it("excludes changes after an alert and changes outside the evidence window", () => {
    const events = [
      event({
        id: "too-old",
        at: "2026-07-17T20:00:00Z",
        kind: "change",
        resourceIds: ["tf:aws_ecs_service.api"],
      }),
      event({
        id: "alert",
        at: "2026-07-18T09:00:00Z",
        kind: "alert",
        resourceIds: ["tf:aws_ecs_service.api"],
      }),
      event({
        id: "after-alert",
        at: "2026-07-18T09:01:00Z",
        kind: "change",
        resourceIds: ["tf:aws_ecs_service.api"],
      }),
    ];

    expect(scoreSuspects(events, buildResourceGraph(events))).toEqual([]);
  });

  it("scores deployment failures and all mutation action risk branches", () => {
    const alert = event({
      id: "shared-alert",
      at: "2026-07-18T09:10:00Z",
      kind: "alert",
      resourceIds: ["tf:service.api"],
    });
    const candidates: TimelineEvent[] = (
      [
        ["failed-deploy", "deployment", undefined, "failed"],
        ["delete-change", "change", "delete", undefined],
        ["replace-change", "change", "replace", undefined],
        ["create-change", "change", "create", undefined],
      ] as const
    ).map(([id, kind, action, status], index) =>
      event({
        id,
        at: `2026-07-18T09:0${index}:00Z`,
        kind,
        resourceIds: ["tf:service.api"],
        attributes: status ? { status } : {},
        mutations: action
          ? [
              {
                resourceId: "tf:service.api",
                action,
                before: action === "create" ? null : { revision: 1 },
                after: action === "delete" ? null : { revision: 2 },
                changedFields: ["revision"],
                evidence: {
                  sourceName: `${id}.json`,
                  pointer: "/",
                  observedAt: `2026-07-18T09:0${index}:00Z`,
                },
              },
            ]
          : [],
      }),
    );

    const hypotheses = scoreSuspects([...candidates, alert], buildResourceGraph(candidates));
    expect(hypotheses).toHaveLength(4);
    expect(hypotheses.find((item) => item.candidateEventId === "delete-change")?.score).toBe(99);
    expect(
      hypotheses.find((item) => item.candidateEventId === "failed-deploy")?.dimensions.mutationRisk,
    ).toBe(0.9);
  });

  it("uses graph and namespace relationships without upgrading them to direct overlap", () => {
    const bridge = event({
      id: "bridge",
      at: "2026-07-18T08:00:00Z",
      kind: "deployment",
      resourceIds: ["tf:service.api", "k8s:payments/deployment/api"],
    });
    const linked = event({
      id: "linked",
      at: "2026-07-18T09:00:00Z",
      kind: "change",
      resourceIds: ["tf:service.api"],
    });
    const namespace = event({
      id: "namespace",
      at: "2026-07-18T09:01:00Z",
      kind: "change",
      resourceIds: ["k8s:payments/configmap/api"],
    });
    const alert = event({
      id: "alert",
      at: "2026-07-18T09:05:00Z",
      kind: "alert",
      resourceIds: ["k8s:payments/deployment/api"],
    });
    const all = [bridge, linked, namespace, alert];
    const hypotheses = scoreSuspects(all, buildResourceGraph(all));

    expect(hypotheses.find((item) => item.candidateEventId === "linked")?.dimensions).toMatchObject(
      {
        resourceRelation: "graph",
      },
    );
    expect(
      hypotheses.find((item) => item.candidateEventId === "namespace")?.dimensions,
    ).toMatchObject({ resourceRelation: "namespace" });
  });
});

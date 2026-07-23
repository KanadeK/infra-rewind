import { describe, expect, it } from "vitest";
import { buildResourceGraph, measureResourceAffinity } from "../../src/core/graph";
import type { TimelineEvent } from "../../src/core/types";

const evidence = {
  sourceName: "deployment.json",
  pointer: "/events/0",
  observedAt: "2026-07-18T09:05:00.000Z",
};

const bridgeEvent: TimelineEvent = {
  id: "deploy-api",
  at: evidence.observedAt,
  sourceType: "deployment_event",
  kind: "deployment",
  title: "Deploy API",
  summary: "Revision api:42 deployed.",
  resourceIds: ["tf:aws_ecs_service.api", "k8s:payments/deployment/api"],
  mutations: [],
  evidence: [evidence],
  attributes: { revision: "api:42" },
};

describe("resource graph", () => {
  it("builds stable resource nodes and co-observation edges", () => {
    const graph = buildResourceGraph([bridgeEvent]);
    expect(graph.nodes.map((node) => node.id)).toEqual([
      "k8s:payments/deployment/api",
      "tf:aws_ecs_service.api",
    ]);
    expect(graph.edges).toEqual([
      {
        source: "k8s:payments/deployment/api",
        target: "tf:aws_ecs_service.api",
        weight: 1,
        eventIds: ["deploy-api"],
      },
    ]);
  });

  it("distinguishes direct, graph-linked, namespace, and unrelated resources", () => {
    const graph = buildResourceGraph([bridgeEvent]);
    expect(
      measureResourceAffinity(
        ["k8s:payments/deployment/api"],
        ["k8s:payments/deployment/api"],
        graph,
      ),
    ).toMatchObject({ value: 1, relation: "direct" });
    expect(
      measureResourceAffinity(["tf:aws_ecs_service.api"], ["k8s:payments/deployment/api"], graph),
    ).toMatchObject({ value: 0.65, relation: "graph" });
    expect(
      measureResourceAffinity(["k8s:payments/service/api"], ["k8s:payments/deployment/api"], graph),
    ).toMatchObject({ value: 0.35, relation: "namespace" });
    expect(
      measureResourceAffinity(
        ["k8s:catalog/configmap/search"],
        ["k8s:payments/deployment/api"],
        graph,
      ),
    ).toMatchObject({ value: 0, relation: "none" });
    expect(measureResourceAffinity([], ["k8s:payments/deployment/api"], graph)).toEqual({
      value: 0,
      relation: "none",
    });
  });
});

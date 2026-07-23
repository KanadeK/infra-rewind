import { describe, expect, it } from "vitest";
import { replayStateAt } from "../../src/core/replay";
import type { TimelineEvent } from "../../src/core/types";

const events: TimelineEvent[] = [
  {
    id: "change-scale-down",
    at: "2026-07-18T09:04:00.000Z",
    sourceType: "kubernetes_diff",
    kind: "change",
    title: "Scale API down",
    summary: "Deployment replicas changed from 6 to 2.",
    resourceIds: ["k8s:payments/deployment/api"],
    mutations: [
      {
        resourceId: "k8s:payments/deployment/api",
        action: "update",
        before: { spec: { replicas: 6 } },
        after: { spec: { replicas: 2 } },
        changedFields: ["spec.replicas"],
        evidence: {
          sourceName: "kubernetes-diff.json",
          pointer: "/changes/0",
          observedAt: "2026-07-18T09:04:00.000Z",
        },
      },
    ],
    evidence: [
      {
        sourceName: "kubernetes-diff.json",
        pointer: "/changes/0",
        observedAt: "2026-07-18T09:04:00.000Z",
      },
    ],
    attributes: {},
  },
  {
    id: "rollback-scale",
    at: "2026-07-18T09:25:00.000Z",
    sourceType: "kubernetes_diff",
    kind: "rollback",
    title: "Restore API capacity",
    summary: "Deployment replicas changed from 2 to 6.",
    resourceIds: ["k8s:payments/deployment/api"],
    mutations: [
      {
        resourceId: "k8s:payments/deployment/api",
        action: "update",
        before: { spec: { replicas: 2 } },
        after: { spec: { replicas: 6 } },
        changedFields: ["spec.replicas"],
        evidence: {
          sourceName: "rollback.json",
          pointer: "/changes/0",
          observedAt: "2026-07-18T09:25:00.000Z",
        },
      },
    ],
    evidence: [
      {
        sourceName: "rollback.json",
        pointer: "/changes/0",
        observedAt: "2026-07-18T09:25:00.000Z",
      },
    ],
    attributes: {},
  },
];

describe("replayStateAt", () => {
  it("reconstructs the fixture state before, during, and after an incident", () => {
    expect(replayStateAt(events, "2026-07-18T09:03:00Z")[0]?.state).toEqual({
      spec: { replicas: 6 },
    });
    expect(replayStateAt(events, "2026-07-18T09:12:00Z")[0]?.state).toEqual({
      spec: { replicas: 2 },
    });
    expect(replayStateAt(events, "2026-07-18T09:26:00Z")[0]?.state).toEqual({
      spec: { replicas: 6 },
    });
  });

  it("does not mutate source events when replaying different points", () => {
    const baseline = structuredClone(events);
    replayStateAt(events, "2026-07-18T09:12:00Z");
    replayStateAt(events, "2026-07-18T09:26:00Z");
    expect(events).toEqual(baseline);
  });

  it("applies create and delete mutations and rejects an invalid replay time", () => {
    const lifecycle: TimelineEvent[] = [
      {
        ...events[0]!,
        id: "create",
        at: "2026-07-18T08:00:00.000Z",
        resourceIds: ["k8s:payments/configmap/runtime"],
        mutations: [
          {
            ...events[0]!.mutations[0]!,
            resourceId: "k8s:payments/configmap/runtime",
            action: "create",
            before: null,
            after: { data: { mode: "active" } },
          },
        ],
      },
      {
        ...events[0]!,
        id: "delete",
        at: "2026-07-18T08:10:00.000Z",
        resourceIds: ["k8s:payments/configmap/runtime"],
        mutations: [
          {
            ...events[0]!.mutations[0]!,
            resourceId: "k8s:payments/configmap/runtime",
            action: "delete",
            before: { data: { mode: "active" } },
            after: null,
          },
        ],
      },
    ];

    expect(replayStateAt(lifecycle, "2026-07-18T07:59:00Z")).toEqual([]);
    expect(replayStateAt(lifecycle, "2026-07-18T08:05:00Z")).toHaveLength(1);
    expect(replayStateAt(lifecycle, "2026-07-18T08:11:00Z")).toEqual([]);
    expect(() => replayStateAt(lifecycle, "invalid")).toThrowError(RangeError);
  });
});

import type {
  ResourceAffinity,
  ResourceEdge,
  ResourceGraph,
  ResourceNode,
  SourceType,
  TimelineEvent,
} from "./types";

interface MutableNode {
  eventIds: Set<string>;
  sourceTypes: Set<SourceType>;
}

interface MutableEdge {
  source: string;
  target: string;
  eventIds: Set<string>;
}

function edgeKey(left: string, right: string): string {
  return left < right ? `${left}\u0000${right}` : `${right}\u0000${left}`;
}

export function buildResourceGraph(events: TimelineEvent[]): ResourceGraph {
  const nodes = new Map<string, MutableNode>();
  const edges = new Map<string, MutableEdge>();

  for (const event of events) {
    const resources = [...new Set(event.resourceIds)].sort();
    for (const resourceId of resources) {
      const node = nodes.get(resourceId) ?? {
        eventIds: new Set<string>(),
        sourceTypes: new Set<SourceType>(),
      };
      node.eventIds.add(event.id);
      node.sourceTypes.add(event.sourceType);
      nodes.set(resourceId, node);
    }

    for (let leftIndex = 0; leftIndex < resources.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < resources.length; rightIndex += 1) {
        const left = resources[leftIndex];
        const right = resources[rightIndex];
        if (!left || !right) {
          continue;
        }
        const key = edgeKey(left, right);
        const edge = edges.get(key) ?? {
          source: left,
          target: right,
          eventIds: new Set<string>(),
        };
        edge.eventIds.add(event.id);
        edges.set(key, edge);
      }
    }
  }

  const resultNodes: ResourceNode[] = [...nodes.entries()]
    .map(([id, node]) => ({
      id,
      eventIds: [...node.eventIds].sort(),
      sourceTypes: [...node.sourceTypes].sort(),
    }))
    .sort((left, right) => left.id.localeCompare(right.id));

  const resultEdges: ResourceEdge[] = [...edges.values()]
    .map((edge) => ({
      source: edge.source,
      target: edge.target,
      weight: edge.eventIds.size,
      eventIds: [...edge.eventIds].sort(),
    }))
    .sort(
      (left, right) =>
        left.source.localeCompare(right.source) || left.target.localeCompare(right.target),
    );

  return { nodes: resultNodes, edges: resultEdges };
}

function sharesGraphEdge(left: string[], right: string[], graph: ResourceGraph): boolean {
  const expected = new Set<string>();
  for (const leftId of left) {
    for (const rightId of right) {
      expected.add(edgeKey(leftId, rightId));
    }
  }
  return graph.edges.some((edge) => expected.has(edgeKey(edge.source, edge.target)));
}

function resourceNamespace(resourceId: string): string | null {
  if (!resourceId.startsWith("k8s:")) {
    return null;
  }
  return resourceId.split("/")[0] ?? null;
}

export function measureResourceAffinity(
  candidateResources: string[],
  alertResources: string[],
  graph: ResourceGraph,
): ResourceAffinity {
  const candidate = [...new Set(candidateResources)];
  const alert = [...new Set(alertResources)];
  if (candidate.length === 0 || alert.length === 0) {
    return { value: 0, relation: "none" };
  }

  const alertSet = new Set(alert);
  const overlap = candidate.filter((resourceId) => alertSet.has(resourceId)).length;
  if (overlap > 0) {
    return {
      value: overlap / Math.min(candidate.length, alert.length),
      relation: "direct",
    };
  }

  if (sharesGraphEdge(candidate, alert, graph)) {
    return { value: 0.65, relation: "graph" };
  }

  const candidateNamespaces = new Set(
    candidate.map(resourceNamespace).filter((value): value is string => value !== null),
  );
  if (
    alert
      .map(resourceNamespace)
      .some((namespace) => namespace !== null && candidateNamespaces.has(namespace))
  ) {
    return { value: 0.35, relation: "namespace" };
  }

  return { value: 0, relation: "none" };
}

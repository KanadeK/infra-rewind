import type { JsonObject, ResourceSnapshot, TimelineEvent } from "./types";

interface MutableSnapshot {
  state: JsonObject;
  lastEventId: string | null;
  changedAt: string | null;
}

function cloneState(value: JsonObject): JsonObject {
  return structuredClone(value);
}

export function replayStateAt(events: TimelineEvent[], at: string): ResourceSnapshot[] {
  const targetTime = new Date(at).getTime();
  if (Number.isNaN(targetTime)) {
    throw new RangeError(`Invalid replay timestamp: ${at}`);
  }

  const ordered = [...events].sort(
    (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
  );
  const state = new Map<string, MutableSnapshot>();
  const baselineSeen = new Set<string>();

  for (const event of ordered) {
    for (const mutation of event.mutations) {
      if (!baselineSeen.has(mutation.resourceId)) {
        baselineSeen.add(mutation.resourceId);
        if (mutation.before) {
          state.set(mutation.resourceId, {
            state: cloneState(mutation.before),
            lastEventId: null,
            changedAt: null,
          });
        }
      }
    }
  }

  for (const event of ordered) {
    if (new Date(event.at).getTime() > targetTime) {
      continue;
    }
    for (const mutation of event.mutations) {
      if (mutation.action === "delete" || mutation.after === null) {
        state.delete(mutation.resourceId);
      } else {
        state.set(mutation.resourceId, {
          state: cloneState(mutation.after),
          lastEventId: event.id,
          changedAt: event.at,
        });
      }
    }
  }

  return [...state.entries()]
    .map(([resourceId, snapshot]) => ({
      resourceId,
      state: snapshot.state,
      lastEventId: snapshot.lastEventId,
      changedAt: snapshot.changedAt,
    }))
    .sort((left, right) => left.resourceId.localeCompare(right.resourceId));
}

import type { ResourceSnapshot } from "../../core/types";

interface StateInspectorProps {
  snapshots: ResourceSnapshot[];
  replayAt: string;
}

export function StateInspector({ snapshots, replayAt }: StateInspectorProps) {
  return (
    <section className="panel state-panel" aria-labelledby="state-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Deterministic replay</p>
          <h2 id="state-heading">Resource state</h2>
        </div>
        <time dateTime={replayAt}>{replayAt.slice(11, 19)} UTC</time>
      </div>
      {snapshots.length === 0 ? (
        <div className="empty-state">No resource state is established at this point.</div>
      ) : (
        <div className="state-list">
          {snapshots.map((snapshot) => (
            <details key={snapshot.resourceId} className="state-card" open>
              <summary>
                <span>{snapshot.resourceId}</span>
                <span>
                  {snapshot.changedAt ? `changed ${snapshot.changedAt.slice(11, 19)}` : "baseline"}
                </span>
              </summary>
              <pre role="region" aria-label={`${snapshot.resourceId} state JSON`} tabIndex={0}>
                {JSON.stringify(snapshot.state, null, 2)}
              </pre>
            </details>
          ))}
        </div>
      )}
    </section>
  );
}

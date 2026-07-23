import type { SuspicionHypothesis, TimelineEvent } from "../../core/types";

interface SuspectPanelProps {
  hypotheses: SuspicionHypothesis[];
  events: TimelineEvent[];
}

export function SuspectPanel({ hypotheses, events }: SuspectPanelProps) {
  const eventIndex = new Map(events.map((event) => [event.id, event]));
  const visible = hypotheses.slice(0, 4);

  return (
    <section className="panel suspect-panel" aria-labelledby="suspect-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Bounded inference</p>
          <h2 id="suspect-heading">Change suspicion</h2>
        </div>
        <span className="classification-badge">Not causality</span>
      </div>
      <p className="panel-note">
        Scores combine time, observed resource relation, and mutation risk. They never certify a
        root cause.
      </p>

      {visible.length === 0 ? (
        <div className="empty-state">
          No pre-alert change falls inside the six-hour evidence window.
        </div>
      ) : (
        <ol className="suspect-list">
          {visible.map((hypothesis) => {
            const candidate = eventIndex.get(hypothesis.candidateEventId);
            const alert = eventIndex.get(hypothesis.alertEventId);
            return (
              <li key={hypothesis.id} className="suspect-card">
                <div className="suspect-score">
                  <strong>{hypothesis.score}</strong>
                  <span>/100</span>
                </div>
                <div className="suspect-body">
                  <div className="suspect-title-row">
                    <h3>{candidate?.title ?? hypothesis.candidateEventId}</h3>
                    <span>{hypothesis.dimensions.resourceRelation}</span>
                  </div>
                  <p>
                    Against <strong>{alert?.title ?? hypothesis.alertEventId}</strong>
                  </p>
                  <div
                    className="score-track"
                    role="meter"
                    aria-label={`Suspicion score ${hypothesis.score} out of 100`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={hypothesis.score}
                  >
                    <span style={{ width: `${hypothesis.score}%` }} />
                  </div>
                  <dl className="score-dimensions">
                    <div>
                      <dt>Time</dt>
                      <dd>{Math.round(hypothesis.dimensions.temporalProximity * 100)}</dd>
                    </div>
                    <div>
                      <dt>Resource</dt>
                      <dd>{Math.round(hypothesis.dimensions.resourceAffinity * 100)}</dd>
                    </div>
                    <div>
                      <dt>Mutation</dt>
                      <dd>{Math.round(hypothesis.dimensions.mutationRisk * 100)}</dd>
                    </div>
                  </dl>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}

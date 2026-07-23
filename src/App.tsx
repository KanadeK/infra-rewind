import { useMemo, useState, type ChangeEvent } from "react";
import { importBrowserFiles } from "./adapters/browserFiles";
import { createIncidentReport, exportReportMarkdown } from "./core/report";
import { replayStateAt } from "./core/replay";
import type { TimelineEvent } from "./core/types";
import { BUILT_IN_SCENARIO_SUMMARIES, getBuiltInScenario } from "./demo/scenarios";
import { useAnalysis } from "./features/analysis/useAnalysis";
import { downloadText } from "./features/export/download";
import { RelationshipPanel } from "./features/relationships/RelationshipPanel";
import { StateInspector } from "./features/replay/StateInspector";
import { SuspectPanel } from "./features/suspects/SuspectPanel";
import { TimelineChart } from "./features/timeline/TimelineChart";
import { PROJECT_META } from "./project";

interface EvidenceSet {
  id: string;
  title: string;
  description: string;
  sourceLabel: string;
  events: TimelineEvent[];
  defaultReplayAt: string;
}

function evidenceSetFromScenario(id: string): EvidenceSet {
  const scenario = getBuiltInScenario(id);
  return {
    id: scenario.manifest.id,
    title: scenario.manifest.title,
    description: scenario.manifest.description,
    sourceLabel: `Bundled fixture · ${scenario.manifest.evidenceFiles.length} files`,
    events: scenario.events,
    defaultReplayAt: scenario.manifest.defaultReplayAt,
  };
}

function defaultReplayAt(events: TimelineEvent[]): string {
  const alert = events.find((event) => event.kind === "alert");
  return alert?.at ?? events.at(-1)?.at ?? new Date(0).toISOString();
}

function ensureUniqueEventIds(events: TimelineEvent[]): void {
  const seen = new Set<string>();
  for (const event of events) {
    if (seen.has(event.id)) {
      throw new Error(`Duplicate event id "${event.id}" was found in the imported evidence.`);
    }
    seen.add(event.id);
  }
}

function formatUtc(value: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "medium",
    timeStyle: "medium",
    timeZone: "UTC",
  }).format(new Date(value));
}

export function App() {
  const [evidenceSet, setEvidenceSet] = useState<EvidenceSet>(() =>
    evidenceSetFromScenario("config-misconfiguration"),
  );
  const [replayAt, setReplayAt] = useState(evidenceSet.defaultReplayAt);
  const [importState, setImportState] = useState<string>(
    "Synthetic evidence loaded. No network required.",
  );
  const [importError, setImportError] = useState<string | null>(null);
  const { analysis, error: analysisError, loading } = useAnalysis(evidenceSet.events);

  const orderedEvents = useMemo(
    () =>
      [...evidenceSet.events].sort(
        (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
      ),
    [evidenceSet.events],
  );
  const snapshots = useMemo(
    () => replayStateAt(evidenceSet.events, replayAt),
    [evidenceSet.events, replayAt],
  );
  const range = useMemo(() => {
    const first = Date.parse(orderedEvents[0]?.at ?? replayAt);
    const last = Date.parse(orderedEvents.at(-1)?.at ?? replayAt);
    return {
      min: first - 5 * 60_000,
      max: last + 60_000,
      value: Math.min(last + 60_000, Math.max(first - 5 * 60_000, Date.parse(replayAt))),
    };
  }, [orderedEvents, replayAt]);
  const alertCount = evidenceSet.events.filter((event) => event.kind === "alert").length;
  const resourceCount =
    analysis?.graph.nodes.length ??
    new Set(evidenceSet.events.flatMap((event) => event.resourceIds)).size;

  function loadScenario(id: string): void {
    const next = evidenceSetFromScenario(id);
    setEvidenceSet(next);
    setReplayAt(next.defaultReplayAt);
    setImportError(null);
    setImportState(`Loaded ${next.title} from deterministic repository fixtures.`);
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const input = event.currentTarget;
    const files = [...(input.files ?? [])];
    if (files.length === 0) {
      return;
    }
    setImportError(null);
    setImportState(`Reading ${files.length} local file${files.length === 1 ? "" : "s"}…`);
    try {
      const importedEvents = await importBrowserFiles(files);
      if (importedEvents.length === 0) {
        throw new Error("The selected files contained no supported evidence events.");
      }
      ensureUniqueEventIds(importedEvents);
      const nextReplayAt = defaultReplayAt(importedEvents);
      setEvidenceSet({
        id: "local-import",
        title: "Local evidence session",
        description:
          "Terraform, Kubernetes, deployment, rollback, and alert records imported from this device.",
        sourceLabel: `${files.length} local file${files.length === 1 ? "" : "s"} · in-memory only`,
        events: importedEvents,
        defaultReplayAt: nextReplayAt,
      });
      setReplayAt(nextReplayAt);
      setImportState(
        `Imported ${importedEvents.length} event${importedEvents.length === 1 ? "" : "s"} from ${files.length} local file${files.length === 1 ? "" : "s"}.`,
      );
    } catch (fileError) {
      setImportError(fileError instanceof Error ? fileError.message : String(fileError));
      setImportState("Import failed. Existing evidence remains unchanged.");
    } finally {
      input.value = "";
    }
  }

  function moveToEvent(direction: "previous" | "next"): void {
    const current = Date.parse(replayAt);
    const candidates = orderedEvents
      .map((event) => Date.parse(event.at))
      .filter((time) => (direction === "previous" ? time < current : time > current));
    const target = direction === "previous" ? candidates.at(-1) : candidates[0];
    if (target !== undefined) {
      setReplayAt(new Date(target).toISOString());
    }
  }

  function exportJson(): void {
    if (!analysis) {
      return;
    }
    const report = createIncidentReport(analysis, evidenceSet.title);
    downloadText(
      `${JSON.stringify({ report, replay: { at: replayAt, resources: snapshots } }, null, 2)}\n`,
      `${PROJECT_META.slug}-${evidenceSet.id}-report.json`,
      "application/json",
    );
  }

  function exportMarkdown(): void {
    if (!analysis) {
      return;
    }
    const report = createIncidentReport(analysis, evidenceSet.title);
    const content = `${exportReportMarkdown(report)}\n## Replayed state at ${replayAt}\n\n\`\`\`json\n${JSON.stringify(snapshots, null, 2)}\n\`\`\`\n`;
    downloadText(content, `${PROJECT_META.slug}-${evidenceSet.id}-report.md`, "text/markdown");
  }

  return (
    <div className="app" data-testid={analysis ? "app-ready" : "app-loading"}>
      <a className="skip-link" href="#analysis-workspace">
        Skip to incident analysis
      </a>

      <aside className="sidebar" aria-label="Evidence controls">
        <div className="brand">
          <div className="brand-mark" aria-hidden="true">
            IR
          </div>
          <div>
            <strong>{PROJECT_META.name}</strong>
            <span>Evidence, rewound.</span>
          </div>
        </div>

        <section className="sidebar-section" aria-labelledby="samples-heading">
          <p className="sidebar-label" id="samples-heading">
            Synthetic incidents
          </p>
          <div className="scenario-list">
            {BUILT_IN_SCENARIO_SUMMARIES.map((scenario, index) => (
              <button
                key={scenario.id}
                className={
                  evidenceSet.id === scenario.id ? "scenario-button is-active" : "scenario-button"
                }
                type="button"
                data-testid={`scenario-${scenario.id}`}
                aria-pressed={evidenceSet.id === scenario.id}
                onClick={() => loadScenario(scenario.id)}
              >
                <span>0{index + 1}</span>
                <span>{scenario.title}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="sidebar-section import-section" aria-labelledby="import-heading">
          <p className="sidebar-label" id="import-heading">
            Your evidence
          </p>
          <label className="file-button" htmlFor="evidence-files">
            <span aria-hidden="true">＋</span>
            Import JSON files
          </label>
          <input
            className="visually-hidden"
            id="evidence-files"
            data-testid="evidence-files"
            type="file"
            accept=".json,application/json"
            multiple
            onChange={(event) => void handleFiles(event)}
          />
          <p className="import-status" role="status">
            {importState}
          </p>
          {importError ? (
            <p className="error-message" role="alert">
              {importError}
            </p>
          ) : null}
        </section>

        <div className="privacy-note">
          <span aria-hidden="true">⌁</span>
          <p>
            <strong>Local by design</strong>
            Files stay in this tab. No telemetry, account, or upload endpoint.
          </p>
        </div>

        <div className="sidebar-footer">
          <span>v{PROJECT_META.version}</span>
          <a href="https://github.com/KanadeK/infra-rewind">Source</a>
        </div>
      </aside>

      <div className="main-column">
        <header className="topbar">
          <div className="runtime-status">
            <span className={loading ? "status-dot is-loading" : "status-dot"} />
            {loading ? "Analyzing in worker" : "Analysis ready"}
          </div>
          <div className="topbar-actions">
            <button
              type="button"
              onClick={exportMarkdown}
              disabled={!analysis}
              data-testid="export-markdown"
            >
              Export .md
            </button>
            <button
              className="button-primary"
              type="button"
              onClick={exportJson}
              disabled={!analysis}
            >
              Export JSON
            </button>
          </div>
        </header>

        <main id="analysis-workspace" className="workspace">
          <section className="incident-heading">
            <div>
              <p className="section-kicker">{evidenceSet.sourceLabel}</p>
              <h1 data-testid="scenario-title">{evidenceSet.title}</h1>
              <p>{evidenceSet.description}</p>
            </div>
            <dl className="summary-stats" aria-label="Evidence summary">
              <div>
                <dt>Events</dt>
                <dd>{evidenceSet.events.length}</dd>
              </div>
              <div>
                <dt>Resources</dt>
                <dd>{resourceCount}</dd>
              </div>
              <div>
                <dt>Alerts</dt>
                <dd>{alertCount}</dd>
              </div>
              <div className="summary-boundary">
                <dt>Causal claims</dt>
                <dd>0</dd>
              </div>
            </dl>
          </section>

          <aside className="causality-boundary">
            <span className="boundary-icon" aria-hidden="true">
              ≠
            </span>
            <p>
              <strong>Correlation boundary</strong>
              Suspicion scores rank imported evidence. They do not determine root cause.
            </p>
          </aside>

          {analysisError ? (
            <section className="analysis-error" role="alert">
              <h2>Analysis stopped</h2>
              <p>{analysisError}</p>
            </section>
          ) : null}

          <section className="panel timeline-panel" aria-labelledby="timeline-heading">
            <div className="panel-heading timeline-heading-row">
              <div>
                <p className="section-kicker">Unified chronology</p>
                <h2 id="timeline-heading">Evidence timeline</h2>
              </div>
              <div className="timeline-legend" aria-label="Timeline legend">
                <span className="legend-change">Change</span>
                <span className="legend-deployment">Deploy</span>
                <span className="legend-alert">Alert</span>
                <span className="legend-rollback">Rollback</span>
              </div>
            </div>

            <TimelineChart
              events={orderedEvents}
              replayAt={replayAt}
              onReplayAtChange={setReplayAt}
            />

            <div className="replay-controls">
              <button type="button" onClick={() => moveToEvent("previous")}>
                ← Previous event
              </button>
              <div className="range-control">
                <label htmlFor="replay-range">Replay point</label>
                <input
                  id="replay-range"
                  data-testid="replay-range"
                  type="range"
                  min={range.min}
                  max={range.max}
                  step={60_000}
                  value={range.value}
                  onChange={(event) =>
                    setReplayAt(new Date(Number(event.target.value)).toISOString())
                  }
                />
              </div>
              <label className="datetime-control">
                <span>UTC time</span>
                <input
                  data-testid="replay-time"
                  type="datetime-local"
                  value={replayAt.slice(0, 16)}
                  onChange={(event) => {
                    const time = Date.parse(`${event.target.value}:00Z`);
                    if (!Number.isNaN(time)) {
                      setReplayAt(new Date(time).toISOString());
                    }
                  }}
                />
              </label>
              <button type="button" onClick={() => moveToEvent("next")}>
                Next event →
              </button>
            </div>
            <output className="replay-output" htmlFor="replay-range">
              Replaying <strong>{formatUtc(replayAt)} UTC</strong> · {snapshots.length} active
              resource{snapshots.length === 1 ? "" : "s"}
            </output>
          </section>

          {analysis ? (
            <>
              <div className="analysis-grid">
                <SuspectPanel hypotheses={analysis.hypotheses} events={analysis.events} />
                <RelationshipPanel graph={analysis.graph} />
              </div>

              <div className="evidence-grid">
                <StateInspector snapshots={snapshots} replayAt={replayAt} />
                <section className="panel ledger-panel" aria-labelledby="ledger-heading">
                  <div className="panel-heading">
                    <div>
                      <p className="section-kicker">Observed facts</p>
                      <h2 id="ledger-heading">Evidence ledger</h2>
                    </div>
                    <span className="count-badge">{analysis.events.length} facts</span>
                  </div>
                  <ol className="ledger-list">
                    {analysis.events.map((event) => (
                      <li key={event.id}>
                        <time dateTime={event.at}>{event.at.slice(11, 19)}</time>
                        <div>
                          <span className={`event-badge event-badge--${event.kind}`}>
                            {event.kind}
                          </span>
                          <h3>{event.title}</h3>
                          <p>{event.summary}</p>
                          <code>
                            {event.evidence[0]?.sourceName}
                            {event.evidence[0]?.pointer}
                          </code>
                        </div>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            </>
          ) : (
            <div className="analysis-loading" role="status">
              <span />
              Rebuilding timeline, relationships, and hypotheses…
            </div>
          )}
        </main>

        <footer className="page-footer">
          <p>Facts remain facts. Inferences remain reviewable. Unknowns stay visible.</p>
          <span>MIT · Synthetic fixtures · Offline analysis</span>
        </footer>
      </div>
    </div>
  );
}

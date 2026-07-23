import type { ResourceGraph } from "../../core/types";

export function RelationshipPanel({ graph }: { graph: ResourceGraph }) {
  const edges = [...graph.edges].sort((left, right) => right.weight - left.weight).slice(0, 6);
  return (
    <section className="panel relationship-panel" aria-labelledby="relationship-heading">
      <div className="panel-heading">
        <div>
          <p className="section-kicker">Observed topology</p>
          <h2 id="relationship-heading">Resource links</h2>
        </div>
        <span className="count-badge">{graph.nodes.length} nodes</span>
      </div>
      {edges.length === 0 ? (
        <div className="empty-state">No multi-resource event established a relationship.</div>
      ) : (
        <ul className="relationship-list">
          {edges.map((edge) => (
            <li key={`${edge.source}:${edge.target}`}>
              <code>{edge.source}</code>
              <span aria-hidden="true">↔</span>
              <code>{edge.target}</code>
              <span>
                {edge.weight} observation{edge.weight === 1 ? "" : "s"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

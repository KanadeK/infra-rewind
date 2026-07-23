import { scaleUtc, timeFormat } from "d3";
import type { EventKind, TimelineEvent } from "../../core/types";

interface TimelineChartProps {
  events: TimelineEvent[];
  replayAt: string;
  onReplayAtChange(at: string): void;
}

const WIDTH = 1040;
const HEIGHT = 284;
const LEFT = 112;
const RIGHT = 28;
const laneY: Record<EventKind, number> = {
  change: 58,
  deployment: 110,
  alert: 162,
  rollback: 214,
};
const laneLabel: Record<EventKind, string> = {
  change: "IaC change",
  deployment: "Deploy",
  alert: "Alert",
  rollback: "Rollback",
};

function EventMark({ event }: { event: TimelineEvent }) {
  if (event.kind === "alert") {
    return <path d="M 0 -10 L 10 0 L 0 10 L -10 0 Z" />;
  }
  if (event.kind === "deployment") {
    return <rect x={-9} y={-9} width={18} height={18} rx={2} />;
  }
  if (event.kind === "rollback") {
    return <path d="M 0 -10 L 10 9 L -10 9 Z" />;
  }
  return <circle r={9} />;
}

export function TimelineChart({ events, replayAt, onReplayAtChange }: TimelineChartProps) {
  const ordered = [...events].sort(
    (left, right) => left.at.localeCompare(right.at) || left.id.localeCompare(right.id),
  );
  const first = new Date(ordered[0]?.at ?? replayAt);
  const last = new Date(ordered.at(-1)?.at ?? replayAt);
  const padding = Math.max(60_000, (last.getTime() - first.getTime()) * 0.04);
  const domainStart = new Date(first.getTime() - padding);
  const domainEnd = new Date(last.getTime() + padding);
  const x = scaleUtc()
    .domain([domainStart, domainEnd])
    .range([LEFT, WIDTH - RIGHT]);
  const ticks = x.ticks(6);
  const formatTick = timeFormat("%H:%M");
  const playhead = x(new Date(replayAt));

  return (
    <div className="timeline-frame" data-testid="timeline-chart">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        role="group"
        aria-label="Infrastructure evidence timeline. Each event can set the replay point."
      >
        <g className="timeline-grid">
          {ticks.map((tick) => {
            const position = x(tick);
            return (
              <g key={tick.toISOString()} transform={`translate(${position} 0)`}>
                <line y1={30} y2={238} />
                <text y={266} textAnchor="middle">
                  {formatTick(tick)}
                </text>
              </g>
            );
          })}
        </g>

        {(Object.keys(laneY) as EventKind[]).map((kind) => (
          <g key={kind} className="timeline-lane">
            <text x={0} y={laneY[kind] + 4}>
              {laneLabel[kind]}
            </text>
            <line x1={LEFT} x2={WIDTH - RIGHT} y1={laneY[kind]} y2={laneY[kind]} />
          </g>
        ))}

        <g className="timeline-playhead" transform={`translate(${playhead} 0)`}>
          <line y1={26} y2={238} />
          <path d="M -6 22 L 6 22 L 0 31 Z" />
        </g>

        {ordered.map((event) => {
          const position = x(new Date(event.at));
          return (
            <g
              key={event.id}
              className={`timeline-event timeline-event--${event.kind}`}
              transform={`translate(${position} ${laneY[event.kind]})`}
              role="button"
              tabIndex={0}
              aria-label={`${event.kind}: ${event.title}, ${event.at}. Set replay time.`}
              onClick={() => onReplayAtChange(event.at)}
              onKeyDown={(keyboardEvent) => {
                if (keyboardEvent.key === "Enter" || keyboardEvent.key === " ") {
                  keyboardEvent.preventDefault();
                  onReplayAtChange(event.at);
                }
              }}
            >
              <EventMark event={event} />
              <title>
                {event.title} — {event.at}
              </title>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

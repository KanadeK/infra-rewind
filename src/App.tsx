import { PROJECT_META } from "./project";

export function App() {
  return (
    <main className="shell">
      <p className="eyebrow">Infrastructure incident replay</p>
      <h1>{PROJECT_META.name}</h1>
      <p>{PROJECT_META.statement}</p>
      <span className="version">v{PROJECT_META.version}</span>
    </main>
  );
}

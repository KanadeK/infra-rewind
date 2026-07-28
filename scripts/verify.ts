import path from "node:path";
import { fileURLToPath } from "node:url";
import { runNpm } from "./run-command";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const checks = [
  "format:check",
  "lint",
  "docs:check",
  "typecheck",
  "test:coverage",
  "test:e2e",
  "build",
] as const;

for (const check of checks) {
  process.stdout.write(`\n[verify] ${check}\n`);
  await runNpm(check, { cwd: root });
}

process.stdout.write(`\nVerification passed (${checks.length} quality gates).\n`);

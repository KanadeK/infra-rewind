import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const markerWords = [
  "TO" + "DO",
  "FIX" + "ME",
  "Not" + "Implemented",
  "place" + "holder",
  "coming" + " soon",
  "lorem" + " ipsum",
];
const markerPattern = new RegExp(`\\b(?:${markerWords.join("|")})\\b`, "i");
const secretPatterns = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bgh[pousr]_[A-Za-z0-9]{20,}\b/,
  /\b(?:api[_-]?key|authorization|cookie|password|secret|token)\b\s*[:=]\s*["']?[A-Za-z0-9+/_=-]{12,}/i,
];

export async function scanRepository(): Promise<void> {
  const { stdout } = await execFileAsync("git", ["ls-files", "-z"], {
    cwd: root,
    encoding: "buffer",
    maxBuffer: 20 * 1024 * 1024,
  });
  const tracked = stdout
    .toString("utf8")
    .split("\0")
    .filter((file) => file.length > 0);
  const failures: string[] = [];

  for (const relativePath of tracked) {
    const normalized = relativePath.replaceAll("\\", "/");
    if (
      normalized === "docs/ROADMAP.md" ||
      normalized.endsWith(".png") ||
      normalized.endsWith(".webp")
    ) {
      continue;
    }
    if (
      (path.basename(normalized) === ".env" || path.basename(normalized).startsWith(".env.")) &&
      path.basename(normalized) !== ".env.example"
    ) {
      failures.push(`${normalized}: tracked environment file`);
      continue;
    }

    const buffer = await readFile(path.join(root, relativePath));
    if (buffer.includes(0)) {
      continue;
    }
    const text = buffer.toString("utf8");
    for (const [index, line] of text.split(/\r?\n/).entries()) {
      if (markerPattern.test(line)) {
        failures.push(`${normalized}:${index + 1}: unfinished marker`);
      }
      if (secretPatterns.some((pattern) => pattern.test(line))) {
        failures.push(`${normalized}:${index + 1}: credential-shaped value`);
      }
    }
  }

  if (failures.length > 0) {
    throw new Error(`Repository scan failed:\n${failures.join("\n")}`);
  }
  process.stdout.write(
    `Scanned ${tracked.length} tracked files for secrets and unfinished work.\n`,
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await scanRepository();
}

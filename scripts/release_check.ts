import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import { runNpm } from "./run-command";
import { scanRepository } from "./scan-repository";

interface PackageMetadata {
  name: string;
  version: string;
}

const execFileAsync = promisify(execFile);
const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));

async function git(args: string[]): Promise<string> {
  const result = await execFileAsync("git", args, { cwd: root, encoding: "utf8" });
  return result.stdout.trim();
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const metadata = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
) as PackageMetadata;
const projectSource = await readFile(path.join(root, "src", "project.ts"), "utf8");
const projectVersion = projectSource.match(/version:\s*"([^"]+)"/)?.[1];
if (projectVersion !== metadata.version) {
  throw new Error(`Version mismatch: package=${metadata.version}, UI=${String(projectVersion)}.`);
}

const readme = await readFile(path.join(root, "README.md"), "utf8");
const chineseReadme = await readFile(path.join(root, "README.zh-CN.md"), "utf8");
if (
  !readme.includes(`Status: v${metadata.version}`) ||
  !chineseReadme.includes(`v${metadata.version}`)
) {
  throw new Error("README status does not match package version.");
}

const changelog = await readFile(path.join(root, "CHANGELOG.md"), "utf8");
const releaseHeading = new RegExp(
  `^## \\[${escapePattern(metadata.version)}\\] - \\d{4}-\\d{2}-\\d{2}$`,
  "m",
);
if (!releaseHeading.test(changelog)) {
  throw new Error(`CHANGELOG has no dated ${metadata.version} release heading.`);
}

const status = await git(["status", "--porcelain=v1", "--untracked-files=all"]);
if (status.length > 0) {
  throw new Error(`Release check requires a clean worktree:\n${status}`);
}

const identity = await git(["config", "--get-regexp", "^user\\.(name|email)$"]);
const configured = new Set(
  identity.split(/\r?\n/).map((line) => line.replace(/^user\.(?:name|email)\s+/, "")),
);
const commits = await git(["log", "--format=%an%x00%ae%x00%cn%x00%ce"]);
for (const line of commits.split(/\r?\n/)) {
  const [authorName, authorEmail, committerName, committerEmail] = line.split("\0");
  if (
    !authorName ||
    !authorEmail ||
    !committerName ||
    !committerEmail ||
    !configured.has(authorName) ||
    !configured.has(authorEmail) ||
    !configured.has(committerName) ||
    !configured.has(committerEmail)
  ) {
    throw new Error(`Commit identity does not match configured Git user: ${line}`);
  }
}
const commitBodies = await git(["log", "--format=%B"]);
if (/Co-authored-by:/i.test(commitBodies)) {
  throw new Error("Commit history contains a Co-authored-by trailer.");
}

const artifactNames = [
  `${metadata.name}-v${metadata.version}-static-web.zip`,
  `${metadata.name}-v${metadata.version}-incident-pack-platform-neutral.zip`,
];
const sums = await readFile(path.join(root, "dist-release", "SHA256SUMS.txt"), "utf8");
for (const artifactName of artifactNames) {
  const expected = sums
    .split(/\r?\n/)
    .find((line) => line.endsWith(`  ${artifactName}`))
    ?.split(/\s+/, 1)[0];
  const artifact = await readFile(path.join(root, "dist-release", artifactName));
  const actual = createHash("sha256").update(artifact).digest("hex");
  if (!expected || expected !== actual) {
    throw new Error(`Checksum mismatch for ${artifactName}.`);
  }
}

await scanRepository();
await runNpm("verify", { cwd: root });
process.stdout.write(
  `Release check passed for ${metadata.name} v${metadata.version}: clean tree, versions, changelog, artifacts, tests, scans, and authors verified.\n`,
);

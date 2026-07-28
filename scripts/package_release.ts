import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { unzipSync, zipSync, type Zippable } from "fflate";
import { loadScenarioDirectory } from "../src/adapters/nodeFiles";
import { analyzeEvents } from "../src/core/analyze";
import { closeStaticSite, listenStaticSite } from "./static-site-server";
import { runNpm } from "./run-command";

interface PackageMetadata {
  name: string;
  version: string;
}

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const releaseDirectory = path.join(root, "dist-release");
const zipTimestamp = new Date("1980-01-01T00:00:00.000Z");

async function collectDirectory(
  directory: string,
  archivePrefix: string,
  target: Zippable,
): Promise<void> {
  const entries = await readdir(directory, { withFileTypes: true });
  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolute = path.join(directory, entry.name);
    const archivePath = `${archivePrefix}/${entry.name}`.replaceAll("\\", "/");
    if (entry.isDirectory()) {
      await collectDirectory(absolute, archivePath, target);
    } else if (entry.isFile()) {
      target[archivePath] = [
        new Uint8Array(await readFile(absolute)),
        { level: 9, mtime: zipTimestamp },
      ];
    }
  }
}

function addText(target: Zippable, archivePath: string, content: string): void {
  target[archivePath] = [new TextEncoder().encode(content), { level: 9, mtime: zipTimestamp }];
}

async function extractArchive(archivePath: string, destination: string): Promise<void> {
  const entries = unzipSync(new Uint8Array(await readFile(archivePath)));
  for (const [entryPath, content] of Object.entries(entries)) {
    const normalized = entryPath.replaceAll("\\", "/");
    const outputPath = path.resolve(destination, normalized);
    if (!outputPath.startsWith(`${path.resolve(destination)}${path.sep}`)) {
      throw new Error(`Archive contains an unsafe path: ${entryPath}`);
    }
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, content);
  }
}

function sha256(content: Uint8Array): string {
  return createHash("sha256").update(content).digest("hex");
}

async function smokeStaticSite(directory: string): Promise<void> {
  const site = await listenStaticSite(directory);
  try {
    const pageResponse = await fetch(site.url);
    if (!pageResponse.ok) {
      throw new Error(`Static smoke request returned ${pageResponse.status}.`);
    }
    const html = await pageResponse.text();
    if (!html.includes('<div id="root"></div>')) {
      throw new Error("Static archive index does not contain the application root.");
    }
    const referencedAssets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:css|js))"/g)].map(
      (match) => match[1],
    );
    if (referencedAssets.length === 0) {
      throw new Error("Static archive index does not reference built assets.");
    }
    for (const asset of referencedAssets) {
      const response = await fetch(new URL(asset ?? "", `${site.url}/`));
      if (!response.ok || (await response.arrayBuffer()).byteLength === 0) {
        throw new Error(`Static asset smoke check failed: ${String(asset)}`);
      }
    }
  } finally {
    await closeStaticSite(site);
  }
}

const packageMetadata = JSON.parse(
  await readFile(path.join(root, "package.json"), "utf8"),
) as PackageMetadata;
const slug = packageMetadata.name;
const version = packageMetadata.version;
const staticBase = `${slug}-v${version}-static-web`;
const incidentBase = `${slug}-v${version}-incident-pack-platform-neutral`;
const staticName = `${staticBase}.zip`;
const incidentName = `${incidentBase}.zip`;

await runNpm("build", { cwd: root });
await runNpm("demo", { cwd: root });
await rm(releaseDirectory, { force: true, recursive: true });
await mkdir(releaseDirectory, { recursive: true });

const staticArchive: Zippable = {};
await collectDirectory(path.join(root, "dist"), staticBase, staticArchive);
staticArchive[`${staticBase}/LICENSE`] = [
  new Uint8Array(await readFile(path.join(root, "LICENSE"))),
  { level: 9, mtime: zipTimestamp },
];
staticArchive[`${staticBase}/THIRD_PARTY_NOTICES.md`] = [
  new Uint8Array(await readFile(path.join(root, "THIRD_PARTY_NOTICES.md"))),
  { level: 9, mtime: zipTimestamp },
];
addText(
  staticArchive,
  `${staticBase}/RELEASE-MANIFEST.txt`,
  `Project: Infra Rewind\nVersion: ${version}\nArtifact: deployable static web application\n`,
);

const incidentArchive: Zippable = {};
await collectDirectory(path.join(root, "examples"), `${incidentBase}/examples`, incidentArchive);
await collectDirectory(path.join(root, "demo-output"), `${incidentBase}/reports`, incidentArchive);
for (const relativePath of [
  "LICENSE",
  "THIRD_PARTY_NOTICES.md",
  "docs/INPUT_FORMATS.md",
  "docs/PRIVACY_AND_SECURITY.md",
]) {
  incidentArchive[`${incidentBase}/${relativePath}`] = [
    new Uint8Array(await readFile(path.join(root, relativePath))),
    { level: 9, mtime: zipTimestamp },
  ];
}
addText(
  incidentArchive,
  `${incidentBase}/INCIDENT-PACK-README.md`,
  [
    "# Infra Rewind incident pack",
    "",
    `Version: ${version}`,
    "",
    "This platform-neutral archive contains only MIT-licensed synthetic evidence, generated reports,",
    "input-format documentation, privacy guidance, and license notices.",
    "",
  ].join("\n"),
);

const staticBytes = zipSync(staticArchive);
const incidentBytes = zipSync(incidentArchive);
await writeFile(path.join(releaseDirectory, staticName), staticBytes);
await writeFile(path.join(releaseDirectory, incidentName), incidentBytes);
const checksums = [
  `${sha256(staticBytes)}  ${staticName}`,
  `${sha256(incidentBytes)}  ${incidentName}`,
].join("\n");
await writeFile(path.join(releaseDirectory, "SHA256SUMS.txt"), `${checksums}\n`, "utf8");

const smokeDirectory = await mkdtemp(path.join(os.tmpdir(), "infra-rewind-release-"));
try {
  await extractArchive(path.join(releaseDirectory, staticName), smokeDirectory);
  await extractArchive(path.join(releaseDirectory, incidentName), smokeDirectory);
  await smokeStaticSite(path.join(smokeDirectory, staticBase));

  const scenario = await loadScenarioDirectory(
    path.join(smokeDirectory, incidentBase, "examples", "config-misconfiguration"),
  );
  const analysis = analyzeEvents(scenario.events);
  if (analysis.events.length !== 6 || analysis.hypotheses[0]?.score !== 96) {
    throw new Error("Extracted incident pack did not reproduce the expected analysis.");
  }
  const report = await readFile(
    path.join(smokeDirectory, incidentBase, "reports", "config-misconfiguration.md"),
    "utf8",
  );
  if (
    !report.includes("## Facts") ||
    !report.includes("## Inferences") ||
    !report.includes("## Unknowns")
  ) {
    throw new Error("Extracted incident report is missing a classification section.");
  }
} finally {
  await rm(smokeDirectory, { force: true, recursive: true });
}

process.stdout.write(
  `Created and smoke-tested ${staticName}, ${incidentName}, and SHA256SUMS.txt\n`,
);

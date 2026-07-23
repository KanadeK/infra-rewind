import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const documents = [
  "README.md",
  "README.zh-CN.md",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "THIRD_PARTY_NOTICES.md",
  "docs/ARCHITECTURE.md",
  "docs/BENCHMARK.md",
  "docs/COMPETITOR_SCAN.md",
  "docs/DEMO.md",
  "docs/INPUT_FORMATS.md",
  "docs/PRIVACY_AND_SECURITY.md",
  "docs/RELEASE_CHECKLIST.md",
];
const failures: string[] = [];

for (const relativeDocument of documents) {
  const documentPath = path.join(root, relativeDocument);
  const markdown = await readFile(documentPath, "utf8");
  const links = markdown.matchAll(/!?\[[^\]]*]\(([^)]+)\)/g);
  for (const match of links) {
    const rawTarget = match[1]?.trim();
    if (!rawTarget || rawTarget.startsWith("#") || /^[a-z][a-z0-9+.-]*:/i.test(rawTarget)) {
      continue;
    }
    const targetWithoutAnchor = rawTarget.split("#", 1)[0];
    if (!targetWithoutAnchor) {
      continue;
    }
    const targetPath = path.resolve(
      path.dirname(documentPath),
      decodeURIComponent(targetWithoutAnchor),
    );
    try {
      await access(targetPath);
    } catch {
      failures.push(`${relativeDocument}: ${rawTarget}`);
    }
  }
}

if (failures.length > 0) {
  throw new Error(`Broken relative documentation links:\n${failures.join("\n")}`);
}

process.stdout.write(`Checked relative links in ${documents.length} documentation files.\n`);

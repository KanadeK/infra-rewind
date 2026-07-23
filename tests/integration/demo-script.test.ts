import { execFile } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it } from "vitest";

const execFileAsync = promisify(execFile);
const root = process.cwd();

describe("demo generator", () => {
  it("accepts a bounded unrelated hypothesis without requiring a preferred candidate", async () => {
    const tsxCli = path.join(root, "node_modules", "tsx", "dist", "cli.mjs");
    const { stdout } = await execFileAsync(
      process.execPath,
      [tsxCli, path.join(root, "scripts", "demo.ts")],
      { cwd: root },
    );

    expect(stdout).toContain("Validated 3 incidents");
    const index = await readFile(path.join(root, "demo-output", "README.md"), "utf8");
    const unrelatedRow = index.match(/\| Unrelated concurrent change \| 4 \| \d+ \| (\d+) \|/);
    expect(unrelatedRow).not.toBeNull();
    expect(Number(unrelatedRow?.[1])).toBeLessThanOrEqual(25);
  });
});

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "@playwright/test";
import { build } from "vite";
import { closeStaticSite, listenStaticSite } from "./static-site-server";

const root = path.resolve(fileURLToPath(new URL("..", import.meta.url)));
const outputPath = path.join(root, "docs", "assets", "infra-rewind-dashboard.png");
process.chdir(root);

await mkdir(path.dirname(outputPath), { recursive: true });
await build();
const site = await listenStaticSite(path.join(root, "dist"));
const browser = await chromium.launch();

try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  await page.goto(site.url, { waitUntil: "networkidle" });
  await page.getByTestId("app-ready").waitFor();
  await page.screenshot({ path: outputPath, fullPage: false });
} finally {
  await browser.close();
  await closeStaticSite(site);
}

process.stdout.write(`Captured the running application at ${outputPath}\n`);

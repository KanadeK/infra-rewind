import { readFile } from "node:fs/promises";
import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const baseUrl = process.env.INFRA_REWIND_E2E_URL;
  if (!baseUrl) {
    throw new Error("INFRA_REWIND_E2E_URL was not initialized by global setup.");
  }
  await page.goto(baseUrl);
  await expect(page.getByTestId("app-ready")).toBeVisible();
});

test("replays the configuration incident before and after recovery", async ({ page }) => {
  await expect(page.getByTestId("scenario-title")).toHaveText("Checkout configuration regression");
  const statePanel = page.getByRole("region", { name: "Resource state" });
  await expect(statePanel).toContainText("https://payment.internal");

  await page.getByTestId("replay-time").fill("2026-07-18T09:24");
  await expect(statePanel).toContainText("https://payments.internal");
  await expect(statePanel).not.toContainText('"value": "https://payment.internal"');
});

test("keeps unrelated changes bounded and exports a classified report", async ({ page }) => {
  await page.getByTestId("scenario-unrelated-concurrent-change").click();
  await expect(page.getByTestId("app-ready")).toBeVisible();
  await expect(page.getByTestId("scenario-title")).toHaveText("Unrelated concurrent change");
  await expect(page.getByText("Not causality")).toBeVisible();
  await expect(page.getByRole("meter").first()).toHaveAttribute(
    "aria-valuenow",
    /^(?:[0-9]|1[0-9]|2[0-5])$/,
  );

  const downloadPromise = page.waitForEvent("download");
  await page.getByTestId("export-markdown").click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("infra-rewind-unrelated-concurrent-change-report.md");
  const downloadPath = await download.path();
  expect(downloadPath).not.toBeNull();
  const content = await readFile(downloadPath!, "utf8");
  expect(content).toContain("## Facts");
  expect(content).toContain("## Inferences");
  expect(content).toContain("## Unknowns");
  expect(content).toContain("correlation");
});

test("imports real local evidence and preserves it after an invalid follow-up", async ({
  page,
}) => {
  const capacityDirectory = path.join(process.cwd(), "examples", "capacity-shortage");
  await page
    .getByTestId("evidence-files")
    .setInputFiles([
      path.join(capacityDirectory, "terraform-plan.json"),
      path.join(capacityDirectory, "kubernetes-diff.json"),
      path.join(capacityDirectory, "operations.json"),
      path.join(capacityDirectory, "alerts.json"),
      path.join(capacityDirectory, "recovery-diff.json"),
    ]);
  await expect(page.getByTestId("app-ready")).toBeVisible();
  await expect(page.getByTestId("scenario-title")).toHaveText("Local evidence session");
  await expect(page.getByText(/Imported 6 events from 5 local files/)).toBeVisible();
  await expect(page.getByRole("region", { name: "Resource state" })).toContainText('"replicas": 3');

  await page.getByTestId("evidence-files").setInputFiles({
    name: "invalid.json",
    mimeType: "application/json",
    buffer: Buffer.from("{"),
  });
  await expect(page.getByRole("alert")).toContainText("Could not parse invalid.json");
  await expect(page.getByTestId("scenario-title")).toHaveText("Local evidence session");
});

test("supports keyboard replay, a narrow viewport, and automated accessibility checks", async ({
  page,
}) => {
  const firstTimelineEvent = page.getByTestId("timeline-chart").locator('[role="button"]').first();
  await firstTimelineEvent.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("replay-time")).toHaveValue("2026-07-18T09:00");

  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);

  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.getByTestId("timeline-chart")).toBeVisible();
  const dimensions = await page.evaluate(() => ({
    viewport: window.innerWidth,
    page: document.documentElement.scrollWidth,
  }));
  expect(dimensions.page).toBeLessThanOrEqual(dimensions.viewport);
});

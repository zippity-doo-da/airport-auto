import { expect, test } from "@playwright/test";

test("Manual Supervisor can ignore a flow advisory, see consequences, and recover", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The advisory workflow is covered once in desktop Chromium.",
  );
  test.setTimeout(60_000);

  await page.goto(
    "/?airport=ORD&mode=manual&station=supervisor&density=rush&autostart=1&detail=low&renderFps=0.25",
  );
  await page.waitForFunction(
    () => window.airportControl?.snapshot().trafficManagement.recommendations.length > 0,
  );
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));
  await page.evaluate(() =>
    window.airportControl.request({ action: "setQueueInspectorVisible", enabled: true }),
  );
  await expect(page.locator("#queue-panel")).toBeVisible();

  const metricsBeforeIgnore = await page.evaluate(
    () => window.airportControl.snapshot().traffic.metrics,
  );
  const ignore = page.locator(
    '#queue-capacity button[data-flow-advisory-action="ignore"]',
  ).first();
  await expect(ignore).toBeVisible();
  await ignore.click();
  await expect(
    page.locator('#queue-capacity [data-status="ignored"]'),
  ).toContainText(/Ignored \d+s · \+\d+s queue delay · \+[\d.]+ kg holding fuel/);
  expect(
    await page.evaluate(() => window.airportControl.snapshot().traffic.metrics),
  ).toEqual(metricsBeforeIgnore);

  const recover = page.locator(
    '#queue-capacity button[data-flow-advisory-action="recover"]',
  ).first();
  await expect(recover).toBeEnabled();
  await recover.click();
  await expect(
    page.locator('#queue-capacity [data-status="recovered"]'),
  ).toContainText(/recovery active/i);
  await expect(page.locator("#queue-flow-objective")).toHaveValue(
    /minimum-holding|minimum-taxi-delay/,
  );
  await page.screenshot({
    path: testInfo.outputPath("manual-flow-advisory-recovery.png"),
  });
});

import { expect, test } from "@playwright/test";

test("removed contrails stay absent from UI, URL, renderer, and API", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop covers the shared presentation and control contract.",
  );

  await page.goto(
    "/?airport=ORD&mode=watch&autostart=1&detail=low&renderFps=4&contrails=1",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.40.0");
  await page.waitForFunction(
    () => window.airportControl.snapshot().renderer.aircraftAssets.active > 0,
  );

  await page.locator("#menu-toggle").click();
  await expect(page.locator("#control-panel")).toHaveClass(
    /control-panel--open/,
  );
  await expect(page.locator("#contrails-toggle")).toHaveCount(0);

  const initial = await page.evaluate(() => ({
    snapshot: window.airportControl.snapshot(),
    help: window.airportControl.help(),
  }));
  expect(initial.help).not.toHaveProperty("contrails");
  expect(initial.snapshot.contrailsVisible).toBeFalsy();
  expect(initial.snapshot.renderer).toMatchObject({
    contrailsVisible: false,
    activeContrails: 0,
    pooling: {
      trails: { active: 0, available: 0, capacity: 0 },
    },
  });

  const enableResult = await page.evaluate(() =>
    window.airportControl.request({
      action: "setContrailsVisible",
      enabled: true,
    }),
  );
  expect(enableResult).toMatchObject({
    accepted: false,
    reason: "contrails have been removed",
  });

  const disableResult = await page.evaluate(() =>
    window.airportControl.request({
      action: "setContrailsVisible",
      enabled: false,
    }),
  );
  expect(disableResult).toMatchObject({
    accepted: true,
    reason: "contrails are permanently disabled",
  });

  await page.waitForTimeout(500);
  const final = await page.evaluate(() => window.airportControl.snapshot());
  expect(final.contrailsVisible).toBeFalsy();
  expect(final.renderer).toMatchObject({
    contrailsVisible: false,
    activeContrails: 0,
  });
  await page.screenshot({
    path: testInfo.outputPath("contrails-removed.png"),
  });
});

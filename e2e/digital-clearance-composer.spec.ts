import { expect, test } from "@playwright/test";

test("Data Comm composes, sends, and cancels one atomic route package", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The composer has a focused desktop workflow; responsive layout is covered separately.",
  );
  test.setTimeout(90_000);
  await page.goto(
    "/?airport=ATL&mode=manual&station=supervisor&density=quiet&autostart=1&detail=low",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));

  await page.locator("#menu-toggle").click();
  await page.locator("#digital-clearance-toggle").click();
  await expect(page.locator("#digital-clearance-panel")).toBeVisible();
  await expect(page.locator("#digital-clearance-composer")).toBeVisible();
  await expect(
    page.locator('[data-digital-clearance-view="action"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator("#digital-clearance-flight option"),
  ).not.toHaveCount(0);
  await expect(page.locator("#digital-clearance-route option")).not.toHaveCount(
    0,
  );

  let flightId: number | null = null;
  const flightCount = await page
    .locator("#digital-clearance-flight option")
    .count();
  for (
    let flightIndex = 0;
    flightIndex < flightCount && flightId === null;
    flightIndex += 1
  ) {
    await page
      .locator("#digital-clearance-flight")
      .selectOption({ index: flightIndex });
    const routeCount = await page
      .locator("#digital-clearance-route option")
      .count();
    for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
      await page
        .locator("#digital-clearance-route")
        .selectOption({ index: routeIndex });
      await page.locator("#digital-clearance-altitude").fill("4000");
      await page.locator("#digital-clearance-speed").fill("190");
      await page.locator("#digital-clearance-preview").click();
      if (await page.locator("#digital-clearance-issue").isEnabled()) {
        flightId = Number(
          await page.locator("#digital-clearance-flight").inputValue(),
        );
        break;
      }
      await page.locator("#digital-clearance-cancel").click();
    }
  }
  expect(flightId).not.toBeNull();
  const originalRoute = await page.evaluate(
    (id) =>
      window.airportControl
        .snapshot()
        .flights.find((flight) => flight.id === id)?.navigation.routeFixIds,
    flightId!,
  );
  expect(originalRoute?.length).toBeGreaterThan(0);

  await expect(page.locator("#digital-clearance-composer-state")).toContainText(
    "Preview safe",
  );
  await expect(page.locator("#digital-clearance-issue")).toBeEnabled();
  await expect(
    page.locator('.digital-clearance__message[data-status="draft"]'),
  ).toContainText(/4,000 ft · 190 kt/i);
  await page.screenshot({
    path: testInfo.outputPath("digital-clearance-preview.png"),
  });

  await page.locator("#digital-clearance-issue").click();
  await expect(page.locator("#digital-clearance-composer-state")).toContainText(
    "Sent",
  );
  await expect(
    page.locator('.digital-clearance__message[data-status="sent"]'),
  ).toContainText("COMPOUND CLEARANCE");
  const sentRoute = await page.evaluate(
    (id) =>
      window.airportControl
        .snapshot()
        .flights.find((flight) => flight.id === id)?.navigation.routeFixIds,
    flightId!,
  );
  expect(sentRoute).toEqual(originalRoute);

  await page.locator("#digital-clearance-cancel").click();
  await page.locator('[data-digital-clearance-view="history"]').click();
  await expect(
    page.locator('[data-digital-clearance-view="history"]'),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    page.locator(
      `.digital-clearance__message[data-status="cancelled"][data-clearance-flight-id="${flightId}"]`,
    ),
  ).toContainText("COMPOUND CLEARANCE");
  await expect(page.locator("#digital-clearance-cancel")).toBeDisabled();
});

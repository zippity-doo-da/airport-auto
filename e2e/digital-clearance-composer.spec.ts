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

test("Data Comm retains focus through a keyboard-only clearance lifecycle", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop Chromium exercises the complete keyboard focus order.",
  );
  test.setTimeout(90_000);
  await page.goto(
    "/?airport=ATL&mode=manual&station=supervisor&density=quiet&autostart=1&detail=low&seed=44001",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));

  const menuToggle = page.locator("#menu-toggle");
  if ((await menuToggle.getAttribute("aria-expanded")) !== "true") {
    await menuToggle.focus();
    await page.keyboard.press("Enter");
  }
  const panelToggle = page.locator("#digital-clearance-toggle");
  await panelToggle.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator("#digital-clearance-panel")).toBeVisible();
  await expect(panelToggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#digital-clearance-close")).toBeFocused();

  await page.keyboard.press("Tab");
  await expect(
    page.locator('[data-digital-clearance-view="action"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.locator('[data-digital-clearance-view="history"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.locator('[data-digital-clearance-view="all"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#digital-clearance-flight")).toBeFocused();

  const flight = page.locator("#digital-clearance-flight");
  const route = page.locator("#digital-clearance-route");
  const altitude = page.locator("#digital-clearance-altitude");
  const speed = page.locator("#digital-clearance-speed");
  const preview = page.locator("#digital-clearance-preview");
  const issue = page.locator("#digital-clearance-issue");
  const cancel = page.locator("#digital-clearance-cancel");
  let flightId: number | null = null;
  const flightCount = await flight.locator("option").count();
  for (
    let flightIndex = 0;
    flightIndex < flightCount && flightId === null;
    flightIndex += 1
  ) {
    await flight.focus();
    await page.keyboard.press("Home");
    for (let index = 0; index < flightIndex; index += 1)
      await page.keyboard.press("ArrowDown");
    const routeCount = await route.locator("option").count();
    for (let routeIndex = 0; routeIndex < routeCount; routeIndex += 1) {
      await route.focus();
      await page.keyboard.press("Home");
      for (let index = 0; index < routeIndex; index += 1)
        await page.keyboard.press("ArrowDown");
      await altitude.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("4000");
      await speed.focus();
      await page.keyboard.press("ControlOrMeta+A");
      await page.keyboard.type("190");
      await preview.focus();
      await page.keyboard.press("Enter");
      if (await issue.isEnabled()) {
        flightId = Number(await flight.inputValue());
        break;
      }
      await cancel.focus();
      await page.keyboard.press("Enter");
    }
  }
  expect(flightId).not.toBeNull();
  await issue.focus();
  await expect(issue).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#digital-clearance-composer-state")).toContainText(
    "Sent",
  );

  const allView = page.locator('[data-digital-clearance-view="all"]');
  await allView.focus();
  await page.keyboard.press("Enter");
  const sentRow = page
    .locator(
      `.digital-clearance__message[data-clearance-flight-id="${flightId}"]`,
    )
    .filter({ hasText: "COMPOUND CLEARANCE" })
    .first();
  await expect(sentRow).toHaveAttribute("data-status", "sent");
  const commandId = await sentRow.getAttribute("data-clearance-command-id");
  expect(commandId).toBeTruthy();
  await sentRow.focus();
  await expect(sentRow).toBeFocused();

  await page.evaluate(() =>
    window.airportControl.request({ action: "resume" }),
  );
  await page.waitForFunction((id) => {
    const row = document.querySelector<HTMLElement>(
      `[data-clearance-command-id="${id}"]`,
    );
    return row && row.dataset.status !== "sent";
  }, commandId);
  await expect(
    page.locator(`[data-clearance-command-id="${commandId}"]`),
  ).toBeFocused();
  await page.screenshot({
    path: testInfo.outputPath("digital-clearance-keyboard-focus.png"),
  });

  await page.keyboard.press("Escape");
  await expect(page.locator("#digital-clearance-panel")).toBeHidden();
  await expect(panelToggle).toHaveAttribute("aria-expanded", "false");
  await expect(panelToggle).toBeFocused();
});

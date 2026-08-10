import { expect, test } from "@playwright/test";

test("Assisted flow proposal shows its authoritative timing context", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The compact advisor regression is covered once in desktop Chromium.",
  );
  test.setTimeout(90_000);
  await page.goto(
    "/?airport=ORD&mode=assisted&station=supervisor&density=busy&autostart=1&detail=low&renderFps=0.25",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await page.waitForFunction(
    () =>
      window.airportControl
        .snapshot()
        .proposals.some((proposal) => proposal.flow),
    undefined,
    { timeout: 60_000 },
  );
  const proposal = await page.evaluate(() =>
    window.airportControl
      .snapshot()
      .proposals.find((candidate) => candidate.flow),
  );
  expect(proposal?.flow).toMatchObject({
    schemaVersion: 1,
    commandArbiterRequired: true,
  });
  await page
    .locator(`#flight-chips [data-flight-chip="${proposal!.flightId}"]`)
    .click();
  const flowLine = page.locator(".clearance-advisor__flow");
  await expect(flowLine).toBeVisible();
  await expect(flowLine).toContainText(/RUNWAY THRESHOLD|DEPARTURE RELEASE/);
  await expect(flowLine).toContainText(/early|on-time|late/i);
  await expect(flowLine).toContainText(/window/i);
  await flowLine.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("flow-advisor.png") });
});

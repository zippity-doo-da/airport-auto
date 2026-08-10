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

test("Supervisor can safely resequence a non-imminent departure slot", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The flow sequencing command and Queue panel are covered once in desktop Chromium.",
  );
  test.setTimeout(90_000);
  await page.goto(
    "/?airport=ORD&mode=assisted&station=supervisor&density=busy&autostart=1&detail=low&renderFps=2",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await page.waitForFunction(() => {
    const snapshot = window.airportControl.snapshot();
    return snapshot.trafficManagement.departureQueue
      .slice(1, 5)
      .some((entry, offset) => {
        const index = offset + 1;
        const previous = snapshot.trafficManagement.departureQueue[index - 1];
        return (
          previous &&
          entry.releaseSlotSeconds > snapshot.clock + 10 &&
          previous.releaseSlotSeconds > snapshot.clock + 10
        );
      });
  });
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));
  const before = await page.evaluate(() => {
    const snapshot = window.airportControl.snapshot();
    const queue = snapshot.trafficManagement.departureQueue;
    const index =
      queue.slice(1, 5).findIndex((entry, offset) => {
        const actualIndex = offset + 1;
        const previous = queue[actualIndex - 1];
        return (
          previous &&
          entry.releaseSlotSeconds > snapshot.clock + 10 &&
          previous.releaseSlotSeconds > snapshot.clock + 10
        );
      }) + 1;
    const entry = queue[index];
    return {
      entryId: entry.id,
      priorEntryId: queue[index - 1].id,
      order: queue.map((candidate) => candidate.id),
      poses: snapshot.flights.map((flight) => ({
        id: flight.id,
        motion: flight.motion,
      })),
    };
  });
  const openResult = await page.evaluate(() =>
    window.airportControl.request({
      action: "setQueueInspectorVisible",
      enabled: true,
    }),
  );
  expect(openResult.accepted).toBeTruthy();
  const panel = page.locator("#queue-panel");
  await expect(panel).toBeVisible();
  const earlier = panel.locator(
    `button[data-flow-entry-id="${before.entryId}"][data-flow-resequence="earlier"]`,
  );
  await expect(earlier).toBeEnabled();
  await earlier.click();
  await page.waitForFunction(
    ({ entryId, priorEntryId }) => {
      const queue =
        window.airportControl.snapshot().trafficManagement.departureQueue;
      return (
        queue.findIndex((entry) => entry.id === entryId) + 1 ===
        queue.findIndex((entry) => entry.id === priorEntryId)
      );
    },
    { entryId: before.entryId, priorEntryId: before.priorEntryId },
  );
  const after = await page.evaluate(() => {
    const snapshot = window.airportControl.snapshot();
    return {
      queue: snapshot.trafficManagement.departureQueue,
      poses: snapshot.flights.map((flight) => ({
        id: flight.id,
        motion: flight.motion,
      })),
    };
  });
  expect(after.queue.map((entry) => entry.id)).not.toEqual(before.order);
  expect(after.poses).toEqual(before.poses);
  expect(
    after.queue
      .find((entry) => entry.id === before.entryId)
      ?.slotRevisions.at(-1)?.reason,
  ).toContain("sequence revised");
  await expect(
    panel
      .locator(".queue-meter-slot")
      .filter({ hasText: "controller sequence" }),
  ).not.toHaveCount(0);
  await earlier.scrollIntoViewIfNeeded();
  await page.screenshot({ path: testInfo.outputPath("flow-resequence.png") });
});

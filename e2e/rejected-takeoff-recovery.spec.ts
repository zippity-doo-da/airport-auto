import { expect, test } from "@playwright/test";

test("a rejected takeoff protects, recovers, and reopens its runway", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The recovery presentation gate runs once on desktop.",
  );
  test.skip(
    process.env.AIRPORT_AUTO_LONG_E2E !== "1",
    "Set AIRPORT_AUTO_LONG_E2E=1 for the real-time surface lifecycle gate.",
  );
  test.setTimeout(360_000);

  await page.goto(
    "/?airport=ATL&seed=18003&mode=auto&density=quiet&weather=clear&wind=off&autostart=1&detail=low&renderFps=30",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  const sandbox = await page.evaluate(() => {
    const started = window.airportControl.request({
      action: "startSandbox",
      backgroundTraffic: false,
    });
    const injected = window.airportControl.request({
      action: "injectSandboxTraffic",
      direction: "departure",
      trafficClass: "passenger",
      runwayId: null,
      count: 1,
    });
    return {
      started: started.accepted,
      injected: injected.accepted,
    };
  });
  expect(sandbox).toEqual({ started: true, injected: true });
  await page.waitForFunction(
    () =>
      window.airportControl
        .snapshot()
        .flights.some(
          (flight) =>
            flight.phase === "takeoff" &&
            flight.takeoffCleared &&
            flight.motion.stage === "takeoff-roll" &&
            flight.kinematics.groundSpeedKts >= 30,
        ),
    undefined,
    { timeout: 240_000 },
  );

  const rejected = await page.evaluate(() => {
    const api = window.airportControl;
    const flight = api
      .snapshot()
      .flights.find(
        (candidate) =>
          candidate.phase === "takeoff" &&
          candidate.takeoffCleared &&
          candidate.motion.stage === "takeoff-roll" &&
          candidate.kinematics.groundSpeedKts >= 30,
      );
    if (!flight) return null;
    const rejection = api.request({
      action: "rejectTakeoff",
      flightId: flight.id,
      reason: "technical",
    });
    const manual = api.request({ action: "setMode", value: "manual" });
    const supervisor = api.request({
      action: "setStation",
      station: "supervisor",
    });
    return {
      flightId: flight.id,
      runwayId: flight.runway,
      rejectionAccepted: rejection.accepted,
      rejectionReason: rejection.reason,
      manualAccepted: manual.accepted,
      supervisorAccepted: supervisor.accepted,
    };
  });
  expect(rejected).not.toBeNull();
  expect(rejected).toMatchObject({
    rejectionAccepted: true,
    manualAccepted: true,
    supervisorAccepted: true,
  });

  await page.waitForFunction((flightId) => {
    const flight = window.airportControl
      .snapshot()
      .flights.find((candidate) => candidate.id === flightId);
    return typeof flight?.rejectedTakeoff?.stoppedAtSeconds === "number";
  }, rejected?.flightId);
  await page.evaluate((flightId) => {
    window.airportControl.request({ action: "focusFlight", flightId });
  }, rejected?.flightId);

  const recoveryButton = page.locator(
    '[data-flight-action="recover"]:has-text("Dispatch runway recovery")',
  );
  await expect(recoveryButton).toBeVisible();
  await expect(recoveryButton).toBeEnabled();
  await expect(page.locator("#flight-actions")).toContainText(
    "Rejected takeoff recovery",
  );
  await page.screenshot({
    path: testInfo.outputPath("rejected-takeoff-awaiting-recovery.png"),
    animations: "disabled",
  });

  await recoveryButton.click();
  await page.waitForFunction(
    (flightId) =>
      window.airportControl
        .snapshot()
        .surfaceDisruptions.some(
          (disruption) =>
            disruption.flightId === flightId &&
            disruption.status === "recovering",
        ),
    rejected?.flightId,
  );
  await page.evaluate(() =>
    window.airportControl.request({ action: "setSpeed", value: 3 }),
  );
  await page.waitForFunction(
    (flightId) =>
      !window.airportControl
        .snapshot()
        .flights.some((flight) => flight.id === flightId),
    rejected?.flightId,
    { timeout: 45_000 },
  );

  const restored = await page.evaluate(({ flightId, runwayId }) => {
    const snapshot = window.airportControl.snapshot();
    return {
      disruptionPresent: snapshot.surfaceDisruptions.some(
        (disruption) => disruption.flightId === flightId,
      ),
      runwayClosed: snapshot.surfaceDisruptions.some(
        (disruption) =>
          disruption.runwayId === runwayId &&
          (disruption.status === "active" ||
            disruption.status === "recovering"),
      ),
      collisions: snapshot.traffic.collisions.length,
      obstacleCollisions: snapshot.traffic.obstacleCollisions.length,
      serviceVehicleConflicts: snapshot.traffic.serviceVehicleConflicts.length,
    };
  }, rejected!);
  expect(restored).toEqual({
    disruptionPresent: false,
    runwayClosed: false,
    collisions: 0,
    obstacleCollisions: 0,
    serviceVehicleConflicts: 0,
  });
});

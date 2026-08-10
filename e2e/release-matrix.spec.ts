import { expect, test } from "@playwright/test";

const AIRPORTS = [
  "LOCAL",
  "ATL",
  "DXB",
  "HND",
  "DFW",
  "ORD",
  "LHR",
  "IST",
  "DEN",
  "LAX",
  "JFK",
] as const;

const SCENARIOS = [
  "normal",
  "rush",
  "storm",
  "closure",
  "training",
  "emergency",
] as const;

async function waitForRuntime(page: import("@playwright/test").Page) {
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await page.waitForFunction(
    () => window.airportControl.snapshot().renderer.aircraftAssets.active > 0,
  );
}

test("every named airport and traffic scenario boots through the public runtime", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "The release matrix runs once; mobile has its own presentation gate.",
  );
  test.setTimeout(150_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  for (const [index, airport] of AIRPORTS.entries()) {
    await page.goto(
      `/?airport=${airport}&seed=${11000 + index}&mode=watch&density=quiet&autostart=1&detail=low&renderFps=0.25`,
    );
    await waitForRuntime(page);
    const smoke = await page.evaluate(() => {
      const snapshot = window.airportControl.snapshot();
      return {
        code: snapshot.airport.code,
        flights: snapshot.flights.length,
        drawCalls: snapshot.renderer.drawCalls,
        groundFillsViewport: snapshot.renderer.camera.groundFillsViewport,
        migrationContracts: window.airportControl.migrations.catalog().length,
      };
    });
    expect(smoke.code).toBe(airport);
    expect(smoke.flights).toBeGreaterThan(0);
    expect(smoke.drawCalls).toBeGreaterThan(0);
    expect(smoke.groundFillsViewport).toBeTruthy();
    expect(smoke.migrationContracts).toBe(11);
  }

  for (const scenario of SCENARIOS) {
    await page.goto(
      `/?airport=ATL&seed=12000&mode=auto&scenario=${scenario}&density=quiet&autostart=1&detail=low&renderFps=0.25`,
    );
    await waitForRuntime(page);
    const state = await page.evaluate(() => window.airportControl.snapshot());
    expect(state.scenario).toBe(scenario);
    expect(state.traffic.collisions).toHaveLength(0);
    expect(state.traffic.obstacleCollisions).toHaveLength(0);
    expect(state.traffic.serviceVehicleConflicts).toHaveLength(0);
  }

  expect(consoleErrors).toEqual([]);
});

test("desktop spectator scene matches the release baseline", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop baseline only.",
  );
  await page.goto(
    "/?airport=ORD&seed=10001&mode=watch&density=busy&weather=rain&windDir=260&wind=14&season=autumn&autostart=1&detail=low&renderFps=30",
  );
  await waitForRuntime(page);
  await page.waitForFunction(
    () => window.airportControl.snapshot().renderer.context.status === "loaded",
  );
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await expect(page).toHaveScreenshot("spectator-ord-desktop.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.locator(".status"), page.locator(".scoreboard")],
    maxDiffPixelRatio: 0.035,
  });
});

test("mobile spectator scene matches the release baseline", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Mobile baseline only.",
  );
  await page.goto(
    "/?airport=ATL&seed=10000&mode=watch&density=realistic&weather=clear&wind=off&autostart=1&detail=low&renderFps=30",
  );
  await waitForRuntime(page);
  await page.evaluate(() => window.airportControl.request({ action: "pause" }));
  await page.addStyleTag({
    content:
      "*,*::before,*::after{animation:none!important;transition:none!important;caret-color:transparent!important}",
  });
  await expect(page).toHaveScreenshot("spectator-atl-mobile.png", {
    animations: "disabled",
    caret: "hide",
    mask: [page.locator(".status"), page.locator(".scoreboard")],
    maxDiffPixelRatio: 0.035,
  });
});

test("Atlanta matches the ORD control and presentation acceptance gate", async ({
  page,
}, testInfo) => {
  test.setTimeout(60_000);
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  await page.goto(
    "/?airport=ATL&seed=10003&mode=auto&density=quiet&weather=clear&wind=off&autostart=1&detail=low&renderFps=30",
  );
  await waitForRuntime(page);

  const controlGate = await page.evaluate(() => {
    const api = window.airportControl;
    const modes = ["auto", "assisted", "manual", "watch"] as const;
    const modeResults = modes.map((value) =>
      api.request({ action: "setMode", value }),
    );
    const weather = api.request({
      action: "setWeather",
      condition: "rain",
      directionDegrees: 270,
      windSpeed: 18,
    });
    const weatherOff = api.request({
      action: "setWeatherEnabled",
      enabled: false,
    });
    const windOff = api.request({ action: "setWindEnabled", enabled: false });
    const radar = api.request({ action: "setRadarVisible", enabled: true });
    api.request({ action: "setCameraDirectorEnabled", enabled: false });
    const cameraBefore = api.snapshot().renderer.camera;
    const zoom = api.request({ action: "zoomIn" });
    const rotate = api.request({ action: "rotateRight" });
    const cameraAfter = api.snapshot().renderer.camera;
    return {
      airport: api.snapshot().airport.code,
      modeResults: modeResults.map((result) => ({
        accepted: result.accepted,
        mode: result.resultingState.mode,
        commandId: result.commandId,
        eventId: result.eventId,
        requestId: result.requestId,
        reason: result.reason,
      })),
      weather: {
        accepted: weather.accepted,
        condition: weather.resultingState.weather.condition,
        direction: weather.resultingState.weather.windDirectionDegrees,
        speed: weather.resultingState.weather.windSpeed,
      },
      weatherOff: {
        accepted: weatherOff.accepted,
        enabled: weatherOff.resultingState.weather.enabled,
      },
      windOff: {
        accepted: windOff.accepted,
        enabled: windOff.resultingState.weather.windEnabled,
      },
      radar: {
        accepted: radar.accepted,
        visible: radar.resultingState.radarVisible,
      },
      camera: {
        zoomAccepted: zoom.accepted,
        rotateAccepted: rotate.accepted,
        zoomBefore: cameraBefore.zoom,
        zoomAfter: cameraAfter.zoom,
        orbitBefore: cameraBefore.orbitDegrees,
        orbitAfter: cameraAfter.orbitDegrees,
      },
    };
  });

  expect(controlGate.airport).toBe("ATL");
  expect(controlGate.modeResults).toHaveLength(4);
  for (const [index, mode] of [
    "auto",
    "assisted",
    "manual",
    "watch",
  ].entries()) {
    expect(controlGate.modeResults[index]).toMatchObject({
      accepted: true,
      mode,
    });
    expect(controlGate.modeResults[index].commandId).toBeTruthy();
    expect(controlGate.modeResults[index].eventId).toBeTruthy();
    expect(controlGate.modeResults[index].requestId).toBeTruthy();
    expect(controlGate.modeResults[index].reason).toBeTruthy();
  }
  expect(controlGate.weather).toEqual({
    accepted: true,
    condition: "rain",
    direction: 270,
    speed: 18,
  });
  expect(controlGate.weatherOff).toEqual({ accepted: true, enabled: false });
  expect(controlGate.windOff).toEqual({ accepted: true, enabled: false });
  expect(controlGate.radar).toEqual({ accepted: true, visible: true });
  expect(controlGate.camera.zoomAccepted).toBeTruthy();
  expect(controlGate.camera.rotateAccepted).toBeTruthy();
  expect(controlGate.camera.zoomAfter).toBeLessThan(
    controlGate.camera.zoomBefore,
  );
  expect(controlGate.camera.orbitAfter).not.toBe(
    controlGate.camera.orbitBefore,
  );
  await expect(page.locator("#radar-panel")).toBeVisible();

  const cameraBeforeInput = await page.evaluate(
    () => window.airportControl.snapshot().renderer.camera,
  );
  if (testInfo.project.name === "mobile-chromium") {
    const panRight = page.locator('[data-touch-camera="pan-right"]');
    await panRight.dispatchEvent("pointerdown", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
    });
    await page.waitForTimeout(250);
    await panRight.dispatchEvent("pointerup", {
      pointerId: 7,
      pointerType: "touch",
      isPrimary: true,
    });
  } else {
    await page.keyboard.down("w");
    await page.waitForTimeout(250);
    await page.keyboard.up("w");
  }
  const cameraAfterInput = await page.evaluate(
    () => window.airportControl.snapshot().renderer.camera,
  );
  expect(
    Math.hypot(
      cameraAfterInput.focusX - cameraBeforeInput.focusX,
      cameraAfterInput.focusY - cameraBeforeInput.focusY,
    ),
  ).toBeGreaterThan(0.01);

  await page.waitForFunction(
    () => window.airportControl.snapshot().replay.frames >= 3,
  );
  const replayGate = await page.evaluate(() => {
    const api = window.airportControl;
    const recording = api.recording();
    const verification = api.replayTools.verify(recording);
    const loaded = api.replayTools.load(recording);
    return {
      frames: recording.frames.length,
      verified: verification.exact,
      loaded: loaded.exact,
      airport: api.snapshot().airport.code,
      replaySource: api.snapshot().replay.source,
    };
  });
  expect(replayGate).toMatchObject({
    verified: true,
    loaded: true,
    airport: "ATL",
    replaySource: "imported",
  });
  expect(replayGate.frames).toBeGreaterThanOrEqual(3);

  await page.locator("#replay-slider").evaluate((slider: HTMLInputElement) => {
    slider.value = "0";
    slider.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.waitForTimeout(100);
  const replayPose = await page.evaluate(() => {
    const api = window.airportControl;
    const firstFrame = api.replay()[0];
    const snapshot = api.snapshot();
    const replayFlight = firstFrame.state.flights.find((flight) =>
      snapshot.flights.some((liveFlight) => liveFlight.id === flight.id),
    );
    const liveFlight = snapshot.flights.find(
      (flight) => flight.id === replayFlight?.id,
    );
    if (!replayFlight || !liveFlight?.poseAlignment.renderer) return null;
    return {
      sourceError: Math.hypot(
        liveFlight.poseAlignment.renderer.sourceMotion.x -
          replayFlight.motion.x,
        liveFlight.poseAlignment.renderer.sourceMotion.y -
          replayFlight.motion.y,
        liveFlight.poseAlignment.renderer.sourceMotion.z -
          replayFlight.motion.z,
      ),
      horizontalError: Math.hypot(
        liveFlight.poseAlignment.renderer.position.x - replayFlight.motion.x,
        liveFlight.poseAlignment.renderer.position.y - replayFlight.motion.y,
      ),
      verticalError: Math.abs(
        liveFlight.poseAlignment.renderer.position.z - replayFlight.motion.z,
      ),
    };
  });
  expect(replayPose).not.toBeNull();
  expect(replayPose?.sourceError).toBeLessThan(0.001);
  expect(replayPose?.horizontalError).toBeLessThan(0.01);
  expect(replayPose?.verticalError).toBeLessThan(0.5);

  const safety = await page.evaluate(() => {
    const state = window.airportControl.snapshot();
    return {
      collisions: state.traffic.collisions,
      obstacles: state.traffic.obstacleCollisions,
      serviceVehicles: state.traffic.serviceVehicleConflicts,
      groundFillsViewport: state.renderer.camera.groundFillsViewport,
    };
  });
  expect(safety.collisions).toHaveLength(0);
  expect(safety.obstacles).toHaveLength(0);
  expect(safety.serviceVehicles).toHaveLength(0);
  expect(safety.groundFillsViewport).toBeTruthy();
  await page.screenshot({
    path: testInfo.outputPath("atl-parity-gate.png"),
    animations: "disabled",
  });
  expect(consoleErrors).toEqual([]);
});

test("surface safety stays clear of primary transitions at release viewports", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "One Chromium project covers the explicit responsive viewport matrix.",
  );

  await page.goto(
    "/?airport=ORD&seed=10002&mode=auto&density=quiet&autostart=1&detail=low&renderFps=1&surface-safety=1",
  );
  await waitForRuntime(page);

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 600 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    const bounds = await page.evaluate(() => {
      const rect = (selector: string) => {
        const element = document.querySelector(selector);
        if (!element) throw new Error(`Missing ${selector}`);
        const bounds = element.getBoundingClientRect();
        return {
          top: bounds.top,
          right: bounds.right,
          bottom: bounds.bottom,
          left: bounds.left,
        };
      };
      const overlapArea = (
        first: ReturnType<typeof rect>,
        second: ReturnType<typeof rect>,
      ) =>
        Math.max(
          0,
          Math.min(first.right, second.right) -
            Math.max(first.left, second.left),
        ) *
        Math.max(
          0,
          Math.min(first.bottom, second.bottom) -
            Math.max(first.top, second.top),
        );
      const safety = rect("#surface-safety-panel");
      const controls = rect("#menu-toggle");
      const combat = rect(".combat-transition");
      return {
        safety,
        controlsOverlap: overlapArea(safety, controls),
        combatOverlap: overlapArea(safety, combat),
      };
    });

    expect(bounds.safety.top).toBeGreaterThanOrEqual(0);
    expect(bounds.safety.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.safety.bottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.safety.left).toBeGreaterThanOrEqual(0);
    expect(bounds.controlsOverlap).toBe(0);
    expect(bounds.combatOverlap).toBe(0);
  }

  await page.locator("#surface-safety-close").click();
  await expect(page.locator("#surface-safety-panel")).toBeHidden();
  await page.locator("#menu-toggle").click();
  await page.locator("#surface-safety-toggle").click();
  await expect(page.locator("#surface-safety-panel")).toBeVisible();
});

test("surface safety preserves keyboard, readable, and assistive semantics", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Keyboard and assistive-semantics audit runs once on desktop Chromium.",
  );
  await page.goto(
    "/?airport=ORD&seed=10002&mode=auto&density=quiet&autostart=1&detail=low&renderFps=2",
  );
  await waitForRuntime(page);
  await page.locator("#menu-toggle").click();
  const toggle = page.locator("#surface-safety-toggle");
  await toggle.focus();
  await page.keyboard.press("Enter");

  const panel = page.locator("#surface-safety-panel");
  await expect(panel).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  await expect(page.locator("#surface-safety-filter")).toBeFocused();
  await expect(panel).toHaveAttribute(
    "aria-labelledby",
    "surface-safety-heading",
  );
  await expect(page.locator("#surface-safety-live-summary")).toHaveAttribute(
    "aria-live",
    "polite",
  );
  await expect(page.locator("#surface-safety-live-summary")).toContainText(
    /moving aircraft.*protected runway.*held.*warnings.*critical/s,
  );
  await expect
    .poll(() => panel.locator(".surface-safety__track").count())
    .toBeGreaterThan(0);
  await expect(panel.locator(".surface-safety__track").first()).toHaveAttribute(
    "aria-label",
    /Groundspeed .* knots.*Heading .* degrees.*Track age .* seconds/,
  );

  const audit = await panel.evaluate((root) => {
    const visibleText = [
      ...root.querySelectorAll<HTMLElement>(
        ".surface-safety__filter, header span, footer, h2, .surface-safety__summary small, .surface-safety__lookahead, .surface-safety__layers label, .surface-safety__advisory, .surface-safety__track :is(b, i, span, small), .surface-safety__vehicle",
      ),
    ].filter((element) => element.checkVisibility());
    const statusRows = [
      ...root.querySelectorAll<HTMLElement>(
        ".surface-safety__track[data-state], .surface-safety__advisory[data-severity], .surface-safety__vehicle[data-state]",
      ),
    ];
    return {
      minimumFontPx: Math.min(
        ...visibleText.map((element) =>
          Number.parseFloat(getComputedStyle(element).fontSize),
        ),
      ),
      unlabeledStatusRows: statusRows.filter(
        (row) =>
          !row.textContent?.trim() && !row.getAttribute("aria-label")?.trim(),
      ).length,
    };
  });
  expect(audit.minimumFontPx).toBeGreaterThanOrEqual(9);
  expect(audit.unlabeledStatusRows).toBe(0);

  await page.screenshot({
    path: testInfo.outputPath("surface-safety-accessibility-desktop.png"),
  });
  await page.keyboard.press("Escape");
  await expect(panel).toBeHidden();
  await expect(toggle).toBeFocused();
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
});

test("modal focus, keyboard flow, readable strips, and semantic contrast regressions stay bounded", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Keyboard gate runs on desktop.",
  );
  await page.goto(
    "/?airport=ATL&seed=10000&mode=manual&detail=low&renderFps=4",
  );
  await page.waitForFunction(() => window.airportControl?.version === "2.41.0");
  await expect(page.locator("#enter")).toBeFocused();
  const inertSiblings = await page.locator("#app > [inert]").count();
  expect(inertSiblings).toBeGreaterThan(5);
  await page.keyboard.press("Tab");
  await expect(
    page.locator('.intro-archive-link[href="./fighters.html"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.locator('.intro-archive-link[href="./flight-playground.html"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(
    page.locator('.intro-archive-link[href="./dogfight.html"]'),
  ).toBeFocused();
  await page.keyboard.press("Tab");
  await expect(page.locator("#intro-airport-select")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(
    page.locator('.intro-archive-link[href="./dogfight.html"]'),
  ).toBeFocused();

  await page.locator("#enter").click();
  await waitForRuntime(page);
  await page.keyboard.press("c");
  await expect(page.locator("#control-panel")).toHaveAttribute(
    "aria-hidden",
    "false",
  );
  await expect(page.locator("#airport-select")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.locator("#scene")).toBeFocused();

  const minimumStripFont = await page.evaluate(() => {
    const values = [
      ...document.querySelectorAll(
        ".flight-chip :is(strong, span, small, b, em)",
      ),
    ]
      .filter((element) => {
        const style = getComputedStyle(element);
        return style.display !== "none" && style.visibility !== "hidden";
      })
      .map((element) => Number.parseFloat(getComputedStyle(element).fontSize));
    return Math.min(...values);
  });
  expect(minimumStripFont).toBeGreaterThanOrEqual(9);

  const contrast = await page.evaluate(() => {
    const root = getComputedStyle(document.documentElement);
    const hex = (name: string) => root.getPropertyValue(name).trim();
    const rgb = (value: string) => {
      const source = value.replace("#", "");
      return [0, 2, 4].map(
        (offset) => Number.parseInt(source.slice(offset, offset + 2), 16) / 255,
      );
    };
    const luminance = (value: string) =>
      rgb(value)
        .map((channel) =>
          channel <= 0.04045
            ? channel / 12.92
            : ((channel + 0.055) / 1.055) ** 2.4,
        )
        .reduce(
          (sum, channel, index) =>
            sum + channel * [0.2126, 0.7152, 0.0722][index],
          0,
        );
    const ratio = (first: string, second: string) => {
      const firstLum = luminance(first);
      const secondLum = luminance(second);
      return (
        (Math.max(firstLum, secondLum) + 0.05) /
        (Math.min(firstLum, secondLum) + 0.05)
      );
    };
    const ink = hex("--ink");
    return ["--ivory", "--amber", "--rose", "--blue"].map((name) => ({
      name,
      ratio: ratio(ink, hex(name)),
    }));
  });
  expect(contrast.every((entry) => entry.ratio >= 4.5)).toBeTruthy();
});

test("coarse-pointer controls retain usable touch targets", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile-chromium",
    "Touch-target gate runs on mobile.",
  );
  await page.goto(
    "/?airport=ATL&seed=10000&mode=watch&autostart=1&detail=low&renderFps=4",
  );
  await waitForRuntime(page);
  await page.locator("#menu-toggle").click();
  await page.locator("#surface-safety-toggle").click();
  const surfaceUndersized = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#surface-safety-panel button, #surface-safety-panel select, #surface-safety-panel label:has(input)",
      ),
    ]
      .filter((element) => element.checkVisibility())
      .filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => ({
        id: element.id || element.textContent?.trim() || element.tagName,
        width: Math.round(element.getBoundingClientRect().width),
        height: Math.round(element.getBoundingClientRect().height),
      })),
  );
  expect(surfaceUndersized).toEqual([]);
  await page.locator("#surface-safety-close").click();
  await page.locator("#menu-toggle").click();
  const undersized = await page.evaluate(() =>
    [
      ...document.querySelectorAll<HTMLElement>(
        "#control-panel button, #control-panel select, #control-panel input, #control-panel summary",
      ),
    ]
      .filter((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return (
          element.checkVisibility({
            checkOpacity: true,
            checkVisibilityCSS: true,
          }) &&
          !element.closest("details:not([open])") &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          rect.width > 0 &&
          rect.height > 0 &&
          !(element instanceof HTMLInputElement && element.type === "file")
        );
      })
      .filter((element) => {
        const target =
          element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? (element.closest("label") ?? element)
            : element;
        const rect = target.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      })
      .map((element) => ({
        id:
          element.id ||
          element.getAttribute("data-station-automation") ||
          element.tagName,
        width: Math.round(
          (element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? (element.closest("label") ?? element)
            : element
          ).getBoundingClientRect().width,
        ),
        height: Math.round(
          (element instanceof HTMLInputElement &&
          (element.type === "checkbox" || element.type === "radio")
            ? (element.closest("label") ?? element)
            : element
          ).getBoundingClientRect().height,
        ),
      })),
  );
  expect(undersized).toEqual([]);
});

test("reduced-motion mode suppresses runtime and CSS animation", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Reduced-motion gate runs once.",
  );
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(
    "/?airport=ATL&seed=10000&mode=watch&autostart=1&detail=low&renderFps=4",
  );
  await waitForRuntime(page);
  await page.evaluate(() => {
    window.airportControl.request({ action: "pause" });
    window.airportControl.request({ action: "resume" });
  });
  await page.waitForTimeout(80);
  const motion = await page.evaluate(() => ({
    media: matchMedia("(prefers-reduced-motion: reduce)").matches,
    longAnimations: document
      .getAnimations({ subtree: true })
      .filter((animation) => {
        const timing = animation.effect?.getComputedTiming();
        return Number(timing?.duration ?? 0) > 1;
      }).length,
    maximumTransitionMs: Math.max(
      ...[...document.querySelectorAll<HTMLElement>("#app *")]
        .slice(0, 500)
        .flatMap((element) =>
          getComputedStyle(element).transitionDuration.split(","),
        )
        .map(
          (duration) =>
            Number.parseFloat(duration) * (duration.includes("ms") ? 1 : 1000),
        ),
    ),
  }));
  expect(motion.media).toBeTruthy();
  expect(motion.longAnimations).toBe(0);
  expect(motion.maximumTransitionMs).toBeLessThanOrEqual(0.1);
});

test("offline sound recordings decode from the application origin", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Audio decode gate runs once.",
  );
  await page.goto(
    "/?airport=ATL&seed=10000&mode=watch&autostart=1&detail=low&renderFps=4",
  );
  await waitForRuntime(page);
  await page.locator("#menu-toggle").click();
  await page.locator("#sound-toggle").click();
  await page.waitForFunction(
    () =>
      window.airportControl.snapshot().audio.offlineLibrary.status !==
      "loading",
    undefined,
    { timeout: 20_000 },
  );
  const library = await page.evaluate(
    () => window.airportControl.snapshot().audio.offlineLibrary,
  );
  expect(library).toMatchObject({
    status: "ready",
    manifestSchemaVersion: 2,
    activeBeds: 11,
    lastError: null,
    syntheticVoicesDisclosed: true,
  });
  expect(library.totalAssets).toBeGreaterThanOrEqual(45);
  expect(library.decodedAssets).toBe(library.totalAssets);
});

test("local media capture and clean spectator presentation stay bounded", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Capture gate runs once.",
  );
  await page.goto(
    "/?airport=ORD&seed=14001&mode=watch&autostart=1&detail=low&renderFps=30",
  );
  await waitForRuntime(page);

  const clean = await page.evaluate(() => {
    window.airportControl.capture.setCleanView(true);
    const visibleSiblings = [
      ...document.querySelectorAll<HTMLElement>("#app > *"),
    ]
      .filter(
        (element) => !["scene", "capture-clean-exit"].includes(element.id),
      )
      .filter((element) => getComputedStyle(element).visibility !== "hidden")
      .map((element) => element.id || element.className);
    return {
      snapshot: window.airportControl.capture.snapshot(),
      visibleSiblings,
    };
  });
  expect(clean.snapshot.cleanView).toBeTruthy();
  expect(clean.snapshot.localOnly).toBeTruthy();
  expect(clean.snapshot.microphone).toBeFalsy();
  expect(clean.visibleSiblings).toEqual([]);
  await page.keyboard.press("Escape");
  expect(
    await page.evaluate(
      () => window.airportControl.capture.snapshot().cleanView,
    ),
  ).toBeFalsy();

  await page.locator("#menu-toggle").click();
  await page
    .locator(".advanced-tools")
    .evaluate((element: HTMLDetailsElement) => {
      element.open = true;
    });
  const download = page.waitForEvent("download");
  await page.locator("[data-capture-screenshot]").click();
  const screenshot = await download;
  expect(screenshot.suggestedFilename()).toMatch(
    /^airport-auto-ord-14001-.*\.png$/,
  );
  expect((await screenshot.createReadStream()) !== null).toBeTruthy();

  const liveState = await page.evaluate(() => ({
    snapshot: window.airportControl.liveData.snapshot(),
    inputType:
      document.querySelector<HTMLInputElement>("[data-live-token]")?.type,
  }));
  expect(liveState.snapshot).toMatchObject({ enabled: false, station: "KORD" });
  expect(liveState.inputType).toBe("password");
});

test("daily and classroom links reproduce one deliberate seeded briefing", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Daily challenge gate runs once.",
  );
  await page.goto(
    "/?daily=2026-07-27&airport=ATL&seed=1&mode=watch&challenge=rush-hour&detail=low&renderFps=4",
  );
  await waitForRuntime(page);
  const state = await page.evaluate(() => {
    const snapshot = window.airportControl.snapshot();
    const community = window.airportControl.community.snapshot();
    const link = new URL(community.classroomLink);
    return {
      airport: snapshot.airport.code,
      seed: snapshot.surfaceGraph.seed,
      mode: snapshot.mode,
      station: snapshot.station,
      paused: snapshot.paused,
      challenge: snapshot.challenge,
      daily: community.daily,
      classroom: Object.fromEntries(link.searchParams),
    };
  });
  expect(state).toMatchObject({
    airport: "ORD",
    seed: 3387434395,
    mode: "assisted",
    station: "supervisor",
    paused: true,
    challenge: { status: "briefing", challengeId: "storm-operations" },
    daily: {
      date: "2026-07-27",
      airportCode: "ORD",
      seed: 3387434395,
      challengeId: "storm-operations",
    },
    classroom: {
      airport: "ORD",
      seed: "3387434395",
      mode: "assisted",
      station: "supervisor",
      rules: "forgiving",
      challenge: "storm-operations",
      daily: "2026-07-27",
      classroom: "2026-07-27",
    },
  });

  await page.locator("#enter").click();
  await page.locator("#menu-toggle").click();
  await page
    .locator("#challenge-setup")
    .evaluate((element: HTMLDetailsElement) => {
      element.open = true;
    });
  await expect(page.locator("[data-daily-title]")).toHaveText(
    "ORD · Storm operations",
  );
  await expect(page.locator("[data-daily-open]")).toHaveAttribute(
    "href",
    /classroom=2026-07-27/,
  );
});

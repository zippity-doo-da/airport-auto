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
  await page.waitForFunction(() => window.airportControl?.version === "2.40.0");
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
  await page.waitForFunction(() => window.airportControl?.version === "2.40.0");
  await expect(page.locator("#enter")).toBeFocused();
  const inertSiblings = await page.locator("#app > [inert]").count();
  expect(inertSiblings).toBeGreaterThan(5);
  await page.keyboard.press("Tab");
  await expect(page.locator("#intro-airport-select")).toBeFocused();
  await page.keyboard.press("Shift+Tab");
  await expect(page.locator("#enter")).toBeFocused();

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
    decodedAssets: 45,
    totalAssets: 45,
    activeBeds: 11,
    lastError: null,
    syntheticVoicesDisclosed: true,
  });
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

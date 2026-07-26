import { expect, test } from "@playwright/test";

test("soundscape stays spatial, readable, optional, and replay-visible", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "desktop-chromium",
    "Desktop covers the shared Web Audio and caption runtime.",
  );
  test.setTimeout(60_000);
  await page.goto("/?airport=ORD&mode=auto&autostart=1&detail=low&renderFps=2");
  await page.waitForFunction(() => window.airportControl?.version === "2.34.0");
  await page.waitForFunction(
    () => window.airportControl.snapshot().audio.recordedEvents > 0,
  );

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.audio).toMatchObject({
    schemaVersion: 1,
    enabled: false,
    contextState: "not-created",
    radioEnabled: true,
    captionsEnabled: true,
    fictionalOfflineRadio: true,
    sourceManifest: "audio/soundscape-manifest.json",
  });
  expect(initial.audio.environment.field).toBeGreaterThan(0);
  expect(initial.audio.scheduler.trackedFlights).toBeGreaterThan(0);
  expect(initial.replay.soundEvents).toBeGreaterThan(0);
  expect(initial.audio.spatialAircraft.maximumVoices).toBe(14);

  await expect(page.locator("#radio-caption")).toBeVisible();
  const captionId = await page
    .locator("#radio-caption")
    .getAttribute("data-caption-id");
  await page.waitForTimeout(800);
  await expect(page.locator("#radio-caption")).toHaveAttribute(
    "data-caption-id",
    captionId ?? "",
  );
  await expect(page.locator("#radio-caption-copy")).not.toHaveText("");

  await page.locator("#menu-toggle").click();
  await expect(page.locator("#control-panel")).toHaveClass(
    /control-panel--open/,
  );
  await page.locator("#sound-toggle").click();
  await page.waitForFunction(() => {
    const audio = window.airportControl.snapshot().audio;
    return (
      audio.enabled &&
      audio.contextState === "running" &&
      audio.spatialAircraft.activeVoices > 0
    );
  });

  const audible = await page.evaluate(() => window.airportControl.snapshot());
  expect(audible.audio.spatialAircraft.activeVoices).toBeLessThanOrEqual(14);
  expect(audible.audio.spatialAircraft.audibleFlightIds.length).toBe(
    audible.audio.spatialAircraft.activeVoices,
  );

  await page.evaluate(() => {
    const radio = document.querySelector<HTMLInputElement>(
      "#radio-chatter-enabled",
    )!;
    const captions = document.querySelector<HTMLInputElement>(
      "#radio-captions-enabled",
    )!;
    const thunder = document.querySelector<HTMLInputElement>(
      "#high-stakes-weather-enabled",
    )!;
    radio.checked = false;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    captions.checked = false;
    captions.dispatchEvent(new Event("change", { bubbles: true }));
    thunder.checked = true;
    thunder.dispatchEvent(new Event("change", { bubbles: true }));
  });
  const optional = await page.evaluate(() => window.airportControl.snapshot());
  expect(optional.audio.radioEnabled).toBeFalsy();
  expect(optional.audio.captionsEnabled).toBeFalsy();
  expect(optional.audio.scheduler.highStakesWeatherEnabled).toBeTruthy();
  await expect(page.locator("#radio-caption")).toBeHidden();

  const recording = await page.evaluate(() =>
    window.airportControl.recording(),
  );
  expect(recording.schemaVersion).toBe(3);
  expect(recording.soundEvents.length).toBeGreaterThan(0);
  expect(recording.soundEvents[0]).toMatchObject({
    schemaVersion: 1,
    id: expect.any(String),
    sequence: expect.any(Number),
    elapsed: expect.any(Number),
    kind: expect.any(String),
    channel: expect.any(String),
    variant: expect.any(Number),
  });

  const manifest = await page.request.get("/audio/soundscape-manifest.json");
  expect(manifest.ok()).toBeTruthy();
  await expect(manifest.json()).resolves.toMatchObject({
    schemaVersion: 1,
    networkAudio: false,
    runtimeVoiceGeneration: false,
    microphoneAccess: false,
  });
});

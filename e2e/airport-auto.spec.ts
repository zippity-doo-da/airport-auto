import { expect, test } from '@playwright/test';

test('Assisted ORD shift exposes proposals, station workload, and structured control', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=assisted&station=supervisor&autostart=1&detail=low');
  await expect(page.locator('#airport-name')).toContainText('O’Hare');
  await expect(page.locator('#flight-strip-count')).toContainText('aircraft');
  await page.waitForFunction(() => window.airportControl?.version === '2.3.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.schemaVersion).toBe(5);
  expect(initial.mode).toBe('assisted');
  expect(initial.airport.code).toBe('ORD');
  expect(initial.airport.vectorData?.layerCounts.runways).toBe(8);
  expect(initial.airport.vectorData?.layerCounts.taxiways).toBe(743);
  expect(initial.airport.vectorData?.attribution).toContain('Federal Aviation Administration');
  expect(initial.airport.surfaceData?.counts.stands).toBeGreaterThanOrEqual(24);
  expect(initial.airport.surfaceData?.attribution).toContain('OpenStreetMap contributors');
  expect(initial.airport.contextData?.counts).toMatchObject({ roads: 6_016, rails: 1_127, waterways: 35, areas: 1_568, boundaryRings: 1 });
  expect(initial.airport.contextData?.attribution).toContain('OpenStreetMap contributors');
  expect(initial.surfaceGraph.schemaVersion).toBe(3);
  expect(initial.airport.surfaceData?.passengerFacilityReference).toMatchObject({
    provider: 'Chicago Department of Aviation',
    totalPassengerGates: 199,
  });
  expect(initial.surfaceGraph.passengerFacilities).toHaveLength(13);
  expect(initial.surfaceGraph.passengerFacilities.filter((facility) => facility.kind === 'terminal').map((facility) => facility.terminalId).sort()).toEqual(['T1', 'T2', 'T3', 'T5']);
  expect(initial.renderer.passengerFacilities).toBe(13);
  for (const concourse of ['B', 'C', 'E', 'F', 'G', 'H', 'K', 'L', 'M']) {
    expect(initial.surfaceGraph.stands.filter((stand) => stand.concourse === concourse).length).toBeGreaterThanOrEqual(2);
  }
  expect(initial.surfaceGraph.hotspots).toHaveLength(2);
  expect(initial.surfaceGraph.controlPoints.length).toBeGreaterThanOrEqual(200);
  expect(initial.surfaceGraph.edges.filter((edge) => edge.gradeSeparation === 'bridge')).toHaveLength(2);
  const zoneKinds = new Set(initial.surfaceGraph.zones.map((zone) => zone.kind));
  for (const kind of ['terminal-complex', 'terminal-apron', 'cargo-ramp', 'general-aviation', 'deicing-pad', 'holding-pad', 'maintenance', 'remote-ramp', 'perimeter-route']) {
    expect(zoneKinds.has(kind)).toBeTruthy();
  }
  expect(initial.runwayConfigurations.map((configuration) => configuration.id)).toEqual([
    'ORD-WEST-FLOW',
    'ORD-EAST-FLOW',
    'ORD-WEST-HIGH-ARRIVAL',
    'ORD-EAST-OFFSET',
    'ORD-EAST-IFR',
    'ORD-CROSSWIND-22',
  ]);
  expect(initial.runwayConfiguration.selectionMode).toBe('automatic');
  expect(initial.runwayConfigurations.every((configuration) => configuration.source?.url.startsWith('https://www.faa.gov/'))).toBeTruthy();
  for (const runway of initial.runways) {
    const presentation = initial.renderer.runways.find((candidate) => candidate.id === runway.id);
    expect(presentation?.activeEnd).toBe(runway.activeEnd);
    expect(presentation?.markerVisible).toBe(!runway.closed && runway.role !== 'inactive');
    expect(presentation?.arrivalMarkerVisible).toBe(runway.role === 'arrival' || runway.role === 'mixed');
    expect(presentation?.departureMarkerVisible).toBe(runway.role === 'departure' || runway.role === 'mixed');
  }
  expect(initial.renderer.surfaceLayers).toEqual({ 'taxiway-labels': false, 'operational-zones': false, hotspots: false, 'airport-boundary': false });
  expect(initial.renderer.context).toMatchObject({ status: 'loaded', roads: 6_016, rails: 1_127, boundaryRings: 1 });
  expect(initial.renderer.context.drawGroups).toBeLessThanOrEqual(20);
  expect(initial.renderer.drawCalls).toBeLessThan(800);
  expect(initial.flights.some((flight) => flight.phase === 'approach')).toBeTruthy();
  expect(initial.flights.some((flight) => flight.phase === 'taxi-out' || flight.phase === 'resting')).toBeTruthy();
  expect(initial.flights.some((flight) => flight.gate?.ref)).toBeTruthy();
  const pushReady = initial.flights.find((flight) => flight.phase === 'resting' && flight.groundOperation.label === 'Ready push');
  expect(pushReady?.groundOperation).toMatchObject({
    pushbackCleared: false,
    pushbackProgress: 0,
    tugAttached: false,
    engineState: 'off',
  });
  expect(['left', 'right', 'straight']).toContain(pushReady?.groundOperation.pushbackDirection);
  expect(initial.traffic.collisions).toHaveLength(0);
  expect(initial.traffic.obstacleCollisions).toHaveLength(0);
  await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'ground' }));
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), pushReady!.id);
  const pushbackButton = page.locator('#flight-actions button[data-flight-action="pushback"]');
  await expect(pushbackButton).toBeVisible();
  await expect(pushbackButton).toHaveText(new RegExp(`Push ${pushReady!.groundOperation.pushbackDirection}`, 'i'));
  await pushbackButton.click();
  await page.waitForFunction((flightId) => {
    const flight = window.airportControl.snapshot().flights.find((candidate) => candidate.id === flightId);
    return flight?.phase === 'taxi-out' && flight.groundOperation.tugAttached && flight.groundOperation.engineState === 'starting';
  }, pushReady!.id);
  const pushingSnapshot = await page.evaluate(() => window.airportControl.snapshot());
  const pushingFlight = pushingSnapshot.flights.find((flight) => flight.id === pushReady!.id);
  expect(pushingFlight?.trajectory.stage).toBe('pushback');
  expect(pushingFlight?.motion.onGround).toBeTruthy();
  expect(pushingSnapshot.renderer.attachedTugs).toBeGreaterThanOrEqual(1);
  expect(pushingSnapshot.renderer.startingEngines).toBeGreaterThanOrEqual(1);
  expect(pushingSnapshot.recentEvents.some((event) => event.type === 'command:clearPushback' && event.accepted)).toBeTruthy();
  await page.waitForFunction((flightId) => {
    const flight = window.airportControl.snapshot().flights.find((candidate) => candidate.id === flightId);
    return (flight?.groundOperation.pushbackProgress ?? 0) >= 0.28;
  }, pushReady!.id);
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.airportControl.command({ action: 'nextView' });
    for (let index = 0; index < 7; index += 1) window.airportControl.command({ action: 'zoomIn' });
  });
  await page.locator('#flight-strip-toggle').click();
  await page.waitForTimeout(1_200);
  await page.screenshot({ path: testInfo.outputPath('pushback-tug.png') });
  await page.locator('#flight-strip-toggle').click();
  await page.evaluate(() => window.airportControl.command({ action: 'resetCamera' }));
  await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'supervisor' }));
  const runwayPlanResult = await page.evaluate(() => window.airportControl.request({ action: 'setRunwayConfiguration', configurationId: 'ORD-EAST-FLOW' }));
  expect(runwayPlanResult.accepted).toBeTruthy();
  expect(runwayPlanResult.resultingState.runwayConfiguration.selectionMode).toBe('manual');
  expect(runwayPlanResult.resultingState.runwayConfiguration.transition?.targetId).toBe('ORD-EAST-FLOW');
  const automaticPlanResult = await page.evaluate(() => window.airportControl.request({ action: 'setRunwayConfiguration', configurationId: null }));
  expect(automaticPlanResult.accepted).toBeTruthy();
  expect(automaticPlanResult.resultingState.runwayConfiguration.selectionMode).toBe('automatic');
  const importedVectorCounts = await page.evaluate(async () => {
    const [vectorResponse, contextResponse, surfaceResponse] = await Promise.all([
      fetch('./data/airports/KORD.vector.json'),
      fetch('./data/airports/KORD.context.json'),
      fetch('./data/airports/KORD.osm-surface.json'),
    ]);
    if (!vectorResponse.ok) throw new Error(`airport vector request failed: ${vectorResponse.status}`);
    if (!contextResponse.ok) throw new Error(`airport context request failed: ${contextResponse.status}`);
    if (!surfaceResponse.ok) throw new Error(`airport surface request failed: ${surfaceResponse.status}`);
    const vectorAsset = await vectorResponse.json();
    const contextAsset = await contextResponse.json();
    const surfaceAsset = await surfaceResponse.json();
    return {
      runways: vectorAsset.layers.runways.length,
      taxiways: vectorAsset.layers.taxiways.length,
      roads: contextAsset.roads.length,
      boundary: contextAsset.airportBoundary.sourceId,
      gates: surfaceAsset.gates.length,
      parkingPositions: surfaceAsset.parkingPositions.length,
      passengerFacilities: surfaceAsset.passengerFacilities.length,
    };
  });
  expect(importedVectorCounts).toEqual({
    runways: 8,
    taxiways: 743,
    roads: 6_016,
    boundary: 'relation/13423944',
    gates: 219,
    parkingPositions: 364,
    passengerFacilities: 13,
  });

  const proposalButton = page.locator('#clearance-advisor button[data-proposal-id]');
  await expect(proposalButton).toBeVisible();
  const advisorControlStayedMounted = await page.evaluate(async () => {
    const button = document.querySelector('#clearance-advisor button[data-proposal-id]');
    await new Promise((resolve) => window.setTimeout(resolve, 350));
    return button === document.querySelector('#clearance-advisor button[data-proposal-id]');
  });
  expect(advisorControlStayedMounted).toBeTruthy();
  await proposalButton.click();
  await expect(page.locator('#status-detail')).not.toHaveText('');

  const pauseResult = await page.evaluate(() => window.airportControl.request({ action: 'pause' }));
  expect(pauseResult.accepted).toBeTruthy();
  expect(pauseResult.eventId).toBeGreaterThan(0);
  expect(pauseResult.resultingState.paused).toBeTruthy();
  const recording = await page.evaluate(() => window.airportControl.recording());
  expect(recording.seed).toBe(10_004);
  expect(recording.commands.length).toBeGreaterThan(0);
  const resumeResult = await page.evaluate(() => window.airportControl.request({ action: 'resume' }));
  expect(resumeResult.accepted).toBeTruthy();
  await page.evaluate(() => window.airportControl.request({ action: 'pause' }));

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#control-panel')).toHaveClass(/control-panel--open/);
  await expect(page.locator('#runway-configuration-select')).toBeEnabled();
  await expect(page.locator('#runway-configuration-select option')).toHaveCount(7);
  await page.screenshot({ path: testInfo.outputPath('runway-plans.png') });
  await expect(page.locator('.advanced-tools summary')).toBeVisible();
  await page.locator('.advanced-tools summary').click();
  await expect(page.locator('#map-data-version')).toContainText('FAA geometry + OSM surface and surroundings');
  await expect(page.locator('#map-data-attribution')).toContainText('not for navigation');
  await expect(page.locator('#map-data-attribution')).toContainText('Chicago Department of Aviation');
  await expect(page.locator('#map-facility-source')).toBeVisible();
  await expect(page.locator('#map-facility-source')).toHaveAttribute('href', initial.airport.surfaceData?.passengerFacilityReference.url ?? '');
  const hotspotLayer = page.locator('input[data-surface-layer="hotspots"]');
  await expect(hotspotLayer).not.toBeChecked();
  await hotspotLayer.check();
  expect((await page.evaluate(() => window.airportControl.snapshot())).renderer.surfaceLayers.hotspots).toBeTruthy();
  const boundaryLayer = page.locator('input[data-surface-layer="airport-boundary"]');
  await expect(boundaryLayer).not.toBeChecked();
  await boundaryLayer.check();
  expect((await page.evaluate(() => window.airportControl.snapshot())).renderer.surfaceLayers['airport-boundary']).toBeTruthy();
  await page.locator('#map-orientation-toggle').check();
  await expect(page.locator('#map-orientation')).toBeVisible();
  await expect(page.locator('#map-scale-label')).toHaveText(/m|km/);
  const orientationResult = await page.evaluate(() => window.airportControl.request({ action: 'setMapOrientationVisible', enabled: false }));
  expect(orientationResult.accepted).toBeTruthy();
  await expect(page.locator('#map-orientation')).toBeHidden();
  await page.evaluate(() => window.airportControl.command({ action: 'resetCamera' }));
  await page.waitForTimeout(250);
  await page.locator('#station-select').selectOption('ground');
  await expect(page.locator('#flight-strip-count')).toContainText('on frequency');
  await page.screenshot({ path: testInfo.outputPath('assisted-ord.png') });
});

test('Mobile Watch mode keeps controls readable and uses low-detail rendering', async ({ page }, testInfo) => {
  await page.goto('/?airport=ORD&mode=watch&autostart=1&detail=low');
  await page.waitForFunction(() => window.airportControl?.version === '2.3.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');
  await expect(page.locator('body')).toHaveClass(/watch-mode/);
  await expect(page.locator('#menu-toggle')).toBeVisible();
  await expect(page.locator('#zoom-in')).toBeVisible();
  const snapshot = await page.evaluate(() => window.airportControl.snapshot());
  expect(snapshot.mode).toBe('watch');
  expect(snapshot.renderer.detail).toBe('low');
  const safetyFont = await page.locator('.scoreboard span').nth(2).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(safetyFont).toBeGreaterThanOrEqual(7);
  await page.screenshot({ path: testInfo.outputPath('mobile-watch.png') });
});

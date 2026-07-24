import { expect, test } from '@playwright/test';

test('Assisted ORD shift exposes proposals, station workload, and structured control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The focused mobile Watch test covers the responsive controls and radar inset.');
  // Hosted software WebGL can take more than two minutes to traverse this
  // intentionally broad end-to-end scenario even though local Chromium is
  // much faster. Keep waits individually bounded and allow the full sequence.
  test.setTimeout(360_000);
  await page.goto('/?airport=ORD&mode=assisted&station=supervisor&autostart=1&detail=low');
  await expect(page.locator('#airport-name')).toContainText('O’Hare');
  await expect(page.locator('#flight-strip-count')).toContainText('aircraft');
  await page.waitForFunction(() => window.airportControl?.version === '2.12.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.schemaVersion).toBe(14);
  expect(initial.mode).toBe('assisted');
  expect(initial.airport.code).toBe('ORD');
  expect(initial.renderer.camera).toMatchObject({
    panningEnabled: true,
    groundWidth: 16_000,
    groundHeight: 12_000,
    detailedWidth: 4_000,
    detailedHeight: 3_000,
    panLimitX: 5_200,
    panLimitY: 3_900,
  });
  expect(initial.renderer.camera.groundWidth / 2 - initial.renderer.camera.panLimitX).toBeGreaterThanOrEqual(2_800);
  expect(initial.renderer.camera.groundHeight / 2 - initial.renderer.camera.panLimitY).toBeGreaterThanOrEqual(2_100);
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
  expect(initial.renderer.serviceVehiclesVisible).toBeTruthy();
  expect(initial.renderer.surfaceDisruptions).toEqual({ total: 0, pending: 0, active: 0, recovering: 0 });
  expect(initial.surfaceDisruptions).toHaveLength(0);
  for (const concourse of ['B', 'C', 'E', 'F', 'G', 'H', 'K', 'L', 'M']) {
    expect(initial.surfaceGraph.stands.filter((stand) => stand.concourse === concourse).length).toBeGreaterThanOrEqual(2);
  }
  expect(initial.surfaceGraph.hotspots).toHaveLength(2);
  expect(initial.surfaceGraph.controlPoints.length).toBeGreaterThanOrEqual(200);
  expect(initial.surfaceGraph.edges.filter((edge) => edge.gradeSeparation === 'bridge')).toHaveLength(2);
  expect(initial.surfaceGraph.rampControlZones.length).toBeGreaterThanOrEqual(16);
  expect(initial.surfaceGraph.standFlows).toHaveLength(initial.surfaceGraph.stands.length);
  expect(initial.surfaceGraph.standFlows.every((flow) => (
    flow.leadIn.direction === 'inbound'
    && flow.leadOut.direction === 'outbound'
    && flow.leadIn.edgeIds[0] === flow.leadOut.edgeIds[0]
  ))).toBeTruthy();
  expect(initial.surfaceGraph.gatePlanning).toMatchObject({
    model: 'scheduled-stand-reservations',
    turnBufferSeconds: 18,
  });
  expect(initial.surfaceGraph.gatePlanning.factors).toEqual(expect.arrayContaining([
    'airline', 'terminal', 'aircraft-size', 'service-type', 'arrival-time', 'next-departure-route',
  ]));
  expect(initial.surfaceGraph.serviceVehiclePolicy).toMatchObject({
    model: 'shared-surface-reservations',
    pushbackRequiresStandClear: true,
  });
  expect(initial.surfaceGraph.deicingFacilities).toHaveLength(1);
  expect(initial.surfaceGraph.deicingFacilities[0]).toMatchObject({
    name: 'Central Deicing Facility',
    capacity: 4,
    classification: 'published',
  });
  expect(initial.surfaceGraph.deicingPolicy).toMatchObject({
    model: 'fixed-step-pad-queue-and-holdover',
    requiredCondition: 'snow',
    expiredHoldoverAction: 'return-to-pad-before-runway-entry',
  });
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
  expect(initial.flights.every((flight) => (
    flight.gate?.assignment
    && flight.gate.id === flight.stand
    && flight.gate.assignment.scheduledDepartureSeconds >= flight.gate.assignment.scheduledGateInSeconds
    && flight.gate.assignment.nextDestination !== initial.airport.code
    && flight.gate.assignment.zoneName.length > 0
    && flight.gate.assignment.rationale.length >= 4
  ))).toBeTruthy();
  expect(initial.flights.every((flight) => (
    flight.turnaround.tasks.length === 7
    && flight.turnaround.plannedDurationSeconds > 0
    && flight.turnaround.targetFuelPercent >= flight.turnaround.initialFuelPercent
  ))).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.phase === 'approach').every((flight) => flight.turnaround.status === 'planned')).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.phase === 'approach').every((flight) => (
    flight.runwayExit?.safe
    && flight.runwayExit.candidateCount >= 1
    && flight.runwayExit.stoppingMarginM >= 85
    && flight.runwayExit.taxiRouteEdgeIds.length > 0
    && flight.runwayExit.rationale.length >= 3
  ))).toBeTruthy();
  expect(initial.flights.every((flight) => flight.deicing.status === 'not-required')).toBeTruthy();
  expect(initial.serviceVehicles.length).toBeGreaterThanOrEqual(2);
  expect(initial.serviceVehicles.every((vehicle) => !vehicle.protectedMovementAuthorized && !vehicle.protectedMovementArea && vehicle.outboundRoute.length > 0 && vehicle.returnRoute.length > 0)).toBeTruthy();
  expect(initial.flights.some((flight) => flight.gate?.assignment?.airlineFit === 'preferred')).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.airline.code === 'UA' && flight.service === 'passenger').every((flight) => ['B', 'C', 'E', 'F', 'G'].includes(flight.gate?.concourse))).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.airline.code === 'AA' && flight.service === 'passenger').every((flight) => ['G', 'H', 'K', 'L'].includes(flight.gate?.concourse))).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.service === 'cargo').every((flight) => (
    flight.gate?.assignment?.serviceArea === 'cargo-ramp'
    && flight.gate.assignment.zoneName.includes('Cargo')
  ))).toBeTruthy();
  await expect(page.locator('.flight-chip__detail').filter({ hasText: 'planned' }).first()).toBeVisible();
  const taxiingFlight = initial.flights.find((flight) => flight.phase === 'taxi-in' || flight.phase === 'taxi-out');
  expect(taxiingFlight?.aircraft).toMatchObject({
    taxiAccelerationMps2: expect.any(Number),
    taxiBrakingMps2: expect.any(Number),
    taxiTurnRadiusM: expect.any(Number),
    minimumWingtipClearanceM: expect.any(Number),
  });
  expect(taxiingFlight?.taxiPerformance.routeClearanceOk).toBeTruthy();
  expect(taxiingFlight?.taxiPerformance.minimumRouteWingtipClearanceM).toBeGreaterThanOrEqual(
    taxiingFlight?.taxiPerformance.requiredWingtipClearanceM ?? Infinity,
  );
  expect(taxiingFlight?.taxiPerformance.stoppingDistanceM).toBeGreaterThanOrEqual(0);
  expect(taxiingFlight?.surfaceRoutePlanning.routingCost).toEqual(expect.any(Number));
  expect(taxiingFlight?.groundOperation.flowDirection).toMatch(/inbound|outbound/);
  const pushReady = initial.flights.find((flight) => flight.phase === 'resting' && flight.groundOperation.label === 'Ready push');
  expect(pushReady?.groundOperation).toMatchObject({
    pushbackCleared: false,
    pushbackProgress: 0,
    tugAttached: false,
    engineState: 'off',
  });
  expect(['left', 'right', 'straight']).toContain(pushReady?.groundOperation.pushbackDirection);
  expect(pushReady?.groundOperation.rampControlZoneId).toMatch(/^RAMP-/);
  expect(pushReady?.groundOperation.alleyId).toEqual(expect.any(String));
  expect(pushReady?.gate?.assignment).toMatchObject({ status: 'occupied', nextDestination: expect.any(String) });
  expect(pushReady?.turnaround).toMatchObject({ status: 'ready', progress: 1, blockingServices: [] });
  expect(initial.traffic.collisions).toHaveLength(0);
  expect(initial.traffic.obstacleCollisions).toHaveLength(0);
  expect(initial.traffic.serviceVehicleConflicts).toHaveLength(0);
  expect(initial.traffic.serviceVehicleRouteViolations).toHaveLength(0);
  expect(initial.queues.total).toBeGreaterThan(0);
  expect(initial.queues.counts).toMatchObject({ gate: expect.any(Number), ramp: expect.any(Number), taxi: expect.any(Number), crossing: expect.any(Number), runway: expect.any(Number), wake: expect.any(Number), weather: expect.any(Number), downstream: expect.any(Number) });
  const focusCandidate = initial.flights.find((flight) => flight.phase === 'approach')!;
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), focusCandidate.id);
  await expect(page.locator('#flight-actions')).toBeVisible();
  await expect(page.locator('.runway-exit-panel')).toBeVisible();
  await expect(page.locator('.runway-exit-panel')).toContainText(/RWY .* →/);
  await expect(page.locator('.runway-exit-panel')).toContainText(/M MARGIN/);
  await page.screenshot({ path: testInfo.outputPath('runway-exit-plan.png') });
  await page.locator(`button[data-flight-chip="${focusCandidate.id}"]`).click();
  await expect(page.locator('#flight-actions')).toBeHidden();
  const radarResult = await page.evaluate(() => window.airportControl.request({ action: 'setRadarVisible', enabled: true }));
  expect(radarResult.accepted).toBeTruthy();
  await expect(page.locator('#radar-panel')).toBeVisible();
  await expect(page.locator('#radar-airport')).toHaveText('ORD');
  await expect(page.locator('#radar-range')).toHaveText(/NM/);
  await page.screenshot({ path: testInfo.outputPath('terminal-radar.png') });
  await page.locator('#radar-close').click();
  await expect(page.locator('#radar-panel')).toBeHidden();
  const queueResult = await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: true }));
  expect(queueResult.accepted).toBeTruthy();
  await expect(page.locator('#queue-panel')).toBeVisible();
  await expect(page.locator('#queue-count')).toContainText('waiting');
  await expect(page.locator('#queue-list .queue-entry').first()).toBeVisible();
  await page.locator('#queue-filter').selectOption('runway');
  await expect(page.locator('#queue-list')).toContainText(/runway|rwy|arrival|departure/i);
  await page.screenshot({ path: testInfo.outputPath('operation-queues.png') });
  await page.locator('#queue-close').click();
  await expect(page.locator('#queue-panel')).toBeHidden();
  const initialCamera = initial.renderer.camera;
  await page.locator('#scene').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const start = { x: rect.left + rect.width * 0.64, y: rect.top + rect.height * 0.46 };
    const pointer = { bubbles: true, pointerId: 71, pointerType: 'mouse', isPrimary: true };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: start.x, clientY: start.y, button: 1, buttons: 4 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: start.x + 90, clientY: start.y + 55, button: -1, buttons: 4 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: start.x + 90, clientY: start.y + 55, button: 1, buttons: 0 }));
  });
  await page.waitForFunction(({ x, y }) => {
    const camera = window.airportControl.snapshot().renderer.camera;
    return Math.hypot(camera.focusX - x, camera.focusY - y) > 1;
  }, { x: initialCamera.focusX, y: initialCamera.focusY });
  const beforeKeyboardPan = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.locator('#scene').focus();
  await page.keyboard.press('d');
  await page.keyboard.press('w');
  await page.waitForFunction(({ x, y }) => {
    const camera = window.airportControl.snapshot().renderer.camera;
    return Math.hypot(camera.focusX - x, camera.focusY - y) > 1;
  }, { x: beforeKeyboardPan.focusX, y: beforeKeyboardPan.focusY });
  await page.evaluate(() => {
    for (let index = 0; index < 8; index += 1) window.airportControl.command({ action: 'zoomOut' });
    const canvas = document.querySelector<HTMLCanvasElement>('#scene')!;
    const rect = canvas.getBoundingClientRect();
    const start = { x: rect.left + rect.width * 0.24, y: rect.top + rect.height * 0.56 };
    const end = { x: rect.left + rect.width * 0.76, y: rect.top + rect.height * 0.56 };
    for (let index = 0; index < 10; index += 1) {
      const pointer = { bubbles: true, pointerId: 80 + index, pointerType: 'mouse', isPrimary: true };
      canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: start.x, clientY: start.y, button: 1, buttons: 4 }));
      canvas.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: end.x, clientY: end.y, button: -1, buttons: 4 }));
      canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: end.x, clientY: end.y, button: 1, buttons: 0 }));
    }
  });
  const exploredCamera = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  expect(Math.hypot(exploredCamera.focusX, exploredCamera.focusY)).toBeGreaterThan(1_400);
  expect(Math.abs(exploredCamera.focusX)).toBeLessThanOrEqual(exploredCamera.panLimitX);
  expect(Math.abs(exploredCamera.focusY)).toBeLessThanOrEqual(exploredCamera.panLimitY);
  expect(exploredCamera.groundFillsViewport).toBeTruthy();
  expect(exploredCamera.minimumGroundMargin).toBeGreaterThan(1_000);
  await page.screenshot({ path: testInfo.outputPath('map-exploration.png') });
  await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'ground' }));
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), pushReady!.id);
  await expect(page.locator('.turnaround-panel')).toBeVisible();
  await expect(page.locator('.turnaround-panel__summary')).toContainText('Turnaround 100%');
  await expect(page.locator('.turnaround-panel__tasks li')).toHaveCount(pushReady!.turnaround.tasks.filter((task) => task.required).length);
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
  expect(pushingFlight?.turnaround.status).toBe('released');
  expect(pushingSnapshot.renderer.attachedTugs).toBeGreaterThanOrEqual(1);
  expect(pushingSnapshot.renderer.startingEngines).toBeGreaterThanOrEqual(1);
  expect(pushingSnapshot.recentEvents.some((event) => event.type === 'command:clearPushback' && event.accepted)).toBeTruthy();
  await page.evaluate(() => {
    for (let index = 0; index < 3; index += 1) window.airportControl.command({ action: 'nextView' });
    for (let index = 0; index < 10; index += 1) window.airportControl.command({ action: 'zoomIn' });
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
  await page.locator('#surface-disruption-kind').selectOption('runway-closure');
  await page.locator('#surface-disruption-target').selectOption({ index: 0 });
  await page.locator('#surface-disruption-duration').selectOption('90');
  await page.locator('#surface-disruption-apply').click();
  await expect(page.locator('#surface-disruption-list .surface-disruptions__item')).toHaveCount(1);
  const restricted = await page.evaluate(() => window.airportControl.snapshot());
  expect(restricted.surfaceDisruptions).toHaveLength(1);
  expect(restricted.surfaceDisruptions[0]).toMatchObject({ kind: 'runway-closure', source: 'controller' });
  expect(restricted.renderer.surfaceDisruptions.total).toBe(1);
  const restrictedRunway = restricted.runways.find((runway) => runway.id === restricted.surfaceDisruptions[0].runwayId);
  expect(restrictedRunway?.closed).toBeTruthy();
  expect(restricted.renderer.runways.find((runway) => runway.id === restrictedRunway?.id)?.markerVisible).toBeFalsy();
  await page.screenshot({ path: testInfo.outputPath('surface-restriction.png') });
  await page.locator('#surface-disruption-list button[data-clear-disruption]').click();
  await expect(page.locator('#surface-disruption-list .surface-disruptions__item')).toHaveCount(0);
  expect((await page.evaluate(() => window.airportControl.snapshot())).surfaceDisruptions).toHaveLength(0);
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
  await expect(page.locator('.map-orientation__compass')).toContainText('N');
  await expect(page.locator('.map-orientation__compass')).toContainText('E');
  await expect(page.locator('.map-orientation__compass')).toContainText('S');
  await expect(page.locator('.map-orientation__compass')).toContainText('W');
  await expect(page.locator('#map-scale-label')).toHaveText(/m|km/);
  await page.locator('#wind-overlay-toggle').check();
  await expect(page.locator('#wind-overlay')).toBeVisible();
  await expect(page.locator('#wind-overlay-heading')).toHaveText(/WIND/);
  await page.locator('#service-vehicles-toggle').uncheck();
  expect((await page.evaluate(() => window.airportControl.snapshot())).renderer.serviceVehiclesVisible).toBeFalsy();
  await page.locator('#service-vehicles-toggle').check();
  expect((await page.evaluate(() => window.airportControl.snapshot())).renderer.serviceVehiclesVisible).toBeTruthy();
  await page.locator('#menu-toggle').click();
  await page.screenshot({ path: testInfo.outputPath('map-overlays.png') });
  await page.locator('#menu-toggle').click();
  const orientationResult = await page.evaluate(() => window.airportControl.request({ action: 'setMapOrientationVisible', enabled: false }));
  expect(orientationResult.accepted).toBeTruthy();
  await expect(page.locator('#map-orientation')).toBeHidden();
  await page.evaluate(() => window.airportControl.command({ action: 'resetCamera' }));
  await page.waitForTimeout(250);
  await page.locator('#station-select').selectOption('ground');
  await expect(page.locator('#flight-strip-count')).toContainText('on frequency');
  await page.screenshot({ path: testInfo.outputPath('assisted-ord.png') });
});

test('ORD snow exposes the deicing route and holdover model in the normal UI', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Winter operations are viewport-independent and covered once in Chromium.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=auto&autostart=1&detail=low&weather=snow&windDir=270&wind=12');
  await page.waitForFunction(() => window.airportControl?.version === '2.12.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#weather-condition-select')).toBeVisible();
  await expect(page.locator('#weather-condition-select')).toHaveValue('snow');
  await expect(page.locator('#weather-condition-select option')).toHaveCount(5);
  await page.locator('#wind-toggle').click();
  await expect(page.locator('#wind-toggle')).toHaveText('WIND OFF');
  await page.locator('#weather-toggle').click();
  await expect(page.locator('#weather-toggle')).toHaveText('WX OFF');
  await page.locator('#weather-toggle').click();
  await expect(page.locator('#weather-toggle')).toHaveText('WX ON');

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.weather).toMatchObject({
    condition: 'snow',
    enabled: true,
    surfaceCondition: 'contaminated',
  });
  expect(initial.weather.windEnabled).toBeFalsy();
  expect(initial.weather.temperatureC).toBeLessThan(0);
  expect(initial.surfaceGraph.deicingFacilities).toHaveLength(1);
  const planned = initial.flights.find((flight) => flight.phase === 'resting' && flight.deicing.status === 'planned');
  expect(planned?.deicing).toMatchObject({
    required: true,
    facilityName: 'Central Deicing Facility',
    laneNumber: expect.any(Number),
    fluid: 'Type I + Type IV',
  });

  await page.locator('#menu-toggle').click();
  if (await page.locator('#flight-strip').evaluate((element) => element.classList.contains('flight-strip--collapsed'))) {
    await page.locator('#flight-strip-toggle').click();
  }
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), planned!.id);
  await expect(page.locator('.deicing-panel')).toBeVisible();
  await expect(page.locator('.deicing-panel')).toContainText('Central Deicing Facility');
  await expect(page.locator('.deicing-panel__detail')).toContainText(/Lane \d/);
  await expect(page.locator('.flight-chip__detail').filter({ hasText: 'Central Deicing Facility' }).first()).toBeVisible();

  const diagnostics = await page.evaluate(() => window.airportControl.snapshot());
  expect(diagnostics.traffic.collisions).toHaveLength(0);
  expect(diagnostics.traffic.obstacleCollisions).toHaveLength(0);
  await page.screenshot({ path: testInfo.outputPath('ord-winter-deicing.png') });
});

test('Go-around climbs from the live pose and flies a visible missed-approach path', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The authoritative go-around is viewport-independent and covered once in Chromium.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ATL&mode=auto&autostart=1&detail=low&speed=3');
  await page.waitForFunction(() => window.airportControl?.version === '2.12.0');
  await page.waitForFunction(() => {
    const flight = window.airportControl.snapshot().flights.find((candidate) => candidate.phase === 'approach');
    return Boolean(flight && flight.progress > 0.18);
  });
  const before = await page.evaluate(() => window.airportControl.snapshot().flights.find((flight) => flight.phase === 'approach')!);
  const result = await page.evaluate((flightId) => window.airportControl.request({ action: 'triggerEmergency', flightId, type: 'go-around' }), before.id);
  expect(result.accepted).toBeTruthy();
  const instructed = result.resultingState.flights.find((flight) => flight.id === before.id)!;
  expect(instructed.goAround).toMatchObject({ detail: 'controller instruction', stage: 'go-around-climb' });
  expect(Math.hypot(
    instructed.motion.x - instructed.goAround!.start.x,
    instructed.motion.y - instructed.goAround!.start.y,
    instructed.motion.z - instructed.goAround!.start.z,
  )).toBeLessThan(0.05);
  await page.waitForFunction(({ flightId, altitude }) => {
    const flight = window.airportControl.snapshot().flights.find((candidate) => candidate.id === flightId);
    return Boolean(flight?.goAround && flight.goAround.stage === 'go-around-climb' && flight.kinematics.altitudeFt > altitude + 100 && flight.motion.pitch > 0.18);
  }, { flightId: before.id, altitude: instructed.kinematics.altitudeFt });
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), before.id);
  await page.waitForTimeout(900);
  await page.evaluate(() => {
    for (let index = 0; index < 5; index += 1) window.airportControl.command({ action: 'zoomIn' });
  });
  await page.waitForTimeout(300);
  const climbing = await page.evaluate((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId)!, before.id);
  expect(climbing.renderedAttitude?.noseUpDegrees).toBeGreaterThan(9);
  await page.screenshot({ path: testInfo.outputPath('go-around-climb.png') });
});

test('Mobile Watch mode keeps non-ORD and procedural maps navigable in low detail', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This test is the dedicated responsive/mobile browser gate.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ATL&mode=watch&autostart=1&detail=low');
  await page.waitForFunction(() => window.airportControl?.version === '2.12.0');
  await expect(page.locator('body')).toHaveClass(/watch-mode/);
  await expect(page.locator('#menu-toggle')).toBeVisible();
  await expect(page.locator('#zoom-in')).toBeVisible();
  const snapshot = await page.evaluate(() => window.airportControl.snapshot());
  expect(snapshot.mode).toBe('watch');
  expect(snapshot.airport.code).toBe('ATL');
  expect(snapshot.renderer.detail).toBe('low');
  expect(snapshot.renderer.camera).toMatchObject({
    groundWidth: 16_000,
    groundHeight: 12_000,
    detailedWidth: 4_000,
    detailedHeight: 3_000,
  });
  const initialCamera = snapshot.renderer.camera;
  await page.locator('#scene').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const start = { x: rect.left + rect.width * 0.85, y: rect.top + rect.height * 0.82 };
    const pointer = { bubbles: true, pointerId: 93, pointerType: 'touch', isPrimary: true, button: 0 };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...pointer, clientX: start.x, clientY: start.y, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...pointer, clientX: start.x - 70, clientY: start.y + 45, buttons: 1 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...pointer, clientX: start.x - 70, clientY: start.y + 45, buttons: 0 }));
  });
  await page.waitForFunction(({ x, y }) => {
    const camera = window.airportControl.snapshot().renderer.camera;
    return Math.hypot(camera.focusX - x, camera.focusY - y) > 1;
  }, { x: initialCamera.focusX, y: initialCamera.focusY });
  const safetyFont = await page.locator('.scoreboard span').nth(2).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(safetyFont).toBeGreaterThanOrEqual(7);
  const radarResult = await page.evaluate(() => window.airportControl.request({ action: 'setRadarVisible', enabled: true }));
  expect(radarResult.accepted).toBeTruthy();
  await expect(page.locator('#radar-panel')).toBeVisible();
  expect(await page.locator('#radar-panel').evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(210);
  await page.screenshot({ path: testInfo.outputPath('mobile-watch.png') });
  await page.locator('#radar-close').click();
  await expect(page.locator('#radar-panel')).toBeHidden();
  const queueResult = await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: true }));
  expect(queueResult.accepted).toBeTruthy();
  await expect(page.locator('#queue-panel')).toBeVisible();
  expect(await page.locator('#queue-panel').evaluate((element) => element.getBoundingClientRect().width)).toBeLessThanOrEqual(280);
  await page.screenshot({ path: testInfo.outputPath('mobile-queues.png') });
  await page.locator('#queue-close').click();

  await page.evaluate(() => window.airportControl.request({ action: 'selectAirport', code: 'LOCAL' }));
  await page.waitForFunction(() => window.airportControl.snapshot().airport.code === 'LOCAL');
  const local = await page.evaluate(() => window.airportControl.snapshot());
  expect(local.renderer.camera).toMatchObject({
    groundWidth: 9_600,
    groundHeight: 7_200,
    detailedWidth: 2_400,
    detailedHeight: 1_800,
    panLimitX: 3_000,
    panLimitY: 2_200,
    groundFillsViewport: true,
  });
  await page.screenshot({ path: testInfo.outputPath('procedural-local.png') });
});

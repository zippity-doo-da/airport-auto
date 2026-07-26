import { expect, test } from '@playwright/test';

test('Assisted ORD shift exposes proposals, station workload, and structured control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The focused mobile Watch test covers the responsive controls and radar inset.');
  // Hosted software WebGL can take more than six minutes to traverse this
  // intentionally broad end-to-end scenario even though hardware-accelerated
  // Chromium is much faster. Keep waits individually bounded while allowing
  // the complete release sequence to finish on the CI software renderer.
  test.setTimeout(600_000);
  await page.goto('/?airport=ORD&mode=assisted&station=supervisor&autostart=1&detail=low&renderFps=0.25');
  await expect(page.locator('#airport-name')).toContainText('O’Hare');
  await expect(page.locator('#flight-strip-count')).toContainText('aircraft');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.schemaVersion).toBe(33);
  expect(initial.controlProtocol).toMatchObject({
    protocolVersion: '1.2.0',
    apiVersion: '2.31.0',
    commandCount: 86,
    channel: 'airport-auto',
  });
  const protocolProbe = await page.evaluate(() => {
    const protocol = window.airportControl.protocol();
    const invalid = window.airportControl.validate({ action: 'pause', unknown: true });
    const circularCommand: Record<string, unknown> = { action: 'pause' };
    circularCommand.unknown = circularCommand;
    const circularRejected = (window.airportControl.request as unknown as (command: unknown) => ReturnType<typeof window.airportControl.request>)(circularCommand);
    const authorityRejected = window.airportControl.dispatch({
      protocolVersion: '1.2.0',
      requestId: 'e2e-authority-rejection',
      source: 'test',
      authority: { station: 'tower', actorId: 'tower-test-agent' },
      expects: { apiVersion: '2.31.0', snapshotSchemaVersion: 33 },
      command: { action: 'pause' },
    });
    const paused = window.airportControl.dispatch({
      protocolVersion: '1.2.0',
      requestId: 'e2e-formal-pause',
      clientId: 'playwright',
      source: 'test',
      authority: { station: 'supervisor', actorId: 'supervisor-test-agent' },
      expects: { apiVersion: '2.31.0', snapshotSchemaVersion: 33 },
      command: { action: 'pause' },
    });
    const resumed = window.airportControl.dispatch({
      protocolVersion: '1.2.0',
      requestId: 'e2e-formal-resume',
      source: 'test',
      authority: { station: 'supervisor' },
      command: { action: 'resume' },
    });
    return {
      protocol: {
        schemaVersion: protocol.schemaVersion,
        commandCount: protocol.commandCount,
        schemaNames: Object.keys(protocol.schemas),
        firstCommand: protocol.commands[0],
      },
      invalid,
      circularRejected,
      authorityRejected,
      paused,
      resumed,
    };
  });
  expect(protocolProbe.protocol).toMatchObject({
    schemaVersion: 1,
    commandCount: 86,
    schemaNames: ['command', 'requestEnvelope', 'result', 'event', 'broadcastMessage'],
    firstCommand: { action: 'pause', authority: { rule: 'session', safetyArbiter: true } },
  });
  expect(protocolProbe.invalid).toMatchObject({ valid: false, action: 'pause' });
  expect(protocolProbe.circularRejected).toMatchObject({
    accepted: false,
    action: 'pause',
    validation: { valid: false, issues: [{ keyword: 'additionalProperties' }] },
  });
  expect(protocolProbe.authorityRejected).toMatchObject({
    accepted: false,
    requestId: 'e2e-authority-rejection',
    reason: expect.stringContaining('does not match selected supervisor'),
    authority: { assertedStation: 'tower', effectiveStation: 'supervisor', enforced: true },
  });
  expect(protocolProbe.paused).toMatchObject({
    protocolVersion: '1.2.0',
    apiVersion: '2.31.0',
    requestId: 'e2e-formal-pause',
    clientId: 'playwright',
    source: 'test',
    action: 'pause',
    accepted: true,
    authority: { assertedStation: 'supervisor', effectiveStation: 'supervisor', safetyArbiter: true },
    compatibility: { compatible: true },
    validation: { valid: true, issues: [] },
  });
  expect(protocolProbe.paused.commandId).toMatch(/^cmd-/);
  expect(protocolProbe.paused.eventKey).toContain(`:${protocolProbe.paused.eventId}`);
  expect(protocolProbe.resumed.accepted).toBeTruthy();

  const broadcastResult = await page.evaluate(() => new Promise<ReturnType<typeof window.airportControl.request>>((resolve, reject) => {
    const channel = new BroadcastChannel('airport-auto');
    const timer = window.setTimeout(() => {
      channel.close();
      reject(new Error('formal BroadcastChannel request timed out'));
    }, 5_000);
    channel.addEventListener('message', (event) => {
      if (event.data?.type !== 'response' || event.data?.requestId !== 'e2e-broadcast-request') return;
      window.clearTimeout(timer);
      channel.close();
      resolve(event.data.result);
    });
    channel.postMessage({
      type: 'request',
      envelope: {
        protocolVersion: '1.2.0',
        requestId: 'e2e-broadcast-request',
        clientId: 'playwright-channel',
        source: 'test',
        authority: { station: 'supervisor' },
        expects: { apiVersion: '2.31.0', snapshotSchemaVersion: 33 },
        command: { action: 'setRadarVisible', enabled: false },
      },
    });
  }));
  expect(broadcastResult).toMatchObject({
    accepted: true,
    requestId: 'e2e-broadcast-request',
    clientId: 'playwright-channel',
    source: 'test',
    action: 'setRadarVisible',
    compatibility: { compatible: true },
  });
  expect(initial.mode).toBe('assisted');
  expect(initial.airport.code).toBe('ORD');
  expect(initial.controllers.automation).toEqual({
    approach: false,
    tower: false,
    ground: false,
    ramp: false,
  });
  expect(initial.controllers.scripted).toMatchObject({
    schemaVersion: 2,
    programVersion: '2.0.0',
    presetId: 'balanced',
    stations: {
      supervisor: { mode: 'human' },
      approach: { mode: 'human' },
      tower: { mode: 'human' },
      ground: { mode: 'human' },
      ramp: { mode: 'human' },
    },
  });
  expect(initial.controllers.workloads.map((workload) => workload.station)).toEqual(['approach', 'tower', 'ground', 'ramp']);
  expect(initial.controllers.workloads.every((workload) => workload.responsibilities.length >= 4)).toBeTruthy();
  expect(initial.controllers.performance.map((performance) => performance.station)).toEqual(['supervisor', 'approach', 'tower', 'ground', 'ramp']);
  expect(initial.controllers.performance.every((performance) => (
    performance.objectives.length === 4
    && performance.successMeasures.length === 4
    && performance.trafficScope.length > 20
    && performance.authoritySummary.length > 20
  ))).toBeTruthy();
  expect(new Set(initial.controllers.performance.map((performance) => performance.trafficScope)).size).toBe(5);
  expect(initial.controllers.evaluation).toMatchObject({
    schemaVersion: 1,
    methodVersion: '1.0.0',
    safetyBoundary: 'read-only',
    commands: { commandQualityScore: null, commandQualityRating: 'not-rated' },
    holds: { unnecessary: 0 },
  });
  expect(initial.controllers.evaluation.stations.map((evaluation) => evaluation.station)).toEqual(['supervisor', 'approach', 'tower', 'ground', 'ramp']);
  expect(initial.controllers.evaluation.methodology.safetyPriority).toContain('never');
  await expect(page.locator('#station-briefing')).toBeVisible();
  await expect(page.locator('#station-briefing')).toContainText('Supervisor objectives');
  await expect(page.locator('.station-briefing__objectives > span')).toHaveCount(4);
  const roleDisclosure = page.locator('.station-briefing__role');
  const roleSummary = roleDisclosure.locator('summary');
  await roleSummary.click();
  await expect(page.locator('.station-briefing__role')).toContainText('Every active aircraft');
  await page.waitForTimeout(1_200);
  await expect(roleDisclosure).toHaveAttribute('open', '');
  await expect(roleSummary).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath('controller-supervisor-briefing.png') });
  await roleSummary.click();
  const evaluationDisclosure = page.locator('.controller-evaluation');
  await expect(evaluationDisclosure.locator('summary')).toContainText('not rated');
  await evaluationDisclosure.locator('summary').click();
  await expect(evaluationDisclosure).toContainText('Throughput');
  await expect(evaluationDisclosure).toContainText('Hold review');
  await expect(evaluationDisclosure.locator('.controller-evaluation__metrics > span')).toHaveCount(8);
  await page.screenshot({ path: testInfo.outputPath('controller-decision-evaluation.png') });
  await evaluationDisclosure.locator('summary').click();
  expect(initial.airport.airspaceProgram).toMatchObject({
    schemaVersion: 1,
    dataVersion: 'airport-auto-schematic-ord-2026.07',
    nonNavigational: true,
    counts: { procedures: 32, holds: 4, missedApproaches: 16, sectors: 4 },
  });
  expect(initial.airport.airspaceProgram.disclaimer).toContain('never for navigation');
  expect(initial.airport.airspaceProgram.sources.every((source) => source.url.startsWith('https://www.faa.gov/'))).toBeTruthy();
  expect(initial.separationRuleset).toMatchObject({
    ruleset: { id: 'forgiving', physicalUnits: true },
    coordinateBasis: expect.stringContaining('metres'),
  });
  expect(initial.operations.profile).toMatchObject({ airportCode: 'ORD', archetype: 'hub-banked', schemaVersion: 1 });
  expect(initial.operations.current).toMatchObject({ periodId: 'morning-departure' });
  expect(initial.operations.current.localTime).toMatch(/^05:[3-5]\d$/);
  expect(initial.operations.current.mix.departureShare).toBeGreaterThan(initial.operations.current.mix.arrivalShare);
  expect(initial.operations.trafficProgram).toMatchObject({ schemaVersion: 2, airportCode: 'ORD', fidelity: 'sourced-airlines-schematic-weights' });
  expect(initial.operations.density).toMatchObject({ id: 'realistic', holdingCapacity: 4 });
  expect(initial.trafficManagement).toMatchObject({ schemaVersion: 1, density: { id: 'realistic' } });
  expect(initial.flights.every((flight) => flight.operationPlan.periodId === initial.operations.current.periodId)).toBeTruthy();
  expect(initial.flights.some((flight) => flight.operationPlan.direction === 'arrival')).toBeTruthy();
  expect(initial.flights.some((flight) => flight.operationPlan.direction === 'departure')).toBeTruthy();
  await expect(page.locator('#operation-bank')).toContainText('Morning departure bank · Realistic 1.08× bank');
  expect(initial.flights.every((flight) => (
    flight.flightPlan.schemaVersion === 2
    && flight.flightPlan.routeKind === 'schematic-procedure'
    && flight.flightPlan.procedureProfile.nonNavigational === true
    && flight.flightPlan.procedureProfile.dataVersion === initial.airport.airspaceProgram.dataVersion
    && flight.navigation.procedureDataVersion === initial.airport.airspaceProgram.dataVersion
    && flight.navigation.routeFixIds.length >= 3
    && flight.flightPlan.origin.length > 0
    && flight.flightPlan.destination.length > 0
    && flight.flightPlan.route.length >= 3
    && flight.flightPlan.procedure.length > 0
    && flight.flightPlan.gateIntent.standId === flight.stand
    && flight.flightPlan.runwayIntent.designation.length > 0
  ))).toBeTruthy();
  expect(initial.renderer.camera).toMatchObject({
    panningEnabled: true,
    groundWidth: 16_000,
    groundHeight: 12_000,
    detailedWidth: 4_000,
    detailedHeight: 3_000,
    panLimitX: 5_200,
    panLimitY: 3_900,
  });
  expect(initial.input).toMatchObject({
    schemaVersion: 1,
    catalogVersion: 1,
    context: 'gameplay',
    devices: {
      keyboard: true,
      mouse: true,
      touch: true,
      gamepad: { enabled: true, sensitivity: 1 },
    },
  });
  expect(initial.input.actions).toHaveLength(24);
  expect(new Set(initial.input.actions.map((action) => action.id)).size).toBe(24);
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
  expect(initial.contrailsVisible).toBeFalsy();
  expect(initial.renderer).toMatchObject({ contrailsVisible: false, activeContrails: 0 });
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
  expect(initial.renderer.airspaceLayers).toEqual({
    'airspace-sectors': false,
    'navigation-fixes': false,
    procedures: false,
    'flight-routes': false,
    separation: false,
  });
  expect(initial.renderer.context).toMatchObject({ status: 'loaded', roads: 6_016, rails: 1_127, boundaryRings: 1 });
  expect(initial.renderer.context.drawGroups).toBeLessThanOrEqual(20);
  expect(initial.renderer.drawCalls).toBeLessThan(320);
  expect(initial.renderer.geometries).toBeLessThan(280);
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
    && flight.fuelPlan.schemaVersion === 1
    && flight.fuelPlan.usableFuelKg === flight.aircraft.usableFuelKg
    && Math.max(flight.turnaround.initialFuelPercent, flight.fuelPlan.departure.dispatchFuelPercent) === flight.turnaround.targetFuelPercent
    && flight.fuelPlan.departure.estimatedDistanceNm > 0
    && flight.kinematics.headingDegrees >= 1
    && flight.kinematics.headingDegrees <= 360
    && flight.kinematics.cardinalDirection.length > 0
  ))).toBeTruthy();
  expect(initial.flights.filter((flight) => flight.phase === 'approach').every((flight) => (
    flight.kinematics.fuelPercent >= 7 && flight.kinematics.fuelPercent <= 32
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
  await expect(page.locator('.flight-chip').first().locator('.flight-chip__metric')).toHaveCount(4);
  await expect(page.locator('.flight-chip').first().locator('.flight-chip__metric').nth(3)).toContainText(/Heading\d{3}° [NSEW]/i);
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
  const beforeKeyboardRotate = await page.evaluate(() => window.airportControl.snapshot().renderer.camera.orbitDegrees);
  await page.keyboard.press('q');
  await page.waitForFunction((orbit) => window.airportControl.snapshot().renderer.camera.orbitDegrees !== orbit, beforeKeyboardRotate);
  const afterLeftRotate = await page.evaluate(() => window.airportControl.snapshot().renderer.camera.orbitDegrees);
  expect(afterLeftRotate).toBeGreaterThan(beforeKeyboardRotate);
  await page.keyboard.down('e');
  await page.waitForFunction((orbit) => window.airportControl.snapshot().renderer.camera.orbitDegrees < orbit, afterLeftRotate);
  await page.keyboard.up('e');
  expect(await page.evaluate(() => window.airportControl.snapshot().renderer.camera.orbitDegrees)).toBeLessThan(afterLeftRotate);
  const densityResult = await page.evaluate(() => window.airportControl.request({ action: 'setTrafficDensity', density: 'busy' }));
  expect(densityResult.accepted).toBeTruthy();
  expect(densityResult.resultingState.trafficDensity).toBe('busy');
  expect(densityResult.resultingState.trafficManagement.density.id).toBe('busy');
  const rushScenarioResult = await page.evaluate(() => window.airportControl.request({ action: 'setScenario', scenario: 'rush' }));
  expect(rushScenarioResult.accepted).toBeTruthy();
  expect(rushScenarioResult.resultingState.trafficDensity).toBe('busy');
  await page.evaluate(() => window.airportControl.request({ action: 'setScenario', scenario: 'normal' }));
  await page.locator('#menu-toggle').click();
  await expect(page.locator('#density-select')).toHaveValue('busy');
  await expect(page.locator('#traffic-flow')).toContainText('Busy');
  await page.locator('#menu-toggle').click();
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
  const rampStation = await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'ramp' }));
  expect(rampStation.accepted).toBeTruthy();
  expect(rampStation.resultingState.controllers.automation).toEqual({ approach: true, tower: true, ground: true, ramp: false });
  await expect(page.locator('#station-briefing')).toContainText('Ramp objectives');
  await expect(page.locator('#station-briefing')).toContainText('Push ready');
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
  await page.waitForFunction(() => {
    const renderer = window.airportControl.snapshot().renderer;
    return renderer.attachedTugs >= 1 && renderer.startingEngines >= 1;
  });
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
  expect(recording).toMatchObject({
    schemaVersion: 2,
    protocolVersion: '1.2.0',
    simulationVersion: '2.31.0',
    sessionId: expect.stringMatching(/^session-/),
  });
  expect(recording.seed).toBe(10_004);
  expect(recording.commands.length).toBeGreaterThan(0);
  expect(recording.commands.at(-1)).toMatchObject({
    requestId: pauseResult.requestId,
    commandId: pauseResult.commandId,
    eventId: pauseResult.eventId,
    eventKey: pauseResult.eventKey,
    command: { action: 'pause' },
    accepted: true,
  });
  expect(recording.events.every((event) => event.eventKey === `${event.sessionId}:${event.eventId}`)).toBeTruthy();
  const resumeResult = await page.evaluate(() => window.airportControl.request({ action: 'resume' }));
  expect(resumeResult.accepted).toBeTruthy();
  await page.evaluate(() => window.airportControl.request({ action: 'pause' }));

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#control-panel')).toHaveClass(/control-panel--open/);
  await expect(page.locator('#station-select option')).toHaveCount(5);
  await expect(page.locator('[data-station-workload]')).toHaveCount(4);
  await expect(page.locator('[data-station-automation]')).toHaveCount(4);
  await expect(page.locator('[data-station-automation]').first()).toBeEnabled();
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
  await page.waitForFunction(() => {
    const snapshot = window.airportControl.snapshot();
    const runwayId = snapshot.surfaceDisruptions[0]?.runwayId;
    return snapshot.renderer.surfaceDisruptions.total === 1
      && snapshot.renderer.runways.find((runway) => runway.id === runwayId)?.markerVisible === false;
  });
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
  for (const layer of ['navigation-fixes', 'procedures', 'flight-routes', 'separation']) {
    const control = page.locator(`input[data-airspace-layer="${layer}"]`);
    await expect(control).not.toBeChecked();
    await control.check();
  }
  const airspaceSnapshot = await page.evaluate(() => window.airportControl.snapshot());
  expect(airspaceSnapshot.renderer.airspaceLayers).toMatchObject({
    'navigation-fixes': true,
    procedures: true,
    'flight-routes': true,
    separation: true,
  });
  await page.screenshot({ path: testInfo.outputPath('airspace-overlays.png') });
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
  await expect(page.locator('#contrails-toggle')).not.toBeChecked();
  await page.locator('#contrails-toggle').check();
  expect((await page.evaluate(() => window.airportControl.snapshot())).renderer.contrailsVisible).toBeTruthy();
  const contrailResult = await page.evaluate(() => window.airportControl.request({ action: 'setContrailsVisible', enabled: false }));
  expect(contrailResult.accepted).toBeTruthy();
  await expect(page.locator('#contrails-toggle')).not.toBeChecked();
  await page.locator('#menu-toggle').click();
  await page.screenshot({ path: testInfo.outputPath('map-overlays.png') });
  await page.locator('#menu-toggle').click();
  const orientationResult = await page.evaluate(() => window.airportControl.request({ action: 'setMapOrientationVisible', enabled: false }));
  expect(orientationResult.accepted).toBeTruthy();
  await expect(page.locator('#map-orientation')).toBeHidden();
  await page.evaluate(() => window.airportControl.command({ action: 'resetCamera' }));
  await page.waitForTimeout(250);
  await page.locator('#station-select').selectOption('ground');
  await expect(page.locator('#flight-strip-count')).toContainText('tracks');
  await expect(page.locator('#station-briefing')).toContainText('Ground objectives');
  await expect(page.locator('#station-briefing')).toContainText('Crossing wait');
  await page.screenshot({ path: testInfo.outputPath('assisted-ord.png') });
});

test('Manual ORD supports live procedure control, ownership handoffs, and physical separation options', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The live ATC protocol is covered once in desktop Chromium.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=manual&station=approach&density=quiet&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  const pauseResult = await page.evaluate(() => window.airportControl.request({ action: 'pause' }));
  expect(pauseResult.accepted).toBe(true);
  await expect(page.locator('#station-briefing')).toContainText('Approach objectives');
  await expect(page.locator('#station-briefing')).toContainText('Low reserve');
  const arrival = await page.evaluate(() => window.airportControl.snapshot().flights.find((flight) => flight.phase === 'approach'));
  expect(arrival).toBeTruthy();
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), arrival!.id);
  const previewButton = page.getByRole('button', { name: 'Preview route' });
  await expect(previewButton).toBeVisible();
  await expect(page.getByRole('button', { name: `Divert ${arrival!.origin}` })).toBeVisible();
  const routeEditor = page.locator('.route-editor');
  await expect(routeEditor).toBeVisible();
  await routeEditor.locator('summary').click();
  const routeOptionButtons = routeEditor.locator('.route-editor__options button');
  expect(await routeOptionButtons.count()).toBeGreaterThan(1);
  const routeOptions = await routeOptionButtons.evaluateAll((buttons) => buttons.map((button) => (
    (button as HTMLButtonElement).dataset.routeFixes?.split(',').filter(Boolean) ?? []
  )));
  await routeOptionButtons.first().click();
  await page.waitForFunction((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId)?.navigation.routeClearance?.status === 'preview', arrival!.id);
  let previewState = await page.evaluate((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId)?.navigation.routeClearance, arrival!.id);
  for (const fixIds of routeOptions.slice(1)) {
    if (previewState?.safeToIssue) break;
    const nextPreview = await page.evaluate(({ flightId, fixIds: nextFixIds }) => (
      window.airportControl.request({ action: 'previewRoute', flightId, fixIds: nextFixIds })
    ), { flightId: arrival!.id, fixIds });
    expect(nextPreview.accepted).toBe(true);
    previewState = nextPreview.resultingState.flights.find((flight) => flight.id === arrival!.id)?.navigation.routeClearance;
  }
  expect(previewState).toMatchObject({ status: 'preview', safeToIssue: true });
  await expect(page.locator('.route-clearance[data-status="preview"]')).toContainText(/Route preview|SAFE/);
  await expect(page.getByRole('button', { name: 'Issue route' })).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('route-preview.png') });
  const issuedRoute = await page.evaluate((flightId) => window.airportControl.request({ action: 'issueRouteAmendment', flightId }), arrival!.id);
  expect(issuedRoute).toMatchObject({ accepted: true, reason: expect.stringContaining('readback pending') });
  expect(issuedRoute.resultingState.flights.find((flight) => flight.id === arrival!.id)?.navigation).toMatchObject({ readbackStatus: 'pending', routeClearance: { status: 'pending-readback' } });
  const acceptedRoute = await page.evaluate((flightId) => window.airportControl.request({ action: 'acceptRouteReadback', flightId }), arrival!.id);
  expect(acceptedRoute).toMatchObject({ accepted: true, reason: expect.stringContaining('route amendment accepted') });
  expect(acceptedRoute.resultingState.flights.find((flight) => flight.id === arrival!.id)?.navigation).toMatchObject({ readbackStatus: 'accepted', routeClearance: { status: 'accepted' } });
  const resumeResult = await page.evaluate(() => window.airportControl.request({ action: 'resume' }));
  expect(resumeResult.accepted).toBe(true);
  const headingCommand = await page.evaluate((flightId) => {
    const liveFlight = window.airportControl.snapshot().flights.find((flight) => flight.id === flightId);
    if (!liveFlight) throw new Error(`Flight ${flightId} disappeared before the heading command.`);
    const currentHeading = ((90 - liveFlight.motion.heading * 180 / Math.PI) % 360 + 360) % 360;
    const headingDegrees = (currentHeading + 10) % 360;
    return {
      headingDegrees,
      result: window.airportControl.request({ action: 'assignHeading', flightId, headingDegrees }),
    };
  }, arrival!.id);
  const { headingDegrees, result: heading } = headingCommand;
  expect(heading).toMatchObject({ accepted: true, reason: expect.stringContaining('heading'), eventId: expect.any(Number) });
  expect(heading.resultingState.flights.find((flight) => flight.id === arrival!.id)?.navigation.vector).toBeTruthy();
  await page.waitForFunction(({ flightId, commandId }) => window.airportControl.events(30).some((event) => (
    event.type === 'vector'
    && event.flightId === flightId
    && event.causedByCommandId === commandId
  )), { flightId: arrival!.id, commandId: heading.commandId });
  const causalVector = await page.evaluate(({ flightId, commandId }) => window.airportControl.events(30).find((event) => (
    event.type === 'vector'
    && event.flightId === flightId
    && event.causedByCommandId === commandId
  )), { flightId: arrival!.id, commandId: heading.commandId });
  expect(causalVector).toMatchObject({ protocolVersion: '1.2.0', apiVersion: '2.31.0', causedByCommandId: heading.commandId });
  expect(causalVector!.eventId).toBeGreaterThan(heading.eventId);
  const altitude = await page.evaluate((flightId) => window.airportControl.request({ action: 'assignAltitude', flightId, altitudeFt: 3_000 }), arrival!.id);
  expect(altitude.accepted).toBeTruthy();
  const speed = Math.ceil((arrival!.aircraft.approachKts + 5) / 5) * 5;
  expect((await page.evaluate(({ flightId, speedKts }) => window.airportControl.request({ action: 'assignAirspeed', flightId, speedKts }), { flightId: arrival!.id, speedKts: speed })).accepted).toBeTruthy();
  const directFix = arrival!.navigation.routeFixIds[1];
  expect((await page.evaluate(({ flightId, fixId }) => window.airportControl.request({ action: 'directTo', flightId, fixId }), { flightId: arrival!.id, fixId: directFix })).accepted).toBeTruthy();
  expect((await page.evaluate((flightId) => window.airportControl.request({ action: 'holdFlight', flightId, efcMinutes: 2 }), arrival!.id)).accepted).toBeTruthy();
  const held = await page.evaluate((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId), arrival!.id);
  expect(held?.navigation.hold).toMatchObject({ expectFurtherClearanceAtSeconds: expect.any(Number), cycle: 1 });
  expect(held?.trajectory?.stage).toBe('hold-entry');
  expect((await page.evaluate((flightId) => window.airportControl.request({ action: 'releaseHold', flightId }), arrival!.id)).accepted).toBeTruthy();
  expect((await page.evaluate((flightId) => window.airportControl.request({ action: 'clearApproach', flightId }), arrival!.id)).accepted).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'pause' }))).accepted).toBeTruthy();
  const offeredHandoff = await page.evaluate((flightId) => window.airportControl.request({ action: 'offerHandoff', flightId, station: 'tower' }), arrival!.id);
  expect(offeredHandoff).toMatchObject({ accepted: true });
  expect(offeredHandoff.resultingState.flights.find((flight) => flight.id === arrival!.id)?.navigation).toMatchObject({
    frequencyOwner: 'approach',
    handoff: { from: 'approach', to: 'tower', status: 'offered' },
  });
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'tower' }))).accepted).toBeTruthy();
  await expect(page.locator('#coordination-inbox')).toBeVisible();
  await expect(page.locator('#station-briefing')).toContainText('Tower objectives');
  await expect(page.locator('#station-briefing')).toContainText('Runway alerts');
  await expect(page.locator('#coordination-inbox')).toContainText(arrival!.callsign);
  await page.locator('#coordination-inbox button[data-coordination-action="accept"]').click();
  await page.waitForFunction((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId)?.navigation.handoff?.status === 'accepted', arrival!.id);
  await page.screenshot({ path: testInfo.outputPath('tower-coordination-inbox.png') });
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'approach' }))).accepted).toBeTruthy();
  await expect(page.locator('#coordination-inbox button[data-coordination-action="contact"]')).toBeVisible();
  await page.locator('#coordination-inbox button[data-coordination-action="contact"]').click();
  await page.waitForFunction((flightId) => window.airportControl.snapshot().flights.find((flight) => flight.id === flightId)?.navigation.frequencyOwner === 'tower', arrival!.id);
  const wrongOwner = await page.evaluate(({ flightId, headingDegrees }) => window.airportControl.request({ action: 'assignHeading', flightId, headingDegrees }), {
    flightId: arrival!.id,
    headingDegrees,
  });
  expect(wrongOwner).toMatchObject({ accepted: false, reason: expect.stringMatching(/does not own|handoff required/) });
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'tower' }))).accepted).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'resume' }))).accepted).toBeTruthy();
  expect((await page.evaluate(({ flightId, runway }) => window.airportControl.request({ action: 'clearFlight', flightId, runway }), { flightId: arrival!.id, runway: arrival!.runway })).accepted).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setSeparationRuleset', ruleset: 'realistic' }))).accepted).toBeTruthy();
  for (const layer of ['procedures', 'flight-routes', 'separation'] as const) {
    expect((await page.evaluate((name) => window.airportControl.request({ action: 'setAirspaceLayerVisible', layer: name, enabled: true }), layer)).accepted).toBeTruthy();
  }
  await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), arrival!.id);
  const controlled = await page.evaluate(() => window.airportControl.snapshot());
  expect(controlled.separationRuleset).toMatchObject({ ruleset: { id: 'realistic', radarHorizontalNm: 3, verticalFt: 1_000 } });
  expect(controlled.flights.find((flight) => flight.id === arrival!.id)?.navigation).toMatchObject({
    frequencyOwner: 'tower',
    approachCleared: true,
    assignedSpeedKts: speed,
  });
  expect(controlled.flights.find((flight) => flight.id === arrival!.id)?.flightPlan.amendments.some((amendment) => amendment.detail.includes('3,000 ft'))).toBeTruthy();
  await page.screenshot({ path: testInfo.outputPath('manual-live-atc.png') });
});

test('Group select exposes and applies only shared atomic commands', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Grouped ATC commands are covered once in desktop Chromium.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=manual&station=supervisor&density=rush&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.evaluate(() => window.airportControl.request({ action: 'pause' }));
  const arrivals = await page.evaluate(() => window.airportControl.snapshot().flights
    .filter((flight) => flight.phase === 'approach'
      && flight.progress < 0.68
      && flight.navigation.frequencyOwner === 'approach'
      && !flight.navigation.hold
      && !flight.goAround
      && !flight.diversion)
    .slice(0, 2)
    .map((flight) => ({ id: flight.id, callsign: flight.callsign })));
  expect(arrivals).toHaveLength(2);

  await page.locator('#group-select-toggle').click();
  await expect(page.locator('#group-select-toggle')).toHaveAttribute('aria-pressed', 'true');
  for (const flight of arrivals) await page.locator(`button[data-flight-chip="${flight.id}"]`).click();
  await expect(page.locator('#group-select-count')).toHaveText('2 selected');
  await expect(page.locator('#group-actions')).toBeVisible();
  await expect(page.locator('#group-actions button[data-group-instruction="slow"]')).toBeVisible();
  await expect(page.locator('#group-actions button[data-group-instruction="normal"]')).toHaveCount(0);
  await expect(page.locator('#group-actions button[data-group-instruction="hold"]')).toHaveCount(0);
  await expect(page.locator('#group-actions')).toContainText('approach authority');
  await page.screenshot({ path: testInfo.outputPath('grouped-atc-selection.png') });

  const preview = await page.evaluate((flightIds) => window.airportControl.request({
    action: 'previewGroupInstruction',
    flightIds,
    instruction: 'slow',
  }), arrivals.map((flight) => flight.id));
  expect(preview).toMatchObject({
    accepted: true,
    data: {
      safeToIssue: true,
      domain: 'airborne',
      authority: 'approach',
      flightIds: arrivals.map((flight) => flight.id),
    },
  });
  const rejected = await page.evaluate((flightIds) => window.airportControl.request({
    action: 'controlFlights',
    flightIds,
    instruction: 'expedite',
  }), arrivals.map((flight) => flight.id));
  expect(rejected).toMatchObject({ accepted: false, reason: expect.stringContaining('single-flight only') });

  await page.locator('#group-actions button[data-group-instruction="slow"]').click();
  await expect(page.locator('#group-select-toggle')).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#group-actions')).toBeHidden();
  const result = await page.evaluate((flightIds) => {
    const snapshot = window.airportControl.snapshot();
    return {
      selection: snapshot.selection,
      controls: snapshot.flights
        .filter((flight) => flightIds.includes(flight.id))
        .map((flight) => ({ id: flight.id, pace: flight.control.pace })),
      groupEvents: window.airportControl.events(20).filter((event) => event.type === 'group-instruction'),
    };
  }, arrivals.map((flight) => flight.id));
  expect(result.selection).toEqual({
    focusedFlightId: null,
    focusedTarget: null,
    groupMode: false,
    groupedFlightIds: [],
  });
  expect(result.controls).toEqual(arrivals.map((flight) => ({ id: flight.id, pace: 0.55 })));
  expect(result.groupEvents.map((event) => event.flightId)).toEqual(expect.arrayContaining(arrivals.map((flight) => flight.id)));
});

test('ORD snow exposes the deicing route and holdover model in the normal UI', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Winter operations are viewport-independent and covered once in Chromium.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=auto&autostart=1&detail=low&weather=snow&windDir=270&wind=12&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
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
  expect(initial.weather.ceilingFt).toBe(1_000);
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
  await page.goto('/?airport=ATL&mode=auto&autostart=1&detail=low&speed=3&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
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

test('No-fail training teaches, explains rejection, and restores a live checkpoint', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');

  const started = await page.evaluate(() =>
    window.airportControl.request({
      action: 'startTrainingLesson',
      lessonId: 'arrival-basics',
    }),
  );
  expect(started.accepted).toBeTruthy();
  expect(started.resultingState.schemaVersion).toBe(33);
  expect(started.resultingState.training).toMatchObject({
    status: 'coach-paused',
    lessonId: 'arrival-basics',
    noFail: true,
    step: { id: 'arrival-focus', number: 1, count: 4 },
  });
  expect(started.resultingState.training.availableLessons).toHaveLength(4);
  await expect(page.locator('#training-coach')).toBeVisible();
  await expect(page.locator('#training-title')).toHaveText('Arrival foundations');
  await expect(page.locator('#training-objective')).toContainText('Select an aircraft');

  const arrival = started.resultingState.flights.find((flight) => flight.phase === 'approach');
  expect(arrival).toBeTruthy();
  const focused = await page.evaluate((flightId) => window.airportControl.request({ action: 'focusFlight', flightId }), arrival!.id);
  expect(focused.accepted).toBeTruthy();
  expect(focused.resultingState.training).toMatchObject({
    stepIndex: 1,
    targetFlightId: arrival!.id,
    step: { id: 'arrival-station' },
  });

  const station = await page.evaluate(() =>
    window.airportControl.request({
      action: 'setStation',
      station: 'approach',
    }),
  );
  expect(station.accepted).toBeTruthy();
  expect(station.resultingState.training.step.id).toBe('arrival-speed');
  expect((await page.evaluate(() => window.airportControl.request({ action: 'continueTraining' }))).accepted).toBeTruthy();

  const rejected = await page.evaluate(
    (flightId) =>
      window.airportControl.request({
        action: 'assignAirspeed',
        flightId,
        speedKts: 999,
      }),
    arrival!.id,
  );
  expect(rejected.accepted).toBeFalsy();
  expect(rejected.resultingState.training).toMatchObject({
    status: 'coach-paused',
    mistakeCount: 1,
    step: { id: 'arrival-speed' },
  });
  expect(rejected.resultingState.training.feedback).toContain('Instruction not issued');
  expect(rejected.resultingState.gameOver).toBeFalsy();
  expect(rejected.resultingState.traffic.predictions).toEqual([]);
  await expect(page.locator('#training-explanation')).toHaveAttribute('open', '');
  await expect(page.locator('#training-feedback')).toContainText('speed must be');
  await page.screenshot({
    path: testInfo.outputPath('no-fail-training-coaching.png'),
  });

  const retried = await page.evaluate(() => window.airportControl.request({ action: 'retryTrainingStep' }));
  expect(retried.accepted).toBeTruthy();
  expect(retried.resultingState.training).toMatchObject({
    status: 'coach-paused',
    mistakeCount: 1,
    recoveryCount: 1,
  });
  expect(retried.resultingState.training.feedback).toContain('Checkpoint restored exactly');
  expect((await page.evaluate(() => window.airportControl.request({ action: 'continueTraining' }))).accepted).toBeTruthy();

  const speed = await page.evaluate(
    (flightId) =>
      window.airportControl.request({
        action: 'assignAirspeed',
        flightId,
        speedKts: 180,
      }),
    arrival!.id,
  );
  expect(speed.accepted).toBeTruthy();
  expect(speed.resultingState.training.step.id).toBe('arrival-approach');
  const hint = await page.evaluate(() => window.airportControl.request({ action: 'trainingHint' }));
  expect(hint.accepted).toBeTruthy();
  expect(hint.resultingState.training.hintCount).toBe(1);
  const approach = await page.evaluate((flightId) => window.airportControl.request({ action: 'clearApproach', flightId }), arrival!.id);
  expect(approach.accepted).toBeTruthy();
  expect(approach.resultingState.training).toMatchObject({
    status: 'complete',
    completedStepIds: ['arrival-focus', 'arrival-station', 'arrival-speed', 'arrival-approach'],
  });
  await expect(page.locator('#training-progress')).toHaveText('Complete');
  await expect(page.locator('#training-continue')).toHaveText('Continue shift');

  const bounds = await page.locator('#training-coach').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      left: rect.left,
    };
  });
  const viewport = page.viewportSize()!;
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.right).toBeLessThanOrEqual(viewport.width);
  expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(await page.locator('#training-continue').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({
    path: testInfo.outputPath('no-fail-training-complete.png'),
  });

  const continued = await page.evaluate(() => window.airportControl.request({ action: 'continueTraining' }));
  expect(continued.accepted).toBeTruthy();
  expect(continued.resultingState.training.status).toBe('inactive');
  expect(continued.resultingState.paused).toBeFalsy();
  await expect(page.locator('#training-coach')).toBeHidden();
});

test('Challenge shifts lock conditions, grade operations, and fit responsive play', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=auto&challenge=rush-hour&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');
  await page.locator('#enter').click();
  await expect(page.locator('#intro')).toHaveClass(/modal--hidden/);

  const briefing = await page.evaluate(() => window.airportControl.snapshot());
  expect(briefing.schemaVersion).toBe(33);
  expect(briefing.mode).toBe('assisted');
  expect(briefing.paused).toBeTruthy();
  expect(briefing.challenge).toMatchObject({
    status: 'briefing',
    challengeId: 'rush-hour',
    conditionsLocked: true,
    definition: { scenario: 'rush', density: 'rush', separationRuleset: 'forgiving' },
  });
  expect(briefing.challenge.availableChallenges).toHaveLength(4);
  expect(briefing.challenge.objectives).toHaveLength(4);
  expect(Object.values(briefing.controllers.automation).every(Boolean)).toBeTruthy();
  await expect(page.locator('#challenge-hud')).toBeVisible();
  await expect(page.locator('#challenge-title')).toHaveText('Rush-hour bank');
  await expect(page.locator('#challenge-clock')).toHaveText('06:00');
  await expect(page.locator('#challenge-objectives .challenge-objective')).toHaveCount(4);
  await expect(page.locator('#scenario-select')).toBeDisabled();
  await expect(page.locator('#density-select')).toBeDisabled();
  await expect(page.locator('#weather-toggle')).toBeDisabled();
  await expect(page.locator('#challenge-setup')).not.toHaveAttribute('open', '');

  const resume = await page.evaluate(() => window.airportControl.request({ action: 'resume' }));
  expect(resume.accepted).toBeFalsy();
  expect(resume.reason).toContain('begin the challenge');
  const scenario = await page.evaluate(() => window.airportControl.request({ action: 'setScenario', scenario: 'normal' }));
  expect(scenario.accepted).toBeFalsy();
  expect(scenario.reason).toContain('locks');
  const weather = await page.evaluate(() => window.airportControl.request({ action: 'setWeatherEnabled', enabled: false }));
  expect(weather.accepted).toBeFalsy();

  const started = await page.evaluate(() => window.airportControl.request({ action: 'beginChallenge' }));
  expect(started.accepted).toBeTruthy();
  expect(started.resultingState.challenge.status).toBe('active');
  expect(started.resultingState.paused).toBeFalsy();
  await expect(page.locator('#challenge-grade')).toContainText('Live');
  await page.waitForTimeout(900);
  const live = await page.evaluate(() => window.airportControl.snapshot().challenge);
  expect(live.summary.safety.missedHandoffs).toBe(0);
  expect(live.summary.safety.score).toBe(100);
  await page.screenshot({ path: testInfo.outputPath('challenge-rush-active.png') });

  const hudBounds = await page.locator('#challenge-hud').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
  });
  let viewport = page.viewportSize()!;
  expect(hudBounds.top).toBeGreaterThanOrEqual(0);
  expect(hudBounds.left).toBeGreaterThanOrEqual(0);
  expect(hudBounds.right).toBeLessThanOrEqual(viewport.width);
  expect(hudBounds.bottom).toBeLessThanOrEqual(viewport.height);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(await page.locator('#challenge-end').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  } else {
    await page.setViewportSize({ width: 1024, height: 600 });
    viewport = page.viewportSize()!;
    const laptopHud = await page.locator('#challenge-hud').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    });
    expect(laptopHud.top).toBeGreaterThanOrEqual(0);
    expect(laptopHud.left).toBeGreaterThanOrEqual(0);
    expect(laptopHud.right).toBeLessThanOrEqual(viewport.width);
    expect(laptopHud.bottom).toBeLessThanOrEqual(viewport.height);
    const laptopStrip = await page.locator('#flight-strip').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    });
    const overlapsFlightStrip = laptopHud.left < laptopStrip.right
      && laptopHud.right > laptopStrip.left
      && laptopHud.top < laptopStrip.bottom
      && laptopHud.bottom > laptopStrip.top;
    expect(overlapsFlightStrip).toBe(false);
    await page.waitForTimeout(4_100);
    await page.screenshot({ path: testInfo.outputPath('challenge-rush-laptop.png') });
  }

  const ended = await page.evaluate(() => window.airportControl.request({ action: 'endChallenge' }));
  expect(ended.accepted).toBeTruthy();
  expect(ended.resultingState.challenge).toMatchObject({ status: 'abandoned', grade: 'F' });
  await expect(page.locator('#challenge-results')).toBeVisible();
  await expect(page.locator('#challenge-result-grade')).toHaveText('F');
  await expect(page.locator('.challenge-results__summary > span')).toHaveCount(6);
  await expect(page.locator('#challenge-result-objectives .challenge-objective')).toHaveCount(4);
  await expect(page.locator('#challenge-retry')).toBeFocused();
  const resultBounds = await page.locator('.challenge-results__panel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
  });
  expect(resultBounds.top).toBeGreaterThanOrEqual(0);
  expect(resultBounds.left).toBeGreaterThanOrEqual(0);
  expect(resultBounds.right).toBeLessThanOrEqual(viewport.width);
  expect(resultBounds.bottom).toBeLessThanOrEqual(viewport.height);
  await page.screenshot({ path: testInfo.outputPath('challenge-rush-debrief.png') });

  await page.locator('#challenge-retry').click();
  await expect(page.locator('#challenge-results')).toBeHidden();
  await expect(page.locator('#challenge-hud')).toBeVisible();
  expect((await page.evaluate(() => window.airportControl.snapshot())).challenge.status).toBe('briefing');
  expect((await page.evaluate(() => window.airportControl.request({ action: 'endChallenge' }))).accepted).toBeTruthy();
  await expect(page.locator('#challenge-results')).toBeVisible();
  await page.locator('#challenge-continue').click();
  await expect(page.locator('#challenge-results')).toBeHidden();
  await expect(page.locator('#challenge-hud')).toBeHidden();
  const continued = await page.evaluate(() => window.airportControl.snapshot());
  expect(continued.challenge.status).toBe('inactive');
  expect(continued.paused).toBeFalsy();
  expect(continued.gameOver).toBeFalsy();
});

test('Sandbox stages requested traffic without score pressure and fits responsive play', async ({ page }, testInfo) => {
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=auto&sandbox=1&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.context.status === 'loaded');
  await expect(page.locator('#intro')).toHaveClass(/modal--hidden/);

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.schemaVersion).toBe(33);
  expect(initial.airport.code).toBe('ORD');
  expect(initial.sandbox).toMatchObject({
    active: true,
    backgroundTraffic: false,
    noScore: true,
    activeAircraftCount: 0,
    pendingCount: 0,
  });
  expect(initial.score).toEqual({ landed: 0, departed: 0 });
  expect(initial.gameOver).toBeFalsy();
  await expect(page.locator('body')).toHaveClass(/sandbox-active/);
  await expect(page.locator('.scoreboard')).toBeHidden();
  await expect(page.locator('#sandbox-hud')).toBeVisible();
  await expect(page.locator('#sandbox-hud')).toContainText('No score · no fail');

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#sandbox-setup')).toHaveAttribute('open', '');
  await expect(page.locator('#sandbox-inject')).toBeEnabled();
  await expect(page.locator('#sandbox-runway option')).not.toHaveCount(1);
  await page.locator('#sandbox-direction').selectOption('arrival');
  await page.locator('#sandbox-traffic-class').selectOption('passenger');
  await page.locator('#sandbox-count').selectOption('1');
  await page.locator('#sandbox-inject').click();
  await page.waitForFunction(() => window.airportControl.snapshot().sandbox.totals.releasedArrivals === 1);
  const injected = await page.evaluate(() => window.airportControl.snapshot());
  expect(injected.sandbox.activeAircraftCount).toBe(1);
  expect(injected.sandbox.pendingCount).toBe(0);
  expect(injected.flights[0].flightPlan.direction).toBe('arrival');
  expect(injected.flights[0].operationPlan.trafficClass).toBe('passenger');

  const configured = await page.evaluate(() => {
    const weather = window.airportControl.request({
      action: 'setWeather',
      condition: 'rain',
      directionDegrees: 270,
      windSpeed: 18,
    });
    const manual = window.airportControl.request({ action: 'setMode', value: 'manual' });
    const queued = window.airportControl.request({
      action: 'injectSandboxTraffic',
      direction: 'departure',
      trafficClass: 'regional',
      runwayId: null,
      count: 4,
    });
    const cancelled = window.airportControl.request({ action: 'cancelSandboxInjections' });
    return { weather, manual, queued, cancelled, snapshot: window.airportControl.snapshot() };
  });
  expect(configured.weather.accepted).toBeTruthy();
  expect(configured.manual.accepted).toBeTruthy();
  expect(configured.queued.accepted).toBeTruthy();
  expect(configured.cancelled.accepted).toBeTruthy();
  expect(configured.snapshot.weather).toMatchObject({ condition: 'rain', windSpeed: 18 });
  expect(configured.snapshot.sandbox.pendingCount).toBe(0);
  expect(configured.snapshot.sandbox.totals.cancelled).toBe(4);
  await expect(page.locator('#station-briefing')).toBeHidden();

  const hudBounds = await page.locator('#sandbox-hud').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
  });
  const viewport = page.viewportSize()!;
  expect(hudBounds.top).toBeGreaterThanOrEqual(0);
  expect(hudBounds.left).toBeGreaterThanOrEqual(0);
  expect(hudBounds.right).toBeLessThanOrEqual(viewport.width);
  expect(hudBounds.bottom).toBeLessThanOrEqual(viewport.height);
  if (testInfo.project.name === 'mobile-chromium') {
    expect(await page.locator('#sandbox-inject').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  }
  await page.screenshot({ path: testInfo.outputPath(`sandbox-${testInfo.project.name}.png`) });

  const cleared = await page.evaluate(() => window.airportControl.request({ action: 'clearSandboxTraffic' }));
  expect(cleared.accepted).toBeTruthy();
  expect(cleared.resultingState.sandbox.activeAircraftCount).toBe(0);
  expect(cleared.resultingState.weather).toMatchObject({ condition: 'rain', windSpeed: 18 });
  const stopped = await page.evaluate(() => window.airportControl.request({ action: 'stopSandbox' }));
  expect(stopped.accepted).toBeTruthy();
  expect(stopped.resultingState.sandbox.active).toBeFalsy();
  expect(stopped.resultingState.gameOver).toBeFalsy();
  await expect(page.locator('#sandbox-hud')).toBeHidden();
  await expect(page.locator('.scoreboard')).toBeVisible();
});

test('Unified input keeps held keys smooth and supports a standard gamepad without bypassing UI context', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium covers keyboard and the optional standard-gamepad adapter.');
  test.setTimeout(120_000);
  await page.addInitScript(() => {
    const buttons = Array.from({ length: 18 }, () => ({ pressed: false, touched: false, value: 0 }));
    const gamepad = {
      axes: [0, 0, 0, 0],
      buttons,
      connected: true,
      id: 'Airport Test Pad',
      index: 0,
      mapping: 'standard',
      timestamp: 0,
    };
    Object.defineProperty(navigator, 'getGamepads', { configurable: true, value: () => [gamepad] });
    Object.defineProperty(window, '__airportTestGamepad', {
      configurable: true,
      value: {
        axis(index: number, value: number) {
          gamepad.axes[index] = value;
          gamepad.timestamp = performance.now();
        },
        button(index: number, pressed: boolean) {
          buttons[index].pressed = pressed;
          buttons[index].touched = pressed;
          buttons[index].value = pressed ? 1 : 0;
          gamepad.timestamp = performance.now();
        },
      },
    });
  });
  await page.goto('/?airport=ATL&mode=auto&autostart=1&detail=low&renderFps=4');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().input.devices.gamepad.connected);

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.input).toMatchObject({
    schemaVersion: 1,
    catalogVersion: 1,
    context: 'gameplay',
    lastDevice: null,
    devices: { gamepad: { supported: true, enabled: true, connected: true, id: 'Airport Test Pad', mapping: 'standard' } },
  });
  expect(initial.input.actions).toHaveLength(24);

  await page.locator('#scene').focus();
  const keyStart = initial.renderer.camera;
  await page.keyboard.down('d');
  await page.waitForTimeout(260);
  const keyMid = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.waitForTimeout(220);
  const keyEnd = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.keyboard.up('d');
  expect(Math.hypot(keyMid.focusX - keyStart.focusX, keyMid.focusY - keyStart.focusY)).toBeGreaterThan(1);
  expect(Math.hypot(keyEnd.focusX - keyMid.focusX, keyEnd.focusY - keyMid.focusY)).toBeGreaterThan(1);
  await page.waitForTimeout(80);
  const keyReleased = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.waitForTimeout(180);
  const keyStopped = await page.evaluate(() => window.airportControl.snapshot());
  expect(Math.hypot(keyStopped.renderer.camera.focusX - keyReleased.focusX, keyStopped.renderer.camera.focusY - keyReleased.focusY)).toBeLessThan(1);
  expect(keyStopped.input.heldActions).toHaveLength(0);
  expect(keyStopped.input.lastDevice).toBe('keyboard');

  await page.keyboard.press('c');
  await expect(page.locator('#control-panel')).toHaveClass(/control-panel--open/);
  expect((await page.evaluate(() => window.airportControl.snapshot().input.context))).toBe('ui');
  const drawerCamera = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.keyboard.press('d');
  await page.waitForTimeout(200);
  const blockedCamera = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  expect(blockedCamera.focusX).toBe(drawerCamera.focusX);
  expect(blockedCamera.focusY).toBe(drawerCamera.focusY);
  await page.locator('.advanced-tools').evaluate((details: HTMLDetailsElement) => { details.open = true; });
  await page.locator('#gamepad-enabled').scrollIntoViewIfNeeded();
  await expect(page.locator('#input-device')).toContainText('Airport Test Pad');
  await expect(page.locator('#input-bindings > div')).toHaveCount(6);
  await page.screenshot({ path: testInfo.outputPath('unified-input-settings.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#control-panel')).not.toHaveClass(/control-panel--open/);

  const invalidSensitivity = await page.evaluate(() => window.airportControl.request({ action: 'setGamepadSensitivity', sensitivity: 3 }));
  expect(invalidSensitivity.accepted).toBeFalsy();
  expect(invalidSensitivity.reason).toContain('0.5 to 2');
  const sensitivity = await page.evaluate(() => window.airportControl.request({ action: 'setGamepadSensitivity', sensitivity: 1.4 }));
  expect(sensitivity.accepted).toBeTruthy();
  expect(sensitivity.resultingState.input.devices.gamepad.sensitivity).toBe(1.4);

  const gamepadStart = await page.evaluate(() => window.airportControl.snapshot().renderer.camera);
  await page.evaluate(() => {
    const pad = (window as unknown as { __airportTestGamepad: { axis(index: number, value: number): void } }).__airportTestGamepad;
    pad.axis(0, 0.85);
  });
  await page.waitForFunction(({ x, y }) => {
    const camera = window.airportControl.snapshot().renderer.camera;
    return Math.hypot(camera.focusX - x, camera.focusY - y) > 1;
  }, { x: gamepadStart.focusX, y: gamepadStart.focusY });
  await page.evaluate(() => {
    (window as unknown as { __airportTestGamepad: { axis(index: number, value: number): void } }).__airportTestGamepad.axis(0, 0);
  });
  expect((await page.evaluate(() => window.airportControl.snapshot().input.lastDevice))).toBe('gamepad');

  await page.evaluate(() => {
    (window as unknown as { __airportTestGamepad: { button(index: number, pressed: boolean): void } }).__airportTestGamepad.button(5, true);
  });
  await page.waitForFunction(() => window.airportControl.snapshot().selection.focusedFlightId !== null);
  expect((await page.evaluate(() => window.airportControl.snapshot().input.lastAction))).toBe('selection.next');
  await page.evaluate(() => {
    const pad = (window as unknown as { __airportTestGamepad: { button(index: number, pressed: boolean): void } }).__airportTestGamepad;
    pad.button(5, false);
    pad.button(1, true);
  });
  await page.waitForFunction(() => window.airportControl.snapshot().selection.focusedFlightId === null);
  await page.evaluate(() => {
    (window as unknown as { __airportTestGamepad: { button(index: number, pressed: boolean): void } }).__airportTestGamepad.button(1, false);
  });

  const disabled = await page.evaluate(() => window.airportControl.request({ action: 'setGamepadEnabled', enabled: false }));
  expect(disabled.accepted).toBeTruthy();
  const disabledCamera = disabled.resultingState.renderer.camera;
  await page.evaluate(() => {
    (window as unknown as { __airportTestGamepad: { axis(index: number, value: number): void } }).__airportTestGamepad.axis(0, -1);
  });
  await page.waitForTimeout(250);
  const stillDisabled = await page.evaluate(() => window.airportControl.snapshot());
  expect(stillDisabled.renderer.camera.focusX).toBe(disabledCamera.focusX);
  expect(stillDisabled.renderer.camera.focusY).toBe(disabledCamera.focusY);
  expect(stillDisabled.input.devices.gamepad.enabled).toBeFalsy();
  await page.reload();
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  const persisted = await page.evaluate(() => window.airportControl.snapshot().input.devices.gamepad);
  expect(persisted.enabled).toBeFalsy();
  expect(persisted.sensitivity).toBe(1.4);
});

test('Controller policies expose capacity, preserve safety authority, and survive airport changes', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium covers the controller-policy controls and protocol.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ORD&mode=watch&station=supervisor&autostart=1&detail=low&renderFps=1');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().controllers.scripted.decisions.length > 0);

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.controllers.policy).toMatchObject({
    selected: 'balanced',
    active: { id: 'balanced', label: 'Balanced' },
  });
  expect(initial.controllers.policy.catalog.map((preset) => preset.id)).toEqual([
    'balanced', 'conservative', 'efficient', 'calm', 'teaching', 'realistic',
  ]);
  expect(initial.controllers.scripted).toMatchObject({ schemaVersion: 2, programVersion: '2.0.0', presetId: 'balanced' });
  expect(Object.values(initial.controllers.scripted.stations).every((station) => (
    station.workload.trackLimit === station.policy.trackLimit
    && station.workload.activeTracks <= initial.flights.length
  ))).toBeTruthy();

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#controller-policy-select')).toBeVisible();
  await page.selectOption('#controller-policy-select', 'calm');
  await page.waitForFunction(() => window.airportControl.snapshot().controllers.policy.selected === 'calm');
  await expect(page.locator('#controller-policy-detail')).toContainText('ASMR');
  await expect(page.locator('[data-station-workload="approach"] span')).toContainText('/');

  await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'tower' }));
  await expect(page.locator('#controller-policy-select')).toBeDisabled();
  const authorityRejected = await page.evaluate(() => window.airportControl.dispatch({
    protocolVersion: '1.2.0',
    requestId: 'policy-tower-rejection',
    source: 'test',
    authority: { station: 'tower', actorId: 'tower-policy-test' },
    command: { action: 'setControllerPolicyPreset', preset: 'efficient' },
  }));
  expect(authorityRejected).toMatchObject({ accepted: false, action: 'setControllerPolicyPreset' });
  expect(authorityRejected.reason).toContain('cannot configure');

  const policyChanged = await page.evaluate(() => {
    window.airportControl.request({ action: 'setStation', station: 'supervisor' });
    return window.airportControl.dispatch({
      protocolVersion: '1.2.0',
      requestId: 'policy-supervisor-change',
      source: 'test',
      authority: { station: 'supervisor', actorId: 'supervisor-policy-test' },
      expects: { apiVersion: '2.31.0', snapshotSchemaVersion: 33 },
      command: { action: 'setControllerPolicyPreset', preset: 'efficient' },
    });
  });
  expect(policyChanged).toMatchObject({ accepted: true, action: 'setControllerPolicyPreset' });
  expect(policyChanged.resultingState.controllers.policy.selected).toBe('efficient');
  expect(policyChanged.resultingState.controllers.scripted.stations.ground.policy.maxActionsPerEvaluation).toBe(3);

  const changedAirport = await page.evaluate(() => window.airportControl.request({ action: 'selectAirport', code: 'JFK' }));
  expect(changedAirport.accepted).toBeTruthy();
  expect(changedAirport.resultingState).toMatchObject({
    airport: { code: 'JFK' },
    controllers: { policy: { selected: 'efficient' }, scripted: { presetId: 'efficient' } },
  });
  expect(changedAirport.resultingState.controllers.scripted.transitions.length).toBeLessThanOrEqual(32);
});

test('Observer focus follows live traffic, airport assets, queues, and conflicts without stealing camera control', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Desktop Chromium covers the complete focus catalog and moving follow behavior.');
  test.setTimeout(180_000);
  await page.goto('/?airport=ORD&mode=watch&density=busy&autostart=1&detail=low&renderFps=4');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().controllers.scripted.decisions.length > 0);
  await page.waitForFunction(() => window.airportControl.snapshot().focus.catalog.categories.every((category) => category.kind === 'conflict' || category.count > 0));

  const initial = await page.evaluate(() => window.airportControl.snapshot());
  expect(initial.schemaVersion).toBe(33);
  expect(Object.values(initial.controllers.scripted.stations).every((station) => station.mode === 'scripted' && station.evaluations > 0)).toBeTruthy();
  expect(initial.controllers.scripted.decisions.some((decision) => decision.accepted && decision.producedEventTypes.length > 0)).toBeTruthy();
  const scriptedEvent = await page.evaluate(() => window.airportControl.events(100).find((event) => event.type === 'controller-decision'));
  expect(scriptedEvent).toMatchObject({
    protocolVersion: '1.2.0',
    apiVersion: '2.31.0',
    causedByControllerDecisionId: expect.stringMatching(/^controller-/),
    payload: { station: expect.any(String), ruleId: expect.any(String), accepted: expect.any(Boolean) },
  });
  expect(initial.focus).toMatchObject({ schemaVersion: 1, current: null, catalog: { schemaVersion: 1 } });
  expect(initial.focus.catalog.categories.map((category) => category.kind)).toEqual([
    'flight', 'runway', 'taxiway', 'gate', 'queue', 'conflict',
  ]);
  expect(initial.focus.catalog.targets.filter((target) => target.kind === 'runway')).toHaveLength(8);
  expect(initial.focus.catalog.targets.filter((target) => target.kind === 'taxiway').length).toBeGreaterThanOrEqual(100);
  expect(initial.focus.catalog.targets.filter((target) => target.kind === 'gate')).toHaveLength(40);
  expect(initial.input.actions).toContainEqual(expect.objectContaining({ id: 'ui.focus', keyboardCodes: ['KeyF'] }));

  await page.locator('#scene').focus();
  await page.keyboard.press('f');
  await expect(page.locator('#focus-panel')).toBeVisible();
  expect((await page.evaluate(() => window.airportControl.snapshot().input.context))).toBe('ui');
  const panelBounds = await page.locator('#focus-panel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom, width: innerWidth, height: innerHeight };
  });
  expect(panelBounds.top).toBeGreaterThanOrEqual(0);
  expect(panelBounds.left).toBeGreaterThanOrEqual(0);
  expect(panelBounds.right).toBeLessThanOrEqual(panelBounds.width);
  expect(panelBounds.bottom).toBeLessThanOrEqual(panelBounds.height);

  await page.locator('#focus-target').focus();
  await page.waitForTimeout(1_100);
  expect(await page.evaluate(() => document.activeElement?.id)).toBe('focus-target');

  await page.selectOption('#focus-kind', 'runway');
  const runwayKey = await page.locator('#focus-target').inputValue();
  await page.locator('#focus-apply').click();
  await page.waitForFunction((key) => window.airportControl.snapshot().focus.current?.key === key, runwayKey);
  await page.waitForFunction((key) => window.airportControl.snapshot().renderer.camera.target?.key === key, runwayKey);
  const runwayFocused = await page.evaluate(() => window.airportControl.snapshot());
  expect(runwayFocused.focus.current).toMatchObject({ kind: 'runway', follow: 'static', flightIds: [] });
  expect(runwayFocused.renderer.camera.target).toMatchObject({ kind: 'runway', tracking: true });
  await expect(page.locator('#focus-status')).toBeVisible();

  const directTargets = await page.evaluate(() => {
    const snapshot = window.airportControl.snapshot();
    const catalog = snapshot.focus.catalog.targets;
    const movingFlight = snapshot.flights.find((flight) => (
      flight.phase === 'approach'
      || flight.phase === 'landing'
      || flight.phase === 'takeoff'
      || flight.kinematics.groundSpeedKts > 1
    ));
    return {
      taxiway: catalog.find((target) => target.kind === 'taxiway' && target.id === 'A'),
      gate: catalog.find((target) => target.kind === 'gate'),
      queue: catalog.find((target) => target.kind === 'queue'),
      conflict: catalog.find((target) => target.kind === 'conflict'),
      flight: catalog.find((target) => target.kind === 'flight' && target.id === String(movingFlight?.id)),
    };
  });
  expect(directTargets.taxiway).toBeTruthy();
  expect(directTargets.gate).toBeTruthy();
  expect(directTargets.queue).toBeTruthy();
  expect(directTargets.flight).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'pause' }))).accepted).toBeTruthy();
  for (const target of [directTargets.taxiway, directTargets.gate, directTargets.queue].filter(Boolean)) {
    const response = await page.evaluate((ref) => window.airportControl.request({
      action: 'focusTarget',
      target: { kind: ref!.kind, id: ref!.id },
    }), target);
    expect(response.accepted).toBeTruthy();
    expect(response.resultingState.focus.current?.key).toBe(target!.key);
    expect(response.resultingState.renderer.camera.target?.key).toBe(target!.key);
  }
  if (directTargets.conflict) {
    const conflict = await page.evaluate((target) => window.airportControl.request({
      action: 'focusTarget',
      target: { kind: target!.kind, id: target!.id },
    }), directTargets.conflict);
    expect(conflict.accepted).toBeTruthy();
    expect(conflict.resultingState.focus.current?.flightIds.length).toBeGreaterThanOrEqual(2);
  }
  const missing = await page.evaluate(() => window.airportControl.request({
    action: 'focusTarget',
    target: { kind: 'conflict', id: 'missing-conflict' },
  }));
  expect(missing.accepted).toBeFalsy();
  expect(missing.reason).toContain('not currently available');

  await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: true }));
  await expect(page.locator('#queue-panel')).toBeVisible();
  const queueRows = page.locator('[data-queue-focus]');
  await expect(queueRows.first()).toBeVisible();
  await queueRows.first().click();
  await page.waitForFunction(() => window.airportControl.snapshot().focus.current?.kind === 'queue');
  expect((await page.evaluate(() => window.airportControl.snapshot().renderer.camera.target?.kind))).toBe('queue');
  await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: false }));

  expect((await page.evaluate(() => window.airportControl.request({ action: 'resume' }))).accepted).toBeTruthy();
  const flightResponse = await page.evaluate((target) => window.airportControl.request({
    action: 'focusTarget',
    target: { kind: target!.kind, id: target!.id },
  }), directTargets.flight);
  expect(flightResponse.accepted).toBeTruthy();
  const firstFlightFocus = flightResponse.resultingState.renderer.camera.target;
  await page.waitForTimeout(1_000);
  const movingFlightFocus = await page.evaluate(() => window.airportControl.snapshot());
  expect(movingFlightFocus.focus.current?.kind).toBe('flight');
  expect(movingFlightFocus.selection.focusedFlightId).toBe(Number(directTargets.flight!.id));
  expect(movingFlightFocus.renderer.camera.target?.key).toBe(directTargets.flight!.key);
  expect(Math.hypot(
    movingFlightFocus.renderer.camera.target.resolvedX - firstFlightFocus.resolvedX,
    movingFlightFocus.renderer.camera.target.resolvedY - firstFlightFocus.resolvedY,
  )).toBeGreaterThan(0.001);
  await page.locator('#scene').focus();
  await page.keyboard.press('f');
  await expect(page.locator('#focus-panel')).toBeVisible();
  await page.screenshot({ path: testInfo.outputPath('observer-focus-desktop.png') });

  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-panel')).toBeHidden();
  expect((await page.evaluate(() => window.airportControl.snapshot().focus.current?.kind))).toBe('flight');
  await page.locator('#scene').focus();
  await page.keyboard.down('w');
  await page.waitForTimeout(220);
  await page.keyboard.up('w');
  await page.waitForFunction(() => window.airportControl.snapshot().focus.current === null);
  const released = await page.evaluate(() => window.airportControl.snapshot());
  expect(released.renderer.camera.target).toBeNull();
  await expect(page.locator('#focus-status')).toBeHidden();
});

test('Mobile Watch mode keeps non-ORD and procedural maps navigable in low detail', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'mobile-chromium', 'This test is the dedicated responsive/mobile browser gate.');
  test.setTimeout(120_000);
  await page.goto('/?airport=ATL&mode=watch&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
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
  const beforePinch = await page.evaluate(() => window.airportControl.snapshot().renderer.camera.zoom);
  await page.locator('#scene').evaluate((canvas) => {
    const rect = canvas.getBoundingClientRect();
    const y = rect.top + rect.height * 0.74;
    const first = { bubbles: true, pointerType: 'touch', button: 0, buttons: 1 };
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...first, pointerId: 101, isPrimary: true, clientX: rect.left + rect.width * 0.38, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointerdown', { ...first, pointerId: 102, isPrimary: false, clientX: rect.left + rect.width * 0.62, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...first, pointerId: 101, isPrimary: true, clientX: rect.left + rect.width * 0.3, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointermove', { ...first, pointerId: 102, isPrimary: false, clientX: rect.left + rect.width * 0.7, clientY: y }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...first, pointerId: 101, isPrimary: true, clientX: rect.left + rect.width * 0.3, clientY: y, buttons: 0 }));
    canvas.dispatchEvent(new PointerEvent('pointerup', { ...first, pointerId: 102, isPrimary: false, clientX: rect.left + rect.width * 0.7, clientY: y, buttons: 0 }));
  });
  await page.waitForFunction((zoom) => Math.abs(window.airportControl.snapshot().renderer.camera.zoom - zoom) > 0.02, beforePinch);
  expect((await page.evaluate(() => window.airportControl.snapshot().input.lastGesture))).toBe('pinch');
  await page.locator('#menu-toggle').click();
  await page.locator('.advanced-tools').evaluate((details: HTMLDetailsElement) => { details.open = true; });
  await page.locator('.input-settings').scrollIntoViewIfNeeded();
  await expect(page.locator('.input-settings')).toBeVisible();
  expect(await page.locator('.input-settings__toggle').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('mobile-input-settings.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#control-panel')).not.toHaveClass(/control-panel--open/);
  const safetyFont = await page.locator('.scoreboard span').nth(2).evaluate((element) => parseFloat(getComputedStyle(element).fontSize));
  expect(safetyFont).toBeGreaterThanOrEqual(7);
  await expect(page.locator('#focus-toggle')).toBeVisible();
  await page.locator('#focus-toggle').click();
  await expect(page.locator('#focus-panel')).toBeVisible();
  const focusBounds = await page.locator('#focus-panel').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(focusBounds.top).toBeGreaterThanOrEqual(0);
  expect(focusBounds.left).toBeGreaterThanOrEqual(0);
  expect(focusBounds.right).toBeLessThanOrEqual(focusBounds.viewportWidth);
  expect(focusBounds.bottom).toBeLessThanOrEqual(focusBounds.viewportHeight);
  const compactFocusControls = await page.locator('#focus-panel button, #focus-panel select').evaluateAll((elements) => (
    elements.map((element) => element.getBoundingClientRect().height)
  ));
  expect(Math.min(...compactFocusControls)).toBeGreaterThanOrEqual(44);
  await page.selectOption('#focus-kind', 'gate');
  await page.locator('#focus-apply').click();
  await page.waitForFunction(() => window.airportControl.snapshot().focus.current?.kind === 'gate');
  await page.screenshot({ path: testInfo.outputPath('mobile-observer-focus.png') });
  await page.keyboard.press('Escape');
  await expect(page.locator('#focus-panel')).toBeHidden();
  await expect(page.locator('#focus-status')).toBeVisible();
  await page.locator('#focus-status-release').click();
  await expect(page.locator('#focus-status')).toBeHidden();
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
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setMode', value: 'manual' }))).accepted).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'approach' }))).accepted).toBeTruthy();
  await expect(page.locator('#station-briefing')).toContainText('Approach objectives');
  const mobileBriefing = await page.locator('#station-briefing').evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left, viewportWidth: innerWidth, viewportHeight: innerHeight };
  });
  expect(mobileBriefing.top).toBeGreaterThanOrEqual(0);
  expect(mobileBriefing.left).toBeGreaterThanOrEqual(0);
  expect(mobileBriefing.right).toBeLessThanOrEqual(mobileBriefing.viewportWidth);
  expect(mobileBriefing.bottom).toBeLessThanOrEqual(mobileBriefing.viewportHeight);
  expect(await page.locator('.station-briefing__role summary').evaluate((element) => element.getBoundingClientRect().height)).toBeGreaterThanOrEqual(44);
  await page.screenshot({ path: testInfo.outputPath('mobile-controller-briefing.png') });
});

test('Laptop viewports keep the complete controls menu reachable', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'Laptop viewport coverage runs once in desktop Chromium.');
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 1024, height: 600 });
  await page.goto('/?airport=ORD&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  const introPanel = page.locator('#intro .intro__panel');
  const introBounds = await introPanel.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
  });
  expect(introBounds.top).toBeGreaterThanOrEqual(0);
  expect(introBounds.bottom).toBeLessThanOrEqual(600);
  expect(introBounds.left).toBeGreaterThanOrEqual(0);
  expect(introBounds.right).toBeLessThanOrEqual(1024);
  await introPanel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect(page.locator('#enter')).toBeVisible();

  await page.goto('/?airport=ORD&mode=auto&autostart=1&detail=low&renderFps=0.25');
  await page.waitForFunction(() => window.airportControl?.version === '2.31.0');
  await page.waitForFunction(() => window.airportControl.snapshot().renderer.drawCalls > 100);
  const renderBudget = await page.evaluate(() => window.airportControl.snapshot().renderer);
  expect(renderBudget.detail).toBe('low');
  expect(renderBudget.drawCalls).toBeLessThan(320);
  expect(renderBudget.geometries).toBeLessThan(280);

  for (const viewport of [
    { width: 1366, height: 768 },
    { width: 1280, height: 720 },
    { width: 1024, height: 600 },
    { width: 912, height: 512 },
    { width: 800, height: 500 },
    { width: 700, height: 500 },
  ]) {
    await page.setViewportSize(viewport);
    const menu = page.locator('#menu-toggle');
    const panel = page.locator('#control-panel');
    await expect(menu).toBeVisible();
    if (!await panel.evaluate((element) => element.classList.contains('control-panel--open'))) await menu.click();
    await expect(panel).toHaveClass(/control-panel--open/);
    await page.waitForTimeout(220);

    const bounds = await panel.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        left: rect.left,
        clientHeight: element.clientHeight,
        scrollHeight: element.scrollHeight,
      };
    });
    expect(bounds.top).toBeGreaterThanOrEqual(90);
    expect(bounds.left).toBeGreaterThanOrEqual(0);
    expect(bounds.right).toBeLessThanOrEqual(viewport.width);
    expect(bounds.bottom).toBeLessThanOrEqual(viewport.height);
    expect(bounds.clientHeight).toBeGreaterThan(300);

    if (viewport.width >= 640) {
      const controlsBounds = await page.locator('#control-panel > .controls').evaluate((element) => {
        const rect = element.getBoundingClientRect();
        return { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right };
      });
      expect(controlsBounds.top).toBeGreaterThanOrEqual(bounds.top);
      expect(controlsBounds.bottom).toBeLessThanOrEqual(bounds.bottom);
      expect(controlsBounds.left).toBeGreaterThanOrEqual(bounds.left);
      expect(controlsBounds.right).toBeLessThanOrEqual(bounds.right);
    }

    await panel.evaluate((element) => { element.scrollTop = element.scrollHeight; });
    const advancedBounds = await page.locator('.advanced-tools summary').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, bottom: rect.bottom };
    });
    expect(advancedBounds.top).toBeGreaterThanOrEqual(bounds.top);
    expect(advancedBounds.bottom).toBeLessThanOrEqual(bounds.bottom + 4);
    if (viewport.width === 700) {
      await panel.evaluate((element) => { element.scrollTop = 0; });
      await page.waitForTimeout(100);
      await page.screenshot({ path: testInfo.outputPath('laptop-zoomed-700x500.png') });
    }
    await menu.click();
    await expect(panel).not.toHaveClass(/control-panel--open/);
  }

  await page.setViewportSize({ width: 700, height: 500 });
  await page.evaluate(() => window.airportControl.request({ action: 'setRadarVisible', enabled: true }));
  await expect(page.locator('#radar-panel')).toBeVisible();
  await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: true }));
  await expect(page.locator('#queue-panel')).toBeVisible();
  await expect(page.locator('#radar-panel')).toBeHidden();
  await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: false }));

  await page.setViewportSize({ width: 1024, height: 600 });
  await page.evaluate(() => window.airportControl.request({ action: 'setRadarVisible', enabled: true }));
  await page.evaluate(() => window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: true }));
  const compactOverlayBounds = await page.locator('#radar-panel, #queue-panel').evaluateAll((elements) => elements.map((element) => {
    const rect = element.getBoundingClientRect();
    return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
  }));
  expect(compactOverlayBounds).toHaveLength(2);
  const [radarBounds, queueBounds] = compactOverlayBounds;
  const overlaysIntersect = radarBounds.left < queueBounds.right
    && radarBounds.right > queueBounds.left
    && radarBounds.top < queueBounds.bottom
    && radarBounds.bottom > queueBounds.top;
  expect(overlaysIntersect).toBe(false);
  await page.evaluate(() => {
    window.airportControl.request({ action: 'setRadarVisible', enabled: false });
    window.airportControl.request({ action: 'setQueueInspectorVisible', enabled: false });
  });

  await page.locator('#menu-toggle').click();
  await expect(page.locator('#control-panel')).toHaveClass(/control-panel--open/);
  await page.locator('#control-panel').evaluate((element) => { element.scrollTop = 0; });
  await page.waitForTimeout(200);
  await page.screenshot({ path: testInfo.outputPath('laptop-controls-1024x600.png') });
  await page.locator('#menu-toggle').click();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setMode', value: 'manual' }))).accepted).toBeTruthy();
  expect((await page.evaluate(() => window.airportControl.request({ action: 'setStation', station: 'ground' }))).accepted).toBeTruthy();
  await expect(page.locator('#station-briefing')).toContainText('Ground objectives');
  for (const viewport of [{ width: 1024, height: 600 }, { width: 700, height: 500 }]) {
    await page.setViewportSize(viewport);
    const briefingBounds = await page.locator('#station-briefing').evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return { top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left };
    });
    expect(briefingBounds.top).toBeGreaterThanOrEqual(0);
    expect(briefingBounds.left).toBeGreaterThanOrEqual(0);
    expect(briefingBounds.right).toBeLessThanOrEqual(viewport.width);
    expect(briefingBounds.bottom).toBeLessThanOrEqual(viewport.height);
  }
  await page.waitForTimeout(4_100);
  await page.screenshot({ path: testInfo.outputPath('laptop-ground-briefing-700x500.png') });
});

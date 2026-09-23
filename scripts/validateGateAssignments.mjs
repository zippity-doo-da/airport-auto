import { build } from 'esbuild';

const validationSource = `
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import {
  GATE_TURN_BUFFER_SECONDS,
  gateReservationsOverlap,
  planGateAssignment,
  standReservationsConflict,
} from './src/simulation/gateAssignment.ts';
import { surfaceStandSupportsAircraft } from './src/simulation/surfaceGraph.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const ord = generateHubConfig(4);
const arrivalRunways = ord.runways.filter((runway) => runway.role === 'arrival' || runway.role === 'mixed');
const departureRunways = ord.runways.filter((runway) => runway.role === 'departure' || runway.role === 'mixed');
assert(arrivalRunways.length && departureRunways.length, 'ORD gate test has no operating runway pair');

function assignmentFor({
  flightId,
  airline,
  aircraft,
  service,
  readyForTaxiAtSeconds = 100,
  departureRunway = departureRunways[0],
  reservations = [],
  excludedStandIds,
}) {
  return planGateAssignment({
    config: ord,
    flightId,
    aircraft,
    airline,
    service,
    trafficClass: service === 'cargo' ? 'cargo' : aircraft === 'E175' || aircraft === 'Q400' ? 'regional' : 'passenger',
    arrivalRunway: arrivalRunways[0].id,
    arrivalOperatingEnd: arrivalRunways[0].landingEnd,
    departureRunway: departureRunway.id,
    departureOperatingEnd: departureRunway.landingEnd,
    readyForTaxiAtSeconds,
    turnaroundSeconds: 72,
    nextDestination: 'KDFW',
    assignedAtSeconds: 0,
    reservations,
    excludedStandIds,
  });
}

const ua = assignmentFor({ flightId: 101, airline: 'UA', aircraft: 'A320', service: 'passenger' });
const aa = assignmentFor({ flightId: 102, airline: 'AA', aircraft: 'B738', service: 'passenger' });
const dl = assignmentFor({ flightId: 103, airline: 'DL', aircraft: 'A320', service: 'passenger' });
const ups = assignmentFor({ flightId: 104, airline: '5X', aircraft: 'B77F', service: 'cargo' });
const fedex = assignmentFor({ flightId: 105, airline: 'FX', aircraft: 'B77F', service: 'cargo' });
const feederCargo = assignmentFor({ flightId: 106, airline: '5X', aircraft: 'B738', service: 'cargo' });
assert(ua && ['B', 'C', 'E', 'F', 'G'].includes(ua.concourse) && ua.airlineFit === 'preferred', 'United was not assigned to its ORD home concourses');
assert(aa && ['G', 'H', 'K', 'L'].includes(aa.concourse) && aa.airlineFit === 'preferred', 'American was not assigned to its ORD home concourses');
assert(dl?.concourse === 'M' && dl.airlineFit === 'preferred', 'Delta was not assigned to Concourse M');
assert(ups?.serviceArea === 'cargo-ramp' && ups.serviceFit === 'preferred', 'UPS widebody did not receive a cargo-ramp stand');
assert(fedex?.serviceArea === 'cargo-ramp' && fedex.serviceFit === 'preferred', 'FedEx widebody did not receive a cargo-ramp stand');
assert(feederCargo?.serviceArea === 'cargo-ramp', 'narrowbody cargo service leaked into a passenger gate');
const zoneById = new Map(ord.surfaceGraph.zones.map((zone) => [zone.id, zone]));
assert(zoneById.get(ups.zoneId)?.name === 'Southeast Cargo Ramp', 'UPS did not receive its ORD cargo-ramp affinity');
assert(zoneById.get(fedex.zoneId)?.name === 'Southwest Cargo Ramp', 'FedEx did not receive its ORD cargo-ramp affinity');

const reservedWindow = {
  flightId: 201,
  standId: ua.standId,
  aircraft: 'A320',
  terminalId: ua.terminalId,
  startSeconds: ua.scheduledGateInSeconds,
  endSeconds: ua.scheduledDepartureSeconds,
};
const onlyUaStand = new Set(ord.surfaceGraph.stands.filter((stand) => stand.id !== ua.standId).map((stand) => stand.id));
const overlapping = assignmentFor({
  flightId: 101,
  airline: 'UA',
  aircraft: 'A320',
  service: 'passenger',
  readyForTaxiAtSeconds: 100,
  reservations: [reservedWindow],
  excludedStandIds: onlyUaStand,
});
assert(overlapping === null, 'overlapping gate window reused the occupied stand');
const later = assignmentFor({
  flightId: 101,
  airline: 'UA',
  aircraft: 'A320',
  service: 'passenger',
  readyForTaxiAtSeconds: reservedWindow.endSeconds + GATE_TURN_BUFFER_SECONDS + 120,
  reservations: [reservedWindow],
  excludedStandIds: onlyUaStand,
});
assert(later?.standId === ua.standId, 'non-overlapping future arrival could not safely reuse a stand');
assert(!gateReservationsOverlap(reservedWindow, {
  startSeconds: later.scheduledGateInSeconds,
  endSeconds: later.scheduledDepartureSeconds,
}), 'future stand reuse retained an overlapping window');

const jumboStand = ord.surfaceGraph.stands.find((stand) => stand.id === 'ORD-04');
const adjacentJumboStand = ord.surfaceGraph.stands.find((stand) => stand.id === 'ORD-06');
assert(jumboStand && adjacentJumboStand, 'ORD adjacent-widebody test stands are missing');
assert(standReservationsConflict(ord, jumboStand.id, 'B748', adjacentJumboStand.id, 'B748'), 'adjacent jumbo stands were not recognized as mutually exclusive');
const onlyJumboStand = new Set(ord.surfaceGraph.stands.filter((stand) => stand.id !== jumboStand.id).map((stand) => stand.id));
const jumboBaseline = assignmentFor({
  flightId: 220,
  airline: 'UA',
  aircraft: 'B748',
  service: 'passenger',
  readyForTaxiAtSeconds: 800,
  excludedStandIds: onlyJumboStand,
});
assert(jumboBaseline?.standId === jumboStand.id, 'widebody baseline could not use its compatible ORD stand');
const adjacentBlocked = assignmentFor({
  flightId: 221,
  airline: 'UA',
  aircraft: 'B748',
  service: 'passenger',
  readyForTaxiAtSeconds: 800,
  reservations: [{
    flightId: 219,
    standId: adjacentJumboStand.id,
    aircraft: 'B748',
    startSeconds: jumboBaseline.scheduledGateInSeconds,
    endSeconds: jumboBaseline.scheduledDepartureSeconds,
  }],
  excludedStandIds: onlyJumboStand,
});
assert(adjacentBlocked === null, 'gate planner scheduled simultaneous jumbo aircraft at mutually exclusive adjacent stands');

const forcedStandIds = new Set(ord.surfaceGraph.stands.filter((stand) => stand.id !== ua.standId).map((stand) => stand.id));
const routeScores = departureRunways.map((runway, index) => assignmentFor({
  flightId: 300,
  airline: 'UA',
  aircraft: 'A320',
  service: 'passenger',
  departureRunway: runway,
  readyForTaxiAtSeconds: 500 + index * 200,
  excludedStandIds: forcedStandIds,
})).filter(Boolean);
assert(routeScores.length === departureRunways.length, 'forced ORD stand lacks a route to an operating departure runway');
assert(new Set(routeScores.map((assignment) => assignment.departureRouteDistance)).size > 1, 'next departure runway did not affect gate route cost');
assert(routeScores.every((assignment, index) => assignment.departureRunway === departureRunways[index].id), 'gate assignment lost its planned departure runway');

const supervisorGateSimulation = new AirportSimulation(ord);
const supervisorArrival = supervisorGateSimulation.state.flights.find(
  (flight) => flight.phase === 'approach' && flight.gateAssignment,
);
assert(supervisorArrival, 'supervisor gate-reassignment test has no assigned arrival');
const originalSupervisorStand = supervisorArrival.gateAssignment.standId;
const gateSwapBaseline = supervisorGateSimulation.state.trafficFlow.totals.gateSwaps;
supervisorGateSimulation.setStation('ground');
assert(!supervisorGateSimulation.requestArrivalGateReassignment(supervisorArrival.id), 'non-supervisor station reassigned an arrival gate');
assert(supervisorGateSimulation.lastCommandReason().includes('no gate reassignment authority'), 'gate reassignment rejection did not explain the authority boundary');
supervisorGateSimulation.setStation('supervisor');
assert(supervisorGateSimulation.requestArrivalGateReassignment(supervisorArrival.id), 'supervisor could not safely reassign the arriving aircraft gate: ' + supervisorGateSimulation.lastCommandReason());
assert(supervisorArrival.gateAssignment?.standId !== originalSupervisorStand, 'supervisor gate reassignment retained the original stand');
assert(supervisorArrival.flightPlan.amendments.at(-1)?.kind === 'gate-swap', 'supervisor gate reassignment did not record a gate-swap amendment');
assert(supervisorGateSimulation.state.trafficFlow.totals.gateSwaps === gateSwapBaseline + 1, 'supervisor gate reassignment did not update gate-swap flow telemetry');
assert(supervisorGateSimulation.drainEvents().some((event) => event.type === 'gate-reassignment'), 'supervisor gate reassignment emitted no domain event');

const equipmentFailureSimulation = new AirportSimulation(ord);
const equipmentFailureArrival = equipmentFailureSimulation.state.flights.find(
  (flight) => flight.phase === 'approach' && flight.gateAssignment,
);
assert(equipmentFailureArrival, 'gate-equipment-failure test has no assigned arrival');
const failedStand = equipmentFailureArrival.gateAssignment.standId;
equipmentFailureSimulation.setStation('tower');
assert(!equipmentFailureSimulation.reportGateEquipmentFailure(equipmentFailureArrival.id), 'non-supervisor station reported a gate equipment failure');
assert(equipmentFailureSimulation.lastCommandReason().includes('no gate-equipment recovery authority'), 'gate-equipment failure authority rejection was not explained');
equipmentFailureSimulation.setStation('supervisor');
assert(equipmentFailureSimulation.reportGateEquipmentFailure(equipmentFailureArrival.id), 'supervisor could not recover a gate equipment failure: ' + equipmentFailureSimulation.lastCommandReason());
assert(equipmentFailureArrival.gateAssignment?.standId !== failedStand, 'gate-equipment failure retained the failed stand');
assert(equipmentFailureArrival.gateEquipmentFailure?.failedStandId === failedStand, 'gate-equipment failure did not retain the failed stand identity');
assert(equipmentFailureArrival.gateEquipmentFailure?.replacementStandId === equipmentFailureArrival.gateAssignment?.standId, 'gate-equipment failure did not retain the replacement stand identity');
const equipmentEvents = equipmentFailureSimulation.drainEvents();
assert(equipmentEvents.some((event) => event.type === 'gate-reassignment' && event.detail?.includes('gate equipment failure')), 'gate-equipment failure did not reuse the authoritative gate planner');
assert(equipmentEvents.some((event) => event.type === 'gate-equipment-failure' && event.detail?.includes('unavailable')), 'gate-equipment failure emitted no durable recovery event');
assert(!equipmentFailureSimulation.reportGateEquipmentFailure(equipmentFailureArrival.id), 'recovered gate-equipment failure could be reported twice');

// Late ramp recovery has two coupled decisions: a new gate and a route suffix
// from the aircraft's current position. The stand must not change when the
// suffix is unavailable; otherwise a held arrival can be routed to its old
// stand while its schedule claims a new one.
const atomicLateGateSimulation = new AirportSimulation(ord);
const atomicLateGateArrival = atomicLateGateSimulation.state.flights.find(
  (flight) => flight.phase === 'approach' && flight.gateAssignment,
);
assert(atomicLateGateArrival, 'atomic late-gate test has no assigned arrival');
const atomicOriginal = {
  assignment: structuredClone(atomicLateGateArrival.gateAssignment),
  gateSlot: atomicLateGateArrival.gateSlot,
  standId: atomicLateGateArrival.standId,
  pushbackDirection: atomicLateGateArrival.pushbackDirection,
  turnaround: structuredClone(atomicLateGateArrival.turnaround),
  flightPlan: structuredClone(atomicLateGateArrival.flightPlan),
  gateSwaps: atomicLateGateSimulation.state.trafficFlow.totals.gateSwaps,
};
atomicLateGateSimulation.drainEvents();
const originalLateGateReplan = atomicLateGateSimulation['replanSurfaceFlight'];
atomicLateGateSimulation['replanSurfaceFlight'] = () => false;
const failedLateGateChange = atomicLateGateSimulation['reassignArrivalGateAndRoute'](
  atomicLateGateArrival,
  'forced late gate route failure',
  new Set([atomicOriginal.standId]),
  'forced route failure',
  ['test:forced-route-failure'],
);
atomicLateGateSimulation['replanSurfaceFlight'] = originalLateGateReplan;
assert(!failedLateGateChange, 'late gate transaction accepted an unavailable route suffix');
assert(JSON.stringify(atomicLateGateArrival.gateAssignment) === JSON.stringify(atomicOriginal.assignment), 'failed late gate transaction retained the replacement assignment');
assert(atomicLateGateArrival.gateSlot === atomicOriginal.gateSlot && atomicLateGateArrival.standId === atomicOriginal.standId, 'failed late gate transaction changed the assigned stand identity');
assert(atomicLateGateArrival.pushbackDirection === atomicOriginal.pushbackDirection, 'failed late gate transaction changed pushback geometry');
assert(JSON.stringify(atomicLateGateArrival.turnaround) === JSON.stringify(atomicOriginal.turnaround), 'failed late gate transaction changed turnaround timing');
assert(JSON.stringify(atomicLateGateArrival.flightPlan) === JSON.stringify(atomicOriginal.flightPlan), 'failed late gate transaction retained a gate-swap amendment');
assert(atomicLateGateSimulation.state.trafficFlow.totals.gateSwaps === atomicOriginal.gateSwaps, 'failed late gate transaction changed flow telemetry');
assert(atomicLateGateSimulation.drainEvents().length === 0, 'failed late gate transaction emitted a false reassignment event');

const remoteStandSimulation = new AirportSimulation(ord);
remoteStandSimulation.setStation('supervisor');
let remoteStandArrival = null;
for (const arrival of remoteStandSimulation.state.flights.filter((flight) => flight.phase === 'approach' && flight.gateAssignment)) {
  if (remoteStandSimulation.assignRemoteStand(arrival.id)) {
    remoteStandArrival = arrival;
    break;
  }
}
assert(remoteStandArrival, 'ORD had no compatible inbound aircraft for a remote-stand assignment: ' + remoteStandSimulation.lastCommandReason());
const remoteZone = ord.surfaceGraph.zones.find((zone) => zone.id === remoteStandArrival.gateAssignment?.zoneId);
assert(remoteZone?.kind === 'remote-ramp', 'remote-stand assignment selected a non-remote operational zone');
assert(remoteStandArrival.remoteStand?.standId === remoteStandArrival.gateAssignment?.standId, 'remote-stand state did not retain the assigned compatible stand');
assert(remoteStandArrival.remoteStand?.previousStandId !== remoteStandArrival.remoteStand?.standId, 'remote-stand assignment retained the original gate');
assert(remoteStandSimulation.drainEvents().some((event) => event.type === 'remote-stand-assignment' && event.detail?.includes('route confirmed')), 'remote-stand assignment emitted no durable event');
assert(!remoteStandSimulation.assignRemoteStand(remoteStandArrival.id), 'remote-stand assignment could be repeated for one arrival');

const harness = new FixedStepSimulationHarness(ord, { stepSeconds: 0.1 });
harness.simulation.setScenario('rush');
harness.simulation.setTrafficDensity('rush');
let maximumPhysicalOccupancy = 0;
let preferredAssignments = 0;
let cargoAssignments = 0;
let checkedFlights = 0;
let observedDepartureIdentity = 0;
for (let tick = 0; tick < 6_000; tick += 1) {
  harness.advanceTicks(1);
  const flights = harness.simulation.state.flights;
  const physicallyOccupying = flights.filter((flight) => (
    flight.phase === 'resting'
    || (flight.phase === 'taxi-in' && flight.progress > 0.94)
    || (flight.phase === 'taxi-out' && (flight.tugAttached || flight.pushbackProgress < 1))
  ));
  maximumPhysicalOccupancy = Math.max(maximumPhysicalOccupancy, physicallyOccupying.length);
  assert(new Set(physicallyOccupying.map((flight) => flight.standId)).size === physicallyOccupying.length, 'two aircraft physically occupied the same stand');
  for (const flight of flights) {
    const assignment = flight.gateAssignment;
    assert(assignment, 'active flight has no gate assignment: ' + flight.callsign);
    assert(assignment.zoneName.length > 0, 'gate assignment has no readable operational-zone name');
    const stand = ord.surfaceGraph.stands.find((candidate) => candidate.id === assignment.standId);
    assert(stand && stand.slot === flight.gateSlot && flight.standId === stand.id, 'flight/stand assignment identity diverged');
    const profile = aircraftProfile(flight.aircraft);
    assert(surfaceStandSupportsAircraft(stand, profile.category, profile.wingspanM), 'gate assignment violated aircraft size/category compatibility');
    assert(assignment.scheduledDepartureSeconds >= assignment.scheduledGateInSeconds, 'gate schedule ends before gate-in');
    if (assignment.airlineFit === 'preferred') preferredAssignments += 1;
    if (flight.service === 'cargo') {
      cargoAssignments += 1;
      assert(['cargo-ramp', 'remote-ramp', 'maintenance'].includes(assignment.serviceArea), 'cargo flight used a passenger terminal during the soak');
    }
    if ((flight.phase === 'taxi-out' || flight.phase === 'takeoff') && flight.origin === ord.code) {
      observedDepartureIdentity += 1;
      assert(flight.destination === assignment.nextDestination, 'departure identity differs from the planned next flight');
    }
    checkedFlights += 1;
  }
  const diagnostics = harness.simulation.diagnostics();
  assert(diagnostics.collisions.length === 0, 'gate-assignment soak produced an aircraft collision');
  assert(diagnostics.obstacleCollisions.length === 0, 'gate-assignment soak produced an obstacle collision');
}
const snapshot = harness.snapshot();
const gateEvents = snapshot.events.filter((event) => event.type === 'gate-assignment' || event.type === 'gate-reassignment' || event.type === 'gate-release');
assert(maximumPhysicalOccupancy >= 1, 'gate soak never observed an occupied stand');
assert(preferredAssignments > 0, 'gate soak never used an airline-preferred stand');
assert(cargoAssignments > 0, 'gate soak never exercised cargo assignment');
assert(observedDepartureIdentity > 0, 'gate soak never exercised a planned next departure');
assert(gateEvents.length > 0, 'gate lifecycle emitted no diagnostic events');

console.log(JSON.stringify({
  directAssignments: 6,
  homeConcourses: { UA: ua.concourse, AA: aa.concourse, DL: dl.concourse },
  cargoRamps: { UPS: zoneById.get(ups.zoneId)?.name, FedEx: zoneById.get(fedex.zoneId)?.name },
  safeStandReuse: later.standId,
  adjacentStandExclusion: true,
  departureRouteScores: routeScores.length,
  supervisorGateReassignment: true,
  gateEquipmentFailureRecovery: true,
  remoteStandRecovery: true,
  maximumPhysicalOccupancy,
  preferredAssignmentSamples: preferredAssignments,
  cargoAssignmentSamples: cargoAssignments,
  checkedFlightSamples: checkedFlights,
  departureIdentitySamples: observedDepartureIdentity,
  gateEvents: gateEvents.length,
  simulatedMinutes: 10,
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'gate-assignment-validation.ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});

const source = Buffer.from(result.outputFiles[0].contents).toString('base64');
try {
  await import('data:text/javascript;base64,' + source);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

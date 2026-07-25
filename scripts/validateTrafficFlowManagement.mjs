import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { AIRCRAFT_PROFILES } from './src/simulation/aircraftProfiles.ts';
import { airportTrafficProgram, selectTrafficProgram } from './src/simulation/airportTrafficPrograms.ts';
import { buildAirportOperationProfile } from './src/simulation/airportOperationProfiles.ts';
import { TRAFFIC_DENSITIES, TRAFFIC_DENSITY_PROFILES } from './src/simulation/trafficDensity.ts';
import {
  createTrafficFlowState,
  enqueueArrivalDemand,
  expireTrafficFlow,
  registerDepartureDemand,
  releaseArrivalDemand,
  releaseDepartureDemand,
  trafficFlowSnapshot,
} from './src/simulation/trafficFlowManagement.ts';
import { amendFlightPlan, createFlightPlan } from './src/simulation/flightPlanning.ts';
import { createHubSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { selectTerminalProcedure } from './src/simulation/airspaceProcedures.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const totals = {
  densityProfiles: 0,
  airportPrograms: 0,
  deterministicSelections: 0,
  completePlans: 0,
  flowTransitions: 0,
  simulatedLocalHours: 0,
  spawnedFlights: 0,
  completedArrivals: 0,
  completedDepartures: 0,
  concurrentTaxiMovers: 0,
};

assert(JSON.stringify(TRAFFIC_DENSITIES) === JSON.stringify(['quiet', 'realistic', 'busy', 'rush', 'extreme']), 'traffic-density order changed');
let previousDemand = 0;
for (const density of TRAFFIC_DENSITIES) {
  const profile = TRAFFIC_DENSITY_PROFILES[density];
  assert(profile.id === density && profile.label.length > 0 && profile.description.length > 20, density + ': incomplete density presentation');
  assert(profile.demandMultiplier > previousDemand, density + ': demand is not greater than the preceding profile');
  assert(profile.arrivalCapacityMultiplier > 0 && profile.departureCapacityMultiplier > 0, density + ': non-positive capacity assumption');
  assert(profile.holdingCapacity >= 1 && profile.maximumArrivalDelaySeconds > 0 && profile.maximumDepartureDelaySeconds > 0, density + ': invalid pressure-relief assumption');
  assert(profile.assumptions.length >= 3 && profile.assumptions.some((item) => /safety|collision/.test(item.toLowerCase())), density + ': safety boundary is not explicit');
  previousDemand = profile.demandMultiplier;
  totals.densityProfiles += 1;
}

const airportCodes = [...HUB_AIRPORTS.map((airport) => airport.code), 'LOCAL'];
const trafficClasses = ['passenger', 'regional', 'cargo', 'general-aviation'];
for (const [airportIndex, airportCode] of airportCodes.entries()) {
  const program = airportTrafficProgram(airportCode);
  const operation = buildAirportOperationProfile(airportCode, HUB_AIRPORTS.find((airport) => airport.code === airportCode)?.operations ?? null);
  assert(program.schemaVersion === 1 && program.airportCode === airportCode, airportCode + ': invalid traffic-program identity');
  assert(program.airlines.length >= 2 && program.sources.length >= 1, airportCode + ': incomplete traffic program');
  if (airportCode !== 'LOCAL') assert(program.sources.some((source) => source.url), airportCode + ': hub traffic program has no source URL');
  assert(program.recoveryPeriodIds.every((id) => operation.periods.some((period) => period.id === id && period.kind === 'recovery')) || airportCode === 'LOCAL', airportCode + ': recovery lulls do not match the operation profile');
  assert(program.overnightCargoPeriodIds.some((id) => operation.periods.some((period) => period.id === id && period.kind === 'overnight')) || airportCode === 'LOCAL', airportCode + ': overnight cargo peak does not match the operation profile');

  for (const trafficClass of trafficClasses) {
    for (let sample = 1; sample <= 40; sample += 1) {
      const input = {
        trafficClass,
        direction: sample % 2 ? 'arrival' : 'departure',
        periodId: operation.periods[sample % operation.periods.length].id,
        flightId: sample,
        airportSeed: 10_000 + airportIndex,
      };
      const first = selectTrafficProgram(program, input);
      const second = selectTrafficProgram(program, input);
      assert(JSON.stringify(first) === JSON.stringify(second), airportCode + ': traffic selection is not deterministic');
      assert(first.market.length > 0 && AIRCRAFT_PROFILES[first.aircraft], airportCode + ': traffic selection is incomplete');
      assert(program.airlines.some((airline) => airline.airline === first.airline), airportCode + ': selected airline is outside the program');
      totals.deterministicSelections += 1;
    }
  }
  assert(program.airlines.some((airline) => Object.values(airline.bankMultipliers).some((period) => Object.values(period).some((value) => value !== 1))), airportCode + ': airline banks have no time-of-day variation');
  totals.airportPrograms += 1;
}

const gateAssignment = {
  standId: 'TEST-STAND', gateSlot: 0, terminal: 'Test', zoneName: 'Test apron', serviceArea: 'passenger-terminal',
  assignedAtSeconds: 0, scheduledGateInSeconds: 20, scheduledDepartureSeconds: 80, nextDestination: 'ORD', departureRunway: 1,
  airlineFit: 'preferred', serviceFit: 'preferred', arrivalRouteDistance: 1, departureRouteDistance: 1, score: 1, rationale: ['test'], revision: 0,
};
const ordConfig = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const planRunway = ordConfig.runways[0];
const planProcedure = selectTerminalProcedure(ordConfig.airspaceProgram, {
  kind: 'STAR',
  runwayId: planRunway.id,
  operatingEnd: planRunway.landingEnd,
  configurationId: ordConfig.defaultRunwayConfigurationId,
  condition: 'clear',
  flightId: 7,
});
const plan = createFlightPlan({
  flightId: 7, legNumber: 1, direction: 'arrival', origin: 'DFW', destination: 'ORD',
  procedureSelection: planProcedure, procedureDataVersion: ordConfig.airspaceProgram.dataVersion,
  airline: 'AA', aircraft: 'B738', trafficClass: 'passenger', gateAssignment, runwayId: planRunway.id, operatingEnd: planRunway.landingEnd,
  runwayDesignation: planProcedure.procedure.runwayDesignation, createdAtSeconds: 0, scheduledReleaseSeconds: 0, estimatedArrivalSeconds: 60, airportSeed: 10004,
});
assert(plan.schemaVersion === 2 && plan.routeKind === 'schematic-procedure' && plan.route.length >= 6 && plan.origin === 'DFW' && plan.destination === 'ORD', 'complete flight plan lost its procedure route or endpoints');
assert(plan.procedureProfile.dataVersion === ordConfig.airspaceProgram.dataVersion && plan.procedureProfile.nonNavigational && plan.procedureProfile.constraints.length >= 4, 'complete flight plan lost its versioned procedure profile');
assert(plan.gateIntent.standId === 'TEST-STAND' && plan.runwayIntent.designation === planProcedure.procedure.runwayDesignation, 'complete flight plan lost gate/runway intent');
amendFlightPlan(plan, 'runway-change', 12, 'configuration change', { runwayIntent: { runwayId: 2, operatingEnd: 1, designation: '27R' } });
assert(plan.revision === 2 && plan.amendments.at(-1)?.kind === 'runway-change' && plan.runwayIntent.designation === '27R', 'flight-plan amendment was not recorded');
totals.completePlans += 1;

const flow = createTrafficFlowState('realistic', 0, 0);
const arrivals = Array.from({ length: 5 }, (_, index) => enqueueArrivalDemand(flow, index, 'test arrival ' + index));
assert(flow.arrivalQueue.length === 4 && arrivals.at(-1).status === 'diverted' && flow.totals.diversions === 1, 'holding capacity did not divert excess invisible demand');
const fakeArrival = { id: 11, callsign: 'TEST 11', runway: 1 };
releaseArrivalDemand(flow, flow.arrivalQueue[0], 10, fakeArrival, 5);
assert(flow.totals.arrivalReleases === 1 && flow.arrivalQueue.length === 3, 'arrival meter did not release its head entry');
const departureA = { id: 21, callsign: 'TEST 21', departureRunway: 2 };
const departureB = { id: 22, callsign: 'TEST 22', departureRunway: 2 };
const slotA = registerDepartureDemand(flow, departureA, 10, 12, 6);
const slotB = registerDepartureDemand(flow, departureB, 10, 12, 6);
assert(slotB.releaseSlotSeconds >= slotA.releaseSlotSeconds + 6 && flow.departureQueue[0] === slotA, 'departure slots are not ordered');
releaseDepartureDemand(flow, slotA, slotA.releaseSlotSeconds, 6);
assert(flow.totals.departureReleases === 1 && flow.departureQueue[0] === slotB, 'departure release did not advance the queue');
const expiry = expireTrafficFlow(flow, 500);
assert(expiry.diverted.length === 3 && expiry.cancelled.length === 1, 'capacity expiry did not divert/cancel blocked demand');
const flowSnapshot = trafficFlowSnapshot(flow, 500);
assert(flowSnapshot.history.length === 7 && flowSnapshot.backPressure.arrivalsHolding === 0 && flowSnapshot.backPressure.departuresWaiting === 0, 'flow snapshot is incomplete');
totals.flowTransitions += 8;

const hub = createHubSimulationHarness('ORD', { stepSeconds: 0.1, pace: 3, mode: 'auto', density: 'extreme' });
const initialIds = new Set(hub.simulation.state.flights.map((flight) => flight.id));
let maximumActive = hub.simulation.state.flights.length;
let previousProgress = new Map(hub.simulation.state.flights.map((flight) => [flight.id, flight.progress]));
for (let tick = 0; tick < 2_400; tick += 1) {
  hub.advanceTicks(1);
  maximumActive = Math.max(maximumActive, hub.simulation.state.flights.length);
  const movingTaxi = hub.simulation.state.flights.filter((flight) => (
    (flight.phase === 'taxi-in' || flight.phase === 'taxi-out')
    && flight.progress > (previousProgress.get(flight.id) ?? flight.progress) + 1e-9
  )).length;
  totals.concurrentTaxiMovers = Math.max(totals.concurrentTaxiMovers, movingTaxi);
  previousProgress = new Map(hub.simulation.state.flights.map((flight) => [flight.id, flight.progress]));
  if (tick % 10 !== 0) continue;
  const occupied = hub.simulation.state.flights.filter((flight) => (
    flight.phase === 'resting' || (flight.phase === 'taxi-out' && (flight.tugAttached || flight.pushbackProgress < 1))
  ));
  const stands = occupied.map((flight) => flight.standId).filter(Boolean);
  assert(new Set(stands).size === stands.length, 'ORD: active aircraft reused an occupied stand ' + JSON.stringify(occupied.map((flight) => ({ id: flight.id, callsign: flight.callsign, phase: flight.phase, stand: flight.standId, tug: flight.tugAttached, push: flight.pushbackProgress, gateIn: flight.gateAssignment?.scheduledGateInSeconds, gateOut: flight.gateAssignment?.scheduledDepartureSeconds }))));
  assert(hub.simulation.state.trafficFlow.history.length <= 256, 'ORD: traffic history exceeded its bounded retention');
}
const snapshot = hub.snapshot();
const traffic = hub.simulation.trafficFlowSnapshot();
const diagnostics = hub.simulation.diagnostics();
const spawnedIds = new Set(snapshot.events.filter((event) => event.type === 'spawn').map((event) => event.flightId));
assert([...spawnedIds].some((id) => !initialIds.has(id)), 'ORD: long session remained a fixed startup batch');
assert(snapshot.state.arrivals > 0 && snapshot.state.departures > 0, 'ORD: long session did not complete both traffic directions');
assert(traffic.totals.arrivalDemands > traffic.totals.arrivalReleases, 'ORD Extreme: no arrival back-pressure was modeled');
assert(traffic.totals.departureDemands >= traffic.totals.departureReleases, 'ORD: departure-flow totals are inconsistent');
assert(maximumActive <= diagnostics.activeTrafficCap, 'ORD: active entities exceeded the density budget');
assert(totals.concurrentTaxiMovers >= 2, 'ORD: departure metering serialized nonconflicting surface movement');
assert(snapshot.diagnostics.collisionPairs.length === 0 && snapshot.diagnostics.obstacleCollisions.length === 0, 'ORD: traffic management introduced a collision');
assert(snapshot.diagnostics.metrics.collisionAlerts === 0 && snapshot.diagnostics.metrics.runwayIncursions === 0, 'ORD: traffic management breached the safety arbiter');
assert(JSON.stringify(JSON.parse(JSON.stringify(snapshot))) === JSON.stringify(snapshot), 'traffic-managed fixed-step snapshot is not JSON stable');
totals.simulatedLocalHours = Number((snapshot.simulationTimeSeconds / 60).toFixed(1));
totals.spawnedFlights = spawnedIds.size;
totals.completedArrivals = snapshot.state.arrivals;
totals.completedDepartures = snapshot.state.departures;

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'traffic-flow-management-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Traffic-flow management validation bundle was empty.');
try {
  await import('data:text/javascript;base64,' + Buffer.from(bundled).toString('base64'));
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

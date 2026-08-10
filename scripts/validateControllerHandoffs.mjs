import { build } from 'esbuild';

const validationSource = `
import { generateHubConfig } from './src/simulation/airportConfig.ts';
import { AirportSimulation } from './src/simulation/airportSimulation.ts';
import { OPERATIONAL_CONTROLLER_STATIONS, requiredControllerStation } from './src/simulation/controllerOperations.ts';
import { digitalClearanceSnapshot } from './src/simulation/digitalClearances.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function manualFixture() {
  const simulation = new AirportSimulation(generateHubConfig(0), 'quiet');
  simulation.setMode('manual');
  simulation.setPaused(false);
  simulation.setStation('supervisor');
  const flight = simulation.state.flights[0];
  assert(flight, 'handoff validation requires an initial aircraft');
  simulation.state.flights = [flight];
  flight.phase = 'approach';
  flight.flightPlan.direction = 'arrival';
  flight.operationPlan.direction = 'arrival';
  flight.progress = 0.58;
  flight.phaseElapsed = 0;
  flight.duration = 1_000_000;
  flight.navigation.frequencyOwner = 'approach';
  flight.navigation.handoff = undefined;
  flight.navigation.handoffStatus = 'owned';
  flight.navigation.hold = undefined;
  flight.goAround = undefined;
  flight.diversion = undefined;
  simulation.drainEvents();
  return { simulation, flight };
}

const manual = manualFixture();
let eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.offerHandoff(manual.flight.id, 'tower'), 'Approach could not offer Tower a handoff');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-offer');
assert(manual.flight.navigation.frequencyOwner === 'approach', 'handoff offer transferred frequency ownership');
assert(manual.flight.navigation.handoff?.status === 'offered', 'handoff offer did not persist typed coordination');
let frequencyMessage = digitalClearanceSnapshot(manual.simulation.state).messages.find((message) => message.kind === 'frequency');
const frequencyMessageId = frequencyMessage?.id;
assert(frequencyMessage?.status === 'standby' && frequencyMessage.commandId === 'cmd-handoff-offer' && frequencyMessage.causalEventIds.length === 1 && frequencyMessage.capability.responseMode === 'voice-action', 'handoff offer omitted structured actionable message causality');
assert(!manual.simulation.contactFlight(manual.flight.id, 'tower'), 'contact bypassed receiving-controller acceptance');

manual.simulation.setStation('ground');
assert(!manual.simulation.acceptHandoff(manual.flight.id), 'wrong controller accepted an incoming handoff');
manual.simulation.setStation('supervisor');
for (const station of OPERATIONAL_CONTROLLER_STATIONS) manual.simulation.setStationAutomation(station, false);
eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.acceptHandoff(manual.flight.id), 'Tower handoff acceptance was rejected');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-accept');
assert(manual.flight.navigation.frequencyOwner === 'approach' && manual.flight.navigation.handoff?.status === 'accepted', 'acceptance changed ownership before contact');
frequencyMessage = digitalClearanceSnapshot(manual.simulation.state).messages.find((message) => message.kind === 'frequency');
assert(frequencyMessage?.id === frequencyMessageId && frequencyMessage.status === 'delivered' && frequencyMessage.response.commandId === 'cmd-handoff-accept', 'handoff acceptance lost stable identity or response causality');
eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.contactFlight(manual.flight.id, 'tower'), 'accepted contact instruction was rejected');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-contact');
assert(manual.flight.navigation.frequencyOwner === 'tower' && manual.flight.navigation.handoff?.status === 'completed', 'contact did not complete frequency transfer');
assert(manual.flight.navigation.handoff.commandId === 'cmd-handoff-offer' && manual.flight.navigation.handoff.responseCommandId === 'cmd-handoff-accept' && manual.flight.navigation.handoff.completionCommandId === 'cmd-handoff-contact', 'handoff state omitted offer, response, or completion command identity');
frequencyMessage = digitalClearanceSnapshot(manual.simulation.state).messages.find((message) => message.kind === 'frequency');
assert(frequencyMessage?.id === frequencyMessageId && frequencyMessage.status === 'wilco' && frequencyMessage.response.commandId === 'cmd-handoff-contact' && frequencyMessage.causalEventIds.length === 4 && frequencyMessage.capability.responseMode === 'none', 'completed handoff omitted stable closed full-lifecycle evidence');

eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.offerHandoff(manual.flight.id, 'ground'), 'Tower could not offer Ground a handoff');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-offer-cancelled');
eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.cancelHandoff(manual.flight.id), 'Tower could not cancel its active handoff');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-cancel');
frequencyMessage = digitalClearanceSnapshot(manual.simulation.state).messages.find((message) => message.kind === 'frequency');
assert(frequencyMessage?.status === 'cancelled' && frequencyMessage.response.commandId === 'cmd-handoff-cancel' && frequencyMessage.causalEventIds.length === 2, 'cancelled handoff omitted its structured terminal outcome');
eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.offerHandoff(manual.flight.id, 'ground'), 'a cancelled handoff could not be re-coordinated');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-offer-rejected');
eventCursor = manual.simulation.eventCursor();
assert(manual.simulation.rejectHandoff(manual.flight.id), 'Ground handoff rejection was rejected');
manual.simulation.tagEventsSince(eventCursor, 'cmd-handoff-reject');
assert(manual.flight.navigation.frequencyOwner === 'tower' && manual.flight.navigation.handoff?.status === 'rejected', 'rejected handoff changed ownership');
frequencyMessage = digitalClearanceSnapshot(manual.simulation.state).messages.find((message) => message.kind === 'frequency');
assert(frequencyMessage?.status === 'unable' && frequencyMessage.response.commandId === 'cmd-handoff-reject' && frequencyMessage.causalEventIds.length === 2, 'rejected handoff omitted its structured terminal outcome');
assert(manual.simulation.offerHandoff(manual.flight.id, 'ground'), 'a rejected handoff could not be re-coordinated');
manual.flight.navigation.handoff.responseDueSeconds = manual.simulation.state.elapsed;
manual.simulation.update(0.05);
assert(manual.flight.navigation.handoff?.status === 'overdue', 'unanswered handoff did not become overdue');
assert(manual.simulation.shiftMetrics().missedHandoffs === 1, 'overdue handoff was not recorded in shift metrics: ' + JSON.stringify(manual.simulation.shiftMetrics()));
assert(manual.simulation.acceptHandoff(manual.flight.id) && manual.simulation.contactFlight(manual.flight.id, 'ground'), 'overdue handoff could not recover through accept and contact');

manual.flight.navigation.frequencyOwner = 'approach';
manual.flight.navigation.handoff = undefined;
manual.flight.navigation.handoffStatus = 'owned';
manual.flight.phase = 'approach';
manual.flight.progress = 0.72;
manual.simulation.update(0.05);
assert(requiredControllerStation(manual.flight) === 'tower', 'late-handoff fixture did not cross the Tower boundary');
assert(manual.flight.navigation.handoff?.status === 'overdue' && manual.flight.navigation.handoff.to === 'tower', 'missed control boundary did not create an actionable overdue request');

manual.flight.flightPlan.direction = 'departure';
manual.flight.operationPlan.direction = 'departure';
manual.flight.phase = 'taxi-out';
manual.flight.tugAttached = false;
manual.flight.progress = Math.max(0.08, manual.flight.pushbackReleaseProgress + 0.03);
manual.flight.duration = 1_000_000;
manual.flight.phaseElapsed = 0;
manual.flight.navigation.frequencyOwner = 'ramp';
manual.flight.navigation.handoff = undefined;
manual.flight.navigation.handoffStatus = 'owned';
manual.flight.controlHold = false;
manual.flight.automaticHold = false;
manual.simulation.update(0.05);
assert(requiredControllerStation(manual.flight) === 'ground', 'surface handoff fixture did not cross the Ramp/Ground boundary');
assert(manual.flight.automaticHold && /handoff|coordinate|contact/.test(manual.flight.automaticHoldReason ?? ''), 'missed Ramp/Ground handoff did not protect the surface boundary');

const automatic = new AirportSimulation(generateHubConfig(0), 'quiet');
automatic.setMode('auto');
automatic.setPaused(false);
const autoFlight = automatic.state.flights[0];
assert(autoFlight, 'automatic handoff validation requires an aircraft');
automatic.state.flights = [autoFlight];
autoFlight.phase = 'approach';
autoFlight.flightPlan.direction = 'arrival';
autoFlight.operationPlan.direction = 'arrival';
autoFlight.progress = 0.58;
autoFlight.phaseElapsed = 0;
autoFlight.duration = 1_000_000;
autoFlight.navigation.frequencyOwner = 'approach';
autoFlight.navigation.handoff = undefined;
autoFlight.navigation.handoffStatus = 'owned';
automatic.drainEvents();
automatic.update(0.05);
assert(autoFlight.navigation.frequencyOwner === 'approach' && autoFlight.navigation.handoff?.status === 'offered', 'Auto skipped the handoff offer stage');
for (let tick = 0; tick < 25 && autoFlight.navigation.handoff?.status !== 'accepted'; tick += 1) automatic.update(0.05);
assert(autoFlight.navigation.frequencyOwner === 'approach' && autoFlight.navigation.handoff?.status === 'accepted', 'Auto skipped or failed the acceptance stage');
for (let tick = 0; tick < 25 && autoFlight.navigation.frequencyOwner !== 'tower'; tick += 1) automatic.update(0.05);
assert(autoFlight.navigation.frequencyOwner === 'tower' && autoFlight.navigation.handoff?.status === 'completed', 'Auto failed to finish the contact stage');

const eventTypes = new Set([...manual.simulation.drainEvents(), ...automatic.drainEvents()].map((event) => event.type));
for (const eventType of ['handoff-offer', 'handoff-accept', 'handoff-reject', 'handoff-overdue', 'handoff-cancel', 'handoff-complete', 'contact']) {
  assert(eventTypes.has(eventType), 'typed handoff event missing: ' + eventType);
}

const metrics = manual.simulation.shiftMetrics();
assert(metrics.handoffOffers >= 4 && metrics.handoffAcceptances >= 2 && metrics.handoffRejections === 1 && metrics.missedHandoffs >= 2, 'handoff shift metrics are incomplete');

console.log(JSON.stringify({
  manualStages: 8,
  automaticStages: 3,
  typedEvents: eventTypes.size,
  handoffMetrics: {
    offers: metrics.handoffOffers,
    acceptances: metrics.handoffAcceptances,
    rejections: metrics.handoffRejections,
    missed: metrics.missedHandoffs,
  },
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'controller-handoffs-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Controller handoff validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

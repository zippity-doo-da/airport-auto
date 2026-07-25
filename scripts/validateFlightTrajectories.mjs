import { build } from 'esbuild';

const validationSource = `
import { generateAirportConfig, generateHubConfig, HUB_AIRPORTS } from './src/simulation/airportConfig.ts';
import { aircraftProfile } from './src/simulation/aircraftProfiles.ts';
import {
  departureTrajectoryTiming,
  landingTrajectoryTiming,
  sampleFlightTrajectory,
} from './src/simulation/flightTrajectory.ts';
import { runwaySupportsAircraft } from './src/simulation/runwayPerformance.ts';
import { surfaceRouteForFlight } from './src/simulation/surfaceGraph.ts';
import { FixedStepSimulationHarness } from './src/simulation/fixedStepHarness.ts';
import { selectTerminalProcedure } from './src/simulation/airspaceProcedures.ts';
import { applyAircraftOrientation } from './src/render/aircraftOrientation.ts';
import * as THREE from 'three';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function distance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y, first.z - second.z);
}

function horizontalDistance(first, second) {
  return Math.hypot(first.x - second.x, first.y - second.y);
}

function angleDifference(first, second) {
  return Math.abs(Math.atan2(Math.sin(second - first), Math.cos(second - first)));
}

function makeFlight(config, runway, aircraft, phase, id) {
  const profile = aircraftProfile(aircraft);
  const procedure = selectTerminalProcedure(config.airspaceProgram, {
    kind: phase === 'takeoff' ? 'SID' : 'STAR',
    runwayId: runway.id,
    operatingEnd: runway.landingEnd,
    configurationId: config.defaultRunwayConfigurationId,
    condition: 'clear',
    flightId: id,
  });
  return {
    id,
    runway: runway.id,
    departureRunway: runway.id,
    operatingEnd: runway.landingEnd,
    phase,
    progress: 0,
    phaseElapsed: 0,
    duration: 1,
    gateSlot: id % Math.max(1, config.surfaceGraph.stands.length),
    aircraft,
    controlPattern: undefined,
    controlPatternStart: undefined,
    navigation: {
      schemaVersion: 1,
      procedureDataVersion: config.airspaceProgram.dataVersion,
      procedureId: procedure.procedure.id,
      transitionId: procedure.transition.id,
      routeFixIds: [...procedure.routeFixIds],
      activeFixIndex: 0,
      approachCleared: true,
      departureHeadingDegrees: procedure.procedure.initialHeadingDegrees,
      initialClimbAltitudeFt: procedure.procedure.initialClimbAltitudeFt,
      handoffFixId: procedure.procedure.handoffFixId,
      frequencyOwner: phase === 'takeoff' ? 'tower' : 'approach',
      handoffStatus: 'owned',
      readbackStatus: 'not-required',
      missedApproachId: procedure.procedure.missedApproachId,
    },
    kinematics: {
      airspeedKts: profile.approachKts,
      groundSpeedKts: profile.approachKts,
      altitudeFt: 2_000,
      verticalSpeedFpm: -profile.descentFpm,
      accelerationMps2: 0,
      fuelPercent: 60,
    },
  };
}

function sampleSeries(config, flight, count = 600) {
  const samples = [];
  for (let index = 0; index <= count; index += 1) {
    const sample = sampleFlightTrajectory(config, flight, index / count);
    assert(sample, config.code + ': missing ' + flight.phase + ' trajectory');
    assert([sample.x, sample.y, sample.z, sample.heading, sample.pitch, sample.bank].every(Number.isFinite), config.code + ': non-finite ' + flight.phase + ' sample');
    samples.push(sample);
  }
  return samples;
}

const configs = [
  ...Array.from({ length: 64 }, (_, index) => generateAirportConfig(120_000 + index * 173)),
  ...HUB_AIRPORTS.map((_, index) => generateHubConfig(index)),
];
const representativeAircraft = ['Q400', 'A320', 'B77F'];
const totals = {
  airports: configs.length,
  runways: 0,
  trajectories: 0,
  samples: 0,
  boundaryChecks: 0,
  touchdownChecks: 0,
  rotationChecks: 0,
  orientationChecks: 0,
  goAroundChecks: 0,
  liveMotionTicks: 0,
  approachSpeedChecks: 0,
  liveArrivals: 0,
  liveDepartures: 0,
};

for (const pitch of [THREE.MathUtils.degToRad(8), THREE.MathUtils.degToRad(12)]) {
  for (const bank of [-0.12, 0, 0.12]) {
    for (let headingDegrees = 0; headingDegrees < 360; headingDegrees += 15) {
      const aircraft = new THREE.Object3D();
      applyAircraftOrientation(aircraft, THREE.MathUtils.degToRad(headingDegrees), pitch, bank);
      const nose = new THREE.Vector3(1, 0, 0).applyQuaternion(aircraft.quaternion);
      const nosePosition = new THREE.Vector3(4, 0, 0).applyQuaternion(aircraft.quaternion);
      const tailPosition = new THREE.Vector3(-4, 0, 0).applyQuaternion(aircraft.quaternion);
      const renderedPitch = Math.atan2(nose.z, Math.hypot(nose.x, nose.y));
      assert(
        Math.abs(renderedPitch - pitch) < 1e-10,
        'aircraft orientation: positive pitch was not nose-up at heading ' + headingDegrees + '°, bank ' + bank,
      );
      assert(
        nosePosition.z > tailPosition.z,
        'aircraft orientation: physical nose was not above the tail at heading ' + headingDegrees + '°, bank ' + bank,
      );
      totals.orientationChecks += 1;
    }
  }
}

for (const config of configs) {
  for (const runway of config.runways.filter((item) => item.role !== 'inactive')) {
    totals.runways += 1;
    for (let aircraftIndex = 0; aircraftIndex < representativeAircraft.length; aircraftIndex += 1) {
      const aircraft = representativeAircraft[aircraftIndex];
      const id = runway.id * 10 + aircraftIndex + 1;
      const approach = makeFlight(config, runway, aircraft, 'approach', id);
      const landing = makeFlight(config, runway, aircraft, 'landing', id);
      const takeoff = makeFlight(config, runway, aircraft, 'takeoff', id);
      const approachSamples = sampleSeries(config, approach);
      const landingSamples = sampleSeries(config, landing);
      const departureSamples = sampleSeries(config, takeoff);
      totals.trajectories += 3;
      totals.samples += approachSamples.length + landingSamples.length + departureSamples.length;

      const approachStart = approachSamples[0];
      const threshold = approachSamples[approachSamples.length - 1];
      const landingStart = landingSamples[0];
      const landingEnd = landingSamples[landingSamples.length - 1];
      const takeoffStart = departureSamples[0];
      const takeoffEnd = departureSamples[departureSamples.length - 1];

      const requiredEntryDistance = config.scope === 'center' ? 250 : 165;
      assert(horizontalDistance(approachStart, threshold) >= requiredEntryDistance, config.code + ' runway ' + runway.id + ': arrival does not begin at the map edge');
      assert(distance(threshold, landingStart) < 1e-8, config.code + ' runway ' + runway.id + ': approach/landing position jump');
      assert(angleDifference(threshold.heading, landingStart.heading) < 1e-8, config.code + ' runway ' + runway.id + ': approach/landing heading jump');
      assert(Math.abs(threshold.pitch - landingStart.pitch) < 1e-8, config.code + ' runway ' + runway.id + ': approach/landing pitch jump');
      totals.boundaryChecks += 3;

      let previousAltitude = Infinity;
      for (let index = 1; index < approachSamples.length; index += 1) {
        const previous = approachSamples[index - 1];
        const sample = approachSamples[index];
        const horizontalStep = horizontalDistance(previous, sample);
        assert(horizontalStep > 1e-5, config.code + ' runway ' + runway.id + ': approach paused at sample ' + index);
        assert(angleDifference(previous.heading, sample.heading) < 0.08, config.code + ' seed ' + config.seed + ' runway ' + runway.id + ': approach turn snapped at sample ' + index + ' ' + JSON.stringify({ previous, sample }));
        assert(sample.z <= previousAltitude + 0.08, config.code + ' runway ' + runway.id + ': approach climbed unexpectedly at sample ' + index);
        if (sample.stage === 'final' && previous.stage === 'final') {
          const descentAngle = Math.atan2(previous.z - sample.z, horizontalStep);
          assert(descentAngle < THREE.MathUtils.degToRad(7), config.code + ' runway ' + runway.id + ': final approach became an implausible dive at sample ' + index);
        }
        previousAltitude = sample.z;
      }

      let touchedDown = false;
      let sawFlare = false;
      let sawRollout = false;
      let previousLandingDistance = -Infinity;
      for (let index = 0; index < landingSamples.length; index += 1) {
        const sample = landingSamples[index];
        assert(sample.distanceAlong + 1e-8 >= previousLandingDistance, config.code + ' runway ' + runway.id + ': landing reversed at sample ' + index);
        previousLandingDistance = sample.distanceAlong;
        if (sample.stage === 'flare') sawFlare = true;
        if (sample.stage === 'rollout') sawRollout = true;
        if (sample.onGround) touchedDown = true;
        if (touchedDown) assert(sample.onGround, config.code + ' runway ' + runway.id + ': aircraft became airborne again after touchdown');
        if (index > 0) assert(horizontalDistance(landingSamples[index - 1], sample) > 1e-6, config.code + ' runway ' + runway.id + ': landing paused at sample ' + index);
        if (sample.stage !== 'runway-exit') {
          const direction = { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
          const lateral = Math.abs((sample.x - runway.center[0]) * -direction.y + (sample.y - runway.center[1]) * direction.x);
          assert(lateral < 1e-6, config.code + ' runway ' + runway.id + ': landing left the runway centerline before its assigned exit');
        }
      }
      assert(sawFlare && sawRollout && touchedDown, config.code + ' runway ' + runway.id + ': landing sequence omitted flare, touchdown, or rollout');
      const touchdown = landingSamples.find((sample) => sample.onGround);
      assert(touchdown && touchdown.distanceAlong <= 5.6, config.code + ' runway ' + runway.id + ': touchdown is too far beyond the threshold');
      assert(touchdown.pitch >= 0.17, config.code + ' runway ' + runway.id + ': touchdown attitude was not visibly nose-up');
      assert(touchdown.pitch <= THREE.MathUtils.degToRad(11), config.code + ' runway ' + runway.id + ': touchdown attitude is excessively nose-high');
      assert(Math.max(...landingSamples.map((sample) => sample.pitch)) >= 0.17, config.code + ' runway ' + runway.id + ': landing did not flare to a 10-degree nose-up attitude');
      assert(Math.abs(landingEnd.pitch) < 1e-8 && landingEnd.onGround, config.code + ' runway ' + runway.id + ': landing did not lower the nose for runway exit');
      const taxiInRoute = surfaceRouteForFlight(config.surfaceGraph, runway.id, runway.landingEnd, 'taxi-in', landing.gateSlot);
      const taxiInStart = config.surfaceGraph.nodes.find((node) => node.id === taxiInRoute?.nodeIds[0]);
      assert(taxiInStart && Math.hypot(landingEnd.x - taxiInStart.position[0], landingEnd.y - taxiInStart.position[1]) < 0.001, config.code + ' runway ' + runway.id + ': landing did not finish at its runway exit');
      assert(landingTrajectoryTiming(config, runway.id, aircraft).totalSeconds > 12, config.code + ' runway ' + runway.id + ': landing timing is implausibly short');
      totals.touchdownChecks += 5;

      const taxiOutRoute = surfaceRouteForFlight(config.surfaceGraph, runway.id, runway.landingEnd, 'taxi-out', takeoff.gateSlot);
      const taxiOutEnd = config.surfaceGraph.nodes.find((node) => node.id === taxiOutRoute?.nodeIds.at(-1));
      assert(taxiOutEnd && Math.hypot(takeoffStart.x - taxiOutEnd.position[0], takeoffStart.y - taxiOutEnd.position[1]) < 0.001, config.code + ' runway ' + runway.id + ': taxi-out/takeoff position jump');
      let liftoffIndex = -1;
      let sawRoll = false;
      let sawRotation = false;
      let sawClimb = false;
      let previousDepartureDistance = -Infinity;
      for (let index = 0; index < departureSamples.length; index += 1) {
        const sample = departureSamples[index];
        assert(sample.distanceAlong + 1e-8 >= previousDepartureDistance, config.code + ' runway ' + runway.id + ': departure reversed at sample ' + index);
        previousDepartureDistance = sample.distanceAlong;
        if (sample.stage === 'takeoff-roll') sawRoll = true;
        if (sample.stage === 'rotation') sawRotation = true;
        if (sample.stage === 'climbout') sawClimb = true;
        if (!sample.onGround && liftoffIndex < 0) liftoffIndex = index;
        if (index > 0) assert(horizontalDistance(departureSamples[index - 1], sample) > 1e-7, config.code + ' runway ' + runway.id + ': departure paused at sample ' + index);
        if (sample.stage === 'takeoff-roll' || sample.stage === 'rotation') {
          const direction = { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
          const lateral = Math.abs((sample.x - runway.center[0]) * -direction.y + (sample.y - runway.center[1]) * direction.x);
          assert(lateral < 1e-6, config.code + ' runway ' + runway.id + ': departure left the runway centerline before liftoff');
        }
        if (index > 0 && !sample.onGround && (sample.stage === 'rotation' || sample.stage === 'climbout')) {
          const previous = departureSamples[index - 1];
          if (previous.stage === sample.stage) {
            const pathAngle = Math.atan2(sample.z - previous.z, horizontalDistance(previous, sample));
            assert(
              sample.pitch > pathAngle,
              config.code + ' runway ' + runway.id + ': airborne departure pointed below its climb path at sample ' + index,
            );
          }
        }
      }
      assert(sawRoll && sawRotation && sawClimb, config.code + ' runway ' + runway.id + ': departure sequence omitted roll, rotation, or climb');
      const midRotation = departureSamples.find((sample) => sample.stage === 'rotation' && sample.stageProgress >= 0.5);
      assert(midRotation?.pitch >= THREE.MathUtils.degToRad(9), config.code + ' runway ' + runway.id + ': rotation attitude develops too late to read nose-up');
      assert(liftoffIndex > departureSamples.length * 0.4, config.code + ' runway ' + runway.id + ': aircraft lifted off without a full runway roll');
      assert(departureSamples[liftoffIndex].distanceAlong >= runway.length * 0.42, config.code + ' runway ' + runway.id + ': aircraft lifted off too early on the runway');
      assert(departureSamples[liftoffIndex].pitch >= THREE.MathUtils.degToRad(10), config.code + ' runway ' + runway.id + ': aircraft lifted off without a nose-up rotation');
      assert(Math.max(...departureSamples.map((sample) => sample.pitch)) >= 0.18, config.code + ' runway ' + runway.id + ': departure did not rotate to a 10-degree nose-up attitude');
      assert(takeoffEnd.z >= 30 && !takeoffEnd.onGround, config.code + ' runway ' + runway.id + ': departure did not complete its climb-out');
      const departureThreshold = {
        x: runway.center[0] + Math.cos(runway.heading) * takeoff.operatingEnd * runway.length / 2,
        y: runway.center[1] + Math.sin(runway.heading) * takeoff.operatingEnd * runway.length / 2,
      };
      assert(horizontalDistance(departureThreshold, takeoffEnd) >= runway.length + (config.scope === 'center' ? 210 : 140), config.code + ' runway ' + runway.id + ': departure did not reach the map edge');
      assert(departureTrajectoryTiming(config, runway.id, aircraft).totalSeconds > 30, config.code + ' runway ' + runway.id + ': takeoff timing is implausibly short');
      totals.rotationChecks += 7;
    }
  }
}

const ordConfig = generateHubConfig(HUB_AIRPORTS.findIndex((airport) => airport.code === 'ORD'));
const goAroundRunway = ordConfig.runways.find((runway) => runway.role === 'arrival' || runway.role === 'mixed');
assert(goAroundRunway, 'ORD go-around validation requires an arrival runway');
const goAroundFlight = makeFlight(ordConfig, goAroundRunway, 'A320', 'approach', 701);
const goAroundStart = sampleFlightTrajectory(ordConfig, goAroundFlight, 0.88);
assert(goAroundStart, 'ORD go-around validation requires an established approach sample');
goAroundFlight.goAround = {
  startedAt: 120,
  detail: 'trajectory validation',
  cycle: 1,
  start: {
    x: goAroundStart.x,
    y: goAroundStart.y,
    z: goAroundStart.z,
    heading: goAroundStart.heading,
    pitch: goAroundStart.pitch,
    bank: goAroundStart.bank,
    onGround: goAroundStart.onGround,
    groundBlend: goAroundStart.groundBlend,
    protectedRunway: goAroundStart.protectedRunway,
  },
};
const goAroundSamples = sampleSeries(ordConfig, goAroundFlight, 900);
assert(distance(goAroundStart, goAroundSamples[0]) < 1e-8, 'ORD go-around jumped when the instruction was issued');
assert(new Set(goAroundSamples.map((sample) => sample.stage)).has('go-around-climb'), 'ORD go-around omitted the initial climb');
assert(new Set(goAroundSamples.map((sample) => sample.stage)).has('go-around-turn'), 'ORD go-around omitted the circuit turn');
assert(new Set(goAroundSamples.map((sample) => sample.stage)).has('go-around-reentry'), 'ORD go-around omitted arrival re-entry');
assert(Math.max(...goAroundSamples.map((sample) => sample.z)) >= goAroundStart.z + 12, 'ORD go-around did not climb');
assert(Math.max(...goAroundSamples.map((sample) => sample.pitch)) >= THREE.MathUtils.degToRad(10), 'ORD go-around never established a nose-up climb attitude');
const missedApproach = ordConfig.airspaceProgram.missedApproaches.find((candidate) => candidate.id === goAroundFlight.navigation.missedApproachId);
assert(missedApproach, 'ORD go-around has no selected missed-approach profile');
for (const fixId of missedApproach.fixIds) {
  const fix = ordConfig.airspaceProgram.fixes.find((candidate) => candidate.id === fixId);
  assert(fix && Math.min(...goAroundSamples.map((sample) => Math.hypot(sample.x - fix.position[0], sample.y - fix.position[1]))) < 3, 'ORD go-around did not fly its selected missed-approach fix ' + fixId);
  totals.goAroundChecks += 1;
}
delete goAroundFlight.goAround;
const normalReentry = sampleFlightTrajectory(ordConfig, goAroundFlight, 0);
assert(normalReentry && distance(normalReentry, goAroundSamples.at(-1)) < 1e-8, 'ORD go-around did not rejoin the normal approach continuously');
totals.goAroundChecks += 8;
const liveHarness = new FixedStepSimulationHarness(ordConfig, { stepSeconds: 0.05, pace: 3, scenario: 'rush', density: 'rush' });
const previousMotion = new Map();
const seenStages = new Set();
const airborneTakeoffs = new Set();
const completedRollouts = new Set();
// Imported ORD surface routes can legitimately take more than fifteen
// simulation minutes from a remote stand to the runway. Keep the live gate
// long enough to observe two complete, safety-arbitrated departure sequences
// instead of treating realistic taxi distance as a takeoff failure.
for (let tick = 0; tick < 9_000; tick += 1) {
  liveHarness.advanceTicks(1);
  totals.liveMotionTicks += 1;
  for (const flight of liveHarness.simulation.state.flights) {
    const runway = ordConfig.runways[flight.runway];
    const operation = flight.phase === 'taxi-out' || flight.phase === 'takeoff' ? 'takeoff' : 'landing';
    assert(runwaySupportsAircraft(runway, flight.aircraft, operation), 'ORD live motion: ' + flight.aircraft + ' assigned to undersized runway ' + flight.runway + ' for ' + operation);
    const motion = sampleFlightTrajectory(ordConfig, flight);
    if (!motion) {
      previousMotion.delete(flight.id);
      continue;
    }
    seenStages.add(motion.stage);
    assert(!flight.safetyHold, 'ORD live motion: ' + flight.callsign + ' paused during ' + motion.stage + ' because ' + flight.safetyHoldReason + ' ' + JSON.stringify(liveHarness.simulation.state.flights.map((item) => ({ id: item.id, callsign: item.callsign, phase: item.phase, progress: item.progress, runway: item.runway, hold: item.safetyHoldReason }))));
    if (flight.phase === 'approach' && flight.progress > 0.02) {
      const profile = aircraftProfile(flight.aircraft);
      assert(
        flight.kinematics.airspeedKts >= profile.approachKts * 0.98 && flight.kinematics.airspeedKts <= profile.approachKts + 30,
        'ORD live motion: ' + flight.callsign + ' approach airspeed departed the model envelope: ' + flight.kinematics.airspeedKts,
      );
      assert(
        Math.abs(flight.kinematics.accelerationMps2) <= Math.max(profile.accelerationMps2, profile.brakingMps2) + 0.25,
        'ORD live motion: ' + flight.callsign + ' exceeded its acceleration envelope: ' + flight.kinematics.accelerationMps2 + ' m/s²',
      );
      assert(
        Math.hypot(flight.motion.x - motion.x, flight.motion.y - motion.y, flight.motion.z - motion.z) < 1e-6,
        'ORD live motion: renderer trajectory diverged from authoritative simulation pose',
      );
      totals.approachSpeedChecks += 1;
    }
    const previous = previousMotion.get(flight.id);
    if (previous) {
      const moved = horizontalDistance(previous.motion, motion);
      assert(moved > 1e-8, 'ORD live motion: ' + flight.callsign + ' stopped between fixed ticks during ' + motion.stage);
      if (previous.phase === 'approach' && flight.phase === 'landing') {
        assert(moved < 2, 'ORD live motion: ' + flight.callsign + ' jumped at the approach/landing boundary');
      }
    }
    if (flight.phase === 'takeoff' && !motion.onGround && !airborneTakeoffs.has(flight.id)) {
      const profile = aircraftProfile(flight.aircraft);
      assert(flight.kinematics.airspeedKts >= profile.approachKts * 1.04, 'ORD live motion: ' + flight.callsign + ' lifted off below a credible rotation speed');
      airborneTakeoffs.add(flight.id);
    }
    if (flight.phase === 'landing' && motion.stage === 'flare' && motion.stageProgress > 0.05) {
      const profile = aircraftProfile(flight.aircraft);
      assert(
        flight.kinematics.airspeedKts >= profile.approachKts * 0.9 && flight.kinematics.airspeedKts <= profile.approachKts * 1.08,
        'ORD live motion: ' + flight.callsign + ' lost approach speed before touchdown: ' + flight.kinematics.airspeedKts,
      );
    }
    if (flight.phase === 'landing' && motion.stage === 'runway-exit' && motion.stageProgress > 0.8) {
      const profile = aircraftProfile(flight.aircraft);
      const plannedExitSpeed = flight.runwayExit?.targetExitSpeedKts ?? profile.taxiKts + 3;
      assert(flight.kinematics.airspeedKts <= plannedExitSpeed + 5, 'ORD live motion: ' + flight.callsign + ' reached the runway exit above its planned speed');
      completedRollouts.add(flight.id);
    }
    previousMotion.set(flight.id, { phase: flight.phase, motion });
  }
  if (liveHarness.simulation.state.departures >= 2 && completedRollouts.size >= 4) break;
}
totals.liveArrivals = liveHarness.simulation.state.arrivals;
totals.liveDepartures = liveHarness.simulation.state.departures;
for (const requiredStage of ['edge-entry', 'arrival-turn', 'final', 'flare', 'touchdown', 'rollout', 'runway-exit', 'lineup', 'takeoff-roll', 'rotation', 'climbout']) {
  assert(seenStages.has(requiredStage), 'ORD live motion never reached ' + requiredStage);
}
assert(airborneTakeoffs.size >= 2, 'ORD live motion did not verify two liftoffs ' + JSON.stringify({ departures: liveHarness.simulation.state.departures, airborne: [...airborneTakeoffs], flights: liveHarness.simulation.state.flights.map((flight) => ({ id: flight.id, phase: flight.phase, progress: flight.progress, runway: flight.runway, gate: flight.gateSlot, route: flight.surfaceRoute, entry: flight.runwayEntryCleared, takeoff: flight.takeoffCleared, hold: flight.safetyHoldReason })), envelopes: liveHarness.simulation.diagnostics().collisionEnvelopes.aircraft }));
assert(completedRollouts.size >= 4, 'ORD live motion did not verify four complete landing rollouts');

console.log(JSON.stringify(totals));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: 'ts',
    resolveDir: process.cwd(),
    sourcefile: 'flight-trajectory-validation.ts',
  },
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node22',
  write: false,
  logLevel: 'silent',
});

const bundled = result.outputFiles[0]?.text;
if (!bundled) throw new Error('Flight trajectory validation bundle was empty.');
try {
  await import(`data:text/javascript;base64,${Buffer.from(bundled).toString('base64')}`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

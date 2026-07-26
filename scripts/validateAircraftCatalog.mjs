import { build } from "esbuild";

const validationSource = `
import {
  AIRCRAFT_DATA_REFERENCES,
  AIRCRAFT_PROFILES,
  AIRCRAFT_ROSTER,
} from './src/simulation/aircraftProfiles.ts';
import {
  AIRLINE_PROFILES,
  airlineLiveryStyle,
} from './src/simulation/airlineProfiles.ts';
import { airportTrafficProgram } from './src/simulation/airportTrafficPrograms.ts';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

assert(AIRCRAFT_ROSTER.length >= 17, 'audited roster did not reach the Milestone 7 breadth target');
assert(new Set(AIRCRAFT_ROSTER).size === AIRCRAFT_ROSTER.length, 'aircraft roster contains duplicates');
const roles = new Set();
const families = new Set();
const engines = new Set();
const numericFields = [
  'lengthM', 'wingspanM', 'heightM', 'operatingEmptyWeightT', 'maxTakeoffWeightT',
  'maxLandingWeightT', 'usableFuelKg', 'nominalCruiseFuelBurnKgPerHour', 'maximumRangeNm',
  'cruiseKts', 'approachKts', 'rotationKts', 'taxiKts', 'taxiTurnKts',
  'taxiAccelerationMps2', 'taxiBrakingMps2', 'taxiTurnRadiusM', 'minimumWingtipClearanceM',
  'takeoffRollM', 'landingRollM', 'takeoffRunwayRequiredM', 'landingRunwayRequiredM',
  'climbFpm', 'descentFpm', 'accelerationMps2', 'brakingMps2', 'turnRadiusM',
  'wakeSeparationSeconds', 'serviceMinutes', 'engines',
];

for (const model of AIRCRAFT_ROSTER) {
  const profile = AIRCRAFT_PROFILES[model];
  assert(profile.model === model, model + ' catalog key/model mismatch');
  roles.add(profile.fleetRole);
  families.add(profile.visual.family);
  engines.add(profile.engineType);
  for (const field of numericFields) {
    const value = profile[field];
    assert(Number.isFinite(value) && value > 0, model + ' has invalid ' + field);
  }
  assert(profile.operatingEmptyWeightT < profile.maxTakeoffWeightT, model + ' empty weight is not below MTOW');
  assert(profile.maxLandingWeightT >= profile.operatingEmptyWeightT && profile.maxLandingWeightT <= profile.maxTakeoffWeightT, model + ' MLW is outside its weight envelope');
  assert(profile.usableFuelKg < profile.maxTakeoffWeightT * 1_000, model + ' usable fuel exceeds gross mass');
  assert(profile.taxiTurnKts <= profile.taxiKts, model + ' turn taxi speed exceeds straight taxi speed');
  assert(profile.takeoffRunwayRequiredM >= profile.takeoffRollM, model + ' takeoff planning length is shorter than roll');
  assert(profile.landingRunwayRequiredM >= profile.landingRollM, model + ' landing planning length is shorter than roll');
  assert(profile.dataReferenceIds.length > 0, model + ' has no catalog source');
  for (const referenceId of profile.dataReferenceIds) {
    const reference = AIRCRAFT_DATA_REFERENCES[referenceId];
    assert(reference, model + ' cites missing source ' + referenceId);
    assert(reference.url.startsWith('https://'), model + ' source is not HTTPS');
    assert(reference.publisher.length > 2 && reference.retrievedOn === profile.auditedOn, model + ' source audit metadata is incomplete');
  }
  if (profile.fleetRole === 'cargo') {
    assert(profile.visual.cargoDoor && !profile.visual.passengerWindows, model + ' freighter visual lacks cargo identity');
  }
  if (profile.engineType === 'turboprop') assert(profile.visual.propeller, model + ' turboprop lacks propeller visual data');
}

for (const requiredRole of ['general-aviation', 'utility', 'business', 'regional', 'narrowbody', 'widebody', 'cargo']) {
  assert(roles.has(requiredRole), 'roster lacks ' + requiredRole + ' aircraft');
}
for (const requiredEngine of ['piston', 'turboprop', 'turbofan']) assert(engines.has(requiredEngine), 'roster lacks ' + requiredEngine + ' powerplants');
assert(families.size >= 10, 'aircraft still collapse into too few visual families');

const airportCodes = ['ORD', 'ATL', 'DXB', 'HND', 'DFW', 'LHR', 'IST', 'DEN', 'LAX', 'JFK', 'LOCAL'];
const assignedModels = new Set();
for (const airportCode of airportCodes) {
  const program = airportTrafficProgram(airportCode);
  for (const airline of program.airlines) {
    for (const fleet of Object.values(airline.fleets)) {
      for (const assignment of fleet ?? []) {
        assignedModels.add(assignment.model);
        if (AIRLINE_PROFILES[airline.airline].cargo) {
          assert(AIRCRAFT_PROFILES[assignment.model].fleetRole === 'cargo', airportCode + ' cargo carrier received passenger airframe ' + assignment.model);
        }
      }
    }
  }
}
for (const model of AIRCRAFT_ROSTER) assert(assignedModels.has(model), model + ' is unreachable from every fleet program');

const liveryStyles = new Set(Object.keys(AIRLINE_PROFILES).map((code) => airlineLiveryStyle(code)));
assert(liveryStyles.size === 4, 'original livery grammar does not expose all four styles');

console.log(JSON.stringify({
  models: AIRCRAFT_ROSTER.length,
  roles: [...roles].sort(),
  visualFamilies: families.size,
  engineTypes: [...engines].sort(),
  sourceReferences: Object.keys(AIRCRAFT_DATA_REFERENCES).length,
  assignedModels: assignedModels.size,
  liveryStyles: [...liveryStyles].sort(),
}));
`;

const result = await build({
  absWorkingDir: process.cwd(),
  stdin: {
    contents: validationSource,
    loader: "ts",
    resolveDir: process.cwd(),
    sourcefile: "aircraft-catalog-validation.ts",
  },
  bundle: true,
  platform: "node",
  format: "esm",
  write: false,
  logLevel: "silent",
});

const code = result.outputFiles[0].text;
try {
  await import(
    "data:text/javascript;base64," + Buffer.from(code).toString("base64")
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}

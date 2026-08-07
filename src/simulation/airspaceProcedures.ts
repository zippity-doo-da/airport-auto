import type { AirportRunwayConfiguration, RunwayConfig } from './airportConfig';
import type { WeatherCondition } from './types';
import { WORLD_METERS_PER_UNIT } from './runwayPerformance';

export type AirspaceFixKind = 'entry' | 'transition' | 'downwind' | 'base' | 'final' | 'departure' | 'handoff' | 'hold' | 'missed';
export type TerminalProcedureKind = 'SID' | 'STAR';

export interface AirspaceFix {
  id: string;
  name: string;
  kind: AirspaceFixKind;
  position: [number, number];
  /** Schematic constraint altitude, in real aviation feet. */
  altitudeFt: number;
}

export interface ProcedureConstraint {
  fixId: string;
  atOrAboveFt?: number;
  atOrBelowFt?: number;
  maximumSpeedKts?: number;
  note: string;
}

export interface AirwayProfile {
  id: string;
  name: string;
  fixIds: string[];
  minimumAltitudeFt: number;
  direction: 'one-way' | 'two-way';
}

export interface TerminalSectorProfile {
  id: string;
  name: string;
  role: 'arrival' | 'departure' | 'mixed';
  floorFt: number;
  ceilingFt: number;
  polygon: Array<[number, number]>;
}

export interface ProcedureTransitionProfile {
  id: string;
  name: string;
  fixIds: string[];
}

export interface MissedApproachProfile {
  id: string;
  name: string;
  fixIds: string[];
  climbToFt: number;
  holdId: string;
  note: string;
}

export interface HoldingPatternProfile {
  id: string;
  name: string;
  fixId: string;
  inboundCourseDegrees: number;
  turns: 'left' | 'right';
  legSeconds: number;
  minimumAltitudeFt: number;
  maximumAltitudeFt: number;
  defaultEfcMinutes: number;
}

export interface TerminalProcedureProfile {
  id: string;
  name: string;
  kind: TerminalProcedureKind;
  revision: number;
  runwayId: number;
  operatingEnd: -1 | 1;
  runwayDesignation: string;
  configurationIds: string[];
  conditions: WeatherCondition[];
  transitions: ProcedureTransitionProfile[];
  commonFixIds: string[];
  constraints: ProcedureConstraint[];
  initialHeadingDegrees?: number;
  initialClimbAltitudeFt?: number;
  handoffFixId?: string;
  missedApproachId?: string;
  note: string;
}

export interface AirspaceProcedureSource {
  title: string;
  url: string;
  retrievedOn: string;
  use: string;
}

/**
 * A deliberately non-navigational terminal-airspace program. Geometry is
 * generated in airport world coordinates and versioned so recordings can
 * reproduce the exact procedure set that produced them.
 */
export interface AirportAirspaceProgram {
  schemaVersion: 1;
  dataVersion: string;
  airportCode: string;
  nonNavigational: true;
  fixes: AirspaceFix[];
  airways: AirwayProfile[];
  sectors: TerminalSectorProfile[];
  procedures: TerminalProcedureProfile[];
  holds: HoldingPatternProfile[];
  missedApproaches: MissedApproachProfile[];
  sources: AirspaceProcedureSource[];
  disclaimer: string;
}

export interface AirspaceAirportDefinition {
  code: string;
  name: string;
  seed: number;
  scope: 'airfield' | 'center';
  runways: RunwayConfig[];
  runwayConfigurations: AirportRunwayConfiguration[];
}

export interface ProcedureSelectionInput {
  kind: TerminalProcedureKind;
  runwayId: number;
  operatingEnd: -1 | 1;
  configurationId: string;
  condition: WeatherCondition;
  flightId: number;
}

export interface SelectedTerminalProcedure {
  procedure: TerminalProcedureProfile;
  transition: ProcedureTransitionProfile;
  routeFixIds: string[];
}

const CARDINALS = [
  { id: 'N', name: 'NORTH', angle: Math.PI / 2 },
  { id: 'NE', name: 'NORTHEAST', angle: Math.PI / 4 },
  { id: 'E', name: 'EAST', angle: 0 },
  { id: 'SE', name: 'SOUTHEAST', angle: -Math.PI / 4 },
  { id: 'S', name: 'SOUTH', angle: -Math.PI / 2 },
  { id: 'SW', name: 'SOUTHWEST', angle: -3 * Math.PI / 4 },
  { id: 'W', name: 'WEST', angle: Math.PI },
  { id: 'NW', name: 'NORTHWEST', angle: 3 * Math.PI / 4 },
] as const;

const PROCEDURE_SOURCES: AirspaceProcedureSource[] = [
  {
    title: 'FAA Aeronautical Information Manual, Chapter 5 — Air Traffic Procedures',
    url: 'https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap5_section_4.html',
    retrievedOn: '2026-07-24',
    use: 'Conceptual STAR, crossing-restriction, approach-clearance, and holding behavior only.',
  },
  {
    title: 'FAA Digital Terminal Procedures Publication',
    url: 'https://www.faa.gov/air_traffic/flight_info/aeronav/digital_products/dtpp/',
    retrievedOn: '2026-07-24',
    use: 'Publication-cycle and procedure-product framing only; generated tracks are not chart transcriptions.',
  },
];

export function buildAirportAirspaceProgram(definition: AirspaceAirportDefinition): AirportAirspaceProgram {
  const center = airportCenter(definition.runways);
  const radius = definition.scope === 'center' ? 285 : 185;
  const sectorRadius = radius * 1.12;
  const fixes: AirspaceFix[] = CARDINALS.map((cardinal, index) => ({
    id: `${definition.code}-${cardinal.id}-ENTRY`,
    name: `${definition.code === 'LOCAL' ? 'LA' : definition.code}-${cardinal.id}${(Math.abs(definition.seed) + index) % 9 + 1}`,
    kind: 'entry',
    position: pointFrom(center, cardinal.angle, radius),
    altitudeFt: definition.scope === 'center' ? 3_000 : 2_200,
  }));
  const procedures: TerminalProcedureProfile[] = [];
  const holds: HoldingPatternProfile[] = [];
  const missedApproaches: MissedApproachProfile[] = [];

  for (const cardinal of CARDINALS.filter((_, index) => index % 2 === 0)) {
    const fixId = `${definition.code}-${cardinal.id}-ENTRY`;
    holds.push({
      id: `${definition.code}-${cardinal.id}-HOLD`,
      name: `${cardinal.name} METERING HOLD`,
      fixId,
      inboundCourseDegrees: normalizeDegrees(90 - cardinal.angle * 180 / Math.PI),
      turns: cardinal.id === 'N' || cardinal.id === 'S' ? 'right' : 'left',
      legSeconds: definition.scope === 'center' ? 60 : 45,
      minimumAltitudeFt: definition.scope === 'center' ? 2_500 : 1_800,
      maximumAltitudeFt: definition.scope === 'center' ? 7_000 : 4_000,
      defaultEfcMinutes: 8,
    });
  }

  for (const runway of definition.runways) {
    for (const operatingEnd of [-1, 1] as const) {
      const generated = buildRunwayProcedures(definition, runway, operatingEnd, fixes, holds);
      fixes.push(...generated.fixes);
      procedures.push(generated.star, generated.sid);
      missedApproaches.push(generated.missedApproach);
    }
  }

  const airways: AirwayProfile[] = CARDINALS.slice(0, 4).map((cardinal, index) => {
    const opposite = CARDINALS[index + 4];
    return {
      id: `${definition.code}-A${index + 1}`,
      name: `${definition.code} TERMINAL AIRWAY ${index + 1}`,
      fixIds: [`${definition.code}-${cardinal.id}-ENTRY`, `${definition.code}-${opposite.id}-ENTRY`],
      minimumAltitudeFt: definition.scope === 'center' ? 3_000 : 2_000,
      direction: 'two-way',
    };
  });
  const sectors = buildSectors(definition.code, center, sectorRadius);

  return {
    schemaVersion: 1,
    dataVersion: `airport-auto-schematic-${definition.code.toLowerCase()}-2026.07`,
    airportCode: definition.code,
    nonNavigational: true,
    fixes: uniqueById(fixes),
    airways,
    sectors,
    procedures,
    holds,
    missedApproaches,
    sources: PROCEDURE_SOURCES.map((source) => ({ ...source })),
    disclaimer: `${definition.name} terminal procedures are original simulation schematics. Not current, not charted, and never for navigation.`,
  };
}

export function selectTerminalProcedure(
  program: AirportAirspaceProgram,
  input: ProcedureSelectionInput,
): SelectedTerminalProcedure {
  const exact = program.procedures.filter((procedure) => (
    procedure.kind === input.kind
    && procedure.runwayId === input.runwayId
    && procedure.operatingEnd === input.operatingEnd
    && procedure.conditions.includes(input.condition)
    && (procedure.configurationIds.length === 0 || procedure.configurationIds.includes(input.configurationId))
  ));
  const fallback = program.procedures.filter((procedure) => (
    procedure.kind === input.kind
    && procedure.runwayId === input.runwayId
    && procedure.operatingEnd === input.operatingEnd
  ));
  const candidates = exact.length ? exact : fallback;
  const procedure = candidates[Math.abs(input.flightId) % Math.max(1, candidates.length)]
    ?? program.procedures.find((candidate) => candidate.kind === input.kind)
    ?? program.procedures[0];
  if (!procedure) throw new Error(`No ${input.kind} procedure is available for ${program.airportCode}`);
  const transition = procedure.transitions[Math.abs(input.flightId + input.runwayId) % procedure.transitions.length]
    ?? { id: `${procedure.id}-DIRECT`, name: 'DIRECT', fixIds: [] };
  return {
    procedure,
    transition,
    routeFixIds: deduplicate(procedure.kind === 'STAR'
      ? [...transition.fixIds, ...procedure.commonFixIds]
      : [...procedure.commonFixIds, ...transition.fixIds]),
  };
}

export function procedureFix(program: AirportAirspaceProgram, id: string): AirspaceFix | undefined {
  return program.fixes.find((fix) => fix.id === id);
}

function buildRunwayProcedures(
  definition: AirspaceAirportDefinition,
  runway: RunwayConfig,
  operatingEnd: -1 | 1,
  entryFixes: AirspaceFix[],
  holds: HoldingPatternProfile[],
): {
  fixes: AirspaceFix[];
  star: TerminalProcedureProfile;
  sid: TerminalProcedureProfile;
  missedApproach: MissedApproachProfile;
} {
  const code = definition.code;
  // The shared array grows as each runway is generated. Keep procedure
  // transitions anchored exclusively to the immutable terminal entry ring;
  // using a previously generated runway fix here can start a later arrival in
  // the middle of the airport and splice unrelated procedures together.
  const cardinalEntries = entryFixes.filter((fix) => fix.kind === 'entry');
  const designation = runway.designation?.[operatingEnd === 1 ? 1 : 0] ?? String(runway.id + 1);
  const direction = { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
  const outward = { x: direction.x * operatingEnd, y: direction.y * operatingEnd };
  const travel = { x: -outward.x, y: -outward.y };
  const side = { x: -travel.y, y: travel.x };
  const threshold: [number, number] = [
    runway.center[0] + outward.x * runway.length / 2,
    runway.center[1] + outward.y * runway.length / 2,
  ];
  const lateralSign = (runway.id + (operatingEnd === 1 ? 1 : 0)) % 2 ? 1 : -1;
  const far = definition.scope === 'center' ? 235 : 145;
  const lateral = definition.scope === 'center' ? 34 : 25;
  const prefix = `${code}-R${runway.id}-${operatingEnd === 1 ? 'B' : 'A'}`;
  const routeFixes: AirspaceFix[] = [
    approachFix(`${prefix}-DW`, `${code} DOWNWIND ${designation}`, 'downwind', threshold, outward, side, far * 0.74, lateral * lateralSign),
    approachFix(`${prefix}-BASE`, `${code} BASE ${designation}`, 'base', threshold, outward, side, far * 0.50, lateral * 0.58 * lateralSign),
    approachFix(`${prefix}-INT`, `${code} INTERCEPT ${designation}`, 'transition', threshold, outward, side, far * 0.32, lateral * 0.12 * lateralSign),
    approachFix(`${prefix}-FAF`, `${code} FINAL ${designation}`, 'final', threshold, outward, side, far * 0.18, 0),
  ];
  const approachAngle = Math.atan2(outward.y, outward.x);
  const closestEntries = [...cardinalEntries]
    .sort((first, second) => angularDifference(angleFrom(threshold, first.position), approachAngle) - angularDifference(angleFrom(threshold, second.position), approachAngle))
    .slice(0, 2);
  const gatewayDistance = definition.scope === 'center' ? 285 : 185;
  const gatewayLane = definition.scope === 'center' ? 5 : 3;
  const runwayLaneOffset = ((runway.id * 2 + (operatingEnd === 1 ? 1 : 0)) % 5 - 2) * gatewayLane;
  const arrivalGateways: AirspaceFix[] = closestEntries.map((entry, index) => {
    // Feed the downwind from a long, nearly parallel leg. The cardinal entry
    // names distinguish transition choices, while the actual gateway lanes
    // remain runway-specific so an aircraft never has to make a hairpin turn
    // at the downwind fix.
    const transitionOffset = lateral * lateralSign + runwayLaneOffset + (index === 0 ? -gatewayLane * 0.5 : gatewayLane * 0.5);
    return {
      id: `${prefix}-GW${index + 1}`,
      name: `${entry.name} GATE ${designation}`,
      kind: 'transition',
      position: [
        threshold[0] + outward.x * gatewayDistance + side.x * transitionOffset,
        threshold[1] + outward.y * gatewayDistance + side.y * transitionOffset,
      ],
      altitudeFt: definition.scope === 'center' ? 3_000 : 2_200,
    };
  });
  const configurationIds = definition.runwayConfigurations
    .filter((configuration) => (
      (configuration.arrivalRunwayIds.includes(runway.id) || configuration.departureRunwayIds.includes(runway.id))
      && (configuration.operatingEnds[runway.id] ?? operatingEnd) === operatingEnd
    ))
    .map((configuration) => configuration.id);
  const conditions = unique(
    definition.runwayConfigurations
      .filter((configuration) => configurationIds.includes(configuration.id))
      .flatMap((configuration) => configuration.restrictions.conditions),
  );
  const approachAltitude = (fix: AirspaceFix): number => glideAltitudeFt(distance2d(fix.position, threshold));
  for (const fix of routeFixes) fix.altitudeFt = approachAltitude(fix);
  const missedFix: AirspaceFix = {
    id: `${prefix}-MISSED`,
    name: `${code} MISSED ${designation}`,
    kind: 'missed',
    position: [threshold[0] + travel.x * (runway.length + 72), threshold[1] + travel.y * (runway.length + 72)],
    altitudeFt: 2_500,
  };
  const hold = nearestHold(holds, cardinalEntries, missedFix.position);
  const missedApproach: MissedApproachProfile = {
    id: `${prefix}-MA`,
    name: `${designation} MISSED APPROACH`,
    fixIds: [missedFix.id, hold.fixId],
    climbToFt: definition.scope === 'center' ? 3_000 : 2_000,
    holdId: hold.id,
    note: `Climb straight ahead, then proceed to the ${hold.name.toLowerCase()} for re-sequencing.`,
  };
  const star: TerminalProcedureProfile = {
    id: `${prefix}-STAR1`,
    name: `${code} ${designation} ARRIVAL ONE`,
    kind: 'STAR',
    revision: 1,
    runwayId: runway.id,
    operatingEnd,
    runwayDesignation: designation,
    configurationIds,
    conditions: conditions.length ? conditions : ['clear', 'haze', 'rain', 'fog', 'snow', 'thunderstorm'],
    transitions: closestEntries.map((entry, index) => ({
      id: `${prefix}-${entry.id.split('-').at(-2)}-TRANSITION`,
      name: `${entry.name} TRANSITION`,
      fixIds: [arrivalGateways[index].id],
    })),
    commonFixIds: routeFixes.map((fix) => fix.id),
    constraints: routeFixes.map((fix, index) => ({
      fixId: fix.id,
      atOrAboveFt: Math.max(500, Math.round((fix.altitudeFt - (index < 2 ? 250 : 100)) / 100) * 100),
      atOrBelowFt: Math.round((fix.altitudeFt + (index < 2 ? 700 : 250)) / 100) * 100,
      maximumSpeedKts: index === 0 ? 220 : index === 1 ? 190 : index === 2 ? 170 : 150,
      note: index === 3 ? 'Cross configured final fix stable for the approach.' : 'Schematic crossing window; controller may amend it.',
    })),
    missedApproachId: missedApproach.id,
    note: 'Original non-navigational arrival with a downwind, base, and stabilized final intercept.',
  };

  const farRunwayEnd: [number, number] = [threshold[0] + travel.x * runway.length, threshold[1] + travel.y * runway.length];
  // Parallel departures must fan outward from the airfield, not alternate a
  // left/right turn by runway ID. The latter can aim two separate runway
  // centerlines at the same climb-out corridor (particularly DFW's paired
  // runway complexes). Use the signed lateral position relative to the
  // airport center whenever the geometry supplies one; the ID fallback keeps
  // a deterministic choice for a lone centerline.
  const airfieldCenter = airportCenter(definition.runways);
  const lateralOffset =
    (runway.center[0] - airfieldCenter[0]) * -travel.y +
    (runway.center[1] - airfieldCenter[1]) * travel.x;
  const turnSign = Math.abs(lateralOffset) > 0.5
    ? Math.sign(lateralOffset)
    : (runway.id + (operatingEnd === 1 ? 0 : 1)) % 2
      ? 1
      : -1;
  const departureAngle = Math.atan2(travel.y, travel.x) + turnSign * (definition.scope === 'center' ? 0.28 : 0.2);
  const departureFix: AirspaceFix = {
    id: `${prefix}-DEP`,
    name: `${code} DEPARTURE ${designation}`,
    kind: 'departure',
    position: [farRunwayEnd[0] + travel.x * 76, farRunwayEnd[1] + travel.y * 76],
    altitudeFt: definition.scope === 'center' ? 3_000 : 2_000,
  };
  const handoffFix: AirspaceFix = {
    id: `${prefix}-HO`,
    name: `${code} HANDOFF ${designation}`,
    kind: 'handoff',
    position: pointFrom(departureFix.position, departureAngle, definition.scope === 'center' ? 115 : 74),
    altitudeFt: definition.scope === 'center' ? 5_000 : 3_000,
  };
  const nearestDepartureEntries = [...cardinalEntries]
    .sort((first, second) => distance2d(first.position, handoffFix.position) - distance2d(second.position, handoffFix.position))
    .slice(0, 2);
  const departureHeadingDegrees = mathAngleToAviationDegrees(departureAngle);
  const sid: TerminalProcedureProfile = {
    id: `${prefix}-SID1`,
    name: `${code} ${designation} DEPARTURE ONE`,
    kind: 'SID',
    revision: 1,
    runwayId: runway.id,
    operatingEnd,
    runwayDesignation: designation,
    configurationIds,
    conditions: conditions.length ? conditions : ['clear', 'haze', 'rain', 'fog', 'snow', 'thunderstorm'],
    transitions: nearestDepartureEntries.map((entry) => ({
      id: `${prefix}-${entry.id.split('-').at(-2)}-TRANSITION`,
      name: `${entry.name} TRANSITION`,
      fixIds: [entry.id],
    })),
    commonFixIds: [departureFix.id, handoffFix.id],
    constraints: [
      { fixId: departureFix.id, atOrAboveFt: 2_000, maximumSpeedKts: 220, note: 'Maintain the initial climb and speed restriction until this fix.' },
      { fixId: handoffFix.id, atOrAboveFt: definition.scope === 'center' ? 4_000 : 2_500, maximumSpeedKts: 250, note: 'Departure handoff point.' },
    ],
    initialHeadingDegrees: departureHeadingDegrees,
    initialClimbAltitudeFt: definition.scope === 'center' ? 5_000 : 3_000,
    handoffFixId: handoffFix.id,
    note: 'Original non-navigational departure with an initial heading, climb restriction, and handoff point.',
  };
  return { fixes: [...arrivalGateways, ...routeFixes, missedFix, departureFix, handoffFix], star, sid, missedApproach };
}

function buildSectors(code: string, center: [number, number], radius: number): TerminalSectorProfile[] {
  const sectors: TerminalSectorProfile[] = [];
  for (let index = 0; index < 4; index += 1) {
    const start = index * Math.PI / 2;
    const polygon: Array<[number, number]> = [center];
    for (let step = 0; step <= 5; step += 1) polygon.push(pointFrom(center, start + step * Math.PI / 10, radius));
    sectors.push({
      id: `${code}-SECTOR-${index + 1}`,
      name: `${code} ${['EAST', 'NORTH', 'WEST', 'SOUTH'][index]} TERMINAL`,
      role: index % 2 === 0 ? 'arrival' : 'mixed',
      floorFt: 0,
      ceilingFt: 10_000,
      polygon,
    });
  }
  return sectors;
}

function approachFix(
  id: string,
  name: string,
  kind: AirspaceFixKind,
  threshold: [number, number],
  outward: { x: number; y: number },
  side: { x: number; y: number },
  distance: number,
  lateral: number,
): AirspaceFix {
  return {
    id,
    name,
    kind,
    position: [threshold[0] + outward.x * distance + side.x * lateral, threshold[1] + outward.y * distance + side.y * lateral],
    altitudeFt: 0,
  };
}

function airportCenter(runways: RunwayConfig[]): [number, number] {
  if (!runways.length) return [0, 0];
  return [
    runways.reduce((sum, runway) => sum + runway.center[0], 0) / runways.length,
    runways.reduce((sum, runway) => sum + runway.center[1], 0) / runways.length,
  ];
}

function nearestHold(holds: HoldingPatternProfile[], fixes: AirspaceFix[], point: [number, number]): HoldingPatternProfile {
  return [...holds].sort((first, second) => {
    const firstFix = fixes.find((fix) => fix.id === first.fixId);
    const secondFix = fixes.find((fix) => fix.id === second.fixId);
    return distance2d(firstFix?.position ?? point, point) - distance2d(secondFix?.position ?? point, point);
  })[0] ?? {
    id: 'LOCAL-HOLD', name: 'LOCAL HOLD', fixId: fixes[0]?.id ?? 'LOCAL', inboundCourseDegrees: 0,
    turns: 'right', legSeconds: 60, minimumAltitudeFt: 2_000, maximumAltitudeFt: 5_000, defaultEfcMinutes: 8,
  };
}

function glideAltitudeFt(distanceWorld: number): number {
  const horizontalFeet = distanceWorld * WORLD_METERS_PER_UNIT * 3.28084;
  return Math.max(500, Math.round((50 + horizontalFeet * Math.tan(3 * Math.PI / 180)) / 50) * 50);
}

function pointFrom(origin: [number, number], angle: number, distance: number): [number, number] {
  return [origin[0] + Math.cos(angle) * distance, origin[1] + Math.sin(angle) * distance];
}

function angleFrom(origin: [number, number], point: [number, number]): number {
  return Math.atan2(point[1] - origin[1], point[0] - origin[0]);
}

function distance2d(first: [number, number], second: [number, number]): number {
  return Math.hypot(first[0] - second[0], first[1] - second[1]);
}

function angularDifference(first: number, second: number): number {
  return Math.abs(Math.atan2(Math.sin(first - second), Math.cos(first - second)));
}

function mathAngleToAviationDegrees(angle: number): number {
  return normalizeDegrees(90 - angle * 180 / Math.PI);
}

function normalizeDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

function deduplicate(values: string[]): string[] {
  return [...new Set(values)];
}

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function uniqueById<T extends { id: string }>(values: T[]): T[] {
  return [...new Map(values.map((value) => [value.id, value])).values()];
}

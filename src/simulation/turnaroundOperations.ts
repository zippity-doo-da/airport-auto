import { aircraftProfile, type AircraftModel } from "./aircraftProfiles";
import type {
  FlightService,
  FlightOperationalDetail,
  FlightTurnaroundState,
  TurnaroundServiceType,
  TurnaroundTaskState,
} from "./types";

export interface TurnaroundPlanRequest {
  flightId: number;
  airportSeed: number;
  aircraft: AircraftModel;
  service: FlightService;
  fuelPercent: number;
  targetFuelPercent: number;
  scope: "airfield" | "center";
  scheduledGateInSeconds: number;
  operationalDetail?: FlightOperationalDetail;
}

export interface TurnaroundTransition {
  type: "service-start" | "service-complete" | "turnaround-ready";
  service?: TurnaroundServiceType;
}

const SERVICE_ORDER: TurnaroundServiceType[] = [
  "fueling",
  "potable-water",
  "lavatory",
  "baggage",
  "cargo",
  "catering",
  "cleaning",
  "boarding",
  "crew",
  "maintenance",
];

const SERVICE_LABELS: Record<TurnaroundServiceType, string> = {
  fueling: "Fueling",
  "potable-water": "Potable water",
  lavatory: "Lavatory service",
  baggage: "Baggage",
  cargo: "Cargo",
  catering: "Catering",
  cleaning: "Cleaning",
  boarding: "Boarding",
  crew: "Flight crew",
  maintenance: "Maintenance",
};

export function createTurnaroundPlan(
  request: TurnaroundPlanRequest,
): FlightTurnaroundState {
  const profile = aircraftProfile(request.aircraft);
  const scopeScale = request.scope === "center" ? 1 : 0.72;
  const sizeScale = Math.max(0.58, Math.min(1.7, profile.serviceMinutes / 50));
  const variant = positiveModulo(
    request.airportSeed * 31 +
      request.flightId * 17 +
      request.aircraft.length * 13,
    97,
  );
  const targetFuelPercent = Math.min(
    96,
    Math.max(request.fuelPercent, request.targetFuelPercent),
  );
  const fuelingRequired = targetFuelPercent - request.fuelPercent >= 2;
  const passenger = request.service === "passenger";
  // Full cabin-water and waste turns are modeled for widebodies, where the
  // service is operationally prominent and can be staged without turning a
  // compact narrowbody gate into an implausible equipment parade.
  const potableWaterRequired = passenger && profile.category === "widebody";
  const lavatoryRequired = passenger && profile.category === "widebody";
  const cateringRequired =
    passenger && (profile.category !== "regional" || variant % 3 === 0);
  // A crew van is intentionally reserved for turns where a remote crew swap is
  // operationally visible: widebodies, freighters, and a deterministic subset
  // of longer narrowbody turns. Small regional turns retain their compact ramp
  // picture rather than receiving a vehicle parade at every stand.
  const crewRequired =
    profile.category === "widebody" ||
    request.service === "cargo" ||
    (profile.category === "narrowbody" && variant % 4 === 0);
  const maintenanceRequired = request.operationalDetail
    ? request.operationalDetail.maintenanceClass === "transit-inspection"
    : variant % 9 === 0;
  const extendedMaintenance =
    request.operationalDetail?.maintenanceClass === "out-of-service-repair";
  const duration = (base: number, variation = 0): number =>
    round1(
      (base + (variant % Math.max(1, variation + 1))) * sizeScale * scopeScale,
    );
  const definitions: Array<{
    type: TurnaroundServiceType;
    required: boolean;
    durationSeconds: number;
    dependencies?: TurnaroundServiceType[];
    reason: string;
  }> = [
    {
      type: "fueling",
      required: fuelingRequired,
      durationSeconds: fuelingRequired
        ? round1(
            (12 + (targetFuelPercent - request.fuelPercent) * 0.45) *
              Math.max(0.86, sizeScale) *
              scopeScale,
          )
        : 0,
      reason: fuelingRequired
        ? `dispatch target ${Math.round(targetFuelPercent)}%`
        : "arrival fuel already meets dispatch target",
    },
    {
      type: "potable-water",
      required: potableWaterRequired,
      durationSeconds: potableWaterRequired ? duration(10, 3) : 0,
      reason: potableWaterRequired
        ? "cabin potable-water uplift scheduled"
        : "standard turn does not require a dedicated water uplift",
    },
    {
      type: "lavatory",
      required: lavatoryRequired,
      durationSeconds: lavatoryRequired ? duration(11, 3) : 0,
      reason: lavatoryRequired
        ? "cabin waste servicing scheduled"
        : "standard turn does not require dedicated lavatory servicing",
    },
    {
      type: "baggage",
      required: passenger,
      durationSeconds: passenger ? duration(23, 5) : 0,
      reason: passenger
        ? "unload and reload passenger baggage"
        : "freighter has no passenger-baggage turn",
    },
    {
      type: "cargo",
      required: !passenger,
      durationSeconds: passenger ? 0 : duration(36, 7),
      reason: passenger
        ? "passenger service uses the baggage operation"
        : "freighter main-deck and belly load exchange",
    },
    {
      type: "catering",
      required: cateringRequired,
      durationSeconds: cateringRequired ? duration(16, 4) : 0,
      reason: cateringRequired
        ? "route and cabin service require catering"
        : "no catering uplift scheduled",
    },
    {
      type: "cleaning",
      required: passenger,
      durationSeconds: passenger ? duration(17, 5) : 0,
      reason: passenger
        ? "cabin reset before boarding"
        : "no passenger cabin turn",
    },
    {
      type: "boarding",
      required: passenger,
      durationSeconds: passenger ? duration(28, 7) : 0,
      dependencies: cateringRequired ? ["cleaning", "catering"] : ["cleaning"],
      reason: passenger
        ? "boarding waits for cabin service"
        : "freighter has no passenger boarding",
    },
    {
      type: "crew",
      required: crewRequired,
      durationSeconds: crewRequired ? duration(9, 3) : 0,
      reason: crewRequired
        ? "relief crew and dispatch package transfer"
        : "same crew remains assigned for this short turn",
    },
    {
      type: "maintenance",
      required: maintenanceRequired,
      durationSeconds: maintenanceRequired
        ? duration(extendedMaintenance ? 58 : 27, extendedMaintenance ? 16 : 9)
        : 0,
      reason: maintenanceRequired
        ? (request.operationalDetail?.maintenanceReason ??
          "scheduled transit inspection")
        : "no maintenance action required",
    },
  ];

  const tasks: TurnaroundTaskState[] = definitions.map((definition) => ({
    type: definition.type,
    label: SERVICE_LABELS[definition.type],
    required: definition.required,
    status: definition.required ? "waiting" : "not-required",
    durationSeconds: definition.durationSeconds,
    scheduledStartOffsetSeconds: 0,
    elapsedSeconds: 0,
    dependencies: definition.dependencies ?? [],
    reason: definition.reason,
  }));
  scheduleTaskOffsets(tasks);
  const plannedDurationSeconds = round1(
    Math.max(
      0,
      ...tasks.map((task) =>
        task.required
          ? task.scheduledStartOffsetSeconds + task.durationSeconds
          : 0,
      ),
    ),
  );
  return {
    status: "planned",
    plannedDurationSeconds,
    elapsedSeconds: 0,
    progress: 0,
    scheduledStartSeconds: request.scheduledGateInSeconds,
    scheduledReadySeconds:
      request.scheduledGateInSeconds + plannedDurationSeconds,
    initialFuelPercent: request.fuelPercent,
    targetFuelPercent,
    tasks,
  };
}

export function scheduleTurnaround(
  turnaround: FlightTurnaroundState,
  scheduledGateInSeconds: number,
): void {
  if (turnaround.status !== "planned") return;
  turnaround.scheduledStartSeconds = scheduledGateInSeconds;
  turnaround.scheduledReadySeconds =
    scheduledGateInSeconds + turnaround.plannedDurationSeconds;
}

export function startTurnaround(
  turnaround: FlightTurnaroundState,
  actualStartSeconds: number,
  initialFuelPercent: number,
  availableServices?: ReadonlySet<TurnaroundServiceType>,
): TurnaroundTransition[] {
  turnaround.status = "servicing";
  turnaround.actualStartSeconds = actualStartSeconds;
  turnaround.actualReadySeconds = undefined;
  turnaround.releasedAtSeconds = undefined;
  turnaround.elapsedSeconds = 0;
  turnaround.progress = turnaround.plannedDurationSeconds <= 0 ? 1 : 0;
  turnaround.scheduledStartSeconds = actualStartSeconds;
  turnaround.scheduledReadySeconds =
    actualStartSeconds + turnaround.plannedDurationSeconds;
  turnaround.initialFuelPercent = initialFuelPercent;
  for (const task of turnaround.tasks) {
    task.elapsedSeconds = 0;
    task.actualStartSeconds = undefined;
    task.actualCompleteSeconds = undefined;
    task.status = task.required ? "waiting" : "not-required";
  }
  return advanceTurnaround(turnaround, actualStartSeconds, availableServices);
}

export function advanceTurnaround(
  turnaround: FlightTurnaroundState,
  nowSeconds: number,
  availableServices?: ReadonlySet<TurnaroundServiceType>,
): TurnaroundTransition[] {
  if (
    turnaround.status !== "servicing" ||
    turnaround.actualStartSeconds === undefined
  )
    return [];
  if (availableServices)
    return advanceResourceGatedTurnaround(
      turnaround,
      nowSeconds,
      availableServices,
    );
  const transitions: TurnaroundTransition[] = [];
  const elapsed = round6(
    Math.max(
      0,
      Math.min(
        turnaround.plannedDurationSeconds,
        nowSeconds - turnaround.actualStartSeconds,
      ),
    ),
  );
  turnaround.elapsedSeconds = elapsed;
  turnaround.progress =
    turnaround.plannedDurationSeconds <= 0
      ? 1
      : elapsed / turnaround.plannedDurationSeconds;

  for (const task of turnaround.tasks) {
    if (!task.required) continue;
    const priorStatus = task.status;
    const relative = elapsed - task.scheduledStartOffsetSeconds;
    task.elapsedSeconds = round6(
      Math.max(0, Math.min(task.durationSeconds, relative)),
    );
    task.status =
      relative < -1e-6
        ? "waiting"
        : task.elapsedSeconds + 1e-6 >= task.durationSeconds
          ? "complete"
          : "active";
    if (
      priorStatus === "waiting" &&
      (task.status === "active" || task.status === "complete")
    ) {
      task.actualStartSeconds =
        turnaround.actualStartSeconds + task.scheduledStartOffsetSeconds;
      transitions.push({ type: "service-start", service: task.type });
    }
    if (priorStatus !== "complete" && task.status === "complete") {
      task.actualCompleteSeconds =
        turnaround.actualStartSeconds +
        task.scheduledStartOffsetSeconds +
        task.durationSeconds;
      transitions.push({ type: "service-complete", service: task.type });
    }
  }

  if (
    turnaround.tasks.every(
      (task) => !task.required || task.status === "complete",
    )
  ) {
    turnaround.status = "ready";
    turnaround.elapsedSeconds = turnaround.plannedDurationSeconds;
    turnaround.progress = 1;
    turnaround.actualReadySeconds =
      turnaround.actualStartSeconds + turnaround.plannedDurationSeconds;
    transitions.push({ type: "turnaround-ready" });
  }
  return transitions;
}

/**
 * Physical equipment can delay a task beyond its nominal offset. Once a task
 * starts, its own elapsed clock is authoritative; dependent work waits for the
 * recorded completion rather than a detached master timeline.
 */
function advanceResourceGatedTurnaround(
  turnaround: FlightTurnaroundState,
  nowSeconds: number,
  availableServices: ReadonlySet<TurnaroundServiceType>,
): TurnaroundTransition[] {
  const transitions: TurnaroundTransition[] = [];
  const actualStart = turnaround.actualStartSeconds!;
  const taskByType = new Map(turnaround.tasks.map((task) => [task.type, task]));
  for (const task of turnaround.tasks) {
    if (!task.required || task.status === "complete") continue;
    const dependenciesComplete = task.dependencies.every((dependency) => {
      const prerequisite = taskByType.get(dependency);
      return !prerequisite?.required || prerequisite.status === "complete";
    });
    const earliestStart = actualStart + task.scheduledStartOffsetSeconds;
    if (
      task.status === "waiting" &&
      nowSeconds + 1e-6 >= earliestStart &&
      dependenciesComplete &&
      availableServices.has(task.type)
    ) {
      task.status = "active";
      task.actualStartSeconds = nowSeconds;
      task.elapsedSeconds = 0;
      transitions.push({ type: "service-start", service: task.type });
    }
    if (task.status !== "active" || task.actualStartSeconds === undefined)
      continue;
    task.elapsedSeconds = round6(
      Math.max(
        0,
        Math.min(task.durationSeconds, nowSeconds - task.actualStartSeconds),
      ),
    );
    if (task.elapsedSeconds + 1e-6 < task.durationSeconds) continue;
    task.status = "complete";
    task.actualCompleteSeconds = task.actualStartSeconds + task.durationSeconds;
    transitions.push({ type: "service-complete", service: task.type });
  }

  const required = turnaround.tasks.filter((task) => task.required);
  const totalWork = required.reduce(
    (total, task) => total + task.durationSeconds,
    0,
  );
  const completedWork = required.reduce(
    (total, task) => total + task.elapsedSeconds,
    0,
  );
  turnaround.elapsedSeconds = round6(Math.max(0, nowSeconds - actualStart));
  turnaround.progress =
    totalWork <= 0 ? 1 : Math.max(0, Math.min(1, completedWork / totalWork));
  if (required.every((task) => task.status === "complete")) {
    turnaround.status = "ready";
    turnaround.progress = 1;
    turnaround.actualReadySeconds = Math.max(
      actualStart,
      ...required.map((task) => task.actualCompleteSeconds ?? nowSeconds),
    );
    turnaround.elapsedSeconds = round6(
      turnaround.actualReadySeconds - actualStart,
    );
    transitions.push({ type: "turnaround-ready" });
  }
  return transitions;
}

export function completeTurnaround(
  turnaround: FlightTurnaroundState,
  readySeconds: number,
): void {
  const startSeconds = readySeconds - turnaround.plannedDurationSeconds;
  turnaround.status = "ready";
  turnaround.actualStartSeconds = startSeconds;
  turnaround.actualReadySeconds = readySeconds;
  turnaround.elapsedSeconds = turnaround.plannedDurationSeconds;
  turnaround.progress = 1;
  turnaround.scheduledStartSeconds = startSeconds;
  turnaround.scheduledReadySeconds = readySeconds;
  for (const task of turnaround.tasks) {
    if (!task.required) continue;
    task.status = "complete";
    task.elapsedSeconds = task.durationSeconds;
    task.actualStartSeconds = startSeconds + task.scheduledStartOffsetSeconds;
    task.actualCompleteSeconds = task.actualStartSeconds + task.durationSeconds;
  }
}

export function releaseTurnaround(
  turnaround: FlightTurnaroundState,
  releasedAtSeconds: number,
): void {
  turnaround.status = "released";
  turnaround.releasedAtSeconds = releasedAtSeconds;
}

/**
 * Re-open only the fueling task for a flight that is still physically at the
 * stand. Completed cabin and ramp work stays complete; a new fuel truck and
 * the normal vehicle gate own the added dispatch fuel.
 */
export function requestAdditionalFuel(
  turnaround: FlightTurnaroundState,
  currentFuelPercent: number,
  targetFuelPercent: number,
  nowSeconds: number,
): boolean {
  const fueling = turnaround.tasks.find((task) => task.type === "fueling");
  const target = Math.min(96, Math.max(currentFuelPercent, targetFuelPercent));
  if (!fueling || target - currentFuelPercent < 1) return false;
  turnaround.status = "servicing";
  turnaround.actualReadySeconds = undefined;
  turnaround.releasedAtSeconds = undefined;
  turnaround.initialFuelPercent = currentFuelPercent;
  turnaround.targetFuelPercent = target;
  fueling.required = true;
  fueling.status = "waiting";
  fueling.elapsedSeconds = 0;
  fueling.actualStartSeconds = undefined;
  fueling.actualCompleteSeconds = undefined;
  fueling.scheduledStartOffsetSeconds = 0;
  fueling.dependencies = [];
  fueling.durationSeconds = round1(Math.max(8, 12 + (target - currentFuelPercent) * 0.45));
  fueling.reason = `dispatch fuel return to ${Math.round(target)}%`;
  turnaround.scheduledReadySeconds = Math.max(
    turnaround.scheduledReadySeconds,
    nowSeconds + fueling.durationSeconds,
  );
  turnaround.plannedDurationSeconds = Math.max(
    turnaround.plannedDurationSeconds,
    turnaround.elapsedSeconds + fueling.durationSeconds,
  );
  return true;
}

/**
 * Re-open only the boarding task for a ready passenger flight. This keeps the
 * completed technical and ramp work intact while returning the stand to the
 * normal passenger-service gate. Remote stands consequently receive the same
 * passenger coach reservation used during the original turn.
 */
export function requestPassengerReturn(
  turnaround: FlightTurnaroundState,
  nowSeconds: number,
): boolean {
  const boarding = turnaround.tasks.find((task) => task.type === "boarding");
  if (!boarding || !boarding.required) return false;
  turnaround.status = "servicing";
  turnaround.actualReadySeconds = undefined;
  turnaround.releasedAtSeconds = undefined;
  boarding.status = "waiting";
  boarding.elapsedSeconds = 0;
  boarding.actualStartSeconds = undefined;
  boarding.actualCompleteSeconds = undefined;
  boarding.scheduledStartOffsetSeconds = 0;
  boarding.dependencies = [];
  boarding.durationSeconds = round1(Math.max(12, boarding.durationSeconds));
  boarding.reason = "passenger return and controlled reboarding";
  turnaround.scheduledReadySeconds = Math.max(
    turnaround.scheduledReadySeconds,
    nowSeconds + boarding.durationSeconds,
  );
  turnaround.plannedDurationSeconds = Math.max(
    turnaround.plannedDurationSeconds,
    turnaround.elapsedSeconds + boarding.durationSeconds,
  );
  return true;
}

export function turnaroundFuelPercent(
  turnaround: FlightTurnaroundState,
): number {
  const fueling = turnaround.tasks.find((task) => task.type === "fueling");
  if (!fueling?.required) return turnaround.initialFuelPercent;
  const progress =
    fueling.durationSeconds <= 0
      ? 1
      : fueling.elapsedSeconds / fueling.durationSeconds;
  return (
    turnaround.initialFuelPercent +
    (turnaround.targetFuelPercent - turnaround.initialFuelPercent) * progress
  );
}

export function turnaroundBlockingServices(
  turnaround: FlightTurnaroundState,
): TurnaroundServiceType[] {
  return turnaround.tasks
    .filter((task) => task.required && task.status !== "complete")
    .map((task) => task.type);
}

function scheduleTaskOffsets(tasks: TurnaroundTaskState[]): void {
  const byType = new Map(tasks.map((task) => [task.type, task]));
  for (const type of SERVICE_ORDER) {
    const task = byType.get(type);
    if (!task?.required) continue;
    task.scheduledStartOffsetSeconds = round1(
      Math.max(
        0,
        ...task.dependencies.map((dependency) => {
          const prerequisite = byType.get(dependency);
          return prerequisite?.required
            ? prerequisite.scheduledStartOffsetSeconds +
                prerequisite.durationSeconds
            : 0;
        }),
      ),
    );
  }
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function round6(value: number): number {
  return Math.round(value * 1_000_000) / 1_000_000;
}

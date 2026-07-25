import type {
  AirportState,
  ControllerStation,
  Flight,
  FlightPhase,
  TrainingLessonId,
  TrainingState,
} from "./types";

export type TrainingCommandObservation = {
  action: string;
  accepted: boolean;
  reason: string;
  flightId?: number;
  station?: ControllerStation;
  targetStation?: ControllerStation;
};

export type TrainingCandidateKind =
  "arrival" | "departure-at-gate" | "departure-taxiing" | "any-active";

export type TrainingStepDefinition = {
  id: string;
  objective: string;
  why: string;
  hint: string;
  actions: string[];
  candidate?: TrainingCandidateKind;
  targetPhases?: FlightPhase[];
  station?: ControllerStation;
  targetStation?: ControllerStation;
  requireTarget?: boolean;
};

export type TrainingLessonDefinition = {
  id: TrainingLessonId;
  title: string;
  summary: string;
  estimatedMinutes: number;
  steps: TrainingStepDefinition[];
};

const LESSONS: readonly TrainingLessonDefinition[] = [
  {
    id: "arrival-basics",
    title: "Arrival foundations",
    summary:
      "Read an arrival strip, take Approach, manage speed, and authorize the instrument approach.",
    estimatedMinutes: 3,
    steps: [
      {
        id: "arrival-focus",
        objective: "Select an aircraft on approach.",
        why: "A controller must positively identify the flight before changing its clearance.",
        hint: "Choose a strip marked ARR or click an inbound aircraft on the map.",
        actions: ["focusFlight"],
        candidate: "arrival",
        targetPhases: ["approach"],
      },
      {
        id: "arrival-station",
        objective: "Take the Approach position.",
        why: "Approach owns vectors, speed, altitude, holds, and approach clearances before Tower.",
        hint: "Open Controls and set Station to Approach.",
        actions: ["setStation"],
        station: "approach",
      },
      {
        id: "arrival-speed",
        objective: "Assign the selected arrival a safe airspeed.",
        why: "Stable speed creates spacing and gives the crew a predictable final approach.",
        hint: "Open the selected flight actions and issue an airspeed near the suggested arrival value.",
        actions: ["assignAirspeed"],
        requireTarget: true,
        targetPhases: ["approach"],
      },
      {
        id: "arrival-approach",
        objective: "Clear the selected aircraft for its assigned approach.",
        why: "An approach clearance authorizes the published final path; it is not yet a landing clearance.",
        hint: "Use “Clear approach” in the selected flight actions.",
        actions: ["clearApproach"],
        requireTarget: true,
        targetPhases: ["approach"],
      },
    ],
  },
  {
    id: "tower-landing",
    title: "Tower landing sequence",
    summary:
      "Coordinate an inbound aircraft to Tower and issue a runway-specific landing clearance.",
    estimatedMinutes: 4,
    steps: [
      {
        id: "tower-focus",
        objective: "Select an arrival that is still owned by Approach.",
        why: "Tower cannot clear an aircraft it does not own; coordination comes before runway authority.",
        hint: "Choose an inbound strip marked ARR.",
        actions: ["focusFlight"],
        candidate: "arrival",
        targetPhases: ["approach"],
      },
      {
        id: "tower-supervisor",
        objective: "Take the Supervisor position for this guided handoff.",
        why: "Supervisor can demonstrate both sides of coordination without making you switch desks repeatedly.",
        hint: "Open Controls and set Station to Supervisor.",
        actions: ["setStation"],
        station: "supervisor",
      },
      {
        id: "tower-offer",
        objective: "Offer the selected arrival to Tower.",
        why: "The receiving controller must see and accept the track before frequency ownership changes.",
        hint: "Use Offer Tower in the selected flight’s coordination actions.",
        actions: ["offerHandoff", "handoffFlight"],
        requireTarget: true,
        targetStation: "tower",
      },
      {
        id: "tower-accept",
        objective: "Accept Tower’s incoming handoff.",
        why: "Acceptance reserves controller attention; the aircraft remains on the sending frequency for now.",
        hint: "Use Accept handoff in the coordination inbox or selected flight actions.",
        actions: ["acceptHandoff"],
        requireTarget: true,
      },
      {
        id: "tower-contact",
        objective: "Issue contact Tower to complete the transfer.",
        why: "Only the contact instruction changes the aircraft’s frequency owner.",
        hint: "Use Contact Tower after the handoff shows Accepted.",
        actions: ["contactStation"],
        requireTarget: true,
        targetStation: "tower",
      },
      {
        id: "tower-station",
        objective: "Take the Tower position.",
        why: "Tower owns landing, runway entry, crossing, and takeoff clearances.",
        hint: "Open Controls and set Station to Tower.",
        actions: ["setStation"],
        station: "tower",
      },
      {
        id: "tower-clear-land",
        objective: "Clear the selected arrival to land on its assigned runway.",
        why: "The runway-specific landing clearance is the final authorization after ownership and safety checks.",
        hint: "Use Clear to land. If the runway is protected, wait for the safety reason to clear.",
        actions: ["clearFlight"],
        requireTarget: true,
        targetPhases: ["approach"],
      },
    ],
  },
  {
    id: "surface-flow",
    title: "Ramp and surface flow",
    summary:
      "Release a ready departure, assign pavement routing, then practice a controlled stop and restart.",
    estimatedMinutes: 4,
    steps: [
      {
        id: "surface-focus",
        objective: "Select a departure that is ready at a stand.",
        why: "Pushback begins at the ramp boundary and must wait for services and the alley to clear.",
        hint: "Choose a DEP strip showing Ready or Await push.",
        actions: ["focusFlight"],
        candidate: "departure-at-gate",
        targetPhases: ["resting"],
      },
      {
        id: "surface-supervisor",
        objective: "Take the Supervisor position.",
        why: "This lesson crosses Ramp and Ground authority while keeping one guided control position.",
        hint: "Open Controls and set Station to Supervisor.",
        actions: ["setStation"],
        station: "supervisor",
      },
      {
        id: "surface-push",
        objective: "Clear the selected departure to push back.",
        why: "The clearance is accepted only when turnaround equipment, stand geometry, and downstream capacity are safe.",
        hint: "Use Clear pushback. A rejection explains the exact service or movement-area blocker.",
        actions: ["clearPushback"],
        requireTarget: true,
        targetPhases: ["resting"],
      },
      {
        id: "surface-route",
        objective:
          "Assign the departure its safe taxi route once it enters taxi-out.",
        why: "A route clearance binds the aircraft to named pavement and its real runway-crossing holds.",
        hint: "Wait for taxi-out, then use Assign taxi route; the proposed graph route remains on pavement.",
        actions: ["assignTaxiRoute"],
        requireTarget: true,
        targetPhases: ["taxi-out"],
      },
      {
        id: "surface-hold",
        objective: "Issue hold position to the taxiing departure.",
        why: "Ground stops traffic by normal deceleration before an occupied segment or changing clearance.",
        hint: "Use Hold position while the aircraft is taxiing.",
        actions: ["holdPosition"],
        requireTarget: true,
        targetPhases: ["taxi-out"],
      },
      {
        id: "surface-resume",
        objective: "Release the controller hold and resume taxi.",
        why: "A deliberate resume distinguishes your clearance from automatic safety holds, which remain protected.",
        hint: "Use Resume taxi after the aircraft has acknowledged the hold.",
        actions: ["resumeTaxi"],
        requireTarget: true,
        targetPhases: ["taxi-out"],
      },
    ],
  },
  {
    id: "handoff-workflow",
    title: "Controller handoff workflow",
    summary:
      "Practice offer, acceptance, and contact as three separate, auditable instructions.",
    estimatedMinutes: 3,
    steps: [
      {
        id: "handoff-focus",
        objective: "Select any active aircraft with a next controller.",
        why: "Handoffs follow the aircraft’s actual phase and frequency owner, not an arbitrary desk choice.",
        hint: "An arrival on Approach is the simplest choice; its next controller is Tower.",
        actions: ["focusFlight"],
        candidate: "arrival",
      },
      {
        id: "handoff-supervisor",
        objective: "Take the Supervisor position.",
        why: "Supervisor lets this lesson model both controllers while preserving the same authority checks.",
        hint: "Open Controls and set Station to Supervisor.",
        actions: ["setStation"],
        station: "supervisor",
      },
      {
        id: "handoff-offer",
        objective: "Offer the selected aircraft to its next controller.",
        why: "An offer starts coordination but does not transfer frequency ownership.",
        hint: "Use the station suggested in the selected flight’s coordination actions.",
        actions: ["offerHandoff", "handoffFlight"],
        requireTarget: true,
      },
      {
        id: "handoff-accept",
        objective: "Accept the pending handoff.",
        why: "The receiving controller explicitly accepts responsibility before contact is issued.",
        hint: "Use Accept handoff while the coordination state is Offered or Overdue.",
        actions: ["acceptHandoff"],
        requireTarget: true,
      },
      {
        id: "handoff-contact",
        objective: "Issue contact to the coordinated controller.",
        why: "Contact completes the transfer and updates the authoritative frequency owner.",
        hint: "Use the Contact action shown after acceptance.",
        actions: ["contactStation"],
        requireTarget: true,
      },
    ],
  },
] as const;

const OPERATIONAL_ACTIONS = new Set(
  LESSONS.flatMap((lesson) => lesson.steps.flatMap((step) => step.actions)),
);

export function createInactiveTrainingState(): TrainingState {
  return {
    status: "inactive",
    lessonId: null,
    stepIndex: 0,
    targetFlightId: null,
    completedStepIds: [],
    skippedStepIds: [],
    startedAtSeconds: 0,
    stepStartedAtSeconds: 0,
    mistakeCount: 0,
    recoveryCount: 0,
    hintCount: 0,
    feedback: null,
    noFail: true,
  };
}

export function trainingLessons(): readonly TrainingLessonDefinition[] {
  return LESSONS;
}

export function trainingLesson(
  id: TrainingLessonId | null,
): TrainingLessonDefinition | null {
  return LESSONS.find((lesson) => lesson.id === id) ?? null;
}

export function currentTrainingStep(
  training: TrainingState,
): TrainingStepDefinition | null {
  return trainingLesson(training.lessonId)?.steps[training.stepIndex] ?? null;
}

export function isTrainingOperationalAction(action: string): boolean {
  return OPERATIONAL_ACTIONS.has(action);
}

export function trainingCandidate(
  state: AirportState,
  kind: TrainingCandidateKind,
): Flight | null {
  const flights = state.flights.filter(
    (flight) => flight.emergency !== "disabled" && !flight.diversion,
  );
  if (kind === "arrival") {
    return (
      flights.find(
        (flight) =>
          flight.flightPlan.direction === "arrival" &&
          flight.phase === "approach",
      ) ?? null
    );
  }
  if (kind === "departure-at-gate") {
    return (
      flights.find(
        (flight) =>
          flight.flightPlan.direction === "departure" &&
          flight.phase === "resting" &&
          flight.turnaround.status === "ready",
      ) ??
      flights.find(
        (flight) =>
          flight.flightPlan.direction === "departure" &&
          flight.phase === "resting",
      ) ??
      null
    );
  }
  if (kind === "departure-taxiing") {
    return (
      flights.find(
        (flight) =>
          flight.flightPlan.direction === "departure" &&
          flight.phase === "taxi-out",
      ) ?? null
    );
  }
  return flights[0] ?? null;
}

export function trainingObservationCompletesStep(
  state: AirportState,
  step: TrainingStepDefinition,
  observation: TrainingCommandObservation,
): boolean {
  if (!observation.accepted || !step.actions.includes(observation.action))
    return false;
  if (step.station !== undefined && observation.station !== step.station)
    return false;
  if (
    step.targetStation !== undefined &&
    observation.targetStation !== step.targetStation
  )
    return false;
  if (
    step.requireTarget &&
    observation.flightId !== state.training.targetFlightId
  )
    return false;
  if (step.candidate !== undefined) {
    const flight =
      observation.flightId === undefined
        ? null
        : (state.flights.find(
            (candidate) => candidate.id === observation.flightId,
          ) ?? null);
    if (
      !flight ||
      trainingCandidate({ ...state, flights: [flight] }, step.candidate)?.id !==
        flight.id
    )
      return false;
  }
  if (step.targetPhases?.length && observation.flightId !== undefined) {
    const flight = state.flights.find(
      (candidate) => candidate.id === observation.flightId,
    );
    if (!flight || !step.targetPhases.includes(flight.phase)) return false;
  }
  return true;
}

export function trainingContext(state: AirportState): string {
  const step = currentTrainingStep(state.training);
  if (!step)
    return state.training.status === "complete"
      ? "Lesson complete. Continue the shift or choose another lesson."
      : "No active lesson.";
  const target =
    state.training.targetFlightId === null
      ? null
      : (state.flights.find(
          (flight) => flight.id === state.training.targetFlightId,
        ) ?? null);
  if (step.requireTarget && !target)
    return "The original target left the lesson state. Select a new eligible aircraft to recover safely.";
  if (
    target &&
    step.targetPhases?.length &&
    !step.targetPhases.includes(target.phase)
  ) {
    return `${target.callsign} is now ${target.phase.replace("-", " ")}. Retry this step to return to its checkpoint.`;
  }
  if (target)
    return `${target.callsign} · ${target.phase.replace("-", " ")} · ${Math.round(target.kinematics.airspeedKts)} kt · ${Math.round(target.kinematics.altitudeFt)} ft`;
  if (step.candidate) {
    const candidate = trainingCandidate(state, step.candidate);
    return candidate
      ? `Suggested: ${candidate.callsign} · ${candidate.phase.replace("-", " ")}`
      : "Waiting for an eligible aircraft; the simulation remains safe and the lesson does not fail.";
  }
  return `Active station: ${state.station[0].toUpperCase()}${state.station.slice(1)}`;
}

export function cloneTrainingState(training: TrainingState): TrainingState {
  return {
    ...training,
    completedStepIds: [...training.completedStepIds],
    skippedStepIds: [...training.skippedStepIds],
  };
}

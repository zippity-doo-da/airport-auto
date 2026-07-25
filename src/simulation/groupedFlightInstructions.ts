import {
  requiredControllerStation,
  stationCanIssue,
} from "./controllerOperations";
import type {
  ControllerStation,
  Flight,
  FlightInstruction,
  GroupFlightInstruction,
  GroupInstructionDomain,
  GroupInstructionPreview,
  OperationalControllerStation,
} from "./types";

export const MAX_GROUPED_FLIGHTS = 8;

export function isGroupFlightInstruction(
  instruction: FlightInstruction,
): instruction is GroupFlightInstruction {
  return (
    instruction === "hold" ||
    instruction === "resume" ||
    instruction === "slow" ||
    instruction === "normal"
  );
}

function domainForFlight(flight: Flight): GroupInstructionDomain | null {
  if (
    flight.phase === "approach" &&
    !flight.goAround &&
    !flight.diversion &&
    !flight.navigation.hold
  )
    return "airborne";
  if (flight.phase === "taxi-in" || flight.phase === "taxi-out")
    return "surface";
  return null;
}

function authorityForFlight(
  flight: Flight,
  domain: GroupInstructionDomain,
): OperationalControllerStation | null {
  if (domain === "airborne")
    return requiredControllerStation(flight) === "approach" ? "approach" : null;
  const station = requiredControllerStation(flight);
  return station === "ground" || station === "ramp" ? station : null;
}

function rejected(
  instruction: FlightInstruction,
  requestedFlightIds: readonly number[],
  flights: readonly Flight[],
  reason: string,
  domain: GroupInstructionDomain | null = null,
  authority: OperationalControllerStation | null = null,
): GroupInstructionPreview {
  return {
    instruction,
    requestedFlightIds: [...requestedFlightIds],
    flightIds: flights.map((flight) => flight.id),
    callsigns: flights.map((flight) => flight.callsign),
    safeToIssue: false,
    reason,
    domain,
    authority,
    safeguards: [],
  };
}

/**
 * Non-mutating compatibility check for a shared instruction. Group commands
 * are deliberately narrower than single-flight controls: every aircraft must
 * share one domain, one authority, and one instruction that cannot create an
 * immediate runway or separation clearance.
 */
export function buildGroupInstructionPreview(
  activeFlights: readonly Flight[],
  requestedFlightIds: readonly number[],
  instruction: FlightInstruction,
  selectedStation: ControllerStation,
): GroupInstructionPreview {
  if (requestedFlightIds.length < 2)
    return rejected(
      instruction,
      requestedFlightIds,
      [],
      "select between 2 and 8 active flights",
    );
  if (requestedFlightIds.length > MAX_GROUPED_FLIGHTS) {
    return rejected(
      instruction,
      requestedFlightIds,
      [],
      `group commands are limited to ${MAX_GROUPED_FLIGHTS} flights`,
    );
  }
  if (requestedFlightIds.some((id) => !Number.isInteger(id) || id <= 0)) {
    return rejected(
      instruction,
      requestedFlightIds,
      [],
      "every grouped flight ID must be a positive integer",
    );
  }
  const uniqueIds = [...new Set(requestedFlightIds)];
  if (uniqueIds.length !== requestedFlightIds.length) {
    return rejected(
      instruction,
      requestedFlightIds,
      [],
      "the grouped flight list contains a duplicate ID",
    );
  }
  if (!isGroupFlightInstruction(instruction)) {
    return rejected(
      instruction,
      requestedFlightIds,
      [],
      `${instruction} is single-flight only; grouped commands may hold, resume, slow, or normalize`,
    );
  }

  const byId = new Map(activeFlights.map((flight) => [flight.id, flight]));
  const flights = uniqueIds
    .map((id) => byId.get(id))
    .filter((flight): flight is Flight => flight !== undefined);
  if (flights.length !== uniqueIds.length) {
    const missing = uniqueIds.filter((id) => !byId.has(id));
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `inactive or unknown flight${missing.length === 1 ? "" : "s"}: ${missing.join(", ")}`,
    );
  }

  const unowned = flights.filter(
    (flight) =>
      selectedStation !== "supervisor" &&
      flight.navigation.frequencyOwner !== selectedStation,
  );
  if (unowned.length) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `${selectedStation} does not own ${unowned.map((flight) => flight.callsign).join(", ")}`,
    );
  }

  const domains = flights.map(domainForFlight);
  if (domains.some((domain) => domain === null)) {
    const incompatible = flights.filter((_, index) => domains[index] === null);
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `${incompatible.map((flight) => flight.callsign).join(", ")} cannot receive a grouped instruction in the current phase`,
    );
  }
  const domain = domains[0] as GroupInstructionDomain;
  if (domains.some((candidate) => candidate !== domain)) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      "selected flights mix airborne and surface control domains",
    );
  }
  if (
    (instruction === "hold" || instruction === "resume") &&
    domain !== "surface"
  ) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `${instruction} is available only to aircraft taxiing on the surface`,
      domain,
    );
  }

  const authorities = flights.map((flight) =>
    authorityForFlight(flight, domain),
  );
  if (authorities.some((authority) => authority === null)) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      "one or more flights are at a runway or controller boundary and require an individual clearance",
      domain,
    );
  }
  const authority = authorities[0] as OperationalControllerStation;
  if (authorities.some((candidate) => candidate !== authority)) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      "selected flights do not share the same controller authority",
      domain,
    );
  }
  if (!stationCanIssue(selectedStation, authority)) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `${selectedStation} station cannot issue a ${authority} group command`,
      domain,
      authority,
    );
  }

  if (instruction === "hold") {
    const alreadyHeld = flights.filter((flight) => flight.controlHold);
    if (alreadyHeld.length) {
      return rejected(
        instruction,
        requestedFlightIds,
        flights,
        `${alreadyHeld.map((flight) => flight.callsign).join(", ")} already has a controller hold`,
        domain,
        authority,
      );
    }
  }
  if (instruction === "resume") {
    const notHeld = flights.filter((flight) => !flight.controlHold);
    if (notHeld.length) {
      return rejected(
        instruction,
        requestedFlightIds,
        flights,
        `${notHeld.map((flight) => flight.callsign).join(", ")} has no controller hold to release`,
        domain,
        authority,
      );
    }
  }
  const requestedPace =
    instruction === "slow" ? 0.55 : instruction === "normal" ? 1 : null;
  if (
    requestedPace !== null &&
    flights.every(
      (flight) => Math.abs((flight.controlPace ?? 1) - requestedPace) < 0.01,
    )
  ) {
    return rejected(
      instruction,
      requestedFlightIds,
      flights,
      `every selected flight is already at ${instruction} pace`,
      domain,
      authority,
    );
  }

  const safeguards =
    domain === "surface"
      ? ["surface reservations and runway protection remain authoritative"]
      : [
          "physical separation alerts and automatic safety holds remain authoritative",
        ];
  if (instruction === "hold")
    safeguards.push(
      "aircraft decelerate with normal braking instead of stopping instantly",
    );
  if (
    instruction === "resume" &&
    flights.some((flight) => flight.automaticHold || flight.safetyHold)
  ) {
    safeguards.push(
      "automatic or safety holds remain in force after the controller hold is released",
    );
  }

  return {
    instruction,
    requestedFlightIds: [...requestedFlightIds],
    flightIds: flights.map((flight) => flight.id),
    callsigns: flights.map((flight) => flight.callsign),
    safeToIssue: true,
    reason: `${instruction} is compatible for ${flights.length} ${domain} flight${flights.length === 1 ? "" : "s"} under ${authority}`,
    domain,
    authority,
    safeguards,
  };
}

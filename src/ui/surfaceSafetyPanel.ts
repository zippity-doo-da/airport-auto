import type {
  SurfaceSafetySnapshot,
  SurfaceTrack,
  SurfaceVehicleTrack,
} from "../simulation/surfaceSafety";

export interface SurfaceSafetyPanelElements {
  panel: HTMLElement;
  tracks: HTMLElement;
  vehicles: HTMLElement;
  advisories: HTMLElement;
  movers: HTMLElement;
  protectedRunways: HTMLElement;
  holds: HTMLElement;
}

export type SurfaceSafetyFilter =
  | "all"
  | "tower"
  | "ground"
  | "ramp"
  | "supervisor"
  | "watch";

export function surfaceSafetyPanelKey(snapshot: SurfaceSafetySnapshot): string {
  return [
    Math.floor(snapshot.generatedAtSeconds),
    snapshot.protectedRunwayOccupancy,
    snapshot.heldTracks,
    snapshot.tracks
      .map(
        (track) =>
          `${track.id}:${track.state}:${track.location}:${track.groundspeedKts}`,
      )
      .join(","),
    snapshot.vehicles
      .map(
        (vehicle) =>
          `${vehicle.id}:${vehicle.state}:${vehicle.location}:${vehicle.groundspeedKts}`,
      )
      .join(","),
    snapshot.advisories
      .map(
        (advisory) =>
          `${advisory.id}:${advisory.severity}:${advisory.status}:${advisory.etaSeconds}:${advisory.firstSeenAtSeconds}:${advisory.resolvedAtSeconds ?? "active"}:${advisory.acknowledgedAtSeconds ?? "none"}`,
      )
      .join(","),
  ].join("|");
}

export function renderSurfaceSafetyPanel(
  elements: SurfaceSafetyPanelElements,
  snapshot: SurfaceSafetySnapshot,
  focusedFlightId: number | null,
  filter: SurfaceSafetyFilter,
): void {
  elements.movers.textContent = String(
    snapshot.tracks.filter((track) => track.state !== "parked").length,
  );
  elements.protectedRunways.textContent = String(
    snapshot.protectedRunwayOccupancy,
  );
  elements.holds.textContent = String(snapshot.heldTracks);
  const visibleTracks = surfaceSafetyTracksForFilter(snapshot, filter);
  const visibleVehicles = surfaceSafetyVehiclesForFilter(snapshot, filter);
  elements.tracks.replaceChildren(
    ...visibleTracks
      .slice(0, 10)
      .map((track) => trackRow(track, focusedFlightId)),
  );
  if (!visibleTracks.length) {
    const empty = document.createElement("small");
    empty.className = "surface-safety__clear";
    empty.textContent = "No tracks match this station view.";
    elements.tracks.append(empty);
  }
  elements.vehicles.replaceChildren(
    ...visibleVehicles.slice(0, 8).map(vehicleRow),
  );
  if (!visibleVehicles.length) {
    const empty = document.createElement("small");
    empty.className = "surface-safety__clear";
    empty.textContent = "No active service vehicles.";
    elements.vehicles.append(empty);
  }
  elements.advisories.replaceChildren(...snapshot.advisories.map(advisoryRow));
  if (!snapshot.advisories.length) {
    const clear = document.createElement("small");
    clear.className = "surface-safety__clear";
    clear.textContent = "No active surface forecasts.";
    elements.advisories.append(clear);
  }
}

/**
 * Returns the flights relevant to a control position without reading renderer
 * state. Keeping this selection pure lets the panel, API, and tests share the
 * exact same operational picture.
 */
export function surfaceSafetyTracksForFilter(
  snapshot: SurfaceSafetySnapshot,
  filter: SurfaceSafetyFilter,
): SurfaceTrack[] {
  return snapshot.tracks.filter((track) => trackMatchesFilter(track, filter));
}

/** Returns the service vehicles relevant to a control position. */
export function surfaceSafetyVehiclesForFilter(
  snapshot: SurfaceSafetySnapshot,
  filter: SurfaceSafetyFilter,
): SurfaceVehicleTrack[] {
  return snapshot.vehicles.filter((vehicle) =>
    vehicleMatchesFilter(vehicle, filter),
  );
}

function trackMatchesFilter(
  track: SurfaceTrack,
  filter: SurfaceSafetyFilter,
): boolean {
  if (filter === "all") return true;
  if (filter === "tower")
    return (
      track.protectedRunway ||
      track.state === "hold-short" ||
      track.state === "safety-hold"
    );
  if (filter === "ground") return track.state !== "parked";
  if (filter === "supervisor") {
    // Supervisor needs the active movement picture plus every exception that
    // can consume capacity; ordinary quiet parked stands stay out of the way.
    return track.state !== "parked" || track.protectedRunway;
  }
  if (filter === "watch") {
    // Watch is an ambient, read-only presentation: keep only motion, not a
    // wall of parked aircraft or controller exception states.
    return track.state === "taxiing" || track.state === "protected-runway";
  }
  return (
    track.state === "parked" ||
    track.location.startsWith("Ramp") ||
    track.location.startsWith("Apron")
  );
}

function vehicleMatchesFilter(
  vehicle: SurfaceVehicleTrack,
  filter: SurfaceSafetyFilter,
): boolean {
  if (filter === "all" || filter === "ground") return true;
  if (filter === "tower") return vehicle.protectedMovementArea || vehicle.held;
  if (filter === "supervisor") return vehicle.state !== "scheduled" && vehicle.state !== "complete";
  if (filter === "watch") {
    return ["dispatching", "approaching", "clearing", "returning", "servicing"].includes(vehicle.state);
  }
  return !vehicle.protectedMovementArea;
}

function trackRow(
  track: SurfaceTrack,
  focusedFlightId: number | null,
): HTMLButtonElement {
  const row = document.createElement("button");
  row.type = "button";
  row.className = "surface-safety__track";
  row.dataset.flightId = String(track.id);
  row.dataset.state = track.state;
  row.setAttribute("aria-pressed", String(track.id === focusedFlightId));
  row.innerHTML = `<b>${escapeHtml(track.callsign)}</b><i>${trackStateLabel(track)}</i><span>${escapeHtml(track.location)} · ${track.groundspeedKts} kt · ${track.headingDegrees.toString().padStart(3, "0")}°</span><small>${escapeHtml(track.routeIntent)} · ${escapeHtml(track.clearanceSummary)} · ${track.surveillanceAgeSeconds}s track age</small>`;
  return row;
}

function advisoryRow(
  advisory: SurfaceSafetySnapshot["advisories"][number],
): HTMLElement {
  const row = document.createElement("div");
  row.className = "surface-safety__advisory";
  row.dataset.severity = advisory.severity;
  row.dataset.status = advisory.status;
  const eta = advisory.etaSeconds > 0 ? ` · ETA ${advisory.etaSeconds}s` : "";
  const age = Math.max(
    0,
    Math.round(advisory.lastSeenAtSeconds - advisory.firstSeenAtSeconds),
  );
  const detail = document.createElement("span");
  detail.textContent = `${advisory.status === "resolved" ? "RESOLVED" : advisory.severity.toUpperCase()}${eta} · ${age}s — ${advisory.detail}`;
  row.append(detail);
  if (advisory.acknowledgedAtSeconds !== undefined) {
    const acknowledgment = document.createElement("small");
    acknowledgment.className = "surface-safety__acknowledged";
    acknowledgment.textContent = "ACK";
    row.append(acknowledgment);
  } else if (advisory.status === "active" && advisory.severity !== "critical") {
    const acknowledge = document.createElement("button");
    acknowledge.type = "button";
    acknowledge.className = "surface-safety__acknowledge";
    acknowledge.dataset.advisoryId = advisory.id;
    acknowledge.textContent = "Ack";
    acknowledge.setAttribute("aria-label", `Acknowledge ${advisory.detail}`);
    row.append(acknowledge);
  }
  return row;
}

function vehicleRow(vehicle: SurfaceVehicleTrack): HTMLElement {
  const row = document.createElement("div");
  row.className = "surface-safety__vehicle";
  row.dataset.state = vehicle.state;
  row.textContent = `${vehicle.callsign} · ${vehicle.location} · ${vehicle.groundspeedKts} kt · ${vehicle.state.replace("-", " ")}`;
  return row;
}

function trackStateLabel(track: SurfaceTrack): string {
  switch (track.state) {
    case "safety-hold":
      return "Safety hold";
    case "hold-short":
      return "Hold short";
    case "controller-hold":
      return "Held";
    case "protected-runway":
      return "Runway";
    case "taxiing":
      return "Taxi";
    default:
      return "Stand";
  }
}

function escapeHtml(value: string): string {
  return value.replace(
    /[&<>'"]/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[
        character
      ] ?? character,
  );
}

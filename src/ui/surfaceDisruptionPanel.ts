import type { AirportConfig } from "../simulation/airportConfig";
import type {
  ControllerStation,
  SurfaceDisruptionKind,
  SurfaceDisruptionState,
} from "../simulation/types";

type UserSurfaceDisruptionKind = Exclude<
  SurfaceDisruptionKind,
  "disabled-aircraft"
>;

export interface SurfaceDisruptionPanelElements {
  kind: HTMLSelectElement;
  target: HTMLSelectElement;
  duration: HTMLSelectElement;
  apply: HTMLButtonElement;
  list: HTMLElement;
}

export interface SurfaceDisruptionPanelState {
  airportCode: string;
  elapsed: number;
  station: ControllerStation;
  replayMode: boolean;
  disruptions: readonly SurfaceDisruptionState[];
  canRecover: boolean;
  namedIncidentSelected: boolean;
}

export function updateSurfaceDisruptionTargetOptions(
  config: AirportConfig,
  kind: UserSurfaceDisruptionKind,
  targetElement: HTMLSelectElement,
): void {
  const previous = targetElement.value;
  const targets =
    kind === "runway-closure"
      ? config.runways
          .filter((runway) => runway.role !== "inactive")
          .map((runway) => ({
            value: String(runway.id),
            label: `Runway ${runway.designation?.join("/") ?? runway.id}`,
          }))
      : config.surfaceGraph.taxiways
          .filter((taxiway) => taxiway.edgeIds.length > 0)
          .filter(
            (taxiway) =>
              taxiway.sourceKind !== "taxilane" || kind === "construction",
          )
          .sort((first, second) =>
            (first.reference ?? first.name).localeCompare(
              second.reference ?? second.name,
            ),
          )
          .map((taxiway) => ({ value: taxiway.id, label: taxiway.name }));
  targetElement.replaceChildren(
    ...targets.map((target) => {
      const option = document.createElement("option");
      option.value = target.value;
      option.textContent = target.label;
      return option;
    }),
  );
  if (targets.some((target) => target.value === previous))
    targetElement.value = previous;
}

export function surfaceDisruptionPanelKey(
  state: SurfaceDisruptionPanelState,
  selectedKind: string,
): string {
  return [
    state.airportCode,
    selectedKind,
    state.station,
    state.replayMode,
    ...state.disruptions.map((disruption) =>
      [
        disruption.id,
        disruption.status,
        disruption.responsePhase ?? "none",
        Math.floor(disruption.recoveryProgress * 20),
        Math.max(
          0,
          Math.ceil(
            (disruption.expectedClearAtSeconds ?? state.elapsed) -
              state.elapsed,
          ),
        ),
        disruption.reroutedFlightIds.join(","),
      ].join(":"),
    ),
  ].join("|");
}

export function renderSurfaceDisruptionPanel(
  elements: SurfaceDisruptionPanelElements,
  state: SurfaceDisruptionPanelState,
): void {
  const supervisor = state.station === "supervisor";
  elements.apply.disabled =
    state.replayMode || !supervisor || !elements.target.value;
  elements.target.disabled = state.replayMode || !supervisor;
  elements.kind.disabled = state.replayMode || !supervisor;
  elements.duration.disabled =
    state.replayMode || !supervisor || state.namedIncidentSelected;
  elements.apply.textContent = state.namedIncidentSelected
    ? "Start incident"
    : "Restrict";

  if (!state.disruptions.length) {
    const empty = document.createElement("small");
    empty.textContent = "All movement surfaces available.";
    elements.list.replaceChildren(empty);
    return;
  }
  const rows = state.disruptions.map((disruption) => {
    const row = document.createElement("div");
    row.className = "surface-disruptions__item";
    const copy = document.createElement("span");
    const title = document.createElement("b");
    title.textContent = disruption.label;
    const remaining =
      disruption.expectedClearAtSeconds === undefined
        ? ""
        : ` · ${Math.max(0, Math.ceil(disruption.expectedClearAtSeconds - state.elapsed))}s`;
    const detail = document.createElement("small");
    const response =
      disruption.responsePhase === "en-route"
        ? `${disruption.responseVehicleLabel ?? "Response unit"} en route · ${Math.round(disruption.recoveryProgress * 100)}%`
        : disruption.responsePhase === "inspecting"
          ? `${disruption.responseVehicleLabel ?? "Response unit"} inspecting · ${Math.round(disruption.recoveryProgress * 100)}%`
          : disruption.responsePhase === "ready-to-reopen"
            ? "Inspection complete · reopen ready"
            : disruption.status.replace("-", " ");
    detail.textContent = `${response}${remaining} · ${disruption.reroutedFlightIds.length} rerouted`;
    detail.title = disruption.reason;
    copy.append(title, detail);
    const button = document.createElement("button");
    button.type = "button";
    if (disruption.kind === "disabled-aircraft") {
      button.textContent =
        disruption.status === "recovering"
          ? `${Math.round(disruption.recoveryProgress * 100)}%`
          : "Recover";
      if (disruption.flightId !== undefined)
        button.dataset.recoverFlight = String(disruption.flightId);
      button.disabled =
        state.replayMode ||
        disruption.status === "recovering" ||
        !state.canRecover;
    } else {
      button.textContent =
        disruption.responsePhase === "ready-to-reopen"
          ? "Reopen"
          : disruption.responsePhase === "en-route"
            ? "En route"
            : disruption.responsePhase === "inspecting"
              ? "Inspecting"
              : "Reopen";
      button.dataset.clearDisruption = disruption.id;
      button.disabled =
        state.replayMode ||
        !supervisor ||
        (disruption.responsePhase !== undefined &&
          disruption.responsePhase !== "ready-to-reopen");
    }
    row.append(copy, button);
    return row;
  });
  elements.list.replaceChildren(...rows);
}

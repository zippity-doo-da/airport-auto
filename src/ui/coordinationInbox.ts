import type { ControllerStation, Flight, FlightHandoffState } from '../simulation/types';

const ACTIVE_HANDOFF_STATUSES = new Set<FlightHandoffState['status']>(['offered', 'accepted', 'overdue']);

export interface CoordinationInboxOptions {
  flights: readonly Flight[];
  station: ControllerStation;
  elapsedSeconds: number;
  enabled: boolean;
  readOnly: boolean;
}

export function coordinationInboxKey(options: CoordinationInboxOptions): string {
  return [
    options.enabled,
    options.readOnly,
    options.station,
    Math.floor(options.elapsedSeconds),
    ...coordinationFlights(options).map(({ flight, handoff }) => (
      `${flight.id}:${handoff.revision}:${handoff.status}:${handoff.from}:${handoff.to}`
    )),
  ].join('|');
}

export function renderCoordinationInbox(container: HTMLElement, options: CoordinationInboxOptions): void {
  const entries = coordinationFlights(options);
  container.hidden = !options.enabled || entries.length === 0;
  if (container.hidden) {
    container.replaceChildren();
    return;
  }

  const header = document.createElement('header');
  const title = document.createElement('b');
  title.textContent = options.station === 'supervisor' ? 'Coordination desk' : `${capitalized(options.station)} coordination`;
  const count = document.createElement('span');
  count.textContent = `${entries.length} ${entries.length === 1 ? 'request' : 'requests'}`;
  header.append(title, count);

  const list = document.createElement('div');
  list.className = 'coordination-inbox__list';
  for (const { flight, handoff } of entries) list.append(coordinationCard(flight, handoff, options));
  container.replaceChildren(header, list);
}

function coordinationFlights(options: CoordinationInboxOptions): Array<{ flight: Flight; handoff: FlightHandoffState }> {
  if (!options.enabled) return [];
  return options.flights
    .flatMap((flight) => {
      const handoff = flight.navigation.handoff;
      if (!handoff || !ACTIVE_HANDOFF_STATUSES.has(handoff.status)) return [];
      if (options.station !== 'supervisor' && handoff.from !== options.station && handoff.to !== options.station) return [];
      return [{ flight, handoff }];
    })
    .sort((first, second) => (
      statusPriority(first.handoff.status) - statusPriority(second.handoff.status)
      || first.handoff.responseDueSeconds - second.handoff.responseDueSeconds
      || first.flight.id - second.flight.id
    ));
}

function coordinationCard(
  flight: Flight,
  handoff: FlightHandoffState,
  options: CoordinationInboxOptions,
): HTMLElement {
  const card = document.createElement('article');
  card.className = 'coordination-card';
  card.dataset.status = handoff.status;

  const identity = document.createElement('div');
  identity.className = 'coordination-card__identity';
  const callsign = document.createElement('b');
  callsign.textContent = flight.callsign;
  const route = document.createElement('span');
  route.textContent = `${capitalized(handoff.from)} → ${capitalized(handoff.to)}`;
  identity.append(callsign, route);

  const state = document.createElement('div');
  state.className = 'coordination-card__state';
  const status = document.createElement('strong');
  status.textContent = handoff.status === 'accepted' ? 'Accepted' : handoff.status === 'overdue' ? 'Overdue' : 'Offered';
  const timing = document.createElement('small');
  timing.textContent = timingLabel(handoff, options.elapsedSeconds);
  state.append(status, timing);

  const controls = document.createElement('div');
  controls.className = 'coordination-card__controls';
  addButton(controls, 'focus', 'Focus', flight.id, handoff.to, false);
  const targetDesk = options.station === 'supervisor' || options.station === handoff.to;
  const sourceDesk = options.station === 'supervisor' || options.station === handoff.from;
  if ((handoff.status === 'offered' || handoff.status === 'overdue') && targetDesk) {
    addButton(controls, 'accept', 'Accept', flight.id, handoff.to, options.readOnly);
    addButton(controls, 'reject', 'Reject', flight.id, handoff.to, options.readOnly);
  }
  if ((handoff.status === 'offered' || handoff.status === 'overdue') && sourceDesk) {
    addButton(controls, 'cancel', 'Cancel', flight.id, handoff.to, options.readOnly);
  }
  if (handoff.status === 'accepted' && sourceDesk) {
    addButton(controls, 'contact', `Contact ${capitalized(handoff.to)}`, flight.id, handoff.to, options.readOnly);
    addButton(controls, 'cancel', 'Cancel', flight.id, handoff.to, options.readOnly);
  }

  card.append(identity, state, controls);
  return card;
}

function addButton(
  container: HTMLElement,
  action: string,
  label: string,
  flightId: number,
  station: ControllerStation,
  disabled: boolean,
): void {
  const button = document.createElement('button');
  button.type = 'button';
  button.dataset.coordinationAction = action;
  button.dataset.flight = String(flightId);
  button.dataset.station = station;
  button.textContent = label;
  button.disabled = disabled;
  container.append(button);
}

function timingLabel(handoff: FlightHandoffState, elapsedSeconds: number): string {
  if (handoff.status === 'accepted') {
    return `contact pending · ${Math.max(0, Math.floor(elapsedSeconds - (handoff.respondedAtSeconds ?? elapsedSeconds)))}s`;
  }
  if (handoff.status === 'overdue') {
    return `${Math.max(0, Math.ceil(elapsedSeconds - handoff.responseDueSeconds))}s late`;
  }
  return `reply in ${Math.max(0, Math.ceil(handoff.responseDueSeconds - elapsedSeconds))}s`;
}

function statusPriority(status: FlightHandoffState['status']): number {
  if (status === 'overdue') return 0;
  if (status === 'accepted') return 1;
  return 2;
}

function capitalized(value: string): string {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
}

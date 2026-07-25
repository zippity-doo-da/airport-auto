import type { AirportSimulation } from '../simulation/airportSimulation';

export type SandboxSnapshot = ReturnType<AirportSimulation['sandboxSnapshot']>;

export interface SandboxPanelElements {
  setup: HTMLDetailsElement;
  toggle: HTMLButtonElement;
  background: HTMLInputElement;
  direction: HTMLSelectElement;
  trafficClass: HTMLSelectElement;
  runway: HTMLSelectElement;
  count: HTMLSelectElement;
  inject: HTMLButtonElement;
  cancel: HTMLButtonElement;
  clear: HTMLButtonElement;
  status: HTMLElement;
  detail: HTMLElement;
  hud: HTMLElement;
  hudStatus: HTMLElement;
}

export interface SandboxPanel {
  render(snapshot: SandboxSnapshot, force?: boolean): void;
  reset(): void;
}

function compatibleRunway(role: SandboxSnapshot['runwayOptions'][number]['role'], direction: string): boolean {
  return role === 'mixed' || role === direction;
}

export function createSandboxPanel(elements: SandboxPanelElements): SandboxPanel {
  let renderKey = '';
  let runwayKey = '';

  function syncRunways(snapshot: SandboxSnapshot): void {
    const direction = elements.direction.value;
    const options = snapshot.runwayOptions.filter((runway) => (
      !runway.closed && compatibleRunway(runway.role, direction)
    ));
    const nextKey = `${direction}|${options.map((runway) => `${runway.id}:${runway.designation}:${runway.role}`).join('|')}`;
    if (runwayKey === nextKey) return;
    runwayKey = nextKey;
    const selected = elements.runway.value;
    const automatic = document.createElement('option');
    automatic.value = 'auto';
    automatic.textContent = 'Automatic safe runway';
    const runwayOptions = options.map((runway) => {
      const option = document.createElement('option');
      option.value = String(runway.id);
      option.textContent = `${runway.designation} · ${runway.role}`;
      return option;
    });
    elements.runway.replaceChildren(automatic, ...runwayOptions);
    elements.runway.value = runwayOptions.some((option) => option.value === selected) ? selected : 'auto';
  }

  function render(snapshot: SandboxSnapshot, force = false): void {
    syncRunways(snapshot);
    const key = JSON.stringify({
      active: snapshot.active,
      background: snapshot.backgroundTraffic,
      pending: snapshot.pendingCount,
      activeFlights: snapshot.activeAircraftCount,
      activeInjected: snapshot.activeInjectedFlightIds.length,
      totals: snapshot.totals,
      message: snapshot.lastMessage,
      injections: snapshot.injections.map((request) => [request.id, request.status, request.remainingCount, request.lastReason]),
      direction: elements.direction.value,
    });
    if (!force && key === renderKey) return;
    renderKey = key;
    elements.setup.dataset.active = String(snapshot.active);
    elements.toggle.textContent = snapshot.active ? 'Leave sandbox' : 'Enter clean sandbox';
    elements.background.checked = snapshot.active && snapshot.backgroundTraffic;
    for (const control of [elements.background, elements.direction, elements.trafficClass, elements.runway, elements.count, elements.inject]) {
      control.disabled = !snapshot.active;
    }
    elements.cancel.disabled = !snapshot.active || snapshot.pendingCount === 0;
    elements.clear.disabled = !snapshot.active || (snapshot.activeAircraftCount === 0 && snapshot.pendingCount === 0);
    elements.status.textContent = snapshot.active
      ? `${snapshot.activeAircraftCount} active · ${snapshot.pendingCount} pending`
      : 'Sandbox inactive';
    const liveRequest = snapshot.injections.find((request) => request.status === 'queued' || request.status === 'releasing');
    elements.detail.textContent = liveRequest
      ? `Request ${liveRequest.id}: ${liveRequest.lastReason}.`
      : snapshot.lastMessage;
    elements.hud.hidden = !snapshot.active;
    elements.hudStatus.textContent = snapshot.active
      ? `${snapshot.activeAircraftCount} aircraft · ${snapshot.pendingCount} pending · background ${snapshot.backgroundTraffic ? 'on' : 'off'}`
      : 'Clear board · background demand off';
  }

  function reset(): void {
    renderKey = '';
    runwayKey = '';
    elements.hud.hidden = true;
    elements.setup.dataset.active = 'false';
  }

  elements.direction.addEventListener('change', () => {
    runwayKey = '';
    renderKey = '';
  });

  return { render, reset };
}

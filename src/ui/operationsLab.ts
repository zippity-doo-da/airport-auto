import {
  OPERATIONS_EXPORT_DATASETS,
  type OperationsAnalyticsSnapshot,
  type OperationsExportDataset,
} from '../telemetry/operationsAnalytics';

export interface OperationsLabCallbacks {
  onVisibilityChange?(visible: boolean): void;
  onFlightChange?(flightId: number | null): void;
  onFocusFlight?(flightId: number): void;
  onExport?(format: 'json' | 'csv', dataset: OperationsExportDataset, flightId: number | null): void;
}

export interface OperationsLab {
  visible(): boolean;
  setVisible(visible: boolean, focus?: boolean): void;
  selectedFlightId(): number | null;
  render(snapshot: OperationsAnalyticsSnapshot): void;
}

interface Elements {
  close: HTMLButtonElement;
  airport: HTMLElement;
  duration: HTMLElement;
  summary: HTMLElement;
  flight: HTMLSelectElement;
  focus: HTMLButtonElement;
  flightState: HTMLElement;
  chart: SVGSVGElement;
  altitudePath: SVGPathElement;
  speedPath: SVGPathElement;
  fuelPath: SVGPathElement;
  runwayList: HTMLElement;
  taxiwayList: HTMLElement;
  heatmap: SVGSVGElement;
  heatmapEmpty: HTMLElement;
  dataset: HTMLSelectElement;
  exportJson: HTMLButtonElement;
  exportCsv: HTMLButtonElement;
  disclosure: HTMLElement;
}

const SVG_NAMESPACE = 'http://www.w3.org/2000/svg';

function required<ElementType extends Element>(root: ParentNode, selector: string): ElementType {
  const element = root.querySelector<ElementType>(selector);
  if (!element) throw new Error(`Operations Lab is missing ${selector}`);
  return element;
}

function formatDuration(seconds: number): string {
  const totalSeconds = Math.max(0, Math.round(seconds));
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor((totalSeconds % 3_600) / 60);
  const remainder = totalSeconds % 60;
  return hours > 0
    ? `${hours}h ${String(minutes).padStart(2, '0')}m`
    : `${minutes}:${String(remainder).padStart(2, '0')}`;
}

function metric(label: string, value: string, detail: string): HTMLElement {
  const card = document.createElement('span');
  const strong = document.createElement('strong');
  const small = document.createElement('small');
  const note = document.createElement('i');
  strong.textContent = value;
  small.textContent = label;
  note.textContent = detail;
  card.append(strong, small, note);
  return card;
}

function linePath(values: readonly number[], width: number, height: number, minimum: number, maximum: number): string {
  if (values.length === 0) return '';
  const range = Math.max(1e-6, maximum - minimum);
  return values.map((value, index) => {
    const x = values.length === 1 ? width : (index / (values.length - 1)) * width;
    const y = height - ((value - minimum) / range) * height;
    return `${index === 0 ? 'M' : 'L'}${x.toFixed(2)} ${y.toFixed(2)}`;
  }).join(' ');
}

function utilizationRow(label: string, seconds: number, share: number, suffix: string): HTMLElement {
  const row = document.createElement('div');
  const header = document.createElement('span');
  const name = document.createElement('b');
  const value = document.createElement('small');
  const bar = document.createElement('i');
  name.textContent = label;
  value.textContent = `${formatDuration(seconds)} · ${suffix}`;
  header.append(name, value);
  bar.style.setProperty('--utilization', `${Math.max(2, Math.min(100, share))}%`);
  row.append(header, bar);
  return row;
}

function svgLine(x1: number, y1: number, x2: number, y2: number, className: string): SVGLineElement {
  const line = document.createElementNS(SVG_NAMESPACE, 'line');
  line.setAttribute('x1', String(x1));
  line.setAttribute('y1', String(y1));
  line.setAttribute('x2', String(x2));
  line.setAttribute('y2', String(y2));
  line.setAttribute('class', className);
  return line;
}

export function createOperationsLab(
  panel: HTMLElement,
  toggle: HTMLButtonElement,
  callbacks: OperationsLabCallbacks = {},
): OperationsLab {
  const elements: Elements = {
    close: required(panel, '[data-operations-close]'),
    airport: required(panel, '[data-operations-airport]'),
    duration: required(panel, '[data-operations-duration]'),
    summary: required(panel, '[data-operations-summary]'),
    flight: required(panel, '[data-operations-flight]'),
    focus: required(panel, '[data-operations-focus]'),
    flightState: required(panel, '[data-operations-flight-state]'),
    chart: required(panel, '[data-operations-chart]'),
    altitudePath: required(panel, '[data-operations-altitude]'),
    speedPath: required(panel, '[data-operations-speed]'),
    fuelPath: required(panel, '[data-operations-fuel]'),
    runwayList: required(panel, '[data-operations-runways]'),
    taxiwayList: required(panel, '[data-operations-taxiways]'),
    heatmap: required(panel, '[data-operations-heatmap]'),
    heatmapEmpty: required(panel, '[data-operations-heatmap-empty]'),
    dataset: required(panel, '[data-operations-dataset]'),
    exportJson: required(panel, '[data-operations-export-json]'),
    exportCsv: required(panel, '[data-operations-export-csv]'),
    disclosure: required(panel, '[data-operations-disclosure]'),
  };
  let open = false;
  let selectedFlightId: number | null = null;
  let optionKey = '';

  for (const dataset of OPERATIONS_EXPORT_DATASETS) {
    const option = document.createElement('option');
    option.value = dataset;
    option.textContent = dataset.replaceAll('-', ' ');
    elements.dataset.append(option);
  }

  function setVisible(visible: boolean, focus = true): void {
    if (open === visible) return;
    open = visible;
    panel.hidden = !visible;
    panel.setAttribute('aria-hidden', String(!visible));
    panel.toggleAttribute('inert', !visible);
    toggle.setAttribute('aria-expanded', String(visible));
    toggle.setAttribute('aria-pressed', String(visible));
    toggle.classList.toggle('control--active', visible);
    document.body.classList.toggle('operations-lab-visible', visible);
    callbacks.onVisibilityChange?.(visible);
    if (visible && focus) elements.close.focus({ preventScroll: true });
    else if (!visible && focus) toggle.focus({ preventScroll: true });
  }

  toggle.addEventListener('click', () => setVisible(!open));
  elements.close.addEventListener('click', () => setVisible(false));
  elements.flight.addEventListener('change', () => {
    const value = Number(elements.flight.value);
    selectedFlightId = Number.isFinite(value) ? value : null;
    callbacks.onFlightChange?.(selectedFlightId);
  });
  elements.focus.addEventListener('click', () => {
    if (selectedFlightId !== null) callbacks.onFocusFlight?.(selectedFlightId);
  });
  elements.exportJson.addEventListener('click', () => callbacks.onExport?.(
    'json',
    elements.dataset.value as OperationsExportDataset,
    selectedFlightId,
  ));
  elements.exportCsv.addEventListener('click', () => callbacks.onExport?.(
    'csv',
    elements.dataset.value as OperationsExportDataset,
    selectedFlightId,
  ));
  window.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && open && !event.defaultPrevented) {
      event.preventDefault();
      setVisible(false);
    }
  });

  function render(snapshot: OperationsAnalyticsSnapshot): void {
    elements.airport.textContent = `${snapshot.airport.code} · ${snapshot.airport.name}`;
    elements.duration.textContent = `${formatDuration(snapshot.window.durationSeconds)} observed`;
    elements.summary.replaceChildren(
      metric('Flow', `${snapshot.summary.movementsPerHour.toFixed(1)}/hr`, `${snapshot.summary.arrivals} in · ${snapshot.summary.departures} out`),
      metric('Traffic', String(snapshot.summary.activeFlights), `${snapshot.summary.observedFlights} observed`),
      metric('Longest queue', formatDuration(snapshot.summary.longestQueueSeconds), `${snapshot.queueUtilization.filter((entry) => entry.averageEntries > 0).length} active categories`),
      metric('Safety', String(snapshot.summary.safetyEvents), `${snapshot.summary.activeConflicts} active forecasts`),
      metric('Fuel', `${Math.round(snapshot.summary.fuelBurnKg).toLocaleString()} kg`, `${Math.round(snapshot.summary.holdingFuelBurnKg).toLocaleString()} kg holding`),
    );

    const nextOptionKey = snapshot.flights.map((flight) => `${flight.flightId}:${flight.callsign}`).join('|');
    if (nextOptionKey !== optionKey) {
      optionKey = nextOptionKey;
      const previousValue = selectedFlightId;
      elements.flight.replaceChildren(...snapshot.flights.map((flight) => {
        const option = document.createElement('option');
        option.value = String(flight.flightId);
        option.textContent = `${flight.callsign} · ${flight.aircraft} · ${flight.origin} → ${flight.destination}`;
        return option;
      }));
      selectedFlightId = previousValue !== null && snapshot.flights.some((flight) => flight.flightId === previousValue)
        ? previousValue
        : snapshot.selectedFlightId;
      if (selectedFlightId !== null) elements.flight.value = String(selectedFlightId);
    }
    if (selectedFlightId === null && snapshot.selectedFlightId !== null) {
      selectedFlightId = snapshot.selectedFlightId;
      elements.flight.value = String(selectedFlightId);
    }
    elements.focus.disabled = selectedFlightId === null;

    const samples = snapshot.selectedFlightId === selectedFlightId
      ? snapshot.selectedFlightSamples
      : [];
    const latest = samples.at(-1);
    elements.flightState.textContent = latest
      ? `${latest.phase.toUpperCase()} · ${latest.altitudeFt.toLocaleString()} ft · ${latest.onGround ? latest.groundSpeedKts : latest.airspeedKts} kt · ${latest.fuelPercent.toFixed(1)}% fuel${latest.held ? ` · ${latest.holdReason}` : ''}`
      : 'Select an observed aircraft to inspect its one-second recorder trace.';
    const chartSamples = samples.slice(-600);
    const altitudeMaximum = Math.max(1_000, ...chartSamples.map((sample) => sample.altitudeFt));
    const speedMaximum = Math.max(100, ...chartSamples.map((sample) => Math.max(sample.airspeedKts, sample.groundSpeedKts)));
    elements.altitudePath.setAttribute('d', linePath(chartSamples.map((sample) => sample.altitudeFt), 360, 92, 0, altitudeMaximum));
    elements.speedPath.setAttribute('d', linePath(chartSamples.map((sample) => Math.max(sample.airspeedKts, sample.groundSpeedKts)), 360, 92, 0, speedMaximum));
    elements.fuelPath.setAttribute('d', linePath(chartSamples.map((sample) => sample.fuelPercent), 360, 92, 0, 100));
    elements.chart.setAttribute('aria-label', latest
      ? `${latest.callsign} recorder chart: altitude ${latest.altitudeFt} feet, speed ${latest.onGround ? latest.groundSpeedKts : latest.airspeedKts} knots, fuel ${latest.fuelPercent.toFixed(1)} percent.`
      : 'No flight recorder samples yet.');

    const maximumRunwaySeconds = Math.max(1, ...snapshot.runwayUtilization.map((entry) => entry.occupiedSeconds));
    elements.runwayList.replaceChildren(...snapshot.runwayUtilization.map((entry) => utilizationRow(
      entry.label,
      entry.occupiedSeconds,
      (entry.occupiedSeconds / maximumRunwaySeconds) * 100,
      `${entry.movements} movements`,
    )));
    const visibleTaxiways = snapshot.taxiwayUtilization.slice(0, 12);
    const maximumTaxiwaySeconds = Math.max(1, ...visibleTaxiways.map((entry) => entry.occupiedSeconds));
    elements.taxiwayList.replaceChildren(...(visibleTaxiways.length
      ? visibleTaxiways.map((entry) => utilizationRow(
        entry.label,
        entry.occupiedSeconds,
        (entry.occupiedSeconds / maximumTaxiwaySeconds) * 100,
        `${entry.visits} visits`,
      ))
      : [Object.assign(document.createElement('p'), { textContent: 'Taxiway observations will appear as surface traffic moves.' })]));

    renderHeatmap(elements, snapshot);
    elements.disclosure.textContent = `${snapshot.disclosure.privacy} ${snapshot.disclosure.retention}`;
  }

  return {
    visible: () => open,
    setVisible,
    selectedFlightId: () => selectedFlightId,
    render,
  };
}

function renderHeatmap(elements: Elements, snapshot: OperationsAnalyticsSnapshot): void {
  const { minX, maxX, minZ, maxZ } = snapshot.airport.bounds;
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxZ - minZ);
  elements.heatmap.setAttribute('viewBox', `0 0 ${width} ${height}`);
  const nodes: SVGElement[] = [];
  for (const runway of snapshot.airport.runways) {
    const halfX = Math.cos(runway.headingRadians) * runway.length * 0.5;
    const halfZ = Math.sin(runway.headingRadians) * runway.length * 0.5;
    nodes.push(svgLine(
      runway.center[0] - halfX - minX,
      maxZ - (runway.center[1] - halfZ),
      runway.center[0] + halfX - minX,
      maxZ - (runway.center[1] + halfZ),
      'operations-lab__heat-runway',
    ));
  }
  const maximumCount = Math.max(1, ...snapshot.conflictHeatmap.map((cell) => cell.count));
  for (const cell of snapshot.conflictHeatmap) {
    const circle = document.createElementNS(SVG_NAMESPACE, 'circle');
    circle.setAttribute('cx', String(cell.x - minX));
    circle.setAttribute('cy', String(maxZ - cell.z));
    circle.setAttribute('r', String(2.5 + (cell.count / maximumCount) * 8));
    circle.setAttribute('class', cell.warningCount > 0 ? 'operations-lab__heat-warning' : 'operations-lab__heat-caution');
    circle.setAttribute('aria-label', `${cell.count} conflict forecasts near ${Math.round(cell.x)}, ${Math.round(cell.z)}`);
    nodes.push(circle);
  }
  elements.heatmap.replaceChildren(...nodes);
  elements.heatmapEmpty.hidden = snapshot.conflictHeatmap.length > 0;
}


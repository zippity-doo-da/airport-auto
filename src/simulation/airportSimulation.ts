import type { AirportConfig } from './airportConfig';
import type { AirportEvent, AirportState, AircraftCategory, ConflictPrediction, ControlMode, Flight, FlightInstruction, FlightPhase, ShiftMetrics, TrafficScenario, WeatherCondition } from './types';

const PHASE_DURATION: Record<FlightPhase, number> = {
  approach: 12,
  landing: 5.5,
  'taxi-in': 18,
  resting: 3.5,
  'taxi-out': 20,
  takeoff: 25,
};

const NEXT_PHASE: Partial<Record<FlightPhase, FlightPhase>> = {
  approach: 'landing',
  landing: 'taxi-in',
  'taxi-in': 'resting',
  resting: 'taxi-out',
  'taxi-out': 'takeoff',
};

const NAMES = ['Bluebell', 'Mallow', 'Juniper', 'Linen', 'Wren', 'Aster', 'Willow', 'Dove'];

export class AirportSimulation {
  readonly state: AirportState = {
    elapsed: 0,
    flights: [],
    arrivals: 0,
    departures: 0,
    breeze: 0,
    gameOver: false,
    paused: false,
    mode: 'auto',
    weather: { weatherEnabled: true, windEnabled: true, condition: 'clear', windDirection: Math.PI, windSpeed: 10, gustSpeed: 14, visibility: 10 },
    scenario: 'normal',
  };

  private nextId = 1;
  private spawnIn: number;
  private events: AirportEvent[] = [];
  private speed = 1;
  private runwayReservations = new Map<number, number>();
  private readonly approachCapacity: number;
  private taxiOutReleaseIn = 0;
  private baseWindDirection = Math.PI;
  private baseWindSpeed = 10;
  private weatherOverrideUntil = 0;
  private closedRunway: number | null = null;
  private readonly metrics: ShiftMetrics = {
    safeArrivals: 0,
    safeDepartures: 0,
    preventedConflicts: 0,
    holdsIssued: 0,
    manualCommands: 0,
    maxConcurrent: 0,
    airborneSeconds: 0,
    taxiSeconds: 0,
    estimatedDelaySeconds: 0,
  };

  constructor(private readonly config: AirportConfig) {
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.approachCapacity = this.calculateApproachCapacity();
    const reference = config.runways.find((runway) => runway.role !== 'inactive') ?? config.runways[0];
    this.baseWindDirection = this.normalizeAngle(reference.heading + (reference.landingEnd === 1 ? Math.PI : 0) + Math.sin(config.seed) * 0.32);
    this.baseWindSpeed = 8 + config.seed % 7;
    this.updateWeather();
  }

  setPace(speed: number): void {
    this.speed = speed;
  }

  setPaused(paused: boolean): void {
    this.state.paused = paused;
  }

  setMode(mode: ControlMode): void {
    this.state.mode = mode;
    if (mode === 'auto') {
      for (const flight of this.state.flights) {
        if (flight.phase === 'approach' && !flight.cleared) {
          flight.cleared = true;
          flight.clearanceLeft = 99;
          this.events.push({ type: 'auto-clear', flight });
        }
      }
    }
  }

  setScenario(scenario: TrafficScenario): void {
    this.state.scenario = scenario;
    this.closedRunway = scenario === 'closure'
      ? this.config.runways.find((runway) => runway.role === 'arrival' || runway.role === 'mixed')?.id ?? null
      : null;
    if (scenario === 'storm') this.setWeather('rain', this.state.weather.windDirection, Math.max(18, this.state.weather.windSpeed));
    if (scenario === 'normal' || scenario === 'rush' || scenario === 'closure') this.weatherOverrideUntil = 0;
  }

  shiftMetrics(): ShiftMetrics { return { ...this.metrics }; }

  conflictPredictions(): ConflictPrediction[] {
    const predictions: ConflictPrediction[] = [];
    const active = this.state.flights.filter((flight) => flight.phase !== 'resting');
    for (let firstIndex = 0; firstIndex < active.length; firstIndex += 1) {
      const first = active[firstIndex];
      for (let secondIndex = firstIndex + 1; secondIndex < active.length; secondIndex += 1) {
        const second = active[secondIndex];
        if (!this.runwaysConflict(first.runway, second.runway)) continue;
        const firstAirborne = first.phase === 'approach' || first.phase === 'landing';
        const secondAirborne = second.phase === 'approach' || second.phase === 'landing';
        if (firstAirborne && secondAirborne && Math.abs(first.progress - second.progress) < 0.24) {
          predictions.push({ severity: 'warning', type: 'separation', flights: [first.id, second.id], runway: first.runway, etaSeconds: Math.max(1, Math.round((1 - Math.max(first.progress, second.progress)) * 18)), detail: `${first.callsign} and ${second.callsign} are compressing on the same runway` });
        } else if (first.phase === 'taxi-out' && first.progress > 0.74 && secondAirborne) {
          predictions.push({ severity: 'caution', type: 'runway', flights: [first.id, second.id], runway: first.runway, etaSeconds: Math.max(1, Math.round((1 - first.progress) * 20)), detail: `${first.callsign} is approaching the hold-short point while ${second.callsign} is active` });
        }
      }
    }
    return predictions.slice(0, 8);
  }

  setWeather(condition: WeatherCondition, windDirection: number, windSpeed: number): void {
    this.state.weather.weatherEnabled = true;
    this.state.weather.windEnabled = true;
    this.state.weather.condition = condition;
    this.state.weather.windDirection = this.normalizeAngle(windDirection);
    this.state.weather.windSpeed = Math.max(0, Math.min(40, windSpeed));
    this.state.weather.gustSpeed = this.state.weather.windSpeed + (condition === 'clear' ? 3 : 7);
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'rain' ? 5 : 10;
    this.baseWindDirection = this.state.weather.windDirection;
    this.baseWindSpeed = this.state.weather.windSpeed;
    this.weatherOverrideUntil = this.state.elapsed + 180;
  }

  setWeatherEnabled(enabled: boolean): void {
    this.state.weather.weatherEnabled = enabled;
    if (!enabled) {
      this.state.weather.condition = 'clear';
      this.state.weather.visibility = 10;
    } else {
      this.weatherOverrideUntil = 0;
    }
    this.updateWeather();
  }

  setWindEnabled(enabled: boolean): void {
    this.state.weather.windEnabled = enabled;
    this.updateWeather();
  }

  clearFlight(id: number, runway: number): boolean {
    if (this.state.gameOver || this.state.paused) return false;
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'approach');
    if (!flight || flight.runway !== runway) {
      if (flight) this.events.push({ type: 'reject', flight });
      return false;
    }
    flight.cleared = true;
    flight.clearanceLeft = 99;
    this.events.push({ type: 'clear', flight });
    return true;
  }

  clearRunwayEntry(id: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'taxi-out');
    if (!flight || flight.progress < 0.9) return false;
    flight.runwayEntryCleared = true;
    this.events.push({ type: 'runway-entry', flight, runway: flight.runway, taxiway: flight.taxiway });
    return true;
  }

  clearRunwayCrossing(id: number, runway: number): boolean {
    const flight = this.state.flights.find((item) => item.id === id && item.phase === 'taxi-out');
    if (!flight || flight.progress < 0.9 || !flight.requiredCrossings?.includes(runway)) return false;
    flight.crossingClearances ??= [];
    if (!flight.crossingClearances.includes(runway)) {
      flight.crossingClearances.push(runway);
      this.events.push({ type: 'runway-crossing', flight, runway, taxiway: flight.taxiway });
    }
    return true;
  }

  controlFlights(ids: number[], instruction: FlightInstruction): number[] {
    const requested = new Set(ids.filter((id) => Number.isInteger(id) && id > 0));
    const controlled: number[] = [];
    for (const flight of this.state.flights) {
      if (!requested.has(flight.id)) continue;
      if (instruction === 'hold') {
        if (flight.phase !== 'taxi-in' && flight.phase !== 'taxi-out') continue;
        flight.controlHold = true;
        this.metrics.holdsIssued += 1;
      }
      if (instruction === 'resume') flight.controlHold = false;
      if (instruction === 'slow') flight.controlPace = 0.55;
      if (instruction === 'normal') flight.controlPace = 1;
      if (instruction === 'expedite') flight.controlPace = 1.4;
      if (instruction === 'zigzag') {
        if (flight.phase !== 'approach') continue;
        flight.controlPattern = 'zigzag';
        flight.controlPatternStart = flight.progress;
      }
      this.metrics.manualCommands += 1;
      controlled.push(flight.id);
    }
    return controlled;
  }

  reset(): void {
    this.state.elapsed = 0;
    this.state.flights = [];
    this.state.arrivals = 0;
    this.state.departures = 0;
    this.state.gameOver = false;
    this.state.paused = false;
    this.nextId = 1;
    this.spawnIn = Math.min(3, this.arrivalSpacing() * 0.55);
    this.events = [];
    this.runwayReservations.clear();
    this.taxiOutReleaseIn = 0;
    this.closedRunway = null;
    this.state.scenario = 'normal';
    Object.assign(this.metrics, { safeArrivals: 0, safeDepartures: 0, preventedConflicts: 0, holdsIssued: 0, manualCommands: 0, maxConcurrent: 0, airborneSeconds: 0, taxiSeconds: 0, estimatedDelaySeconds: 0 });
  }

  update(realDelta: number): void {
    if (this.state.gameOver || this.state.paused) return;
    const realStep = Math.min(realDelta, 0.1);
    const delta = realStep * this.speed;
    this.state.elapsed += delta;
    this.state.breeze = Math.sin(this.state.elapsed * 0.07) * 0.5 + 0.5;
    this.updateWeather();
    this.metrics.maxConcurrent = Math.max(this.metrics.maxConcurrent, this.state.flights.length);
    this.spawnIn -= delta;
    this.taxiOutReleaseIn = Math.max(0, this.taxiOutReleaseIn - delta);

    if (this.spawnIn <= 0) {
      const spawned = this.state.flights.length < this.config.trafficCap && this.spawnFlight();
      this.spawnIn = spawned ? this.arrivalSpacing() : 0.6;
    }

    for (const flight of [...this.state.flights]) {
      // The pace control accelerates the traffic picture, not aircraft driving
      // on the surface. Keeping taxi motion at 1x prevents high-speed ground
      // movement from reading as low-level flight.
      const onSurface = flight.phase === 'taxi-in' || flight.phase === 'taxi-out';
      const commandedPace = Math.max(0.35, Math.min(onSurface ? 1 : 1.4, flight.controlPace ?? 1));
      const flightDelta = flight.controlHold && onSurface
        ? 0
        : (onSurface ? realStep : delta) * commandedPace;
      if (flight.phase === 'approach' || flight.phase === 'landing' || flight.phase === 'takeoff') this.metrics.airborneSeconds += flightDelta;
      if (onSurface) this.metrics.taxiSeconds += flightDelta;
      if (flight.controlHold) this.metrics.estimatedDelaySeconds += realStep;
      if (flight.phase === 'approach' && !flight.cleared) {
        flight.clearanceLeft -= flightDelta;
        flight.phaseElapsed += flightDelta;
        if (flight.clearanceLeft <= 0 || flight.phaseElapsed >= flight.duration * 0.96) {
          this.state.gameOver = true;
          this.events.push({ type: 'conflict', flight });
          break;
        }
      } else {
        flight.phaseElapsed += flightDelta;
      }
      flight.progress = Math.min(1, flight.phaseElapsed / flight.duration);

      if (flight.progress >= 1) this.advance(flight);
    }
  }

  drainEvents(): AirportEvent[] {
    const result = this.events;
    this.events = [];
    return result;
  }

  diagnostics(): { flow: 'continuous'; approachCapacity: number; nextArrivalIn: number; activeFlights: number; runwayReservations: Array<{ runway: number; flight: number }>; scenario: TrafficScenario; closedRunway: number | null; predictions: ConflictPrediction[]; metrics: ShiftMetrics } {
    return {
      flow: 'continuous',
      approachCapacity: this.weatherApproachCapacity(),
      nextArrivalIn: Number(Math.max(0, this.spawnIn).toFixed(2)),
      activeFlights: this.state.flights.length,
      runwayReservations: [...this.runwayReservations].map(([runway, flight]) => ({ runway, flight })),
      scenario: this.state.scenario,
      closedRunway: this.closedRunway,
      predictions: this.conflictPredictions(),
      metrics: this.shiftMetrics(),
    };
  }

  private spawnFlight(): boolean {
    const approachLimit = this.weatherApproachCapacity();
    if (this.state.flights.filter((flight) => flight.phase === 'approach' || flight.phase === 'landing').length >= approachLimit) return false;
    const arrivalRunways = this.config.runways.filter((runway) => (runway.role === 'arrival' || runway.role === 'mixed') && runway.id !== this.closedRunway);
    const unblocked = arrivalRunways.filter((runway) => !this.arrivalBlocked(runway.id));
    const usable = unblocked.filter((runway) => this.headwindComponent(runway.id) >= -5);
    const candidates = (usable.length ? usable : unblocked).sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return false;

    const id = this.nextId++;
    const runway = candidates[0].id;
    const runwayConfig = this.config.runways[runway];
    const departureRunways = this.config.runways.filter((item) => (item.role === 'departure' || item.role === 'mixed') && item.id !== this.closedRunway);
    const departureRunway = [...departureRunways].sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id))[(id - 1) % departureRunways.length].id;
    const automatic = this.state.mode === 'auto';
    const approachDuration = (this.config.scope === 'center' ? 18 : PHASE_DURATION.approach) * this.weatherDurationMultiplier('approach');
    const categories: AircraftCategory[] = ['narrowbody', 'regional', 'widebody', 'cargo'];
    const category = categories[(id - 1) % categories.length];
    const flight: Flight = {
      id,
      callsign: `${NAMES[(id - 1) % NAMES.length]} ${String(id * 3 + 1).padStart(2, '0')}`,
      palette: runwayConfig.color,
      runway,
      departureRunway,
      operatingEnd: this.preferredOperatingEnd(runway),
      phase: 'approach',
      progress: 0,
      phaseElapsed: 0,
      duration: approachDuration,
      cleared: automatic,
      clearanceLeft: automatic ? 99 : approachDuration * 0.96,
      category,
      wakeClass: category === 'widebody' || category === 'cargo' ? 'heavy' : category === 'regional' ? 'light' : 'medium',
    };

    this.state.flights.push(flight);
    this.events.push({ type: 'spawn', flight });
    if (automatic) this.events.push({ type: 'auto-clear', flight });
    return true;
  }

  private advance(flight: Flight): void {
    if (flight.phase === 'takeoff') {
      for (const [runway, owner] of this.runwayReservations) {
        if (owner === flight.id) this.runwayReservations.delete(runway);
      }
      this.state.departures += 1;
      this.metrics.safeDepartures += 1;
      this.events.push({ type: 'depart', flight });
      this.state.flights = this.state.flights.filter((item) => item !== flight);
      return;
    }

    const next = NEXT_PHASE[flight.phase];
    if (!next) return;
    if (next === 'taxi-out') {
      if (this.taxiOutReleaseIn > 0) return;
      const departureRunway = this.selectDepartureRunway(flight);
      if (departureRunway === null) return;
      flight.departureRunway = departureRunway;
      flight.runway = departureRunway;
      flight.operatingEnd = this.preferredOperatingEnd(flight.runway);
      flight.palette = this.config.runways[flight.runway].color;
      flight.taxiway = this.taxiwayName(flight.runway);
      flight.holdShortRunway = flight.runway;
      flight.holdNotified = false;
      flight.runwayEntryCleared = false;
      flight.requiredCrossings = this.intersectingRunways(flight.runway);
      flight.crossingClearances = [];
      this.taxiOutReleaseIn = this.config.scope === 'center' ? 12 : 16;
    }
    if (next === 'takeoff') {
      if (!flight.holdNotified) {
        flight.holdNotified = true;
        this.events.push({ type: 'hold-short', flight, runway: flight.runway, taxiway: flight.taxiway });
      }
      if (this.state.mode === 'auto') {
        if (!flight.runwayEntryCleared) {
          flight.runwayEntryCleared = true;
          this.events.push({ type: 'runway-entry', flight, runway: flight.runway, taxiway: flight.taxiway });
        }
        for (const crossing of flight.requiredCrossings ?? []) {
          if (!flight.crossingClearances?.includes(crossing)) {
            flight.crossingClearances?.push(crossing);
            this.events.push({ type: 'runway-crossing', flight, runway: crossing, taxiway: flight.taxiway });
          }
        }
      }
      const crossingClear = (flight.requiredCrossings ?? []).every((runway) => flight.crossingClearances?.includes(runway));
      if (!flight.runwayEntryCleared || !crossingClear || !this.reserveDeparture(flight)) return;
    }
    flight.phase = next;
    flight.progress = 0;
    flight.phaseElapsed = 0;
    flight.controlPace = 1;
    flight.controlHold = false;
    flight.controlPattern = undefined;
    flight.controlPatternStart = undefined;
    flight.duration = PHASE_DURATION[next] * this.weatherDurationMultiplier(next);

    if (next === 'taxi-in') {
      flight.taxiway = this.taxiwayName(flight.runway);
      this.state.arrivals += 1;
      this.metrics.safeArrivals += 1;
      this.events.push({ type: 'land', flight });
      this.events.push({ type: 'chime', flight });
    }
    if (next === 'resting') flight.taxiway = 'TERMINAL APRON';
    if (next === 'takeoff') {
      flight.taxiway = undefined;
      flight.holdShortRunway = undefined;
    }
  }

  private arrivalBlocked(runway: number): boolean {
    for (const reservedRunway of this.runwayReservations.keys()) {
      if (this.runwaysConflict(runway, reservedRunway)) return true;
    }
    for (const flight of this.state.flights) {
      if (flight.phase === 'resting' && flight.progress >= 0.7 && this.runwaysConflict(runway, flight.departureRunway)) return true;
      if (flight.phase === 'taxi-out' && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'landing' && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'taxi-in' && flight.progress < 0.3 && this.runwaysConflict(runway, flight.runway)) return true;
      if (flight.phase === 'approach' && this.runwaysConflict(runway, flight.runway)) {
        return true;
      }
    }
    return false;
  }

  private reserveDeparture(flight: Flight): boolean {
    const runway = flight.runway;
    for (const [reservedRunway, owner] of this.runwayReservations) {
      if (owner !== flight.id && this.runwaysConflict(runway, reservedRunway)) return false;
    }
    for (const other of this.state.flights) {
      if (other === flight) continue;
      if ((other.phase === 'approach' || other.phase === 'landing' || other.phase === 'taxi-in' || other.phase === 'taxi-out' || other.phase === 'takeoff')
        && this.runwaysConflict(runway, other.runway)) return false;
    }
    this.runwayReservations.set(runway, flight.id);
    for (const crossing of this.intersectingRunways(runway)) this.runwayReservations.set(crossing, flight.id);
    return true;
  }

  private canStartTaxiOut(flight: Flight, runway: number): boolean {
    for (const reservedRunway of this.runwayReservations.keys()) {
      if (reservedRunway !== runway && this.runwaysConflict(runway, reservedRunway)) return false;
    }
    for (const other of this.state.flights) {
      if (other === flight) continue;
      if ((other.phase === 'approach' || other.phase === 'landing' || other.phase === 'taxi-in' || other.phase === 'taxi-out' || other.phase === 'takeoff')
        && this.runwaysConflict(runway, other.runway)) return false;
    }
    return true;
  }

  private selectDepartureRunway(flight: Flight): number | null {
    const candidates = this.config.runways
      .filter((runway) => (runway.role === 'departure' || runway.role === 'mixed') && runway.id !== this.closedRunway)
      .sort((first, second) => this.headwindComponent(second.id) - this.headwindComponent(first.id));
    if (candidates.length === 0) return null;
    const offset = flight.id % candidates.length;
    const rotated = [...candidates.slice(offset), ...candidates.slice(0, offset)];
    return rotated.find((runway) => this.canStartTaxiOut(flight, runway.id))?.id ?? null;
  }

  private calculateApproachCapacity(): number {
    const arrivals = this.config.runways.filter((runway) => runway.role === 'arrival' || runway.role === 'mixed');
    const independentArrivals: number[] = [];
    for (const runway of arrivals) {
      if (independentArrivals.every((other) => !this.runwaysConflict(runway.id, other))) independentArrivals.push(runway.id);
    }
    const departures = this.config.runways.filter((runway) => runway.role === 'departure' || runway.role === 'mixed').length;
    const maximumCapacity = this.config.code === 'ORD' ? 4 : 3;
    return Math.max(1, Math.min(maximumCapacity, independentArrivals.length, Math.max(1, departures + 1)));
  }

  private weatherApproachCapacity(): number {
    if (this.state.scenario === 'rush') return Math.min(this.approachCapacity + 1, this.state.weather.condition === 'clear' ? 5 : this.approachCapacity);
    if (this.state.scenario === 'storm') return Math.min(2, this.approachCapacity);
    if (this.state.weather.condition === 'fog') return Math.min(2, this.approachCapacity);
    if (this.state.weather.condition === 'rain') return Math.min(3, this.approachCapacity);
    return this.approachCapacity;
  }

  private arrivalSpacing(): number {
    const base = this.config.scope === 'center'
      ? Math.max(8, this.config.trafficInterval * 0.9)
      : Math.max(6.5, this.config.trafficInterval * 0.95);
    const scenarioMultiplier = this.state.scenario === 'rush' ? 0.62 : this.state.scenario === 'storm' ? 1.55 : this.state.scenario === 'closure' ? 1.18 : 1;
    const scenarioBase = base * scenarioMultiplier;
    if (this.state.weather.condition === 'fog') return scenarioBase * 1.55;
    if (this.state.weather.condition === 'rain') return scenarioBase * 1.2;
    return scenarioBase;
  }

  private taxiwayName(runway: number): string {
    if (this.config.code !== 'ORD') return `TAXIWAY ${String.fromCharCode(65 + runway % 20)}`;
    const centerY = this.config.runways[runway].center[1];
    return centerY >= 8 ? 'NORTH PERIMETER' : centerY <= -8 ? 'SOUTH PERIMETER' : 'EAST PERIMETER';
  }

  private intersectingRunways(runwayId: number): number[] {
    const runway = this.config.runways[runwayId];
    const direction = { x: Math.cos(runway.heading), y: Math.sin(runway.heading) };
    const result: number[] = [];
    for (const other of this.config.runways) {
      if (other.id === runwayId || other.role === 'inactive') continue;
      const otherDirection = { x: Math.cos(other.heading), y: Math.sin(other.heading) };
      const cross = direction.x * otherDirection.y - direction.y * otherDirection.x;
      if (Math.abs(cross) < 0.08) continue;
      const delta = { x: other.center[0] - runway.center[0], y: other.center[1] - runway.center[1] };
      const firstDistance = (delta.x * otherDirection.y - delta.y * otherDirection.x) / cross;
      const secondDistance = (delta.x * direction.y - delta.y * direction.x) / cross;
      if (Math.abs(firstDistance) <= runway.length / 2 && Math.abs(secondDistance) <= other.length / 2) result.push(other.id);
    }
    return result;
  }

  private runwaysConflict(firstId: number, secondId: number): boolean {
    if (firstId === secondId) return true;
    const first = this.config.runways[firstId];
    const second = this.config.runways[secondId];
    const firstDirection = { x: Math.cos(first.heading), y: Math.sin(first.heading) };
    const secondDirection = { x: Math.cos(second.heading), y: Math.sin(second.heading) };
    const delta = { x: second.center[0] - first.center[0], y: second.center[1] - first.center[1] };
    const cross = firstDirection.x * secondDirection.y - firstDirection.y * secondDirection.x;
    const clearance = (first.width + second.width) / 2 + 2.5;

    if (Math.abs(cross) < 0.08) {
      const lateral = Math.abs(delta.x * -firstDirection.y + delta.y * firstDirection.x);
      const longitudinal = Math.abs(delta.x * firstDirection.x + delta.y * firstDirection.y);
      return lateral < clearance && longitudinal < (first.length + second.length) / 2;
    }

    const firstDistance = (delta.x * secondDirection.y - delta.y * secondDirection.x) / cross;
    const secondDistance = (delta.x * firstDirection.y - delta.y * firstDirection.x) / cross;
    return Math.abs(firstDistance) <= first.length / 2 + clearance && Math.abs(secondDistance) <= second.length / 2 + clearance;
  }

  private updateWeather(): void {
    const overridden = this.state.elapsed < this.weatherOverrideUntil;
    if (!this.state.weather.weatherEnabled) {
      this.state.weather.condition = 'clear';
    } else if (!overridden) {
      const pattern: WeatherCondition[] = ['clear', 'rain', 'clear', 'fog', 'clear', 'rain'];
      this.state.weather.condition = pattern[Math.floor((this.state.elapsed + this.config.seed % 60) / 60) % pattern.length];
    }
    if (!this.state.weather.windEnabled) {
      this.state.weather.windSpeed = 0;
      this.state.weather.gustSpeed = 0;
    } else {
      if (!overridden) {
        this.state.weather.windDirection = this.normalizeAngle(this.baseWindDirection + Math.sin(this.state.elapsed * 0.006) * 0.48);
        this.state.weather.windSpeed = Math.max(2, this.baseWindSpeed + Math.sin(this.state.elapsed * 0.035 + this.config.seed) * 2.8);
      }
      const condition = this.state.weather.condition;
      this.state.weather.gustSpeed = this.state.weather.windSpeed + (condition === 'clear' ? 3 : 6 + Math.sin(this.state.elapsed * 0.11) * 2);
    }
    const condition = this.state.weather.condition;
    this.state.weather.visibility = condition === 'fog' ? 2.5 : condition === 'rain' ? 4.5 : 10;
  }

  private headwindComponent(runwayId: number): number {
    if (!this.state.weather.windEnabled) return 0;
    const runway = this.config.runways[runwayId];
    const positiveEndHeading = runway.heading + Math.PI;
    const positiveEndComponent = this.state.weather.windSpeed * Math.cos(this.state.weather.windDirection - positiveEndHeading);
    const negativeEndComponent = this.state.weather.windSpeed * Math.cos(this.state.weather.windDirection - runway.heading);
    return Math.max(positiveEndComponent, negativeEndComponent);
  }

  private preferredOperatingEnd(runwayId: number): -1 | 1 {
    const runway = this.config.runways[runwayId];
    if (!this.state.weather.windEnabled) return runway.landingEnd;
    const positiveEndComponent = Math.cos(this.state.weather.windDirection - (runway.heading + Math.PI));
    const negativeEndComponent = Math.cos(this.state.weather.windDirection - runway.heading);
    return positiveEndComponent >= negativeEndComponent ? 1 : -1;
  }

  private weatherDurationMultiplier(phase: FlightPhase): number {
    const condition = this.state.weather.condition;
    if (condition === 'clear' || phase === 'resting') return 1;
    if (condition === 'rain') return phase === 'taxi-in' || phase === 'taxi-out' ? 1.2 : phase === 'landing' || phase === 'takeoff' ? 1.12 : 1.08;
    return phase === 'taxi-in' || phase === 'taxi-out' ? 1.35 : phase === 'landing' || phase === 'approach' ? 1.25 : 1.12;
  }

  private normalizeAngle(angle: number): number {
    return (angle % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
  }
}

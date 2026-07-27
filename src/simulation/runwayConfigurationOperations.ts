import type {
  AirportConfig,
  AirportRunwayConfiguration,
  RunwayOperationalRole,
} from './airportConfig';
import { runwayClosedByDisruption } from './surfaceDisruptions';
import type { AirportState } from './types';

export function preferredOperatingEnd(
  config: AirportConfig,
  state: AirportState,
  runwayId: number,
): -1 | 1 {
  return state.activeRunwayEnds[runwayId]
    ?? config.runways[runwayId]?.landingEnd
    ?? -1;
}

export function activeRunwayRole(
  config: AirportConfig,
  state: AirportState,
  runwayId: number,
): RunwayOperationalRole {
  return state.activeRunwayRoles[runwayId]
    ?? config.runways[runwayId]?.role
    ?? 'inactive';
}

export function runwayConfigurationRestrictionReason(
  state: AirportState,
  configuration: AirportRunwayConfiguration,
): string | null {
  const restrictions = configuration.restrictions;
  if (!restrictions.conditions.includes(state.weather.condition)) {
    return `${state.weather.condition} weather is outside this procedure`;
  }
  if (
    restrictions.minimumVisibilityMiles !== undefined
    && state.weather.visibility < restrictions.minimumVisibilityMiles
  ) {
    return `visibility must be at least ${restrictions.minimumVisibilityMiles} mi`;
  }
  if (restrictions.scenarios && !restrictions.scenarios.includes(state.scenario)) {
    return `reserved for ${restrictions.scenarios.join('/')} traffic`;
  }
  if (restrictions.minimumWindSpeedKts !== undefined) {
    if (!state.weather.windEnabled) return 'wind must be enabled';
    if (state.weather.windSpeed < restrictions.minimumWindSpeedKts) {
      return `wind must be at least ${restrictions.minimumWindSpeedKts} kt`;
    }
  }
  if (
    restrictions.preferredWindDirectionDegrees !== undefined
    && restrictions.windDirectionToleranceDegrees !== undefined
  ) {
    if (!state.weather.windEnabled) return 'wind must be enabled';
    const windDegrees = (
      90 - state.weather.windDirection * 180 / Math.PI + 360
    ) % 360;
    const difference = Math.abs(
      ((windDegrees - restrictions.preferredWindDirectionDegrees + 540) % 360)
        - 180,
    );
    if (difference > restrictions.windDirectionToleranceDegrees) {
      return `wind must be within ${restrictions.windDirectionToleranceDegrees}° of ${restrictions.preferredWindDirectionDegrees}°`;
    }
  }
  const usableArrival = configuration.arrivalRunwayIds.some(
    (runwayId) => !runwayClosedByDisruption(state.surfaceDisruptions, runwayId),
  );
  const usableDeparture = configuration.departureRunwayIds.some(
    (runwayId) => !runwayClosedByDisruption(state.surfaceDisruptions, runwayId),
  );
  if (!usableArrival || !usableDeparture) {
    return 'the active closure removes a required runway role';
  }
  return null;
}

export function runwayConfigurationHeadwindScore(
  config: AirportConfig,
  state: AirportState,
  configuration: AirportRunwayConfiguration,
): number {
  const activeRunways = config.runways.filter(
    (runway) => (
      configuration.runwayRoles[runway.id] ?? runway.role
    ) !== 'inactive',
  );
  if (!activeRunways.length) return -Infinity;
  return activeRunways.reduce((score, runway) => {
    const end = configuration.operatingEnds[runway.id] ?? runway.landingEnd;
    const heading = runway.heading + (end === 1 ? Math.PI : 0);
    return score + Math.cos(state.weather.windDirection - heading);
  }, 0) / activeRunways.length;
}

export function selectAutomaticRunwayConfiguration(
  config: AirportConfig,
  state: AirportState,
): AirportRunwayConfiguration {
  const fallback = config.runwayConfigurations.find(
    (configuration) => configuration.id === config.defaultRunwayConfigurationId,
  ) ?? config.runwayConfigurations[0];
  if (!fallback) {
    throw new Error(`${config.code} has no runway configuration`);
  }
  const eligible = config.runwayConfigurations.filter(
    (configuration) => (
      configuration.restrictions.autoSelectable
      && runwayConfigurationRestrictionReason(state, configuration) === null
    ),
  );
  if (!eligible.length) return fallback;
  if (!state.weather.windEnabled) {
    return eligible.find((configuration) => configuration.id === fallback.id)
      ?? eligible[0];
  }
  return [...eligible]
    .map((configuration) => ({
      configuration,
      score: runwayConfigurationHeadwindScore(config, state, configuration)
        + configuration.selectionPriority
        + (configuration.id === state.runwayConfigurationId ? 0.05 : 0),
    }))
    .sort(
      (first, second) => second.score - first.score
        || first.configuration.id.localeCompare(second.configuration.id),
    )[0].configuration;
}

export function changedRunwayConfigurationIds(
  config: AirportConfig,
  state: AirportState,
  configuration: AirportRunwayConfiguration,
): number[] {
  return config.runways
    .filter((runway) => (
      preferredOperatingEnd(config, state, runway.id)
        !== (configuration.operatingEnds[runway.id] ?? runway.landingEnd)
      || activeRunwayRole(config, state, runway.id)
        !== (configuration.runwayRoles[runway.id] ?? runway.role)
    ))
    .map((runway) => runway.id);
}

export function applyRunwayConfiguration(
  config: AirportConfig,
  state: AirportState,
  configuration: AirportRunwayConfiguration,
): void {
  state.runwayConfigurationId = configuration.id;
  state.activeRunwayEnds = Object.fromEntries(
    config.runways.map((runway) => [
      runway.id,
      configuration.operatingEnds[runway.id] ?? runway.landingEnd,
    ]),
  ) as Record<number, -1 | 1>;
  state.activeRunwayRoles = Object.fromEntries(
    config.runways.map((runway) => [
      runway.id,
      configuration.runwayRoles[runway.id] ?? runway.role,
    ]),
  ) as Record<number, RunwayOperationalRole>;
  state.runwayConfigurationTransition = null;
}

import type { Vec3 } from "../playground/flightPlaygroundSimulation";

export type CombatTheaterId =
  "training" | "mountains" | "plains" | "coast" | "desert";
export type CombatAltitudeId = "high" | "medium" | "low";
export type EngagementSetupId =
  "merge" | "altitude-advantage" | "pursuit" | "intercept";
export type CombatWeatherId = "clear" | "scattered" | "overcast" | "haze";

export interface CombatTheaterProfile {
  id: CombatTheaterId;
  name: string;
  shortName: string;
  description: string;
  combatRadiusM: number;
  detailStyle: "forest" | "farms" | "alpine" | "coastal" | "desert";
  palette: {
    low: number;
    middle: number;
    high: number;
    accent: number;
    road: number;
    water: number;
  };
}

export interface CombatAltitudeProfile {
  id: CombatAltitudeId;
  name: string;
  shortName: string;
  description: string;
  baseAltitudeM: number;
  minimumAltitudeM: number;
  maximumAltitudeM: number;
  variationM: number;
}

export interface EngagementSetupProfile {
  id: EngagementSetupId;
  name: string;
  description: string;
}

export interface CombatWeatherProfile {
  id: CombatWeatherId;
  name: string;
  description: string;
  defaultVisibilityKm: number;
  cloudCoverage: number;
  cirrusCoverage: number;
  hazeStrength: number;
  sunlight: number;
}

export interface DogfightScenarioSettings {
  theaterId: CombatTheaterId;
  altitudeId: CombatAltitudeId;
  setupId: EngagementSetupId;
  weatherId: CombatWeatherId;
  visibilityKm: number;
  windSpeedKnots: number;
  windDirectionDeg: number;
}

export interface ScenarioSpawn {
  blue: { position: Vec3; forward: Vec3 };
  red: { position: Vec3; forward: Vec3 };
}

export const COMBAT_THEATER_IDS: readonly CombatTheaterId[] = [
  "training",
  "mountains",
  "plains",
  "coast",
  "desert",
];
export const COMBAT_ALTITUDE_IDS: readonly CombatAltitudeId[] = [
  "high",
  "medium",
  "low",
];
export const ENGAGEMENT_SETUP_IDS: readonly EngagementSetupId[] = [
  "merge",
  "altitude-advantage",
  "pursuit",
  "intercept",
];
export const COMBAT_WEATHER_IDS: readonly CombatWeatherId[] = [
  "clear",
  "scattered",
  "overcast",
  "haze",
];

export const COMBAT_THEATERS: Readonly<
  Record<CombatTheaterId, CombatTheaterProfile>
> = {
  training: {
    id: "training",
    name: "Green Range",
    shortName: "Training range",
    description: "Open rolling country with generous terrain clearance.",
    combatRadiusM: 18_000,
    detailStyle: "forest",
    palette: {
      low: 0x385447,
      middle: 0x68735a,
      high: 0x96917a,
      accent: 0x294336,
      road: 0x958a70,
      water: 0x315d68,
    },
  },
  mountains: {
    id: "mountains",
    name: "Alpine Front",
    shortName: "Mountains",
    description: "Deep valleys and high ridgelines beneath the combat box.",
    combatRadiusM: 22_000,
    detailStyle: "alpine",
    palette: {
      low: 0x334c3e,
      middle: 0x6b695b,
      high: 0xd3d0bd,
      accent: 0x263c31,
      road: 0x8d826f,
      water: 0x315d68,
    },
  },
  plains: {
    id: "plains",
    name: "Continental Plain",
    shortName: "Plains",
    description:
      "Fields, roads and long sightlines give a strong sense of speed.",
    combatRadiusM: 24_000,
    detailStyle: "farms",
    palette: {
      low: 0x536442,
      middle: 0x7d7f4e,
      high: 0xa49a68,
      accent: 0x334b31,
      road: 0xa99a78,
      water: 0x416b74,
    },
  },
  coast: {
    id: "coast",
    name: "Littoral Reach",
    shortName: "Coast",
    description:
      "A broad shoreline, open water and a sparse coastal settlement.",
    combatRadiusM: 23_000,
    detailStyle: "coastal",
    palette: {
      low: 0x49684e,
      middle: 0x7c8261,
      high: 0xa49b78,
      accent: 0x344b3d,
      road: 0xb1a587,
      water: 0x285e70,
    },
  },
  desert: {
    id: "desert",
    name: "Red Mesa",
    shortName: "Desert",
    description: "Dunes, dry basins and mesas under a hard, bright sky.",
    combatRadiusM: 24_000,
    detailStyle: "desert",
    palette: {
      low: 0x8a6042,
      middle: 0xb08055,
      high: 0xd2af79,
      accent: 0x664431,
      road: 0xd0b486,
      water: 0x356a78,
    },
  },
};

export const COMBAT_ALTITUDES: Readonly<
  Record<CombatAltitudeId, CombatAltitudeProfile>
> = {
  high: {
    id: "high",
    name: "High altitude · 34,000 ft",
    shortName: "High",
    description: "Default fighter engagement above the weather and terrain.",
    baseAltitudeM: 10_360,
    minimumAltitudeM: 7_200,
    maximumAltitudeM: 14_600,
    variationM: 950,
  },
  medium: {
    id: "medium",
    name: "Medium altitude · 19,000 ft",
    shortName: "Medium",
    description:
      "A mixed vertical fight with the ground still visually present.",
    baseAltitudeM: 5_800,
    minimumAltitudeM: 2_800,
    maximumAltitudeM: 9_200,
    variationM: 720,
  },
  low: {
    id: "low",
    name: "Low altitude · 8,000 ft",
    shortName: "Low",
    description: "Terrain-aware maneuvering with an aggressive safety floor.",
    baseAltitudeM: 2_440,
    minimumAltitudeM: 620,
    maximumAltitudeM: 5_200,
    variationM: 430,
  },
};

export const ENGAGEMENT_SETUPS: Readonly<
  Record<EngagementSetupId, EngagementSetupProfile>
> = {
  merge: {
    id: "merge",
    name: "Head-on merge",
    description: "Opposing fighters close from several kilometres apart.",
  },
  "altitude-advantage": {
    id: "altitude-advantage",
    name: "High / low advantage",
    description:
      "Blue begins above the merge while red starts with room below.",
  },
  pursuit: {
    id: "pursuit",
    name: "Pursuit",
    description: "Blue begins behind red, outside immediate cannon range.",
  },
  intercept: {
    id: "intercept",
    name: "Crossing intercept",
    description: "The fighters converge on crossing flight paths.",
  },
};

export const COMBAT_WEATHER: Readonly<
  Record<CombatWeatherId, CombatWeatherProfile>
> = {
  clear: {
    id: "clear",
    name: "Clear",
    description: "Dry air, a sharp horizon and only thin cirrus.",
    defaultVisibilityKm: 78,
    cloudCoverage: 0.04,
    cirrusCoverage: 0.16,
    hazeStrength: 0.05,
    sunlight: 1,
  },
  scattered: {
    id: "scattered",
    name: "Scattered layers",
    description: "Broken cloud decks below the usual high-altitude fight.",
    defaultVisibilityKm: 58,
    cloudCoverage: 0.34,
    cirrusCoverage: 0.22,
    hazeStrength: 0.14,
    sunlight: 0.88,
  },
  overcast: {
    id: "overcast",
    name: "Overcast",
    description: "A dense lower deck, muted sun and reduced slant visibility.",
    defaultVisibilityKm: 32,
    cloudCoverage: 0.82,
    cirrusCoverage: 0.08,
    hazeStrength: 0.32,
    sunlight: 0.58,
  },
  haze: {
    id: "haze",
    name: "Heavy haze",
    description:
      "Limited visibility with a washed-out horizon and sparse cloud.",
    defaultVisibilityKm: 18,
    cloudCoverage: 0.12,
    cirrusCoverage: 0.08,
    hazeStrength: 0.62,
    sunlight: 0.7,
  },
};

export const DEFAULT_DOGFIGHT_SCENARIO: Readonly<DogfightScenarioSettings> = {
  theaterId: "mountains",
  altitudeId: "high",
  setupId: "merge",
  weatherId: "scattered",
  visibilityKm: COMBAT_WEATHER.scattered.defaultVisibilityKm,
  windSpeedKnots: 18,
  windDirectionDeg: 270,
};

export function createDefaultDogfightScenario(): DogfightScenarioSettings {
  return { ...DEFAULT_DOGFIGHT_SCENARIO };
}

export function normalizeDogfightScenario(
  scenario: DogfightScenarioSettings,
): DogfightScenarioSettings {
  return {
    ...scenario,
    visibilityKm: clamp(scenario.visibilityKm, 10, 90),
    windSpeedKnots: clamp(scenario.windSpeedKnots, 0, 90),
    windDirectionDeg: ((scenario.windDirectionDeg % 360) + 360) % 360,
  };
}

export function scenarioWindVector(scenario: DogfightScenarioSettings): Vec3 {
  const speedMps = scenario.windSpeedKnots * 0.514444;
  const towardRadians = ((scenario.windDirectionDeg + 180) * Math.PI) / 180;
  return {
    x: Math.sin(towardRadians) * speedMps,
    y: 0,
    z: -Math.cos(towardRadians) * speedMps,
  };
}

export function scenarioOperationalFloorM(
  scenario: DogfightScenarioSettings,
  x: number,
  z: number,
): number {
  const terrainClearance =
    terrainSurfaceAt(scenario.theaterId, x, z).heightM +
    (scenario.altitudeId === "low" ? 360 : 650);
  return Math.max(
    COMBAT_ALTITUDES[scenario.altitudeId].minimumAltitudeM,
    terrainClearance,
  );
}

export function createScenarioSpawn(
  scenario: DogfightScenarioSettings,
  missilesEnabled: boolean,
  horizontalVariation: number,
  altitudeVariation: number,
): ScenarioSpawn {
  const altitude = COMBAT_ALTITUDES[scenario.altitudeId];
  const baseAltitude = altitude.baseAltitudeM;
  const horizontalOffset = (horizontalVariation - 0.5) * 620;
  const verticalOffset = (altitudeVariation - 0.5) * altitude.variationM * 0.55;
  const mergeDistance = missilesEnabled ? 4_600 : 2_450;

  switch (scenario.setupId) {
    case "altitude-advantage":
      return {
        blue: {
          position: {
            x: -2_150,
            y: baseAltitude + altitude.variationM * 0.95 + verticalOffset,
            z: -540 + horizontalOffset,
          },
          forward: { x: 0.98, y: -0.08, z: 0.14 },
        },
        red: {
          position: {
            x: 1_950,
            y: baseAltitude - altitude.variationM * 0.68 - verticalOffset,
            z: 620 - horizontalOffset,
          },
          forward: { x: -0.98, y: 0.055, z: -0.12 },
        },
      };
    case "pursuit":
      return {
        blue: {
          position: {
            x: -2_350,
            y: baseAltitude + 460 + verticalOffset,
            z: -260 + horizontalOffset * 0.35,
          },
          forward: { x: 0.995, y: -0.018, z: 0.08 },
        },
        red: {
          position: {
            x: 350,
            y: baseAltitude - 120 - verticalOffset * 0.3,
            z: 180,
          },
          forward: { x: 0.99, y: 0.012, z: 0.11 },
        },
      };
    case "intercept":
      return {
        blue: {
          position: {
            x: -3_650,
            y: baseAltitude + 380 + verticalOffset,
            z: -850 + horizontalOffset,
          },
          forward: { x: 0.99, y: 0.018, z: 0.12 },
        },
        red: {
          position: {
            x: 680,
            y: baseAltitude - 260 - verticalOffset,
            z: -3_850,
          },
          forward: { x: -0.12, y: 0.016, z: 0.99 },
        },
      };
    case "merge":
    default:
      return {
        blue: {
          position: {
            x: -mergeDistance,
            y: baseAltitude + verticalOffset,
            z: -220 + horizontalOffset,
          },
          forward: { x: 1, y: 0.012, z: 0.055 },
        },
        red: {
          position: {
            x: mergeDistance,
            y: baseAltitude + 170 - verticalOffset,
            z: 240 - horizontalOffset,
          },
          forward: { x: -1, y: -0.01, z: -0.05 },
        },
      };
  }
}

export function terrainSurfaceAt(
  theaterId: CombatTheaterId,
  x: number,
  z: number,
): { heightM: number; water: boolean } {
  if (theaterId === "coast") {
    const shoreline =
      Math.sin(z * 0.00019) * 2_350 +
      Math.sin(z * 0.000047 + 1.4) * 1_300 -
      2_200;
    if (x < shoreline) return { heightM: 4, water: true };
    const inland = Math.min(1, Math.max(0, (x - shoreline) / 8_500));
    const coastalHills =
      Math.abs(Math.sin(x * 0.00041 + z * 0.00027)) * 250 +
      Math.sin((x - z) * 0.00031) * 75;
    return {
      heightM: Math.max(12, 26 + inland * 170 + coastalHills * inland),
      water: false,
    };
  }

  if (theaterId === "mountains") {
    const ridgeA =
      Math.pow(Math.abs(Math.sin(x * 0.00028 + z * 0.00012)), 2.4) * 1_680;
    const ridgeB =
      Math.pow(Math.abs(Math.sin(z * 0.00037 - x * 0.00009)), 3.1) * 980;
    const folded = Math.sin((x + z) * 0.00018) * 260;
    return {
      heightM: Math.max(90, 260 + ridgeA + ridgeB + folded),
      water: false,
    };
  }

  if (theaterId === "plains") {
    const broad = Math.sin(x * 0.00012) * Math.cos(z * 0.00015) * 54;
    const drainage = Math.abs(Math.sin((x + z) * 0.00031)) * 42;
    return { heightM: Math.max(28, 84 + broad + drainage), water: false };
  }

  if (theaterId === "desert") {
    const dunes =
      Math.sin(x * 0.00042 + z * 0.00013) * 75 + Math.sin(z * 0.00073) * 38;
    const mesas =
      Math.pow(Math.abs(Math.sin(x * 0.00016 - z * 0.00021)), 7) * 540;
    return { heightM: Math.max(65, 180 + dunes + mesas), water: false };
  }

  const broad = Math.sin(x * 0.00072) * Math.cos(z * 0.00064) * 115;
  const ridges =
    Math.abs(Math.sin(x * 0.00117 + z * 0.00051)) * 135 +
    Math.sin((x - z) * 0.00163) * 42;
  const basin = Math.cos(Math.hypot(x + 900, z - 600) * 0.0011) * 48;
  return {
    heightM: Math.max(8, 72 + broad + ridges + basin),
    water: false,
  };
}

export function scenarioLabel(scenario: DogfightScenarioSettings): string {
  return `${COMBAT_THEATERS[scenario.theaterId].shortName} · ${COMBAT_ALTITUDES[scenario.altitudeId].shortName}`;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

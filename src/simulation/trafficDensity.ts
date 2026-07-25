export type TrafficDensity = 'quiet' | 'realistic' | 'busy' | 'rush' | 'extreme';

export interface TrafficDensityProfile {
  id: TrafficDensity;
  label: string;
  description: string;
  /** Demand presented to the airport before operational constraints. */
  demandMultiplier: number;
  /** Modeled controller/runway throughput, never a safety-separation override. */
  arrivalCapacityMultiplier: number;
  /** Gate-release cadence, never a runway/surface reservation override. */
  departureCapacityMultiplier: number;
  /** Maximum number of not-yet-rendered inbound demands retained by the meter. */
  holdingCapacity: number;
  /** Scales the airport's active-entity budget while preserving hard safety checks. */
  activeTrafficMultiplier: number;
  maximumArrivalDelaySeconds: number;
  maximumDepartureDelaySeconds: number;
  recoveryDelaySeconds: number;
  assumptions: string[];
}

export const TRAFFIC_DENSITY_PROFILES: Record<TrafficDensity, TrafficDensityProfile> = {
  quiet: {
    id: 'quiet',
    label: 'Quiet',
    description: 'A low-demand soundscape with generous gaps and a short inbound queue.',
    demandMultiplier: 0.46,
    arrivalCapacityMultiplier: 0.72,
    departureCapacityMultiplier: 0.72,
    holdingCapacity: 2,
    activeTrafficMultiplier: 0.58,
    maximumArrivalDelaySeconds: 48,
    maximumDepartureDelaySeconds: 90,
    recoveryDelaySeconds: 34,
    assumptions: [
      'About half of the schematic demand reaches the airport.',
      'Runway and gate capacity are deliberately under-scheduled.',
      'Safety, wake, weather, and pavement reservations remain unchanged.',
    ],
  },
  realistic: {
    id: 'realistic',
    label: 'Realistic',
    description: 'The airport profile’s nominal demand and modeled capacity.',
    demandMultiplier: 1,
    arrivalCapacityMultiplier: 1,
    departureCapacityMultiplier: 1,
    holdingCapacity: 4,
    activeTrafficMultiplier: 1,
    maximumArrivalDelaySeconds: 72,
    maximumDepartureDelaySeconds: 120,
    recoveryDelaySeconds: 28,
    assumptions: [
      'One compressed local minute passes per simulation second at 1×.',
      'Demand follows the airport profile, not a live or ticketed schedule.',
      'Safety remains bounded by runway, wake, weather, gate, and surface rules.',
    ],
  },
  busy: {
    id: 'busy',
    label: 'Busy',
    description: 'A sustained bank with modestly expanded modeled staffing capacity.',
    demandMultiplier: 1.28,
    arrivalCapacityMultiplier: 1.08,
    departureCapacityMultiplier: 1.1,
    holdingCapacity: 6,
    activeTrafficMultiplier: 1.18,
    maximumArrivalDelaySeconds: 86,
    maximumDepartureDelaySeconds: 138,
    recoveryDelaySeconds: 24,
    assumptions: [
      'Demand rises faster than capacity, so visible metering is expected.',
      'Additional capacity represents a coordinated busy configuration.',
      'No collision, runway, wake, or pavement rule is weakened.',
    ],
  },
  rush: {
    id: 'rush',
    label: 'Rush',
    description: 'Hub-bank pressure with deep queues and all modeled runway capacity in use.',
    demandMultiplier: 1.58,
    arrivalCapacityMultiplier: 1.16,
    departureCapacityMultiplier: 1.2,
    holdingCapacity: 8,
    activeTrafficMultiplier: 1.38,
    maximumArrivalDelaySeconds: 105,
    maximumDepartureDelaySeconds: 165,
    recoveryDelaySeconds: 20,
    assumptions: [
      'Demand intentionally exceeds sustainable capacity during bank peaks.',
      'Back-pressure, holding, gate changes, and occasional diversions are expected.',
      'The safety arbiter has final authority over every release.',
    ],
  },
  extreme: {
    id: 'extreme',
    label: 'Extreme',
    description: 'A stress profile for queues, recovery, and long-session testing.',
    demandMultiplier: 2.05,
    arrivalCapacityMultiplier: 1.24,
    departureCapacityMultiplier: 1.28,
    holdingCapacity: 10,
    activeTrafficMultiplier: 1.65,
    maximumArrivalDelaySeconds: 125,
    maximumDepartureDelaySeconds: 190,
    recoveryDelaySeconds: 18,
    assumptions: [
      'Demand is deliberately above the modeled airport’s normal capacity.',
      'Diversions and cancelled release slots are successful pressure relief, not failures.',
      'This is a deterministic stress mode; safety rules remain unchanged and it is not a claim about real airport throughput.',
    ],
  },
};

export const TRAFFIC_DENSITIES = Object.keys(TRAFFIC_DENSITY_PROFILES) as TrafficDensity[];

export function trafficDensityProfile(density: TrafficDensity): TrafficDensityProfile {
  return TRAFFIC_DENSITY_PROFILES[density];
}

export function isTrafficDensity(value: string): value is TrafficDensity {
  return TRAFFIC_DENSITIES.includes(value as TrafficDensity);
}

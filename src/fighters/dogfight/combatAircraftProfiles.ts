export const DOGFIGHT_AIRCRAFT_IDS = [
  "f-35",
  "j-20",
  "f-22",
  "mig-35",
] as const;

export type DogfightAircraftId = (typeof DOGFIGHT_AIRCRAFT_IDS)[number];

export interface AircraftSpecificationSource {
  publisher: string;
  title: string;
  url: string;
}

export interface PublicAircraftSpecifications {
  variant: string;
  nation: string;
  manufacturer: string;
  firstFlight: number;
  lengthM: number;
  wingspanM: number;
  heightM: number;
  emptyWeightKg: number | null;
  normalTakeoffWeightKg: number | null;
  maximumTakeoffWeightKg: number | null;
  internalFuelKg: number | null;
  maximumSpeed: string;
  serviceCeiling: string;
  range: string;
  combatRadius: string;
  maximumG: string;
  engines: string;
  cannon: string;
  airToAirLoadout: string;
  disclosure: "official" | "limited-public";
  note: string;
  sources: readonly AircraftSpecificationSource[];
}

export interface GameAircraftEnvelope {
  preferredSpeedMps: number;
  minimumSpeedMps: number;
  maximumSpeedMps: number;
  airframeTurnRateRadPerSecond: number;
  accelerationMps2: number;
  decelerationMps2: number;
  lockRateMultiplier: number;
  missileCooldownSeconds: number;
  maximumG: number;
}

export interface DogfightAircraftProfile {
  id: DogfightAircraftId;
  name: string;
  shortName: string;
  specifications: PublicAircraftSpecifications;
  game: GameAircraftEnvelope;
}

const USAF_F35_SOURCE: AircraftSpecificationSource = {
  publisher: "United States Air Force",
  title: "F-35A Lightning II fact sheet",
  url: "https://www.af.mil/About-Us/Fact-Sheets/Display/Article/478441/f-35a-lightning-ii-conventional-takeoff-and-landing-variant/",
};

const LOCKHEED_F35_SOURCE: AircraftSpecificationSource = {
  publisher: "Lockheed Martin",
  title: "F-35A product card",
  url: "https://www.lockheedmartin.com/content/dam/lockheed-martin/aero/f35/documents/F-35A%20Product%20Card.pdf",
};

const USAF_F35_GUN_SOURCE: AircraftSpecificationSource = {
  publisher: "United States Air Force",
  title: "F-35A airborne gun firing test",
  url: "https://www.af.mil/News/Article-Display/Article/627610/f-35a-successfully-fires-first-airborne-shots/",
};

const USAF_F22_SOURCE: AircraftSpecificationSource = {
  publisher: "United States Air Force",
  title: "F-22 Raptor fact sheet",
  url: "https://www.af.mil/About-Us/Fact-Sheets/Display/Article/104506/f-22-raptor/",
};

const USAF_F22_G_SOURCE: AircraftSpecificationSource = {
  publisher: "United States Air Force",
  title: "F-22 pilot nine-G operating reference",
  url: "https://www.mildenhall.af.mil/News/Article-Display/Article/2017872/fit-to-fight-one-fighter-wing-at-a-time/",
};

const CHINA_MOD_J20_SOURCE: AircraftSpecificationSource = {
  publisher: "PRC Ministry of National Defense",
  title: "J-20 program history and service status",
  url: "https://eng.mod.gov.cn/xb/News_213114/TopStories/4876978.html",
};

const UAC_MIG35_SOURCE: AircraftSpecificationSource = {
  publisher: "United Aircraft Corporation",
  title: "MiG-35 flight specifications",
  url: "https://uacrussia.ru/en/aircraft/lineup/military/mig-35/",
};

const ROSOBORONEXPORT_MIG35_SOURCE: AircraftSpecificationSource = {
  publisher: "Rosoboronexport",
  title: "MiG-35/35D public product sheet",
  url: "https://roe.ru/pdfs/pdf_6930.pdf",
};

export const DOGFIGHT_AIRCRAFT_PROFILES: Readonly<
  Record<DogfightAircraftId, DogfightAircraftProfile>
> = {
  "f-35": {
    id: "f-35",
    name: "F-35A Lightning II",
    shortName: "F-35A",
    specifications: {
      variant: "F-35A conventional-takeoff variant",
      nation: "United States",
      manufacturer: "Lockheed Martin",
      firstFlight: 2006,
      lengthM: 15.7,
      wingspanM: 10.7,
      heightM: 4.38,
      emptyWeightKg: 13290,
      normalTakeoffWeightKg: null,
      maximumTakeoffWeightKg: 31750,
      internalFuelKg: 8278,
      maximumSpeed: "Mach 1.6 (about 1,975 km/h)",
      serviceCeiling: "Above 15,000 m / 50,000 ft",
      range: "More than 2,200 km / 1,200 nmi on internal fuel",
      combatRadius: "More than 1,093 km / 590 nmi",
      maximumG: "9.0 G",
      engines: "1 × Pratt & Whitney F135-PW-100",
      cannon: "25 mm GAU-22/A, 181-round installation",
      airToAirLoadout:
        "Internal and external stations; load varies by mission and software block",
      disclosure: "official",
      note: "Dimensions, fuel, range, speed, and G rating are public F-35A figures. The arena deliberately compresses speed and weapon behavior.",
      sources: [USAF_F35_SOURCE, LOCKHEED_F35_SOURCE, USAF_F35_GUN_SOURCE],
    },
    game: {
      preferredSpeedMps: 278,
      minimumSpeedMps: 205,
      maximumSpeedMps: 318,
      airframeTurnRateRadPerSecond: 0.82,
      accelerationMps2: 15,
      decelerationMps2: 19,
      lockRateMultiplier: 1.12,
      missileCooldownSeconds: 1.1,
      maximumG: 9,
    },
  },
  "j-20": {
    id: "j-20",
    name: "Chengdu J-20",
    shortName: "J-20",
    specifications: {
      variant: "Single-seat public-view production schematic",
      nation: "China",
      manufacturer: "Chengdu Aircraft Industry Group",
      firstFlight: 2011,
      lengthM: 20.4,
      wingspanM: 13.5,
      heightM: 4.45,
      emptyWeightKg: null,
      normalTakeoffWeightKg: null,
      maximumTakeoffWeightKg: null,
      internalFuelKg: null,
      maximumSpeed: "Not officially published; archive estimate ≈2,100 km/h",
      serviceCeiling: "Not officially published; archive estimate ≈20,000 m",
      range: "Officially described as long-range; no public figure",
      combatRadius: "Not officially published",
      maximumG: "Not officially published",
      engines: "2 × turbofans; production fit varies by block",
      cannon: "No cannon specification confirmed by the cited official source",
      airToAirLoadout:
        "Internal air-to-air weapon bays are publicly visible; capacity is not officially stated",
      disclosure: "limited-public",
      note: "Chinese official sources confirm the program, service entry, and long-range stealth role but do not publish a complete performance table. Dimensions and numeric performance shown here are clearly marked public estimates.",
      sources: [CHINA_MOD_J20_SOURCE],
    },
    game: {
      preferredSpeedMps: 271,
      minimumSpeedMps: 207,
      maximumSpeedMps: 316,
      airframeTurnRateRadPerSecond: 0.76,
      accelerationMps2: 14,
      decelerationMps2: 18,
      lockRateMultiplier: 1.04,
      missileCooldownSeconds: 1.35,
      maximumG: 9,
    },
  },
  "f-22": {
    id: "f-22",
    name: "F-22A Raptor",
    shortName: "F-22A",
    specifications: {
      variant: "F-22A air-dominance fighter",
      nation: "United States",
      manufacturer: "Lockheed Martin / Boeing",
      firstFlight: 1997,
      lengthM: 18.9,
      wingspanM: 13.6,
      heightM: 5.1,
      emptyWeightKg: 19700,
      normalTakeoffWeightKg: null,
      maximumTakeoffWeightKg: 38000,
      internalFuelKg: 8200,
      maximumSpeed: "Mach 2 class; supercruise above Mach 1.5",
      serviceCeiling: "Above 15,000 m / 50,000 ft",
      range: "More than 2,980 km / 1,600 nmi ferry with two tanks",
      combatRadius: "Not stated on the cited USAF fact sheet",
      maximumG: "Approximately 9 G public operating capability",
      engines: "2 × Pratt & Whitney F119-PW-100 with 2D vectoring",
      cannon: "20 mm M61A2, 480 rounds",
      airToAirLoadout: "6 × AIM-120 and 2 × AIM-9 in internal bays",
      disclosure: "official",
      note: "The USAF publishes dimensions, weight, fuel, speed class, ceiling, ferry range, and the standard air-to-air load. Classified sensor and signature performance is not inferred.",
      sources: [USAF_F22_SOURCE, USAF_F22_G_SOURCE],
    },
    game: {
      preferredSpeedMps: 288,
      minimumSpeedMps: 198,
      maximumSpeedMps: 326,
      airframeTurnRateRadPerSecond: 0.88,
      accelerationMps2: 17,
      decelerationMps2: 20,
      lockRateMultiplier: 1.1,
      missileCooldownSeconds: 1.12,
      maximumG: 9,
    },
  },
  "mig-35": {
    id: "mig-35",
    name: "Mikoyan MiG-35",
    shortName: "MiG-35",
    specifications: {
      variant: "Single-seat MiG-35",
      nation: "Russia",
      manufacturer: "Mikoyan / United Aircraft Corporation",
      firstFlight: 2016,
      lengthM: 17.3,
      wingspanM: 12,
      heightM: 4.4,
      emptyWeightKg: null,
      normalTakeoffWeightKg: 19200,
      maximumTakeoffWeightKg: 24500,
      internalFuelKg: 4600,
      maximumSpeed: "2,100 km/h at altitude; 1,400 km/h near ground",
      serviceCeiling: "16,000 m / 52,493 ft",
      range:
        "1,800–2,000 km clean at altitude; 2,800–3,000 km with three tanks",
      combatRadius: "1,000–1,400 km in published air-combat configuration",
      maximumG: "9.0 G",
      engines: "2 × RD-33MK, 9,000 kgf class each",
      cannon: "Internal GSh-30-1 family 30 mm gun; cited pages omit capacity",
      airToAirLoadout:
        "9 external stations; short- and medium-range air-to-air missiles",
      disclosure: "official",
      note: "UAC calls the MiG-35 its newest MiG multifunctional fighter and publishes a complete dimensional and flight-performance table. The unflown MiG-41 concept is not treated as an aircraft option.",
      sources: [UAC_MIG35_SOURCE, ROSOBORONEXPORT_MIG35_SOURCE],
    },
    game: {
      preferredSpeedMps: 282,
      minimumSpeedMps: 200,
      maximumSpeedMps: 322,
      airframeTurnRateRadPerSecond: 0.86,
      accelerationMps2: 16,
      decelerationMps2: 20,
      lockRateMultiplier: 0.98,
      missileCooldownSeconds: 1.2,
      maximumG: 9,
    },
  },
} as const;

export function dogfightAircraftProfile(
  id: DogfightAircraftId,
): DogfightAircraftProfile {
  return DOGFIGHT_AIRCRAFT_PROFILES[id];
}

export function isDogfightAircraftId(
  value: string,
): value is DogfightAircraftId {
  return DOGFIGHT_AIRCRAFT_IDS.includes(value as DogfightAircraftId);
}

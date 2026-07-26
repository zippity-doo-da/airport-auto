export interface AirportPlace {
  code: string;
  city: string;
  country: string;
}

type AirportCities = Readonly<Record<string, string>>;

/**
 * Small offline directory covering every market in the current traffic
 * programs. It is presentation metadata only—not current navigation data.
 * City/country seeds were checked against the OurAirports public data export
 * on 2026-07-26, then shortened into player-facing place names.
 */
const AIRPORTS_BY_COUNTRY: Readonly<Record<string, AirportCities>> = {
  "United States": {
    ABI: "Abilene",
    ABQ: "Albuquerque",
    ACK: "Nantucket",
    ADS: "Dallas",
    AFW: "Fort Worth",
    AMA: "Amarillo",
    ANC: "Anchorage",
    APA: "Denver",
    ASE: "Aspen",
    ATL: "Atlanta",
    AUS: "Austin",
    AVL: "Asheville",
    BHM: "Birmingham",
    BIL: "Billings",
    BJC: "Denver",
    BOI: "Boise",
    BOS: "Boston",
    BTV: "Burlington",
    BUF: "Buffalo",
    BUR: "Burbank",
    CHA: "Chattanooga",
    CID: "Cedar Rapids",
    CLT: "Charlotte",
    CMH: "Columbus",
    COS: "Colorado Springs",
    CSG: "Columbus",
    DAL: "Dallas",
    DCA: "Washington, D.C.",
    DEN: "Denver",
    DFW: "Dallas–Fort Worth",
    DPA: "Chicago",
    DSM: "Des Moines",
    DTW: "Detroit",
    EWR: "Newark",
    FAT: "Fresno",
    FRG: "Farmingdale",
    FTW: "Fort Worth",
    FTY: "Atlanta",
    GJT: "Grand Junction",
    GRR: "Grand Rapids",
    GSP: "Greenville–Spartanburg",
    GXY: "Greeley",
    HNL: "Honolulu",
    HPN: "White Plains",
    IAH: "Houston",
    IND: "Indianapolis",
    ISP: "Islip",
    JAX: "Jacksonville",
    JFK: "New York",
    LAS: "Las Vegas",
    LAX: "Los Angeles",
    LBB: "Lubbock",
    LGA: "New York",
    LGB: "Long Beach",
    MCO: "Orlando",
    MEM: "Memphis",
    MIA: "Miami",
    MKE: "Milwaukee",
    MOB: "Mobile",
    MRY: "Monterey",
    MSP: "Minneapolis–Saint Paul",
    MVY: "Martha's Vineyard",
    OKC: "Oklahoma City",
    OMA: "Omaha",
    ORD: "Chicago",
    PDK: "Atlanta",
    PHX: "Phoenix",
    PSP: "Palm Springs",
    PWK: "Chicago",
    PWM: "Portland, Maine",
    RAP: "Rapid City",
    RFD: "Rockford",
    ROC: "Rochester",
    SAN: "San Diego",
    SAT: "San Antonio",
    SAV: "Savannah",
    SBA: "Santa Barbara",
    SDF: "Louisville",
    SEA: "Seattle",
    SFO: "San Francisco",
    SHV: "Shreveport",
    SJC: "San Jose",
    SLC: "Salt Lake City",
    SMF: "Sacramento",
    SNA: "Orange County",
    STL: "St. Louis",
    SYR: "Syracuse",
    TEB: "Teterboro",
    TUL: "Tulsa",
    TYS: "Knoxville",
    UGN: "Waukegan",
    VNY: "Van Nuys",
  },
  Australia: { SYD: "Sydney" },
  Austria: { VIE: "Vienna" },
  Bahrain: { BAH: "Manama" },
  Canada: { YTZ: "Toronto", YUL: "Montréal", YVR: "Vancouver", YYZ: "Toronto" },
  France: { CDG: "Paris" },
  Germany: { FRA: "Frankfurt", MUC: "Munich" },
  "Hong Kong": { HKG: "Hong Kong" },
  India: { BOM: "Mumbai", DEL: "New Delhi" },
  Ireland: { DUB: "Dublin" },
  Italy: { FCO: "Rome" },
  Japan: {
    AOJ: "Aomori",
    AXT: "Akita",
    CTS: "Sapporo",
    FUK: "Fukuoka",
    HKD: "Hakodate",
    HND: "Tokyo",
    ITM: "Osaka",
    KIX: "Osaka",
    KOJ: "Kagoshima",
    MYJ: "Matsuyama",
    NRT: "Tokyo",
    OKA: "Naha",
    TAK: "Takamatsu",
  },
  Jersey: { JER: "Jersey" },
  Kuwait: { KWI: "Kuwait City" },
  Mexico: { MEX: "Mexico City" },
  Netherlands: { AMS: "Amsterdam" },
  Oman: { MCT: "Muscat" },
  Pakistan: { KHI: "Karachi" },
  Poland: { KRK: "Kraków", WAW: "Warsaw" },
  Qatar: { DOH: "Doha" },
  "Saudi Arabia": { DMM: "Dammam", JED: "Jeddah", RUH: "Riyadh" },
  Singapore: { SIN: "Singapore" },
  "South Korea": { ICN: "Seoul" },
  Spain: { MAD: "Madrid" },
  Switzerland: { ZRH: "Zürich" },
  Taiwan: { TPE: "Taipei" },
  Türkiye: {
    ADB: "İzmir",
    AYT: "Antalya",
    BJV: "Bodrum",
    DLM: "Dalaman",
    ESB: "Ankara",
    GZT: "Gaziantep",
    ISL: "Istanbul",
    IST: "Istanbul",
    SAW: "Istanbul",
    TEQ: "Çorlu",
    TZX: "Trabzon",
  },
  "United Arab Emirates": {
    AUH: "Abu Dhabi",
    DWC: "Dubai",
    DXB: "Dubai",
    SHJ: "Sharjah",
  },
  "United Kingdom": {
    ABZ: "Aberdeen",
    BHD: "Belfast",
    EDI: "Edinburgh",
    EMA: "East Midlands",
    FAB: "Farnborough",
    GLA: "Glasgow",
    LCY: "London",
    LHR: "London",
    LTN: "London",
    MAN: "Manchester",
    NCL: "Newcastle",
  },
};

const ICAO_ALIASES: Readonly<Record<string, string>> = {
  EDDF: "FRA",
  EGLL: "LHR",
  LFPG: "CDG",
  LIRF: "FCO",
  LTFM: "IST",
  OMDB: "DXB",
  RCTP: "TPE",
  RJAA: "NRT",
  RJBB: "KIX",
  RJTT: "HND",
  RKSI: "ICN",
  VIDP: "DEL",
  WSSS: "SIN",
};

const AIRPORT_PLACE_BY_CODE = new Map<string, AirportPlace>();
for (const [country, cities] of Object.entries(AIRPORTS_BY_COUNTRY)) {
  for (const [code, city] of Object.entries(cities)) {
    AIRPORT_PLACE_BY_CODE.set(code, { code, city, country });
  }
}

export function normalizeAirportCode(value: string): string {
  const code = value.trim().toUpperCase();
  if (AIRPORT_PLACE_BY_CODE.has(code)) return code;
  const alias = ICAO_ALIASES[code];
  if (alias) return alias;
  if (
    code.length === 4 &&
    code.startsWith("K") &&
    AIRPORT_PLACE_BY_CODE.has(code.slice(1))
  ) {
    return code.slice(1);
  }
  return code;
}

export function airportPlace(value: string): AirportPlace | null {
  const code = normalizeAirportCode(value);
  if (code === "LOCAL")
    return { code, city: "Local airfield", country: "Fictional region" };
  return AIRPORT_PLACE_BY_CODE.get(code) ?? null;
}

export function airportPlaceLabel(value: string, includeCode = true): string {
  const code = normalizeAirportCode(value);
  const place = airportPlace(code);
  if (!place) return code || "Unknown airport";
  const location = `${place.city}, ${place.country}`;
  return includeCode ? `${place.code} · ${location}` : location;
}

export function airportRouteLabel(origin: string, destination: string): string {
  return `${airportPlaceLabel(origin)} → ${airportPlaceLabel(destination)}`;
}

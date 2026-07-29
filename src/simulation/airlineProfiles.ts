export type AirlineCode = | "UA" | "AA" | "DL" | "WN" | "B6" | "F9" | "AS" | "EK" | "FZ" | "NH" | "JL" | "BA" | "VS" | "TK" | "LH" | "OS" | "KL"
  | "AF"
  | "QR"
  | "AC"
  | "EI"
  | "IB"
  | "LO"
  | "KE"
  | "LX"
  | "5X"
  | "FX"
  | "FDX"
  | "LOCAL";

/** Original, logo-free paint grammar used by the procedural aircraft assets. */
export type AirlineLiveryStyle = "ribbon" | "tail-band" | "belly-sweep" | "minimal";

export interface AirlineProfile {
  code: AirlineCode;
  name: string;
  callsign: string;
  primaryColor: number;
  accentColor: number;
  cargo: boolean;
  registrationPrefix: string;
}

/**
 * Original, logo-free livery guidance. These are color-blocking references,
 * not copied marks or airline artwork: the renderer uses them to keep a light
 * fuselage distinct from its airline-colored tail at hub scale.
 */
export interface AirlineLiveryPresentation {
  fuselageColor: number;
  tailColor: number;
  style: AirlineLiveryStyle;
}

export const AIRLINE_PROFILES: Record<AirlineCode, AirlineProfile> = {
  UA: { code: "UA", name: "United Airlines", callsign: "United", primaryColor: 0x5d8fc4, accentColor: 0xf0c75e, cargo: false, registrationPrefix: "N", },
  AA: { code: "AA", name: "American Airlines", callsign: "American", primaryColor: 0xbac5c7, accentColor: 0xd63d43, cargo: false, registrationPrefix: "N", },
  DL: { code: "DL", name: "Delta Air Lines", callsign: "Delta", primaryColor: 0x9d3047, accentColor: 0x507caf, cargo: false, registrationPrefix: "N", },
  WN: { code: "WN", name: "Southwest Airlines", callsign: "Southwest", primaryColor: 0xf4b63e, accentColor: 0x2c6e9f, cargo: false, registrationPrefix: "N", },
  B6: { code: "B6", name: "JetBlue", callsign: "JetBlue", primaryColor: 0x2e71a8, accentColor: 0x8dc5dc, cargo: false, registrationPrefix: "N", },
  F9: { code: "F9", name: "Frontier Airlines", callsign: "Frontier", primaryColor: 0x4e7b49, accentColor: 0xd4e5b5, cargo: false, registrationPrefix: "N", },
  AS: { code: "AS", name: "Alaska Airlines", callsign: "Alaska", primaryColor: 0x34586f, accentColor: 0x7bb9ae, cargo: false, registrationPrefix: "N", },
  EK: { code: "EK", name: "Emirates", callsign: "Emirates", primaryColor: 0xe8e2d8, accentColor: 0xc9433d, cargo: false, registrationPrefix: "A6-", },
  FZ: { code: "FZ", name: "flydubai", callsign: "Sky Dubai", primaryColor: 0x2f73a8, accentColor: 0xf09a43, cargo: false, registrationPrefix: "A6-F", },
  NH: { code: "NH", name: "All Nippon Airways", callsign: "All Nippon", primaryColor: 0xe8eef0, accentColor: 0x3a69a8, cargo: false, registrationPrefix: "JA", },
  JL: { code: "JL", name: "Japan Airlines", callsign: "Japan Air", primaryColor: 0xeee9df, accentColor: 0xc93e42, cargo: false, registrationPrefix: "JA", },
  BA: { code: "BA", name: "British Airways", callsign: "Speedbird", primaryColor: 0xe8ece9, accentColor: 0x274a83, cargo: false, registrationPrefix: "G-", },
  VS: { code: "VS", name: "Virgin Atlantic", callsign: "Virgin", primaryColor: 0xe9e4df, accentColor: 0xc63e52, cargo: false, registrationPrefix: "G-V", },
  TK: { code: "TK", name: "Turkish Airlines", callsign: "Turkish", primaryColor: 0xe9e5df, accentColor: 0xc53f43, cargo: false, registrationPrefix: "TC-", },
  LH: { code: "LH", name: "Lufthansa", callsign: "Lufthansa", primaryColor: 0xe8e5da,
    accentColor: 0x314a79,
    cargo: false,
    registrationPrefix: "D-A",
  },
  OS: {
    code: "OS",
    name: "Austrian Airlines",
    callsign: "Austrian",
    primaryColor: 0xeee9e1,
    accentColor: 0xc64b45,
    cargo: false,
    registrationPrefix: "OE-L",
  },
  KL: {
    code: "KL",
    name: "KLM Royal Dutch Airlines",
    callsign: "KLM",
    primaryColor: 0x79b8cc,
    accentColor: 0xece8dc,
    cargo: false,
    registrationPrefix: "PH-",
  },
  AF: {
    code: "AF",
    name: "Air France",
    callsign: "Airfrans",
    primaryColor: 0xe9e9e4,
    accentColor: 0x465a82,
    cargo: false,
    registrationPrefix: "F-G",
  },
  QR: {
    code: "QR",
    name: "Qatar Airways",
    callsign: "Qatari",
    primaryColor: 0xd8d1cc,
    accentColor: 0x79475e,
    cargo: false,
    registrationPrefix: "A7-",
  },
  AC: {
    code: "AC",
    name: "Air Canada",
    callsign: "Air Canada",
    primaryColor: 0xdfe7e5,
    accentColor: 0xb94749,
    cargo: false,
    registrationPrefix: "C-F",
  },
  EI: {
    code: "EI",
    name: "Aer Lingus",
    callsign: "Shamrock",
    primaryColor: 0x5d9b86,
    accentColor: 0xdbe6d8,
    cargo: false,
    registrationPrefix: "EI-",
  },
  IB: {
    code: "IB",
    name: "Iberia",
    callsign: "Iberia",
    primaryColor: 0xe8e2d7,
    accentColor: 0xc94f43,
    cargo: false,
    registrationPrefix: "EC-",
  },
  LO: {
    code: "LO",
    name: "LOT Polish Airlines",
    callsign: "Lot",
    primaryColor: 0xe9e8df,
    accentColor: 0x4f6387,
    cargo: false,
    registrationPrefix: "SP-L",
  },
  KE: {
    code: "KE",
    name: "Korean Air",
    callsign: "Korean Air",
    primaryColor: 0x87b5c8,
    accentColor: 0xc95c67,
    cargo: false,
    registrationPrefix: "HL",
  },
  LX: {
    code: "LX",
    name: "Swiss International Air Lines",
    callsign: "Swiss",
    primaryColor: 0xe7e4dd,
    accentColor: 0xb84545,
    cargo: false,
    registrationPrefix: "HB-J",
  },
  "5X": {
    code: "5X",
    name: "UPS Airlines",
    callsign: "UPS", primaryColor: 0x5a392c, accentColor: 0xf0c346, cargo: true, registrationPrefix: "N", },
  FX: { code: "FX", name: "FedEx Express", callsign: "FedEx", primaryColor: 0x70529a, accentColor: 0xe8a12b, cargo: true, registrationPrefix: "N", },
  FDX: { code: "FDX", name: "FedEx Express", callsign: "FedEx", primaryColor: 0x70529a, accentColor: 0xe8a12b, cargo: true, registrationPrefix: "N", },
  LOCAL: { code: "LOCAL", name: "Independent charter", callsign: "Charter", primaryColor: 0x789b92, accentColor: 0xe8dfbf, cargo: false, registrationPrefix: "N", },
};

export const AIRPORT_AIRLINES: Record<string, AirlineCode[]> = {
  ORD: [
    "UA",
    "AA",
    "UA",
    "AA",
    "LH",
    "OS",
    "JL",
    "NH",
    "BA",
    "KL",
    "AF",
    "QR",
    "AC",
    "EI",
    "IB",
    "LO",
    "KE",
    "LX",
    "EK",
    "TK",
    "5X",
    "WN",],
  ATL: [
    "DL", "DL", "WN", "AA", "UA", "F9", "B6", "AS",
    "AF", "BA", "KL", "KE", "LH", "QR", "TK", "VS",
    "5X", "FX",
  ],
  DXB: ["EK", "EK", "FZ", "BA", "TK", "FX"],
  HND: ["NH", "JL", "NH", "JL", "DL", "UA", "AA"],
  DFW: ["AA", "AA", "WN", "FX", "5X"],
  LHR: ["BA", "BA", "VS", "AA", "UA", "TK"],
  IST: ["TK", "TK", "BA", "EK", "FX"],
  DEN: ["UA", "UA", "WN", "F9", "FX"],
  LAX: ["AA", "UA", "DL", "WN", "AS", "5X"],
  JFK: ["B6", "DL", "AA", "UA", "FX"],
  LOCAL: ["LOCAL", "LOCAL", "WN", "F9"],
};

export function airlineProfile(code: AirlineCode): AirlineProfile {
  return AIRLINE_PROFILES[code];
}

export function airlineLiveryStyle(code: AirlineCode): AirlineLiveryStyle {
  return airlineLiveryPresentation(code).style;
}

export function airlineLiveryPresentation(
  code: AirlineCode,
): AirlineLiveryPresentation {
  const profile = AIRLINE_PROFILES[code];
  const lightFuselage = 0xeee9e1;
  const tailored: Partial<Record<AirlineCode, AirlineLiveryPresentation>> = {
    UA: { fuselageColor: lightFuselage, tailColor: 0x2e679d, style: "ribbon" },
    AA: { fuselageColor: 0xe7eceb, tailColor: 0x365f93, style: "ribbon" },
    DL: { fuselageColor: lightFuselage, tailColor: 0x9d3047, style: "tail-band" },
    WN: { fuselageColor: 0x285987, tailColor: 0x274d84, style: "ribbon" },
    B6: { fuselageColor: lightFuselage, tailColor: 0x2e71a8, style: "ribbon" },
    F9: { fuselageColor: lightFuselage, tailColor: 0x4e7b49, style: "minimal" },
    AS: { fuselageColor: lightFuselage, tailColor: 0x34586f, style: "tail-band" },
    EK: { fuselageColor: 0xe8e2d8, tailColor: 0xc9433d, style: "belly-sweep" },
    FZ: { fuselageColor: lightFuselage, tailColor: 0x2f73a8, style: "ribbon" },
    NH: { fuselageColor: 0xe8eef0, tailColor: 0x3a69a8, style: "tail-band" },
    JL: { fuselageColor: lightFuselage, tailColor: 0xc93e42, style: "minimal" },
    BA: { fuselageColor: lightFuselage, tailColor: 0x274a83, style: "ribbon" },
    VS: { fuselageColor: 0xe9e4df, tailColor: 0xc63e52, style: "ribbon" },
    TK: { fuselageColor: 0xe9e5df, tailColor: 0xc53f43, style: "tail-band" },
    LH: { fuselageColor: lightFuselage, tailColor: 0x314a79, style: "tail-band" },
    OS: { fuselageColor: lightFuselage, tailColor: 0xc64b45, style: "tail-band" },
    KL: { fuselageColor: lightFuselage, tailColor: 0x79b8cc, style: "tail-band" },
    AF: { fuselageColor: lightFuselage, tailColor: 0x465a82, style: "tail-band" },
    QR: { fuselageColor: 0xe5e0dc, tailColor: 0x79475e, style: "minimal" },
    AC: { fuselageColor: lightFuselage, tailColor: 0xb94749, style: "minimal" },
    EI: { fuselageColor: lightFuselage, tailColor: 0x5d9b86, style: "tail-band" },
    IB: { fuselageColor: lightFuselage, tailColor: 0xc94f43, style: "tail-band" },
    LO: { fuselageColor: lightFuselage, tailColor: 0x4f6387, style: "minimal" },
    KE: { fuselageColor: lightFuselage, tailColor: 0x87b5c8, style: "tail-band" },
    LX: { fuselageColor: lightFuselage, tailColor: 0xb84545, style: "minimal" },
    "5X": { fuselageColor: 0x5a392c, tailColor: 0xf0c346, style: "belly-sweep" },
    FX: { fuselageColor: 0x70529a, tailColor: 0xe8a12b, style: "belly-sweep" },
    FDX: { fuselageColor: 0x70529a, tailColor: 0xe8a12b, style: "belly-sweep" },
    LOCAL: { fuselageColor: 0x789b92, tailColor: 0xe8dfbf, style: "ribbon" },
  };
  return tailored[code] ?? {
    fuselageColor: profile.primaryColor,
    tailColor: profile.accentColor,
    style: profile.cargo ? "belly-sweep" : "ribbon",
  };
}

const ICAO_STATIONS: Readonly<Record<string, string>> = {
  ATL: "KATL",
  DEN: "KDEN",
  DFW: "KDFW",
  DXB: "OMDB",
  HND: "RJTT",
  IST: "LTFM",
  JFK: "KJFK",
  LAX: "KLAX",
  LHR: "EGLL",
  ORD: "KORD",
};

export function liveDataStationForAirport(code: string): string | null {
  return ICAO_STATIONS[code.toUpperCase()] ?? null;
}

# Aircraft identity, route fit, and fuel planning

Airport Auto 2.21 expands the procedural fleet and gives every flight a deterministic route-aware fuel plan. These values are designed to make the game’s motion and telemetry believable; they are not a dispatch release, loading instruction, performance chart, or navigation source.

## Curated roster

| Code | Family | Category | Engines | MTOW (t) | Modeled usable fuel (kg) | Representative cruise flow (kg/h) | Range (NM) |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| PC12 | Pilatus PC-12 NGX | utility / GA turboprop | 1 | 4.7 | 1,226 | 270 | 1,803 |
| C680 | Cessna Citation Longitude | business jet | 2 | 17.9 | 6,560 | 1,050 | 3,500 |
| E175 | Embraer E175 | regional jet | 2 | 40.4 | 9,335 | 2,000 | 2,200 |
| Q400 | De Havilland Dash 8-400 | regional turboprop | 2 | 29.6 | 5,218 | 1,050 | 1,100 |
| A320 | Airbus A320 | narrowbody | 2 | 78.0 | 19,000 | 2,500 | 3,300 |
| B738 | Boeing 737-800 | narrowbody | 2 | 79.0 | 20,900 | 2,600 | 2,935 |
| A21N | Airbus A321neo | narrowbody | 2 | 97.0 | 20,500 | 2,400 | 4,000 |
| A333 | Airbus A330-300 | widebody | 2 | 242.0 | 76,560 | 5,600 | 6,350 |
| A359 | Airbus A350-900 | widebody | 2 | 280.0 | 110,500 | 5,800 | 8,100 |
| B789 | Boeing 787-9 | widebody | 2 | 254.0 | 101,500 | 5,600 | 7,565 |
| B77W | Boeing 777-300ER | widebody | 2 | 351.5 | 145,500 | 7,500 | 7,370 |
| B748 | Boeing 747-8 Intercontinental | widebody | 4 | 447.7 | 191,565 | 10,500 | 7,730 |
| B77F | Boeing 777 Freighter | cargo | 2 | 347.8 | 145,500 | 8,200 | 4,970 |

Dimensions, weight, fuel capacity, speed, range, runway roll, and turn behavior are stored per model. Fuel flow is a representative planning value selected for the simulation rather than a claim about one airline configuration, payload, altitude, engine option, or day’s atmospheric conditions.

Primary manufacturer references used in this roster expansion include the [Airbus A321neo product data](https://www.aircraft.airbus.com/en/aircraft/a320-family/a321neo), [Airbus A330 family data](https://www.airbus.com/en/products-services/commercial-aircraft/passenger-aircraft/a330-family), [Boeing 777 airport-planning data](https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/777_2lr_3er_f.pdf), [Boeing 747-8 airport-planning data](https://www.boeing.com/content/dam/boeing/boeingdotcom/commercial/airports/acaps/748_REV_C.pdf), and [Cessna Citation Longitude specifications](https://cessna.txtav.com/en/citation/longitude). The remaining established profiles retain their deliberately curated game values until the broader roster audit in the roadmap is complete.

## Route and fleet fit

Traffic-program schema 2 may assign markets per airline. It selects a carrier and one of that carrier’s markets, estimates route distance, and then filters the carrier fleet by range and usable airport runways before choosing a model. If a cargo or passenger market is beyond every aircraft in the airline pool, another viable market is selected instead of silently creating an impossible aircraft/route pair.

Known represented airports use great-circle distance with a small terminal/airway factor. Unknown procedural markets use a stable estimate based on passenger, regional, cargo, or general-aviation traffic class. The distance source appears in each flight’s fuel plan and traffic-program selection.

O’Hare’s representative international program now includes Austrian, Lufthansa, Japan Airlines, ANA, British Airways, Turkish, Emirates, KLM, Air France, Qatar, Air Canada, Aer Lingus, Iberia, LOT, Korean Air, and Swiss alongside its dominant United and American banks. Carrier-specific markets follow the Chicago Department of Aviation’s [July 2026 nonstop service directory](https://www.flychicago.com/SiteCollectionDocuments/O%27Hare/ArchivedPDFs/MyFlight/INTLnonstops.pdf). EL AL is intentionally absent because it is not listed as a current published ORD carrier in that directory. Weights remain a sourced-airline, schematic-frequency approximation—not a live schedule.

## Fuel plan

Every aircraft receives two leg plans when it enters the simulation:

1. The inbound plan determines a plausible arrival reserve.
2. The onward plan determines the gate fueling target for the next destination.

Each leg stores estimated distance and block time, trip fuel, taxi fuel, five-percent contingency, alternate allowance, a 30-minute final reserve, planned landing fuel, dispatch fuel, percentage of usable capacity, and whether the 96% planning ceiling was reached. Arrival fuel is the planned reserve plus a small stable variation and is constrained to a 7–32% envelope. A short onward flight may require no uplift when the inbound reserve already exceeds its dispatch requirement; long-haul departures may appropriately leave with much more fuel.

Moving aircraft burn a model-derived fraction of representative cruise flow. Taxi, approach, landing, and takeoff use different multipliers, and a stopped taxiing aircraft continues consuming a lower idle amount. This replaces the former fixed percentage-per-minute values that made different aircraft burn fuel identically.

The flight strip shows fuel to one decimal below 20%, real IAS or ground speed, altitude, and a three-digit aviation heading plus cardinal direction. Hover text distinguishes inbound reserve from onward dispatch fuel. The control snapshot exposes the complete plan in `flights[].fuelPlan`, aircraft capacity/range data in `flights[].aircraft`, and course in `flights[].kinematics.headingDegrees` / `cardinalDirection`.

## Optional contrails

Upper-scope contrails are a presentation-only map layer and start off. The effect is available only to airborne turbofans in the compressed high portion of approach, climb-out, go-around, or diversion. Visible rain/fog/snow, cold conditions, or a stable per-flight moisture band can make the effect eligible. Trails are emitted behind individual engines—including four trails for the 747-8—and never feed back into aircraft motion, weather, collision checks, or replay state.

Use the Map layers checkbox, `?contrails=1`, or:

```js
airportControl.request({ action: "setContrailsVisible", enabled: true });
```

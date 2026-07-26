# Aircraft identity, performance, and airport life

Airport Auto 2.33 gives each aircraft an audited catalog entry, a distinct original low-poly family, state-driven aircraft systems, route-aware fuel planning, and optional airport-life detail. It is a game model—not a dispatch release, loading instruction, performance chart, maintenance record, or navigation source.

## Audited roster

| Code | Aircraft                      | Fleet role        |     Engines | MTOW (t) | Visual family                |
| ---- | ----------------------------- | ----------------- | ----------: | -------: | ---------------------------- |
| C172 | Cessna 172S Skyhawk           | general aviation  |    1 piston |      1.2 | high-wing GA                 |
| PC12 | Pilatus PC-12 NGX             | utility / charter | 1 turboprop |      4.7 | utility turboprop            |
| C680 | Cessna Citation Longitude     | business          |  2 turbofan |     17.9 | business jet                 |
| E175 | Embraer E175                  | regional          |  2 turbofan |     40.4 | regional jet                 |
| AT76 | ATR 72-600                    | regional          | 2 turboprop |     23.0 | high-wing regional turboprop |
| Q400 | De Havilland Dash 8-400       | regional          | 2 turboprop |     29.6 | high-wing regional turboprop |
| A223 | Airbus A220-300               | narrowbody        |  2 turbofan |     70.9 | Airbus narrowbody            |
| A320 | Airbus A320                   | narrowbody        |  2 turbofan |     78.0 | Airbus narrowbody            |
| B738 | Boeing 737-800                | narrowbody        |  2 turbofan |     79.0 | Boeing narrowbody            |
| A21N | Airbus A321neo                | narrowbody        |  2 turbofan |     97.0 | Airbus narrowbody            |
| A333 | Airbus A330-300               | widebody          |  2 turbofan |    242.0 | Airbus widebody              |
| A359 | Airbus A350-900               | widebody          |  2 turbofan |    280.0 | Airbus widebody              |
| B789 | Boeing 787-9                  | widebody          |  2 turbofan |    254.0 | Boeing widebody              |
| B77W | Boeing 777-300ER              | widebody          |  2 turbofan |    351.5 | Boeing widebody              |
| B748 | Boeing 747-8 Intercontinental | widebody          |  4 turbofan |    447.7 | jumbo / upper deck           |
| B76F | Boeing 767 freighter          | cargo             |  2 turbofan |    186.9 | windowless freighter         |
| B77F | Boeing 777 Freighter          | cargo             |  2 turbofan |    347.8 | windowless freighter         |

Each profile stores real-world envelope references for dimensions and weights plus representative game values for usable fuel, cruise flow, range, cruise/approach/rotation/taxi speeds, taxi acceleration and braking, turn radius, climb/descent rate, takeoff and landing roll, conservative runway requirement, wake spacing, and gate-service time. Physical roll is deliberately separate from the runway planning requirement so the visible movement distance cannot make a large aircraft eligible for short pavement.

Catalog sources are recorded beside every model with publisher, title, URL, retrieval date, and audit date. Primary sources include [Cessna Skyhawk](https://cessna.txtav.com/en/piston/cessna-skyhawk), [Pilatus PC-12](https://www.pilatus-aircraft.com/en/pc-12/technical-data), [Cessna Citation Longitude](https://cessna.txtav.com/en/citation/longitude), [Embraer E175](https://www.embraercommercialaviation.com/wp-content/uploads/2017/06/Embraer_spec_E175_web-EN.pdf), [ATR 72-600](https://www.atr-aircraft.com/aircraft-services/aircraft-family/atr-72-600/), [Dash 8-400](https://dehavilland.com/wp-content/uploads/2025/03/DHC_Dash8_Spec-Sheet_v10_DIGITAL.pdf), [Airbus aircraft characteristics](https://www.aircraft.airbus.com/en/customer-care/fleet-wide-care/airport-operations-and-aircraft-characteristics/aircraft-characteristics), [Airbus A220-300](https://www.aircraft.airbus.com/en/aircraft/a220/a220-300), and [Boeing airport-planning data](https://www.boeing.com/commercial/airports). Values that manufacturers publish only for a particular weight, engine, or atmosphere remain deliberately representative rather than being presented as universal certified performance.

## Identity, fleet fit, and liveries

Traffic-program schema 2 assigns a carrier, market, and carrier-appropriate fleet, then filters by route range and usable arrival/departure runways. General aviation can produce C172, PC-12, or Citation traffic; regional programs include E175, ATR, and Q400; long-haul programs include the widebody roster; cargo airlines use the dedicated 767F/777F catalog rather than a passenger silhouette.

O’Hare’s schematic program includes United, American, Austrian, Lufthansa, Japan Airlines, ANA, British Airways, Turkish, Emirates, KLM, Air France, Qatar, Air Canada, Aer Lingus, Iberia, LOT, Korean Air, Swiss, and cargo operators. Carrier weights and banks are sourced-airline, schematic-frequency approximations—not a live schedule.

Procedural liveries use four original, logo-free grammars—ribbon, tail band, belly sweep, and minimal—with a compact airline/model identifier at high detail. Airframe families vary high/low wing, T-tail, nose and tail proportions, wing sweep and tips, engine placement/count, propellers, the 747 upper deck, passenger windows, and freighter doors. They intentionally suggest aircraft categories without copying a commercial 3D asset or an airline logo.

## State-driven systems and effects

One pure deterministic systems adapter derives presentation from authoritative fixed-step flight state. The renderer does not invent a second motion path.

- Gear extends on approach and landing, retracts after positive takeoff climb, and remains physically attached to the aircraft root.
- Flaps, slats, spoilers, and reverser sleeves follow approach, takeoff, touchdown, rollout speed, and aircraft powerplant.
- Navigation, beacon, double-pulse strobe, landing, taxi, and recognition lights follow engine, ground, and phase state.
- Exhaust follows engine state and phase power.
- Wing condensation requires airborne speed, high lift, low altitude, and moisture/cold conditions.
- Tire smoke appears only during a fast dry touchdown; wet or contaminated pavement substitutes surface spray.
- Shadows fade and soften with altitude. Optional contrails require an eligible airborne turbofan, altitude/moisture conditions, and the player’s map-layer toggle.
- Deicing spray follows the existing authoritative deicing service state.

The complete systems state is exposed in `flights[].systems` for browser tools, tests, replays, and future controllers.

## Optional airport-life detail

Flights deterministically receive an operation kind: scheduled passenger, scheduled cargo with a load type, charter, positioning ferry, or a rare special operation such as air ambulance, flight check, humanitarian movement, or government charter. Rare transit inspections and out-of-service repairs enter the same turnaround service state machine as fueling, baggage/cargo, catering, cleaning, and boarding. Repair status cannot bypass Ramp, Ground, runway, or collision safety; an aircraft returns to service only after its required maintenance task completes.

Airport-life descriptions start hidden so Watch mode stays calm. Enable **Airport-life details** in Map layers, use `?airport-life=1`, or issue the presentation command after API 2.33 loads:

```js
airportControl.request({ action: "setAirportLifeVisible", enabled: true });
```

The control snapshot exposes `airportLifeVisible`, `flights[].operationalDetail`, the maintenance task and reason, and return-to-service time.

## Route fuel planning

Every aircraft receives inbound and onward leg plans. Each stores estimated distance and block time, trip and taxi fuel, five-percent contingency, alternate allowance, a 30-minute final reserve, planned landing fuel, dispatch fuel, usable-capacity percentage, and whether the planning ceiling was reached. Arrival fuel is a reserve—not a nearly full tank—and the onward dispatch target determines gate fueling.

Moving aircraft burn a model-derived fraction of representative cruise flow. Taxi, approach, landing, and takeoff use different multipliers; a stopped aircraft with engines running continues to burn idle fuel. The strip and snapshot distinguish inbound reserve from onward dispatch fuel, IAS from ground speed, altitude, and a three-digit aviation heading/cardinal direction.

## Asset limits

The hub renderer uses a formal low-detail path with instanced engines, gear, tug wheels, paired lights, and effects. Per-aircraft draw, material, texture, triangle, memory, and pooling limits are executable and documented in [the aircraft asset budget](aircraft-asset-budget.md). A model cannot join the roster by visual review alone; catalog, systems, visual-family, operations, LOD, deterministic simulation, collision, and browser performance gates must pass.

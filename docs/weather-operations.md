# Operational weather model

Airport Auto 2.35 turns weather into deterministic simulation state shared by aircraft motion, runway planning, surface movement, presentation, audio, replay, and the control API. It remains an entertainment model. Every modeled runway report and performance assessment is marked **not for navigation** and must not be used for flight planning, dispatch, or airport operations.

## Conditions and effects

The six selectable conditions are Clear, Haze, Rain, Fog, Snow, and Thunderstorm. Each profile owns visibility, ceiling, temperature, precipitation, intensity, cloud cover, surface state, and gust behavior. Switching weather off preserves the selected profile for later restoration but presents and mixes a clear environment and disables weather hazards.

Weather affects:

- terminal visibility and ceiling capacity;
- arrival and departure spacing pressure;
- runway landing and takeoff performance checks;
- runway-exit choice and stopping margin;
- taxi braking, turn speed, and stopping behavior;
- deicing requirements and holdover flow in snow;
- sky, haze/fog, precipitation, lighting, contrails, and weather audio.

The renderer and audio engine consume this state; neither invents a separate weather condition.

## Runway condition reports

Every runway receives a modeled three-segment report with touchdown, midpoint, and rollout runway condition codes, contaminant, depth, coverage, braking action, and report time. The display abbreviates these as `RwyCC 5/5/5`, for example. The codes follow the FAA's 6-to-0 vocabulary and braking-action names, but the simulator generates them from its own deterministic weather profiles rather than observations, NOTAMs, or an airport operator assessment.

The FAA explains that actual RwyCC reports cover runway thirds, use values 1 through 6 for reportable conditions, and must be considered with aircraft performance, weight, wind, and other operational knowledge. See the [FAA Aeronautical Information Manual, Runway Condition Reports](https://www.faa.gov/Air_traffic/publications/atpubs/aim_html/chap4_section_3.html) and the [FAA TALPA/RCAM resources](https://www.faa.gov/about/initiatives/talpa).

Airport Auto's landing and takeoff multipliers are deliberately conservative gameplay approximations. They are not manufacturer performance data, an FAA calculation, or a substitute for a time-of-arrival landing assessment. The active FAA guidance for real landing-performance and runway-excursion risk is [AC 91-79B](https://www.faa.gov/regulations_policies/advisory_circulars/index.cfm/go/document.information/documentID/1042093).

## Wind shear and microbursts

Rare wind-shear and microburst events are disabled by default. A player can opt in through **Controls → Sound mixer → Rare severe weather**, the `setWeatherHazardsEnabled` command, or `?hazards=1`. Events can occur only while weather and wind are enabled and Thunderstorm is selected.

When an active event reaches an aircraft on the affected runway:

- an arrival immediately enters a full-power, wings-level, straight-ahead climb before smoothly joining its missed-approach path;
- an airborne departure clears its vector and performs a full-power, straight-ahead climb until the escape segment is complete;
- contrary vector instructions are rejected during the escape;
- disabling hazards or leaving convective conditions immediately expires the airport advisory, while an aircraft already escaping completes its protected maneuver.

This behavior follows the operational concept, not an aircraft-specific procedure. FAA controller guidance says aircraft performing a wind-shear escape will usually climb at full power straight ahead and should not receive instructions contrary to the pilot's actions until the escape is complete. See [FAA Order JO 7110.65, Wind Shear Escape Procedures](https://www.faa.gov/air_traffic/publications/atpubs/atc_html/chap3_section_1.html) and the [FAA AIM wind-shear guidance](https://www.faa.gov/air_traffic/publications/atpubs/aim_html/chap7_section_1.html).

## Determinism, replay, and API

The airport seed and hazard sequence determine event timing, runway, operation, intensity, and duration. There is no live weather feed and no `Math.random()` dependency. Snapshot schema 38 exposes:

- precipitation, intensity, cloud cover, visibility, ceiling, temperature, wind, gusts, and surface condition;
- the complete modeled runway-condition report for each runway;
- hazard opt-in state, active advisory, bounded history, and affected flight IDs;
- each aircraft's runway-performance assessment and any active weather escape.

Portable replay deep-clones those fields so a replay frame presents its recorded weather rather than hidden live state. The external gateway receives the bounded operational subset, including current runway reports and the active hazard.

Focused validation is available with:

```bash
npm run test:weather-operations
npm run test:control-protocol
npx playwright test e2e/airport-auto.spec.ts --project=desktop-chromium --grep "snow|Thunderstorm hazards"
```

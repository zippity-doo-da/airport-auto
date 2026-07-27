# Optional live-data adapters

Airport Auto remains a complete offline simulation. Live data is an operator-enabled, manually requested preview layer; it is never required for startup, Auto, Watch, challenges, replay, or the safety model. All live material is marked **not for navigation**.

## Sources and provider boundary

- METAR uses the official [Aviation Weather Center Data API](https://aviationweather.gov/data/api/) through the optional server relay. The relay honors the provider’s one-request-per-minute guidance with request coalescing, a minimum 60-second cache, a bounded response, a custom user agent, and no browser-side cross-origin request.
- FAA NOTAM access is not anonymously assumed. The [FAA NOTAM Management Service](https://www.faa.gov/about/initiatives/notam) requires an operator integration and appropriate access. Airport Auto therefore ships a normalized adapter contract but leaves the provider unconfigured by default.
- Traffic data is provider-neutral and unconfigured by default. An operator must supply a licensed aggregate feed whose terms permit this use. The browser accepts aggregate time windows only; callsigns, tracks, passenger data, and raw schedule rows are rejected by the privacy contract.

No provider credential is bundled, persisted by the page, placed in a URL, copied into a snapshot, or written to replay.

## Data path

1. The player opens **Advanced → Optional live data**, enables requests, supplies the same opt-in gateway URL and in-memory host/admin token used for the relay, then chooses **Refresh previews**.
2. The browser requests only the active airport’s mapped ICAO station from the same configured gateway. The token field is cleared after the request attempt.
3. The gateway validates the bearer role, station, response size, timeout, HTTPS provider template, and fixed `{station}` substitution. Arbitrary browser URLs are never proxied.
4. Server adapters normalize provider payloads into schema 1. Browser adapters validate that schema again, including units, ranges, dates, station, provenance, expiry, HTTPS source, and the `notForNavigation` marker.
5. Valid reports enter an 18-entry, 256 KiB least-recently-used browser cache. Credentials do not. A network failure may show a validated cache entry or an explicit offline fallback; it never changes simulation state by itself.

The supported station map is KATL, KDEN, KDFW, OMDB, RJTT, LTFM, KJFK, KLAX, EGLL, and KORD. The procedural LOCAL airport has no live station.

## Human review and deterministic application

Live inputs are previews until the player deliberately applies them:

- **METAR:** displays observation age, wind, visibility, ceiling, raw report, provider, license, and source. **Apply modeled weather** sends the ordinary `setWeather` command through Supervisor authority and the existing weather model. Stale reports remain preview-only.
- **NOTAM/status:** each normalized runway or taxiway item has independent **Review & apply** and **Ignore** actions. An accepted item must exactly match a runway designation or named taxiway in the sourced graph. It then uses the ordinary `setSurfaceDisruption` command and safety arbiter. No fuzzy target or automatic topology change is allowed.
- **Traffic:** aggregate arrival/departure windows produce a reproducible fingerprint and map to one of the existing deterministic traffic-density commands. Only that command enters replay; restricted raw feed data and provider identifiers do not.

The local interface exposes only redacted state:

```js
airportControl.liveData.snapshot();
airportControl.liveData.clearCache();
```

## Gateway configuration

The whole relay is off unless `AIRPORT_LIVE_DATA_ENABLED=1` is present.

| Variable                                               | Purpose                                                                            |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `AIRPORT_LIVE_DATA_ENABLED`                            | Enables the optional relay when exactly `1`.                                       |
| `AIRPORT_METAR_ENABLED`                                | Set to `0` to disable the built-in AWC METAR adapter.                              |
| `AIRPORT_LIVE_USER_AGENT`                              | Operator contact-capable user agent for provider requests.                         |
| `AIRPORT_NOTAM_URL_TEMPLATE`                           | Fixed HTTPS/loopback JSON URL containing exactly a `{station}` substitution point. |
| `AIRPORT_NOTAM_TOKEN`                                  | Optional server-only provider bearer token.                                        |
| `AIRPORT_NOTAM_PROVIDER` / `AIRPORT_NOTAM_LICENSE`     | Provenance labels included in normalized reports.                                  |
| `AIRPORT_TRAFFIC_URL_TEMPLATE`                         | Fixed HTTPS/loopback aggregate JSON URL containing `{station}`.                    |
| `AIRPORT_TRAFFIC_TOKEN`                                | Optional server-only provider bearer token.                                        |
| `AIRPORT_TRAFFIC_PROVIDER` / `AIRPORT_TRAFFIC_LICENSE` | Provenance labels included in normalized reports.                                  |

Relay endpoints are `GET /v1/live/metar/:station`, `GET /v1/live/notams/:station`, and `GET /v1/live/traffic/:station`. A configured host or admin bearer token is required. The gateway returns no permissive unauthenticated proxy route.

## Verification

```bash
npm run test:live-data
npm run test:remote-gateway
npm run test:release-matrix
```

The focused gates cover unit/range validation, cache bounds, request coalescing, provider configuration, station matching, credential and raw-feed redaction, manual NOTAM review, aggregate-only traffic mapping, authorization, offline fallback, and the default-off browser state.

# Airport control and telemetry

Airport Auto exposes a local, versioned interface for playtests, scripted controllers, dashboards, and agent experiments. All commands pass through the same authority and safety checks as the visible HUD. The interface does not provide a privileged collision bypass.

## Browser API

The current schema version is `2.0.0`.

```js
airportControl.version
airportControl.snapshot()
airportControl.events(100)
airportControl.replay()
airportControl.help()
```

Use `request()` when a controller needs an explicit acknowledgement:

```js
const result = airportControl.request({
  action: 'clearTakeoff',
  flightId: 12,
})

// {
//   accepted: true,
//   reason: 'accepted',
//   sequence: 418,
//   snapshot: { ... }
// }
```

`command()` remains a compatibility helper that returns only the resulting snapshot.

## Commands

Global and camera commands:

```js
airportControl.request({ action: 'pause' })
airportControl.request({ action: 'resume' })
airportControl.request({ action: 'setSpeed', value: 2 })
airportControl.request({ action: 'setMode', value: 'manual' })
airportControl.request({ action: 'selectAirport', code: 'ORD' })
airportControl.request({ action: 'setScenario', scenario: 'rush' })
airportControl.request({ action: 'setStation', station: 'tower' })
airportControl.request({ action: 'nextView' })
airportControl.request({ action: 'zoomIn' })
airportControl.request({ action: 'zoomOut' })
airportControl.request({ action: 'resetCamera' })
airportControl.request({ action: 'setNightMode', enabled: true })
airportControl.request({ action: 'setRadarVisible', enabled: true })
airportControl.request({ action: 'setRunwayLabelsVisible', enabled: false })
```

Flight commands:

```js
airportControl.request({ action: 'focusFlight', flightId: 12 })
airportControl.request({ action: 'clearFlight', flightId: 12, runway: 1 })
airportControl.request({ action: 'clearRunwayCrossing', flightId: 12, runway: 4 })
airportControl.request({ action: 'clearRunwayEntry', flightId: 12 })
airportControl.request({ action: 'clearTakeoff', flightId: 12 })
airportControl.request({ action: 'controlFlights', flightIds: [12], instruction: 'hold' })
airportControl.request({ action: 'controlFlights', flightIds: [12, 18], instruction: 'expedite' })
airportControl.request({ action: 'triggerEmergency', flightId: 12, type: 'go-around' })
```

Weather commands:

```js
airportControl.request({
  action: 'setWeather',
  condition: 'rain',
  directionDegrees: 270,
  windSpeed: 18,
})
airportControl.request({ action: 'setWeatherEnabled', enabled: false })
airportControl.request({ action: 'setWindEnabled', enabled: false })
```

In manual mode, the normal departure sequence is: clear every required crossing, clear runway entry / line-up, wait until the aircraft is lined up, then clear takeoff. Rejected commands return a plain-language reason.

## Snapshot and events

Snapshots include the airport and seed, simulation clock, mode, speed, station, scenario, weather, active runway ends, closure, runway roles and reservations, the complete surface graph, renderer diagnostics, safety metrics, and every flight's route, clearances, model data, kinematics, fuel, trajectory, and hold reason.

Events have a monotonic sequence number and include command payloads and acceptance, flight/runway/taxiway context, and safety-hold or go-around details. The in-page log retains the latest 500 events.

## BroadcastChannel bridge

Another same-origin page, devtool, or local controller can communicate without directly accessing the game window:

```js
const channel = new BroadcastChannel('airport-auto')
const requestId = crypto.randomUUID()

channel.addEventListener('message', ({ data }) => {
  if (data.type === 'response' && data.requestId === requestId) {
    console.log(data.result)
  }
})

channel.postMessage({
  type: 'command',
  requestId,
  command: { action: 'focusFlight', flightId: 12 },
})
```

The game publishes `ready`, event, command-result, and request-correlated `response` messages. This bridge is same-origin/local coordination, not a remote network API. A future remote controller should add authentication, rate limits, timeouts, and an emergency stop before accepting commands.

## Launch URL

```text
http://127.0.0.1:5173/?airport=ORD&mode=auto&scenario=rush&speed=3&autostart=1&telemetry=1
```

Supported airports are `LOCAL`, `ATL`, `ORD`, `DXB`, `HND`, `DFW`, `LHR`, `IST`, `DEN`, `LAX`, and `JFK`. Modes are `auto` and `manual`; stations are `supervisor`, `approach`, `tower`, and `ground`; scenarios are `normal`, `rush`, `storm`, `closure`, `training`, and `emergency`.

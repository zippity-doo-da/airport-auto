# Remote controller gateway

Airport Auto 2.32 adds an optional, authenticated external-control path for human and agent controllers. The shipped GitHub Pages game remains a static, fully offline-capable application: it opens no control connection by default, contains no credential, and continues to run deterministic Auto and Watch controllers when no gateway exists.

The remote gateway is operational tooling for a trusted session. It is not aviation infrastructure, navigation data, or a public multi-tenant identity service.

## Architecture and safety boundary

```text
controller / agent ──wss──┐
spectator / dashboard ────┼── gateway ──wss── browser game host
administrator ────────────┘                   │
                                              └─ typed command dispatcher
                                                 station authority
                                                 phase and ownership
                                                 runway protection
                                                 separation
                                                 surface reservations
                                                 collision prevention
```

The gateway authenticates identity, grants one exclusive lease per controller station, coordinates clients, limits command traffic, and forwards a formal request envelope. It cannot move an aircraft or change a clearance itself. The browser host overwrites untrusted source, client, actor, and station assertions at the gateway, then sends the resulting request through `dispatchAirportControl()`, the same arbiter used by the visible game and local API. The browser returns the structured accepted/rejected result to the originating controller.

Rendering and remote transport remain adapters around the authoritative fixed-step simulation. Neither owns aircraft state.

## Hosting and identity decision

Version 1 uses a provider-neutral, self-hosted Node 22 gateway with pre-provisioned opaque bearer tokens:

- The gateway is a separate process and deployment from static GitHub Pages.
- Operators choose the host and retain the token manifest and audit file.
- Remote browser traffic must use TLS (`wss://`) and an exact Origin allowlist.
- Plain `ws://` is accepted by the game host only for `localhost`, `127.0.0.1`, or `::1` development.
- Tokens name permitted roles, stations, and sessions. Session scope is mandatory and `"*"` must be chosen explicitly. Reusing one secret for multiple token identities is rejected. Tokens are not embedded in the app, committed, placed in URLs, written to local storage, returned in snapshots, or included in audit events.
- This release deliberately does not invent account registration, password storage, or a cloud tenancy model. A later public/shared deployment can replace token verification with short-lived OIDC-backed credentials without changing the game command protocol.

This is the chosen first hosting and identity model, not a claim that static Pages itself has become an authenticated server.

## Roles and authority

| Role         | Capability                                                                                                                                                           |
| ------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host`       | Publishes one game's bounded state/events and executes forwarded requests through the local arbiter. One connected host is allowed per session.                      |
| `controller` | Claims one permitted Approach, Tower, Ground, Ramp, or Supervisor lease and sends formal commands.                                                                   |
| `spectator`  | Receives session state and events and may read authenticated HTTP snapshots/metrics. It cannot claim or command.                                                     |
| `admin`      | Reads audit data and can stop/resume remote command routing. It is read-only unless its token separately has another role and the client reconnects using that role. |

Station leases are exclusive. A controller cannot silently change desks, claim two desks, or claim a station omitted from its token. The current holder can explicitly offer its lease to another connected, eligible controller; the recipient must accept before ownership changes. These gateway station leases coordinate people and agents. Per-flight Approach/Tower/Ground/Ramp handoffs remain ordinary typed game commands with their existing ownership and readback rules.

Active client IDs are unique within a session. A disconnected station remains reserved for a short reconnect grace period and can be resumed only by the same client ID, credential identity, role, and one-time resume secret. When the grace period expires, the station is released.

## Configure credentials

Copy `server/token-manifest.example.json` to an ignored operator-local name such as `server/token-manifest.json`, replace every placeholder with a separate random value, and narrow roles/stations/sessions to the minimum needed. Every token needs at least one explicit session; omit neither that field nor its scope.

Generate a 32-byte secret in PowerShell:

```powershell
[Convert]::ToBase64String([Security.Cryptography.RandomNumberGenerator]::GetBytes(32))
```

Or with OpenSSL:

```bash
openssl rand -base64 32
```

The service rejects empty manifests, duplicate IDs, short tokens, and the placeholders in the example. The committed example is never loaded automatically.

## Run locally

PowerShell:

```powershell
$env:AIRPORT_REMOTE_TOKEN_FILE = "server/token-manifest.json"
$env:AIRPORT_REMOTE_ORIGINS = "http://127.0.0.1:5173"
npm run remote:gateway
```

Bash:

```bash
AIRPORT_REMOTE_TOKEN_FILE=server/token-manifest.json \
AIRPORT_REMOTE_ORIGINS=http://127.0.0.1:5173 \
npm run remote:gateway
```

The default bind address is `127.0.0.1:8787`. Optional settings are:

| Environment variable                         | Purpose                                                                           | Default                               |
| -------------------------------------------- | --------------------------------------------------------------------------------- | ------------------------------------- |
| `AIRPORT_REMOTE_HOST`                        | Bind interface                                                                    | `127.0.0.1`                           |
| `AIRPORT_REMOTE_PORT`                        | HTTP/WebSocket port                                                               | `8787`                                |
| `AIRPORT_REMOTE_ORIGINS`                     | Comma-separated exact game/browser origins in addition to the same-origin console | none                                  |
| `AIRPORT_REMOTE_TOKEN_FILE`                  | JSON token manifest path                                                          | required unless inline tokens are set |
| `AIRPORT_REMOTE_TOKENS`                      | Inline JSON manifest for a secret manager                                         | required unless a file is set         |
| `AIRPORT_REMOTE_AUDIT_FILE`                  | Append-only JSONL audit target                                                    | memory only                           |
| `AIRPORT_REMOTE_COMMAND_TIMEOUT_MS`          | Host response timeout                                                             | `5000`                                |
| `AIRPORT_REMOTE_RECONNECT_GRACE_MS`          | Claim reservation after disconnect                                                | `20000`                               |
| `AIRPORT_REMOTE_RATE_LIMIT_COUNT`            | Commands per client/window                                                        | `30`                                  |
| `AIRPORT_REMOTE_RATE_LIMIT_WINDOW_MS`        | Rate-limit window                                                                 | `10000`                               |
| `AIRPORT_REMOTE_MAX_CONNECTIONS_PER_SESSION` | Hard client cap for one session                                                   | `64`                                  |

Set exactly one of `AIRPORT_REMOTE_TOKEN_FILE` and `AIRPORT_REMOTE_TOKENS`. Inline JSON is suitable for a deployment secret manager; take care that the process manager does not expose environment values to untrusted users. If an audit file is configured, the CLI opens it before listening and fails startup when the target is not writable.

## Connect the game host

Start Airport Auto normally. Open **Controls → Replay & agent tools → External controller gateway**, enter the WebSocket endpoint, session, and host token, then choose **Connect host**. Nothing is persisted. After successful authentication the password field is cleared; the adapter retains the credential only in private page memory to support an interrupted connection. Explicit disconnect or page unload removes it and disables reconnect.

Equivalent page API:

```js
await airportControl.remote.connect({
  endpoint: "ws://127.0.0.1:8787/v1/ws",
  sessionId: "airport-auto",
  token: hostToken,
});

airportControl.remote.state();
airportControl.remote.disconnect();
```

`remote.state()` is safe to expose in the ordinary snapshot. It reports connection health, a redacted endpoint, session/client IDs, publish times, reconnect attempt, and emergency-stop state; it never reports a token or resume secret.

## Controller console

The gateway serves a compact human desk at `http://127.0.0.1:8787/console` (or the HTTPS deployment URL). It supports:

- in-memory authentication and station claim/release;
- live exclusive-claim and host status;
- a bounded traffic list with phase, altitude, ground speed, and fuel;
- contextual landing, go-around, hold/resume, and takeoff command templates;
- arbitrary typed command JSON for the complete catalog;
- admin emergency stop/resume;
- recent transient activity without token or local-storage logging.

The console is a convenience client, not a second authority implementation. Rejected commands remain rejected.

## WebSocket protocol 1.0

Connect to `/v1/ws`, then authenticate before sending any other message:

```json
{
  "type": "hello",
  "protocolVersion": "1.0.0",
  "sessionId": "airport-auto",
  "clientId": "tower-agent-a",
  "role": "controller",
  "token": "operator-provided-secret",
  "station": "tower"
}
```

The optional `station` requests a claim during authentication. A successful `welcome` includes permissions, public session state, and a one-time in-memory resume token. Controller messages include:

```json
{ "type": "claim", "requestId": "claim-1", "station": "tower" }
{ "type": "release", "requestId": "release-1" }
{ "type": "offer-station", "toClientId": "tower-agent-b" }
{ "type": "accept-station", "station": "tower" }
```

Operational request:

```json
{
  "type": "command",
  "envelope": {
    "protocolVersion": "1.2.0",
    "requestId": "tower-42",
    "command": { "action": "clearTakeoff", "flightId": 12 }
  }
}
```

The gateway ignores a controller's supplied source, client, actor, and authority station and substitutes the authenticated client ID and active lease. Results have:

```json
{
  "type": "command-result",
  "requestId": "tower-42",
  "gatewayCommandId": "gateway-17",
  "accepted": false,
  "reason": "…",
  "code": "host-rejected",
  "result": { "accepted": false, "authority": {}, "resultingState": {} }
}
```

Gateway rejections use stable codes such as `read-only-role`, `station-required`, `claim-lost`, `request-duplicate`, `rate-limited`, `emergency-stop`, `host-offline`, and `host-timeout`. A host rejection retains the simulator's structured reason inside `result`.

The host publishes a state envelope once per second and event envelopes as they occur. State is intentionally projected: it includes airport/session context, weather, configuration, runways, compact flights, queues, disruptions, coordination, workloads, and evaluation, but excludes the imported surface graph, renderer/input diagnostics, replays, and credentials. Slow clients can lose noncritical state/event frames; commands and results are treated as important traffic.

## Read-only HTTP API

All responses use `Cache-Control: no-store`. Health and protocol discovery are public; session data requires a bearer token permitted for that session.

| Endpoint                               | Authentication | Result                                                          |
| -------------------------------------- | -------------- | --------------------------------------------------------------- |
| `GET /health`                          | none           | Process health and connection counts                            |
| `GET /v1/protocol`                     | none           | Gateway version, roles, stations, transports, security features |
| `GET /v1/sessions`                     | bearer         | Permitted public session summaries                              |
| `GET /v1/sessions/:id/snapshot`        | bearer         | Latest bounded operations snapshot and session summary          |
| `GET /v1/sessions/:id/metrics`         | bearer         | Latest controller-evaluation metrics                            |
| `GET /v1/sessions/:id/audit?limit=100` | admin bearer   | Bounded audit events for the session                            |

The HTTP API is read-only. It has no command route and cannot promote a spectator.

## Emergency stop, limits, and audit

An admin emergency stop blocks new remote command routing for one session. It does not pause the simulation, disable local UI, interrupt deterministic Auto, or bypass an in-progress movement. Controllers receive an explicit `emergency-stop` rejection until an admin resumes routing.

Each connection has duplicate-request protection and a sliding command-rate limit. Every forwarded command has a host response timeout. WebSocket payloads, buffered output, reconnect leases, and clients per session are bounded; heartbeat cleanup removes dead connections and idle sessions. The audit records authentication rejections, connects/disconnects, claims/releases/transfers, forwarded commands, results, timeouts, rate rejections, and emergency-stop changes. It records token IDs, never token values or resume secrets. The in-memory audit is bounded; a configured JSONL file is append-only from the gateway's perspective.

Choose an operator retention period appropriate to the session. Audit records can contain controller IDs, callsigns, commands, and reasons and therefore should not be published by default.

## Production deployment

`Dockerfile.remote` packages only the Node gateway and production dependencies. Supply credentials at runtime, mount a writable audit directory only if needed, and terminate TLS with a maintained reverse proxy or platform load balancer. A production deployment should:

1. expose only HTTPS/WSS;
2. set an exact `AIRPORT_REMOTE_ORIGINS` value for every separate game origin (wildcards and URL paths are rejected; the gateway-hosted console is accepted only on its own Origin);
3. keep the token manifest in a secret store or read-only mounted secret;
4. rotate tokens between shared events and immediately after suspected exposure;
5. restrict gateway network access where practical;
6. run as a non-root user and place audit output on a bounded volume;
7. monitor `/health`, connection count, timeout rate, and audit-file growth;
8. avoid public wildcard origins.

The included process has no TLS certificate automation, public account recovery, abuse-report workflow, distributed session store, or horizontal coordination. Those are required before treating it as an open Internet service. For a small trusted session, run one gateway instance and keep all participants on that instance.

## Verification

```bash
npm run test:remote-gateway
npx playwright test e2e/remote-control.spec.ts --project=desktop-chromium
```

The deterministic gateway validator covers authentication, Origin rejection, role/station permissions, exclusive claims, explicit transfer, identity conflict, controller-envelope substitution, command result and timeout, rate limiting, reconnect claim recovery, emergency stop/resume, initial live state, read-only HTTP access, admin-only audit access, and credential redaction. The browser test starts a real local gateway, connects the page as host, claims Supervisor from an external client, verifies the bounded state projection, and executes a formal command through the game arbiter.

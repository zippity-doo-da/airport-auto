import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { WebSocket } from "ws";

import {
  createRemoteGateway,
  normalizeRemoteTokenManifest,
} from "../server/remoteGateway.mjs";

const secret = () => randomBytes(32).toString("base64url");
const credentials = {
  host: secret(),
  towerA: secret(),
  towerB: secret(),
  ground: secret(),
  spectator: secret(),
  admin: secret(),
  dualRole: secret(),
};
const sessionId = "gateway-validation";
const allowedOrigin = "http://controller.test";

class Peer {
  constructor(socket) {
    this.socket = socket;
    this.messages = [];
    this.waiters = [];
    socket.on("message", (data) => {
      const message = JSON.parse(data.toString("utf8"));
      const waiterIndex = this.waiters.findIndex((waiter) =>
        waiter.predicate(message),
      );
      if (waiterIndex >= 0) {
        const [waiter] = this.waiters.splice(waiterIndex, 1);
        clearTimeout(waiter.timer);
        waiter.resolve(message);
      } else {
        this.messages.push(message);
      }
    });
  }

  send(message) {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(predicate, timeoutMs = 2_000) {
    const messageIndex = this.messages.findIndex(predicate);
    if (messageIndex >= 0)
      return Promise.resolve(this.messages.splice(messageIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        reject,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error("Timed out waiting for gateway message."));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise((resolve) => {
      this.socket.once("close", resolve);
      this.socket.close(1000, "validation complete");
      setTimeout(() => {
        if (this.socket.readyState !== WebSocket.CLOSED)
          this.socket.terminate();
      }, 250).unref?.();
    });
  }
}

async function openSocket(url, origin = allowedOrigin) {
  const socket = new WebSocket(url, { origin });
  const peer = new Peer(socket);
  await new Promise((resolve, reject) => {
    socket.once("open", resolve);
    socket.once("error", reject);
  });
  return peer;
}

async function connectPeer(url, { token, role, clientId, resumeToken }) {
  const peer = await openSocket(url);
  peer.send({
    type: "hello",
    protocolVersion: "1.0.0",
    sessionId,
    clientId,
    role,
    token,
    ...(resumeToken ? { resumeToken } : {}),
  });
  const welcome = await peer.waitFor((message) => message.type === "welcome");
  return { peer, welcome };
}

function command(requestId, action = "pause") {
  return {
    type: "command",
    envelope: {
      protocolVersion: "1.2.0",
      requestId,
      source: "page",
      clientId: "forged-client",
      authority: { station: "supervisor", actorId: "forged-actor" },
      command: { action },
    },
  };
}

async function response(url, path, token = null) {
  return fetch(`${url}${path}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

assert.throws(
  () => normalizeRemoteTokenManifest([]),
  /At least one explicit remote token/,
);
assert.throws(
  () =>
    normalizeRemoteTokenManifest([
      {
        id: "placeholder",
        token: "REPLACE_WITH_A_RANDOM_SECRET_OF_32_BYTES_OR_MORE",
        roles: ["spectator"],
      },
    ]),
  /example placeholder/,
);
assert.throws(
  () =>
    normalizeRemoteTokenManifest([
      {
        id: "unscoped",
        token: secret(),
        roles: ["spectator"],
      },
    ]),
  /explicit permitted session/,
);
const duplicateSecret = secret();
assert.throws(
  () =>
    normalizeRemoteTokenManifest([
      {
        id: "duplicate-a",
        token: duplicateSecret,
        roles: ["spectator"],
        sessions: [sessionId],
      },
      {
        id: "duplicate-b",
        token: duplicateSecret,
        roles: ["spectator"],
        sessions: [sessionId],
      },
    ]),
  /secrets must be unique/,
);
assert.throws(
  () =>
    createRemoteGateway({
      allowedOrigins: ["*"],
      tokens: [
        {
          id: "origin-check",
          token: secret(),
          roles: ["spectator"],
          sessions: [sessionId],
        },
      ],
    }),
  /Wildcard browser Origins are not supported/,
);

const temporaryDirectory = await mkdtemp(join(tmpdir(), "airport-remote-"));
const auditFile = join(temporaryDirectory, "audit.jsonl");
const gateway = createRemoteGateway({
  allowedOrigins: [allowedOrigin],
  auditFile,
  commandTimeoutMs: 300,
  reconnectGraceMs: 2_000,
  heartbeatIntervalMs: 1_000,
  commandRateLimit: { count: 3, windowMs: 2_000 },
  maxPendingCommandsPerController: 1,
  tokens: [
    {
      id: "host",
      displayName: "Validation host",
      token: credentials.host,
      roles: ["host"],
      sessions: [sessionId],
    },
    {
      id: "tower-a",
      displayName: "Tower A",
      token: credentials.towerA,
      roles: ["controller"],
      stations: ["tower"],
      sessions: [sessionId],
    },
    {
      id: "tower-b",
      displayName: "Tower B",
      token: credentials.towerB,
      roles: ["controller"],
      stations: ["tower"],
      sessions: [sessionId],
    },
    {
      id: "ground",
      displayName: "Ground",
      token: credentials.ground,
      roles: ["controller"],
      stations: ["ground"],
      sessions: [sessionId],
    },
    {
      id: "spectator",
      displayName: "Observer",
      token: credentials.spectator,
      roles: ["spectator"],
      sessions: [sessionId],
    },
    {
      id: "admin",
      displayName: "Administrator",
      token: credentials.admin,
      roles: ["admin"],
      sessions: [sessionId],
      admin: true,
    },
    {
      id: "dual-role",
      displayName: "Dual-role validation credential",
      token: credentials.dualRole,
      roles: ["controller", "admin"],
      stations: ["approach"],
      sessions: [sessionId],
      admin: true,
    },
  ],
});

const peers = [];
try {
  const address = await gateway.listen({ port: 0, host: "127.0.0.1" });
  const health = await response(address.httpUrl, "/health");
  assert.equal(health.status, 200);
  assert.equal((await health.json()).status, "ok");
  const protocol = await response(address.httpUrl, "/v1/protocol");
  assert.equal(protocol.status, 200);
  assert.deepEqual((await protocol.json()).transports, [
    "websocket",
    "http-read-only",
    "optional-live-data-relay",
  ]);
  const consolePage = await response(address.httpUrl, "/console");
  assert.equal(consolePage.status, 200);
  const consoleHtml = await consolePage.text();
  assert.match(consoleHtml, /Controller desk/);
  assert.match(consoleHtml, /Station handoff/);
  assert.match(consoleHtml, /Accept station/);
  assert.match(consoleHtml, /Decline/);
  assert.match(consoleHtml, /Shared shift review/);
  assert.equal((await response(address.httpUrl, "/v1/sessions")).status, 401);

  await assert.rejects(async () => {
    const rejected = await openSocket(
      address.webSocketUrl,
      "https://evil.test",
    );
    await rejected.close();
  }, /403|Unexpected server response/);

  const sameOriginConsole = await openSocket(
    address.webSocketUrl,
    address.httpUrl,
  );
  sameOriginConsole.send({
    type: "hello",
    protocolVersion: "1.0.0",
    sessionId,
    clientId: "same-origin-console",
    role: "spectator",
    token: credentials.spectator,
  });
  assert.equal(
    (await sameOriginConsole.waitFor((message) => message.type === "welcome"))
      .role,
    "spectator",
  );
  await sameOriginConsole.close();

  const invalidCredential = await openSocket(address.webSocketUrl);
  invalidCredential.send({
    type: "hello",
    protocolVersion: "1.0.0",
    sessionId,
    clientId: "invalid-credential",
    role: "host",
    token: "invalid-but-long-enough-validation-credential",
  });
  assert.equal(
    (
      await invalidCredential.waitFor(
        (message) => message.type === "gateway-error",
      )
    ).code,
    "authentication-failed",
  );
  await invalidCredential.close();

  const host = await connectPeer(address.webSocketUrl, {
    token: credentials.host,
    role: "host",
    clientId: "browser-host",
  });
  peers.push(host.peer);
  assert.equal(host.welcome.role, "host");
  assert.ok(host.welcome.resumeToken);
  assert.equal(
    host.welcome.session.clients[0].droppedReplaceableMessages,
    0,
    "gateway session state omitted bounded replaceable-publication diagnostics",
  );
  assert.equal(
    (await host.peer.waitFor((message) => message.type === "state-request"))
      .reason,
    "host connected",
  );
  host.peer.send({
    type: "state",
    snapshot: {
      schemaVersion: 1,
      airport: { code: "ORD", name: "Chicago O'Hare" },
      flights: [{ id: 1, callsign: "AAL100", phase: "approach" }],
    },
    metrics: { throughput: 42, conflicts: 0 },
  });

  const spectator = await connectPeer(address.webSocketUrl, {
    token: credentials.spectator,
    role: "spectator",
    clientId: "observer-one",
  });
  peers.push(spectator.peer);
  const initialState = await spectator.peer.waitFor(
    (message) => message.type === "state",
  );
  assert.equal(initialState.snapshot.airport.code, "ORD");
  spectator.peer.send({
    type: "subscribe",
    requestId: "spectator-subscription",
    topics: ["event"],
  });
  const subscription = await spectator.peer.waitFor(
    (message) => message.type === "subscription-result",
  );
  assert.equal(subscription.accepted, true);
  assert.deepEqual(subscription.topics, ["event"]);
  spectator.peer.send(command("spectator-command"));
  const spectatorRejection = await spectator.peer.waitFor(
    (message) => message.type === "command-result",
  );
  assert.equal(spectatorRejection.accepted, false);
  assert.equal(spectatorRejection.code, "read-only-role");

  const dualRoleController = await connectPeer(address.webSocketUrl, {
    token: credentials.dualRole,
    role: "controller",
    clientId: "dual-role-controller",
  });
  assert.equal(dualRoleController.welcome.permissions.admin, false);
  dualRoleController.peer.send({
    type: "emergency-stop",
    reason: "must remain role-bound",
  });
  assert.equal(
    (
      await dualRoleController.peer.waitFor(
        (message) => message.type === "gateway-error",
      )
    ).code,
    "admin-required",
  );
  await dualRoleController.peer.close();

  const towerA = await connectPeer(address.webSocketUrl, {
    token: credentials.towerA,
    role: "controller",
    clientId: "tower-a",
  });
  peers.push(towerA.peer);
  towerA.peer.send({ type: "claim", requestId: "claim-a", station: "tower" });
  assert.equal(
    (await towerA.peer.waitFor((message) => message.type === "claim-result"))
      .accepted,
    true,
  );

  const towerB = await connectPeer(address.webSocketUrl, {
    token: credentials.towerB,
    role: "controller",
    clientId: "tower-b",
  });
  peers.push(towerB.peer);
  towerB.peer.send({ type: "claim", requestId: "claim-b", station: "tower" });
  const duplicateClaim = await towerB.peer.waitFor(
    (message) => message.type === "claim-result",
  );
  assert.equal(duplicateClaim.accepted, false);
  assert.match(duplicateClaim.reason, /already claimed/);

  const ground = await connectPeer(address.webSocketUrl, {
    token: credentials.ground,
    role: "controller",
    clientId: "ground-one",
  });
  peers.push(ground.peer);
  ground.peer.send({
    type: "claim",
    requestId: "ground-wrong-desk",
    station: "tower",
  });
  const permissionRejection = await ground.peer.waitFor(
    (message) => message.type === "claim-result",
  );
  assert.equal(permissionRejection.accepted, false);
  assert.match(permissionRejection.reason, /not permitted/);
  ground.peer.send({
    type: "claim",
    requestId: "ground-claim",
    station: "ground",
  });
  assert.equal(
    (await ground.peer.waitFor((message) => message.type === "claim-result"))
      .accepted,
    true,
  );

  towerA.peer.send(command("tower-command", "clearTakeoff"));
  const forwarded = await host.peer.waitFor(
    (message) => message.type === "command",
  );
  assert.equal(forwarded.envelope.clientId, "tower-a");
  assert.equal(forwarded.envelope.source, "agent");
  assert.deepEqual(forwarded.envelope.authority, {
    station: "tower",
    actorId: "tower-a",
  });
  host.peer.send({
    type: "command-result",
    gatewayCommandId: forwarded.gatewayCommandId,
    result: {
      accepted: true,
      reason: "shared safety arbiter accepted the instruction",
      eventId: 17,
      resultingState: { schemaVersion: 1, flights: [] },
    },
  });
  const accepted = await towerA.peer.waitFor(
    (message) => message.type === "command-result",
  );
  assert.equal(accepted.accepted, true);
  assert.equal(accepted.result.eventId, 17);

  // A host that is momentarily busy must produce an explicit backpressure
  // result, not an unbounded hidden queue or a silently lost ATC instruction.
  towerA.peer.send(command("tower-pending-first", "holdPosition"));
  const pendingForward = await host.peer.waitFor(
    (message) => message.type === "command" && message.envelope.requestId === "tower-pending-first",
  );
  towerA.peer.send(command("tower-pending-second", "holdPosition"));
  const backpressured = await towerA.peer.waitFor(
    (message) => message.type === "command-result" && message.requestId === "tower-pending-second",
  );
  assert.equal(backpressured.accepted, false);
  assert.equal(backpressured.code, "command-backpressure");
  host.peer.send({
    type: "command-result",
    gatewayCommandId: pendingForward.gatewayCommandId,
    result: { accepted: true, reason: "host queue drained" },
  });
  assert.equal(
    (
      await towerA.peer.waitFor(
        (message) => message.type === "command-result" && message.requestId === "tower-pending-first",
      )
    ).accepted,
    true,
  );

  for (let index = 0; index < 3; index += 1) {
    ground.peer.send(command(`ground-rate-${index}`, "holdPosition"));
    const routed = await host.peer.waitFor(
      (message) => message.type === "command",
    );
    host.peer.send({
      type: "command-result",
      gatewayCommandId: routed.gatewayCommandId,
      result: { accepted: true, reason: "accepted" },
    });
    assert.equal(
      (
        await ground.peer.waitFor(
          (message) => message.type === "command-result",
        )
      ).accepted,
      true,
    );
  }
  ground.peer.send(command("ground-rate-over", "holdPosition"));
  const limited = await ground.peer.waitFor(
    (message) => message.type === "command-result",
  );
  assert.equal(limited.code, "rate-limited");

  towerA.peer.send({ type: "offer-station", toClientId: "tower-b" });
  const offer = await towerB.peer.waitFor(
    (message) => message.type === "station-offer",
  );
  assert.equal(offer.station, "tower");
  towerB.peer.send({ type: "accept-station", station: "tower" });
  const transferred = await towerB.peer.waitFor(
    (message) =>
      message.type === "session-state" &&
      message.session.claims.some(
        (claim) => claim.station === "tower" && claim.clientId === "tower-b",
      ),
  );
  assert.equal(
    transferred.session.claims.find((claim) => claim.station === "tower")
      .clientId,
    "tower-b",
  );

  towerB.peer.send(command("tower-timeout", "clearTakeoff"));
  await host.peer.waitFor((message) => message.type === "command");
  const timedOut = await towerB.peer.waitFor(
    (message) =>
      message.type === "command-result" &&
      message.requestId === "tower-timeout",
    1_000,
  );
  assert.equal(timedOut.code, "host-timeout");

  const admin = await connectPeer(address.webSocketUrl, {
    token: credentials.admin,
    role: "admin",
    clientId: "ops-admin",
  });
  peers.push(admin.peer);
  admin.peer.send({ type: "emergency-stop", reason: "validation stop" });
  await towerB.peer.waitFor(
    (message) =>
      message.type === "session-state" && message.session.emergencyStop.active,
  );
  towerB.peer.send(command("stopped-command", "clearTakeoff"));
  assert.equal(
    (
      await towerB.peer.waitFor(
        (message) =>
          message.type === "command-result" &&
          message.requestId === "stopped-command",
      )
    ).code,
    "emergency-stop",
  );
  admin.peer.send({ type: "emergency-resume" });
  await towerB.peer.waitFor(
    (message) =>
      message.type === "session-state" && !message.session.emergencyStop.active,
  );

  const resumeToken = towerB.welcome.resumeToken;
  await towerB.peer.close();
  peers.splice(peers.indexOf(towerB.peer), 1);
  const resumedTower = await connectPeer(address.webSocketUrl, {
    token: credentials.towerB,
    role: "controller",
    clientId: "tower-b",
    resumeToken,
  });
  peers.push(resumedTower.peer);
  assert.equal(resumedTower.welcome.resumed, true);
  assert.equal(
    resumedTower.welcome.session.claims.find(
      (claim) => claim.station === "tower",
    ).clientId,
    "tower-b",
  );

  const duplicateIdentity = await openSocket(address.webSocketUrl);
  duplicateIdentity.send({
    type: "hello",
    protocolVersion: "1.0.0",
    sessionId,
    clientId: "tower-b",
    role: "controller",
    token: credentials.towerB,
  });
  assert.equal(
    (
      await duplicateIdentity.waitFor(
        (message) => message.type === "gateway-error",
      )
    ).code,
    "identity-conflict",
  );
  await duplicateIdentity.close();

  const secondHost = await openSocket(address.webSocketUrl);
  secondHost.send({
    type: "hello",
    protocolVersion: "1.0.0",
    sessionId,
    clientId: "second-host",
    role: "host",
    token: credentials.host,
  });
  assert.equal(
    (await secondHost.waitFor((message) => message.type === "gateway-error"))
      .code,
    "host-conflict",
  );
  await secondHost.close();

  const snapshotResponse = await response(
    address.httpUrl,
    `/v1/sessions/${sessionId}/snapshot`,
    credentials.spectator,
  );
  assert.equal(snapshotResponse.status, 200);
  assert.equal((await snapshotResponse.json()).snapshot.airport.code, "ORD");
  const metricsResponse = await response(
    address.httpUrl,
    `/v1/sessions/${sessionId}/metrics`,
    credentials.spectator,
  );
  assert.equal(metricsResponse.status, 200);
  assert.equal((await metricsResponse.json()).metrics.throughput, 42);
  assert.equal(
    (
      await response(
        address.httpUrl,
        `/v1/sessions/${sessionId}/audit`,
        credentials.spectator,
      )
    ).status,
    403,
  );
  const auditResponse = await response(
    address.httpUrl,
    `/v1/sessions/${sessionId}/audit?limit=500`,
    credentials.admin,
  );
  assert.equal(auditResponse.status, 200);
  const auditPayload = await auditResponse.json();
  assert.ok(
    auditPayload.events.some((event) => event.type === "station-transfer"),
  );
  assert.ok(
    auditPayload.events.some((event) => event.type === "command-timeout"),
  );
  const serializedAudit = JSON.stringify(auditPayload);
  for (const token of Object.values(credentials))
    assert.equal(
      serializedAudit.includes(token),
      false,
      "audit exposed a token",
    );

  await new Promise((resolve) => setTimeout(resolve, 40));
  const fileAudit = await readFile(auditFile, "utf8");
  for (const token of Object.values(credentials))
    assert.equal(
      fileAudit.includes(token),
      false,
      "audit file exposed a token",
    );

  const gatewayState = gateway.snapshot();
  assert.equal(gatewayState.sessions.length, 1);
  assert.equal(gatewayState.sessions[0].hostConnected, true);
  assert.equal(gatewayState.sessions[0].emergencyStop.active, false);
  console.log(
    `Remote gateway validation passed (${gatewayState.auditEvents} audited events, ${gatewayState.sessions[0].clients.length} live clients).`,
  );
} finally {
  await Promise.allSettled(peers.map((peer) => peer.close()));
  await gateway.close();
  await rm(temporaryDirectory, { recursive: true, force: true });
}

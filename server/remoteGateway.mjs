import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { appendFile } from "node:fs/promises";
import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { WebSocket, WebSocketServer } from "ws";

export const REMOTE_GATEWAY_PROTOCOL_VERSION = "1.0.0";
export const REMOTE_GATEWAY_SCHEMA_VERSION = 1;

const CONTROLLER_STATIONS = new Set([
  "supervisor",
  "approach",
  "tower",
  "ground",
  "ramp",
]);
const SUBSCRIPTION_TOPICS = new Set(["state", "event", "session"]);
const REMOTE_ROLES = new Set(["host", "controller", "spectator", "admin"]);
const SESSION_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const CLIENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:@-]{0,127}$/;
const DEFAULT_MAX_PAYLOAD_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_BUFFERED_BYTES = 2 * 1024 * 1024;
const DEFAULT_MAX_CONNECTIONS_PER_SESSION = 64;
const controllerConsoleHtml = readFileSync(
  new URL("./remoteControllerConsole.html", import.meta.url),
  "utf8",
);

function isRecord(value) {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function integer(value, fallback, minimum = 1) {
  const candidate = Number(value);
  return Number.isInteger(candidate) && candidate >= minimum
    ? candidate
    : fallback;
}

function boundedText(value, maximum = 256) {
  return typeof value === "string" ? value.slice(0, maximum) : "";
}

function opaqueHash(value) {
  return createHash("sha256").update(value).digest();
}

function opaqueHashKey(value) {
  return opaqueHash(value).toString("hex");
}

function randomSecret() {
  return randomBytes(32).toString("base64url");
}

function tokenMatches(candidate, expectedHash) {
  if (
    typeof candidate !== "string" ||
    candidate.length < 16 ||
    candidate.length > 512
  )
    return false;
  const candidateHash = opaqueHash(candidate);
  return (
    candidateHash.length === expectedHash.length &&
    timingSafeEqual(candidateHash, expectedHash)
  );
}

function normalizeTokenDescriptor(descriptor, index) {
  if (!isRecord(descriptor))
    throw new Error(`Remote token entry ${index + 1} must be an object.`);
  const id = boundedText(descriptor.id, 64);
  const token = descriptor.token;
  const roles = Array.isArray(descriptor.roles)
    ? [...new Set(descriptor.roles.filter((role) => REMOTE_ROLES.has(role)))]
    : [];
  const stations = Array.isArray(descriptor.stations)
    ? [
        ...new Set(
          descriptor.stations.filter((station) =>
            CONTROLLER_STATIONS.has(station),
          ),
        ),
      ]
    : [];
  const sessions = Array.isArray(descriptor.sessions)
    ? [
        ...new Set(
          descriptor.sessions.filter(
            (session) => session === "*" || SESSION_ID_PATTERN.test(session),
          ),
        ),
      ]
    : [];
  if (!id)
    throw new Error(`Remote token entry ${index + 1} needs a stable id.`);
  if (typeof token !== "string" || token.length < 24)
    throw new Error(`Remote token ${id} must contain at least 24 characters.`);
  if (/REPLACE|CHANGE[_ -]?ME|EXAMPLE|INSERT|<[^>]+>/i.test(token))
    throw new Error(
      `Remote token ${id} still contains an example placeholder.`,
    );
  if (!roles.length)
    throw new Error(`Remote token ${id} needs at least one role.`);
  if (!sessions.length)
    throw new Error(
      `Remote token ${id} needs at least one explicit permitted session.`,
    );
  if (roles.includes("controller") && !stations.length)
    throw new Error(
      `Controller token ${id} needs at least one permitted station.`,
    );
  return {
    id,
    displayName: boundedText(descriptor.displayName, 80) || id,
    tokenHash: opaqueHash(token),
    roles,
    stations,
    sessions,
    admin: descriptor.admin === true || roles.includes("admin"),
  };
}

export function normalizeRemoteTokenManifest(manifest) {
  if (!Array.isArray(manifest) || !manifest.length)
    throw new Error("At least one explicit remote token is required.");
  const tokens = manifest.map(normalizeTokenDescriptor);
  if (new Set(tokens.map((token) => token.id)).size !== tokens.length)
    throw new Error("Remote token ids must be unique.");
  if (
    new Set(tokens.map((token) => token.tokenHash.toString("hex"))).size !==
    tokens.length
  )
    throw new Error("Remote token secrets must be unique.");
  return tokens;
}

function tokenAllowsSession(token, sessionId) {
  return token.sessions.includes("*") || token.sessions.includes(sessionId);
}

function findToken(tokens, candidate) {
  return (
    tokens.find((token) => tokenMatches(candidate, token.tokenHash)) ?? null
  );
}

function gatewayProtocolCompatible(version) {
  if (typeof version !== "string") return false;
  const requestedMajor = Number(version.split(".")[0]);
  return Number.isInteger(requestedMajor) && requestedMajor === 1;
}

function originAllowed(origin, allowedOrigins, requestHost = null) {
  if (!origin) return true;
  if (allowedOrigins.includes(origin)) return true;
  try {
    return Boolean(requestHost && new URL(origin).host === requestHost);
  } catch {
    return false;
  }
}

function normalizeAllowedOrigins(origins) {
  if (!Array.isArray(origins)) return [];
  const normalized = origins.map((configuredOrigin) => {
    if (typeof configuredOrigin !== "string" || !configuredOrigin.trim())
      throw new Error("Every allowed browser Origin must be a non-empty URL.");
    if (configuredOrigin.trim() === "*")
      throw new Error(
        "Wildcard browser Origins are not supported; configure exact Origins.",
      );
    let parsed;
    try {
      parsed = new URL(configuredOrigin.trim());
    } catch {
      throw new Error(`Allowed browser Origin is invalid: ${configuredOrigin}`);
    }
    if (
      (parsed.protocol !== "http:" && parsed.protocol !== "https:") ||
      parsed.username ||
      parsed.password ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      parsed.origin === "null"
    )
      throw new Error(
        `Allowed browser Origin must contain only an http(s) scheme, host, and optional port: ${configuredOrigin}`,
      );
    return parsed.origin;
  });
  return [...new Set(normalized)];
}

function sessionPublicState(session) {
  const now = Date.now();
  for (const [station, offer] of session.stationOffers) {
    if (offer.expiresAt <= now) session.stationOffers.delete(station);
  }
  return {
    schemaVersion: REMOTE_GATEWAY_SCHEMA_VERSION,
    protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
    sessionId: session.id,
    hostConnected: Boolean(session.host?.authenticated),
    stateAvailable: Boolean(session.snapshot),
    stateSequence: session.stateSequence,
    stateUpdatedAt: session.stateUpdatedAt,
    emergencyStop: { ...session.emergencyStop },
    clients: [...session.connections]
      .filter((connection) => connection.authenticated)
      .map((connection) => ({
        clientId: connection.clientId,
        displayName: connection.token.displayName,
        role: connection.role,
        station: connection.station,
        subscriptions: [...(connection.subscriptions ?? SUBSCRIPTION_TOPICS)].sort(),
        connectedAt: connection.connectedAt,
      }))
      .sort((first, second) => first.clientId.localeCompare(second.clientId)),
    claims: [...session.claims.entries()]
      .map(([station, claim]) => ({
        station,
        clientId: claim.clientId,
        displayName: claim.displayName,
        connected: Boolean(claim.connectionId),
        reservedUntil: claim.connectionId ? null : claim.reservedUntil,
      }))
      .sort((first, second) => first.station.localeCompare(second.station)),
    stationOffers: [...session.stationOffers.entries()].map(
      ([station, offer]) => ({
        station,
        fromClientId: offer.fromClientId,
        toClientId: offer.toClientId,
        expiresAt: new Date(offer.expiresAt).toISOString(),
      }),
    ),
  };
}

function safeSend(connection, message) {
  if (!connection || connection.socket.readyState !== WebSocket.OPEN)
    return false;
  if (connection.socket.bufferedAmount > connection.maxBufferedBytes) {
    connection.socket.close(1013, "client output buffer exceeded");
    return false;
  }
  try {
    connection.socket.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function sendGatewayError(connection, code, reason, requestId = null) {
  safeSend(connection, {
    type: "gateway-error",
    protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
    code,
    reason,
    requestId,
  });
}

function sendCommandRejection(connection, requestId, reason, code) {
  safeSend(connection, {
    type: "command-result",
    protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
    requestId,
    gatewayCommandId: null,
    accepted: false,
    reason,
    code,
    result: null,
  });
}

function jsonResponse(response, status, body, origin = null) {
  const payload = JSON.stringify(body);
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(payload),
    "Cache-Control": "no-store",
    "X-Content-Type-Options": "nosniff",
    ...(origin
      ? { "Access-Control-Allow-Origin": origin, Vary: "Origin" }
      : {}),
  });
  response.end(payload);
}

function htmlResponse(response, html) {
  response.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": "no-store",
    "Content-Security-Policy":
      "default-src 'none'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; connect-src ws: wss:; img-src data:; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    "Referrer-Policy": "no-referrer",
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
  });
  response.end(html);
}

function bearerToken(request) {
  const authorization = request.headers.authorization;
  if (typeof authorization !== "string") return null;
  const match = /^Bearer\s+(.+)$/i.exec(authorization);
  return match?.[1] ?? null;
}

function permittedHttpToken(request, tokens, sessionId = null) {
  const token = findToken(tokens, bearerToken(request));
  if (!token) return null;
  if (sessionId && !tokenAllowsSession(token, sessionId)) return null;
  return token;
}

function commandRequestId(message) {
  const value = isRecord(message.envelope) ? message.envelope.requestId : null;
  return typeof value === "string" ? value.slice(0, 128) : "";
}

export function createRemoteGateway(options = {}) {
  const tokens = normalizeRemoteTokenManifest(options.tokens);
  const liveDataService = options.liveDataService ?? null;
  const allowedOrigins = normalizeAllowedOrigins(options.allowedOrigins);
  const handshakeTimeoutMs = integer(options.handshakeTimeoutMs, 5_000, 250);
  const commandTimeoutMs = integer(options.commandTimeoutMs, 5_000, 250);
  const reconnectGraceMs = integer(options.reconnectGraceMs, 20_000, 1_000);
  const heartbeatIntervalMs = integer(
    options.heartbeatIntervalMs,
    15_000,
    1_000,
  );
  const sessionIdleTtlMs = integer(
    options.sessionIdleTtlMs,
    30 * 60_000,
    10_000,
  );
  const auditLimit = integer(options.auditLimit, 5_000, 100);
  const rateLimitCount = integer(options.commandRateLimit?.count, 30, 1);
  const rateLimitWindowMs = integer(
    options.commandRateLimit?.windowMs,
    10_000,
    250,
  );
  const maxPayload = integer(
    options.maxPayloadBytes,
    DEFAULT_MAX_PAYLOAD_BYTES,
    64 * 1024,
  );
  const maxBufferedBytes = integer(
    options.maxBufferedBytes,
    DEFAULT_MAX_BUFFERED_BYTES,
    64 * 1024,
  );
  const maxConnectionsPerSession = integer(
    options.maxConnectionsPerSession,
    DEFAULT_MAX_CONNECTIONS_PER_SESSION,
    2,
  );
  const auditFile =
    typeof options.auditFile === "string" && options.auditFile
      ? options.auditFile
      : null;
  const sessions = new Map();
  const audit = [];
  let auditWrite = Promise.resolve();
  let commandSequence = 0;
  let closing = false;

  const recordAudit = (entry) => {
    const event = {
      auditId: `audit-${randomUUID()}`,
      timestamp: new Date().toISOString(),
      ...entry,
    };
    audit.push(event);
    if (audit.length > auditLimit) audit.splice(0, audit.length - auditLimit);
    if (auditFile)
      auditWrite = auditWrite
        .then(() => appendFile(auditFile, `${JSON.stringify(event)}\n`, "utf8"))
        .catch(() => {});
    return event;
  };

  const getSession = (sessionId) => {
    let session = sessions.get(sessionId);
    if (session) return session;
    session = {
      id: sessionId,
      createdAt: new Date().toISOString(),
      lastActivityAt: Date.now(),
      host: null,
      connections: new Set(),
      claims: new Map(),
      stationOffers: new Map(),
      reconnects: new Map(),
      pendingCommands: new Map(),
      snapshot: null,
      metrics: null,
      stateSequence: 0,
      stateUpdatedAt: null,
      emergencyStop: {
        active: false,
        reason: null,
        byClientId: null,
        changedAt: null,
      },
    };
    sessions.set(sessionId, session);
    return session;
  };

  const broadcastSessionState = (session) => {
    const message = {
      type: "session-state",
      session: sessionPublicState(session),
    };
    for (const connection of session.connections) {
      if ((connection.subscriptions ?? SUBSCRIPTION_TOPICS).has("session"))
        safeSend(connection, message, false);
    }
  };

  const releaseClaim = (session, station, reason, actor = null) => {
    const claim = session.claims.get(station);
    if (!claim) return false;
    session.claims.delete(station);
    session.stationOffers.delete(station);
    const connection = [...session.connections].find(
      (candidate) => candidate.id === claim.connectionId,
    );
    if (connection) connection.station = null;
    recordAudit({
      type: "station-release",
      sessionId: session.id,
      station,
      clientId: claim.clientId,
      actorClientId: actor?.clientId ?? null,
      reason,
    });
    return true;
  };

  const claimStation = (connection, station, reason = "explicit claim") => {
    const session = connection.session;
    if (connection.role !== "controller")
      return {
        accepted: false,
        reason: "only controller connections can claim a station",
      };
    if (!CONTROLLER_STATIONS.has(station))
      return { accepted: false, reason: "station is not recognized" };
    if (!connection.token.stations.includes(station))
      return {
        accepted: false,
        reason: `token is not permitted to claim ${station}`,
      };
    if (connection.station && connection.station !== station)
      return {
        accepted: false,
        reason: `release ${connection.station} before claiming ${station}`,
      };
    const existing = session.claims.get(station);
    if (existing && existing.connectionId !== connection.id)
      return {
        accepted: false,
        reason: `${station} is already claimed by ${existing.clientId}`,
      };
    connection.station = station;
    session.claims.set(station, {
      clientId: connection.clientId,
      displayName: connection.token.displayName,
      tokenId: connection.token.id,
      connectionId: connection.id,
      reservedUntil: null,
    });
    recordAudit({
      type: "station-claim",
      sessionId: session.id,
      station,
      clientId: connection.clientId,
      reason,
    });
    broadcastSessionState(session);
    return { accepted: true, reason: `${station} claimed` };
  };

  const sendClaimResult = (connection, station, result, requestId = null) => {
    safeSend(connection, {
      type: "claim-result",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      requestId,
      station,
      ...result,
      session: sessionPublicState(connection.session),
    });
  };

  const expireReservedClaim = (session, station, clientId, expiresAt) => {
    const delay = Math.max(0, expiresAt - Date.now());
    const timer = setTimeout(() => {
      const claim = session.claims.get(station);
      if (
        claim &&
        !claim.connectionId &&
        claim.clientId === clientId &&
        claim.reservedUntil === expiresAt
      ) {
        releaseClaim(session, station, "reconnect grace expired");
        broadcastSessionState(session);
      }
    }, delay + 10);
    timer.unref?.();
  };

  const disconnectConnection = (connection, reason = "socket closed") => {
    if (connection.disconnected) return;
    connection.disconnected = true;
    clearTimeout(connection.handshakeTimer);
    const session = connection.session;
    if (!session) return;
    session.connections.delete(connection);
    session.lastActivityAt = Date.now();
    if (session.host === connection) {
      session.host = null;
      for (const pending of session.pendingCommands.values()) {
        clearTimeout(pending.timer);
        sendCommandRejection(
          pending.connection,
          pending.requestId,
          "game host disconnected before returning a command result",
          "host-disconnected",
        );
      }
      session.pendingCommands.clear();
    } else {
      for (const [gatewayCommandId, pending] of session.pendingCommands) {
        if (pending.connection !== connection) continue;
        clearTimeout(pending.timer);
        session.pendingCommands.delete(gatewayCommandId);
        recordAudit({
          type: "command-abandoned",
          sessionId: session.id,
          clientId: connection.clientId,
          station: pending.station,
          requestId: pending.requestId,
          gatewayCommandId,
          action: pending.action,
          reason: "controller disconnected before result",
        });
      }
    }
    if (connection.authenticated && connection.resumeTokenHash) {
      const expiresAt = Date.now() + reconnectGraceMs;
      for (const [resumeKey, resume] of session.reconnects) {
        if (
          resume.clientId === connection.clientId &&
          resume.tokenId === connection.token.id &&
          resume.role === connection.role
        )
          session.reconnects.delete(resumeKey);
      }
      session.reconnects.set(connection.resumeTokenHash, {
        clientId: connection.clientId,
        tokenId: connection.token.id,
        role: connection.role,
        station: connection.station,
        expiresAt,
      });
      while (session.reconnects.size > maxConnectionsPerSession * 2)
        session.reconnects.delete(session.reconnects.keys().next().value);
      if (connection.station) {
        const claim = session.claims.get(connection.station);
        if (claim?.connectionId === connection.id) {
          claim.connectionId = null;
          claim.reservedUntil = expiresAt;
          expireReservedClaim(
            session,
            connection.station,
            connection.clientId,
            expiresAt,
          );
        }
      }
    }
    recordAudit({
      type: "disconnect",
      sessionId: session.id,
      clientId: connection.clientId,
      role: connection.role,
      station: connection.station,
      reason,
    });
    broadcastSessionState(session);
  };

  const authenticateConnection = (connection, message) => {
    if (message.type !== "hello") {
      sendGatewayError(
        connection,
        "authentication-required",
        "send hello before any other message",
      );
      return false;
    }
    const sessionId = boundedText(message.sessionId, 64);
    const clientId = boundedText(message.clientId, 128);
    const role = boundedText(message.role, 16);
    if (!gatewayProtocolCompatible(message.protocolVersion)) {
      sendGatewayError(
        connection,
        "protocol-incompatible",
        "gateway protocol major 1 is required",
      );
      connection.socket.close(1002, "protocol incompatible");
      return false;
    }
    if (
      !SESSION_ID_PATTERN.test(sessionId) ||
      !CLIENT_ID_PATTERN.test(clientId)
    ) {
      sendGatewayError(
        connection,
        "identity-invalid",
        "sessionId or clientId is invalid",
      );
      connection.socket.close(1008, "invalid identity");
      return false;
    }
    if (!REMOTE_ROLES.has(role)) {
      sendGatewayError(
        connection,
        "role-invalid",
        "remote role is not recognized",
      );
      connection.socket.close(1008, "invalid role");
      return false;
    }
    const token = findToken(tokens, message.token);
    if (
      !token ||
      !token.roles.includes(role) ||
      !tokenAllowsSession(token, sessionId)
    ) {
      sendGatewayError(
        connection,
        "authentication-failed",
        "token is invalid for the requested role or session",
      );
      recordAudit({
        type: "authentication-rejected",
        sessionId,
        clientId,
        role,
      });
      connection.socket.close(1008, "authentication failed");
      return false;
    }
    const session = getSession(sessionId);
    if (session.connections.size >= maxConnectionsPerSession) {
      sendGatewayError(
        connection,
        "session-capacity",
        "this session has reached its connection limit",
      );
      recordAudit({
        type: "connection-rejected",
        sessionId,
        clientId,
        role,
        reason: "session-capacity",
      });
      connection.socket.close(1013, "session connection limit reached");
      return false;
    }
    const duplicateIdentity = [...session.connections].find(
      (candidate) => candidate.authenticated && candidate.clientId === clientId,
    );
    if (duplicateIdentity) {
      sendGatewayError(
        connection,
        "identity-conflict",
        "this clientId is already connected to the session",
      );
      connection.socket.close(1008, "client identity already connected");
      return false;
    }
    if (role === "host" && session.host && session.host !== connection) {
      sendGatewayError(
        connection,
        "host-conflict",
        "this session already has a connected game host",
      );
      connection.socket.close(1008, "host already connected");
      return false;
    }
    let resumed = false;
    let resumeRecord = null;
    if (typeof message.resumeToken === "string") {
      const resumeKey = opaqueHashKey(message.resumeToken);
      const candidate = session.reconnects.get(resumeKey);
      if (
        candidate &&
        candidate.expiresAt > Date.now() &&
        candidate.clientId === clientId &&
        candidate.tokenId === token.id &&
        candidate.role === role
      ) {
        resumed = true;
        resumeRecord = candidate;
        session.reconnects.delete(resumeKey);
      }
    }
    connection.authenticated = true;
    connection.clientId = clientId;
    connection.role = role;
    connection.token = token;
    connection.session = session;
    connection.connectedAt = new Date().toISOString();
    connection.resumeToken = randomSecret();
    connection.resumeTokenHash = opaqueHashKey(connection.resumeToken);
    clearTimeout(connection.handshakeTimer);
    session.connections.add(connection);
    session.lastActivityAt = Date.now();
    if (role === "host") session.host = connection;
    if (resumed && resumeRecord?.station) {
      const claim = session.claims.get(resumeRecord.station);
      if (claim?.clientId === clientId && !claim.connectionId) {
        claim.connectionId = connection.id;
        claim.reservedUntil = null;
        connection.station = resumeRecord.station;
      }
    }
    safeSend(connection, {
      type: "welcome",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      schemaVersion: REMOTE_GATEWAY_SCHEMA_VERSION,
      connectionId: connection.id,
      clientId,
      role,
      resumed,
      resumeToken: connection.resumeToken,
      permissions: {
        stations: [...token.stations],
        sessions: [...token.sessions],
        admin: role === "admin" && token.admin,
      },
      session: sessionPublicState(session),
    });
    recordAudit({
      type: resumed ? "reconnect" : "connect",
      sessionId,
      clientId,
      role,
      station: connection.station,
      tokenId: token.id,
    });
    broadcastSessionState(session);
    if (role === "host")
      safeSend(connection, { type: "state-request", reason: "host connected" });
    else if (session.snapshot)
      safeSend(connection, {
        type: "state",
        protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
        sessionId: session.id,
        sequence: session.stateSequence,
        updatedAt: session.stateUpdatedAt,
        snapshot: session.snapshot,
        metrics: session.metrics,
      });
    if (role === "controller" && typeof message.station === "string") {
      const result = claimStation(
        connection,
        message.station,
        resumed ? "reconnect" : "hello request",
      );
      sendClaimResult(connection, message.station, result);
    }
    return true;
  };

  const withinCommandRate = (connection) => {
    const threshold = Date.now() - rateLimitWindowMs;
    connection.commandTimes = connection.commandTimes.filter(
      (time) => time > threshold,
    );
    if (connection.commandTimes.length >= rateLimitCount) return false;
    connection.commandTimes.push(Date.now());
    return true;
  };

  const handleControllerCommand = (connection, message) => {
    const requestId = commandRequestId(message);
    if (connection.role !== "controller") {
      sendCommandRejection(
        connection,
        requestId,
        "spectator and admin connections are read-only",
        "read-only-role",
      );
      return;
    }
    if (!connection.station) {
      sendCommandRejection(
        connection,
        requestId,
        "claim a controller station before sending commands",
        "station-required",
      );
      return;
    }
    const claim = connection.session.claims.get(connection.station);
    if (claim?.connectionId !== connection.id) {
      sendCommandRejection(
        connection,
        requestId,
        "controller station claim is no longer active",
        "claim-lost",
      );
      return;
    }
    if (
      !requestId ||
      !isRecord(message.envelope) ||
      !isRecord(message.envelope.command)
    ) {
      sendCommandRejection(
        connection,
        requestId,
        "command envelope is incomplete",
        "envelope-invalid",
      );
      return;
    }
    if (connection.requestIds.has(requestId)) {
      sendCommandRejection(
        connection,
        requestId,
        "requestId has already been used on this connection",
        "request-duplicate",
      );
      return;
    }
    connection.requestIds.add(requestId);
    if (connection.requestIds.size > 512)
      connection.requestIds.delete(connection.requestIds.values().next().value);
    if (!withinCommandRate(connection)) {
      sendCommandRejection(
        connection,
        requestId,
        "command rate limit exceeded",
        "rate-limited",
      );
      recordAudit({
        type: "command-rejected",
        sessionId: connection.session.id,
        clientId: connection.clientId,
        station: connection.station,
        requestId,
        action: boundedText(message.envelope.command.action, 64),
        reason: "rate-limited",
      });
      return;
    }
    if (connection.session.emergencyStop.active) {
      sendCommandRejection(
        connection,
        requestId,
        "remote command routing is emergency-stopped",
        "emergency-stop",
      );
      return;
    }
    const host = connection.session.host;
    if (!host?.authenticated) {
      sendCommandRejection(
        connection,
        requestId,
        "game host is not connected",
        "host-offline",
      );
      return;
    }
    const gatewayCommandId = `gateway-${++commandSequence}`;
    const envelope = {
      ...message.envelope,
      requestId,
      clientId: connection.clientId,
      source: "agent",
      authority: {
        station: connection.station,
        actorId: connection.clientId,
      },
    };
    const timer = setTimeout(() => {
      const pending = connection.session.pendingCommands.get(gatewayCommandId);
      if (!pending) return;
      connection.session.pendingCommands.delete(gatewayCommandId);
      sendCommandRejection(
        pending.connection,
        requestId,
        "game host did not return a command result before the timeout",
        "host-timeout",
      );
      recordAudit({
        type: "command-timeout",
        sessionId: connection.session.id,
        clientId: connection.clientId,
        station: connection.station,
        requestId,
        gatewayCommandId,
        action: boundedText(envelope.command.action, 64),
      });
    }, commandTimeoutMs);
    timer.unref?.();
    connection.session.pendingCommands.set(gatewayCommandId, {
      connection,
      requestId,
      station: connection.station,
      action: boundedText(envelope.command.action, 64),
      timer,
    });
    safeSend(host, {
      type: "command",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      gatewayCommandId,
      envelope,
    });
    recordAudit({
      type: "command-forwarded",
      sessionId: connection.session.id,
      clientId: connection.clientId,
      station: connection.station,
      requestId,
      gatewayCommandId,
      action: boundedText(envelope.command.action, 64),
    });
  };

  const handleHostResult = (connection, message) => {
    if (connection.role !== "host") return;
    const gatewayCommandId = boundedText(message.gatewayCommandId, 128);
    const pending = connection.session.pendingCommands.get(gatewayCommandId);
    if (!pending) return;
    connection.session.pendingCommands.delete(gatewayCommandId);
    clearTimeout(pending.timer);
    const accepted =
      isRecord(message.result) && message.result.accepted === true;
    const reason = isRecord(message.result)
      ? boundedText(message.result.reason, 512)
      : "host returned an invalid result";
    safeSend(pending.connection, {
      type: "command-result",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      requestId: pending.requestId,
      gatewayCommandId,
      accepted,
      reason,
      code: accepted ? "accepted" : "host-rejected",
      result: isRecord(message.result) ? message.result : null,
    });
    recordAudit({
      type: "command-result",
      sessionId: connection.session.id,
      clientId: pending.connection.clientId,
      station: pending.station,
      requestId: pending.requestId,
      gatewayCommandId,
      action: pending.action,
      accepted,
      reason,
    });
  };

  const handleHostState = (connection, message) => {
    if (connection.role !== "host" || !isRecord(message.snapshot)) return;
    const session = connection.session;
    session.snapshot = message.snapshot;
    session.metrics = isRecord(message.metrics)
      ? message.metrics
      : isRecord(message.snapshot.controllers) &&
          isRecord(message.snapshot.controllers.evaluation)
        ? message.snapshot.controllers.evaluation
        : null;
    session.stateSequence += 1;
    session.stateUpdatedAt = new Date().toISOString();
    session.lastActivityAt = Date.now();
    const outgoing = {
      type: "state",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      sessionId: session.id,
      sequence: session.stateSequence,
      updatedAt: session.stateUpdatedAt,
      snapshot: session.snapshot,
      metrics: session.metrics,
    };
    for (const target of session.connections) {
      if (
        target !== connection &&
        (target.subscriptions ?? SUBSCRIPTION_TOPICS).has("state")
      )
        safeSend(target, outgoing, false);
    }
  };

  const handleHostEvent = (connection, message) => {
    if (connection.role !== "host" || !isRecord(message.event)) return;
    const outgoing = {
      type: "event",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      sessionId: connection.session.id,
      event: message.event,
    };
    for (const target of connection.session.connections) {
      if (
        target !== connection &&
        (target.subscriptions ?? SUBSCRIPTION_TOPICS).has("event")
      )
        safeSend(target, outgoing, false);
    }
  };

  const handleSubscribe = (connection, message) => {
    if (connection.role === "host") {
      sendGatewayError(
        connection,
        "subscription-host-forbidden",
        "hosts publish state and cannot filter their own source stream",
      );
      return;
    }
    if (!Array.isArray(message.topics)) {
      sendGatewayError(connection, "subscription-invalid", "topics must be an array");
      return;
    }
    const topics = [...new Set(message.topics.map((topic) => boundedText(topic, 16)))]
      .filter((topic) => topic && SUBSCRIPTION_TOPICS.has(topic));
    if (topics.length !== message.topics.length || topics.length === 0) {
      sendGatewayError(
        connection,
        "subscription-invalid",
        "choose one or more supported topics: state, event, session",
      );
      return;
    }
    connection.subscriptions = new Set(topics);
    safeSend(connection, {
      type: "subscription-result",
      protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
      requestId: boundedText(message.requestId, 128),
      accepted: true,
      topics: [...connection.subscriptions],
    });
  };

  const handleStationOffer = (connection, message) => {
    const station = connection.station;
    const targetClientId = boundedText(message.toClientId, 128);
    if (connection.role !== "controller" || !station) {
      sendGatewayError(
        connection,
        "claim-required",
        "claim a station before offering it",
      );
      return;
    }
    const target = [...connection.session.connections].find(
      (candidate) =>
        candidate.authenticated &&
        candidate.role === "controller" &&
        candidate.clientId === targetClientId,
    );
    if (!target || !target.token.stations.includes(station) || target.station) {
      sendGatewayError(
        connection,
        "handoff-target-invalid",
        "target controller is unavailable or not permitted for this station",
      );
      return;
    }
    const offer = {
      fromClientId: connection.clientId,
      toClientId: target.clientId,
      expiresAt: Date.now() + 15_000,
    };
    connection.session.stationOffers.set(station, offer);
    recordAudit({
      type: "station-offer",
      sessionId: connection.session.id,
      station,
      clientId: connection.clientId,
      targetClientId: target.clientId,
    });
    safeSend(target, {
      type: "station-offer",
      station,
      fromClientId: connection.clientId,
      expiresAt: new Date(offer.expiresAt).toISOString(),
    });
    broadcastSessionState(connection.session);
  };

  const handleStationOfferResponse = (connection, message, accepted) => {
    const station = boundedText(message.station, 16);
    const offer = connection.session.stationOffers.get(station);
    if (
      !offer ||
      offer.toClientId !== connection.clientId ||
      offer.expiresAt <= Date.now()
    ) {
      sendGatewayError(
        connection,
        "station-offer-missing",
        "no active station offer matches this response",
      );
      return;
    }
    connection.session.stationOffers.delete(station);
    if (!accepted) {
      recordAudit({
        type: "station-offer-declined",
        sessionId: connection.session.id,
        station,
        clientId: connection.clientId,
      });
      broadcastSessionState(connection.session);
      return;
    }
    const priorClaim = connection.session.claims.get(station);
    const priorConnection = [...connection.session.connections].find(
      (candidate) => candidate.id === priorClaim?.connectionId,
    );
    if (
      !priorClaim ||
      priorClaim.clientId !== offer.fromClientId ||
      connection.station
    ) {
      sendGatewayError(
        connection,
        "station-transfer-conflict",
        "station ownership changed before acceptance",
      );
      return;
    }
    if (priorConnection) priorConnection.station = null;
    connection.station = station;
    connection.session.claims.set(station, {
      clientId: connection.clientId,
      displayName: connection.token.displayName,
      tokenId: connection.token.id,
      connectionId: connection.id,
      reservedUntil: null,
    });
    recordAudit({
      type: "station-transfer",
      sessionId: connection.session.id,
      station,
      clientId: offer.fromClientId,
      targetClientId: connection.clientId,
    });
    broadcastSessionState(connection.session);
  };

  const handleEmergencyStop = (connection, message, active) => {
    if (connection.role !== "admin" || !connection.token.admin) {
      sendGatewayError(
        connection,
        "admin-required",
        "emergency stop requires an admin token",
      );
      return;
    }
    const session = connection.session;
    session.emergencyStop = {
      active,
      reason: active
        ? boundedText(message.reason, 256) || "operator emergency stop"
        : null,
      byClientId: connection.clientId,
      changedAt: new Date().toISOString(),
    };
    recordAudit({
      type: active ? "emergency-stop" : "emergency-resume",
      sessionId: session.id,
      clientId: connection.clientId,
      reason: session.emergencyStop.reason,
    });
    broadcastSessionState(session);
  };

  const handleAuthenticatedMessage = (connection, message) => {
    connection.session.lastActivityAt = Date.now();
    switch (message.type) {
      case "ping":
        safeSend(connection, { type: "pong", at: new Date().toISOString() });
        return;
      case "subscribe":
        handleSubscribe(connection, message);
        return;
      case "claim": {
        const station = boundedText(message.station, 16);
        sendClaimResult(
          connection,
          station,
          claimStation(connection, station),
          message.requestId,
        );
        return;
      }
      case "release": {
        const station = connection.station;
        const accepted = Boolean(
          station &&
          releaseClaim(
            connection.session,
            station,
            "explicit release",
            connection,
          ),
        );
        sendClaimResult(
          connection,
          station,
          {
            accepted,
            reason: accepted ? `${station} released` : "no station is claimed",
          },
          message.requestId,
        );
        broadcastSessionState(connection.session);
        return;
      }
      case "offer-station":
        handleStationOffer(connection, message);
        return;
      case "accept-station":
        handleStationOfferResponse(connection, message, true);
        return;
      case "decline-station":
        handleStationOfferResponse(connection, message, false);
        return;
      case "command":
        handleControllerCommand(connection, message);
        return;
      case "command-result":
        handleHostResult(connection, message);
        return;
      case "state":
        handleHostState(connection, message);
        return;
      case "event":
        handleHostEvent(connection, message);
        return;
      case "emergency-stop":
        handleEmergencyStop(connection, message, true);
        return;
      case "emergency-resume":
        handleEmergencyStop(connection, message, false);
        return;
      default:
        sendGatewayError(
          connection,
          "message-unknown",
          "message type is not recognized",
        );
    }
  };

  const httpServer = createServer((request, response) => {
    const requestOrigin =
      typeof request.headers.origin === "string"
        ? request.headers.origin
        : null;
    if (
      requestOrigin &&
      !originAllowed(requestOrigin, allowedOrigins, request.headers.host)
    ) {
      jsonResponse(response, 403, { error: "origin is not allowed" });
      return;
    }
    if (request.method === "OPTIONS") {
      response.writeHead(204, {
        "Access-Control-Allow-Origin": requestOrigin ?? "null",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Max-Age": "600",
        Vary: "Origin",
      });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://gateway.invalid");
    if (
      request.method === "GET" &&
      (url.pathname === "/" || url.pathname === "/console")
    ) {
      htmlResponse(response, controllerConsoleHtml);
      return;
    }
    if (request.method === "GET" && url.pathname === "/health") {
      jsonResponse(
        response,
        200,
        {
          status: "ok",
          protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
          sessions: sessions.size,
          connections: [...sessions.values()].reduce(
            (total, session) => total + session.connections.size,
            0,
          ),
          liveData: liveDataService?.diagnostics?.() ?? {
            providers: {
              metar: "disabled",
              notam: "disabled",
              traffic: "disabled",
            },
          },
        },
        requestOrigin,
      );
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/protocol") {
      jsonResponse(
        response,
        200,
        {
          schemaVersion: REMOTE_GATEWAY_SCHEMA_VERSION,
          protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
          roles: [...REMOTE_ROLES],
          stations: [...CONTROLLER_STATIONS],
          transports: [
            "websocket",
            "http-read-only",
            "optional-live-data-relay",
          ],
          security: [
            "explicit bearer token",
            "exclusive station claim",
            "origin allowlist",
            "rate limit",
            "command timeout",
            "bounded redacted audit",
            "emergency stop",
          ],
        },
        requestOrigin,
      );
      return;
    }
    const liveDataMatch = /^\/v1\/live\/(metar|notams|traffic)\/([^/]+)$/.exec(
      url.pathname,
    );
    if (request.method === "GET" && liveDataMatch) {
      const token = permittedHttpToken(request, tokens);
      if (!token) {
        jsonResponse(
          response,
          401,
          { error: "valid bearer token required" },
          requestOrigin,
        );
        return;
      }
      if (!token.admin && !token.roles.includes("host")) {
        jsonResponse(
          response,
          403,
          { error: "host or admin token required for live-data relay" },
          requestOrigin,
        );
        return;
      }
      if (!liveDataService) {
        jsonResponse(
          response,
          503,
          { error: "live-data relay is disabled by the gateway operator" },
          requestOrigin,
        );
        return;
      }
      let station;
      try {
        station = decodeURIComponent(liveDataMatch[2]).toUpperCase();
      } catch {
        jsonResponse(
          response,
          400,
          { error: "station is not valid URL encoding" },
          requestOrigin,
        );
        return;
      }
      const kind = liveDataMatch[1] === "notams" ? "notam" : liveDataMatch[1];
      Promise.resolve(liveDataService.report(kind, station))
        .then((report) =>
          jsonResponse(response, 200, { report }, requestOrigin),
        )
        .catch((error) =>
          jsonResponse(
            response,
            503,
            {
              error:
                boundedText(error?.message, 300) || "live-data provider failed",
            },
            requestOrigin,
          ),
        );
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/sessions") {
      const token = permittedHttpToken(request, tokens);
      if (!token) {
        jsonResponse(
          response,
          401,
          { error: "valid bearer token required" },
          requestOrigin,
        );
        return;
      }
      jsonResponse(
        response,
        200,
        {
          sessions: [...sessions.values()]
            .filter((session) => tokenAllowsSession(token, session.id))
            .map(sessionPublicState),
        },
        requestOrigin,
      );
      return;
    }
    const sessionMatch =
      /^\/v1\/sessions\/([^/]+)\/(snapshot|metrics|audit)$/.exec(url.pathname);
    if (request.method === "GET" && sessionMatch) {
      let sessionId;
      try {
        sessionId = decodeURIComponent(sessionMatch[1]);
      } catch {
        jsonResponse(
          response,
          400,
          { error: "session id is not valid URL encoding" },
          requestOrigin,
        );
        return;
      }
      const token = permittedHttpToken(request, tokens, sessionId);
      if (!token) {
        jsonResponse(
          response,
          401,
          { error: "valid bearer token required" },
          requestOrigin,
        );
        return;
      }
      const session = sessions.get(sessionId);
      if (!session) {
        jsonResponse(
          response,
          404,
          { error: "session not found" },
          requestOrigin,
        );
        return;
      }
      if (sessionMatch[2] === "snapshot") {
        jsonResponse(
          response,
          session.snapshot ? 200 : 404,
          {
            session: sessionPublicState(session),
            snapshot: session.snapshot,
          },
          requestOrigin,
        );
        return;
      }
      if (sessionMatch[2] === "metrics") {
        jsonResponse(
          response,
          session.metrics ? 200 : 404,
          {
            sessionId,
            updatedAt: session.stateUpdatedAt,
            metrics: session.metrics,
          },
          requestOrigin,
        );
        return;
      }
      if (!token.admin) {
        jsonResponse(
          response,
          403,
          { error: "admin token required for audit access" },
          requestOrigin,
        );
        return;
      }
      const limit = Math.min(
        500,
        Math.max(1, Number(url.searchParams.get("limit")) || 100),
      );
      jsonResponse(
        response,
        200,
        {
          sessionId,
          events: audit
            .filter((entry) => entry.sessionId === sessionId)
            .slice(-limit),
        },
        requestOrigin,
      );
      return;
    }
    jsonResponse(response, 404, { error: "not found" }, requestOrigin);
  });

  const webSocketServer = new WebSocketServer({ noServer: true, maxPayload });
  httpServer.on("upgrade", (request, socket, head) => {
    const url = new URL(request.url ?? "/", "http://gateway.invalid");
    const origin =
      typeof request.headers.origin === "string"
        ? request.headers.origin
        : null;
    if (
      url.pathname !== "/v1/ws" ||
      !originAllowed(origin, allowedOrigins, request.headers.host)
    ) {
      socket.write("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
      socket.destroy();
      return;
    }
    webSocketServer.handleUpgrade(request, socket, head, (webSocket) => {
      webSocketServer.emit("connection", webSocket, request);
    });
  });

  webSocketServer.on("connection", (socket) => {
    const connection = {
      id: `connection-${randomUUID()}`,
      socket,
      maxBufferedBytes,
      authenticated: false,
      disconnected: false,
      isAlive: true,
      clientId: null,
      role: null,
      token: null,
      session: null,
      station: null,
      connectedAt: null,
      resumeToken: null,
      resumeTokenHash: null,
      commandTimes: [],
      requestIds: new Set(),
      subscriptions: new Set(SUBSCRIPTION_TOPICS),
      handshakeTimer: null,
    };
    connection.handshakeTimer = setTimeout(() => {
      if (!connection.authenticated) {
        sendGatewayError(
          connection,
          "authentication-timeout",
          "hello was not received before timeout",
        );
        socket.close(1008, "authentication timeout");
      }
    }, handshakeTimeoutMs);
    connection.handshakeTimer.unref?.();
    socket.on("pong", () => {
      connection.isAlive = true;
    });
    socket.on("message", (data, binary) => {
      if (binary) {
        sendGatewayError(
          connection,
          "text-required",
          "binary messages are not accepted",
        );
        return;
      }
      let message;
      try {
        message = JSON.parse(data.toString("utf8"));
      } catch {
        sendGatewayError(
          connection,
          "json-invalid",
          "message must be valid JSON",
        );
        return;
      }
      if (!isRecord(message)) {
        sendGatewayError(
          connection,
          "message-invalid",
          "message must be an object",
        );
        return;
      }
      if (!connection.authenticated)
        authenticateConnection(connection, message);
      else handleAuthenticatedMessage(connection, message);
    });
    socket.on("close", (_code, reason) =>
      disconnectConnection(
        connection,
        boundedText(reason?.toString(), 128) || "socket closed",
      ),
    );
    socket.on("error", () => disconnectConnection(connection, "socket error"));
  });

  const heartbeat = setInterval(() => {
    const now = Date.now();
    for (const socket of webSocketServer.clients) {
      const connection = [...sessions.values()]
        .flatMap((session) => [...session.connections])
        .find((candidate) => candidate.socket === socket);
      if (!connection) continue;
      if (!connection.isAlive) {
        socket.terminate();
        continue;
      }
      connection.isAlive = false;
      socket.ping();
    }
    for (const [sessionId, session] of sessions) {
      for (const [resumeKey, resume] of session.reconnects) {
        if (resume.expiresAt <= now) session.reconnects.delete(resumeKey);
      }
      if (
        !session.connections.size &&
        now - session.lastActivityAt > sessionIdleTtlMs
      )
        sessions.delete(sessionId);
    }
  }, heartbeatIntervalMs);
  heartbeat.unref?.();

  return {
    protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
    async listen({ port = 0, host = "127.0.0.1" } = {}) {
      if (closing) throw new Error("Remote gateway is closing.");
      await new Promise((resolve, reject) => {
        const onError = (error) => reject(error);
        httpServer.once("error", onError);
        httpServer.listen(port, host, () => {
          httpServer.off("error", onError);
          resolve();
        });
      });
      const address = httpServer.address();
      if (!address || typeof address === "string")
        throw new Error("Remote gateway address is unavailable.");
      return {
        host: address.address,
        port: address.port,
        httpUrl: `http://${address.address}:${address.port}`,
        webSocketUrl: `ws://${address.address}:${address.port}/v1/ws`,
      };
    },
    async close() {
      if (closing) return;
      closing = true;
      clearInterval(heartbeat);
      for (const session of sessions.values()) {
        for (const pending of session.pendingCommands.values())
          clearTimeout(pending.timer);
        for (const connection of session.connections)
          connection.socket.close(1001, "gateway shutting down");
      }
      await new Promise((resolve) => webSocketServer.close(() => resolve()));
      if (httpServer.listening)
        await new Promise((resolve) => httpServer.close(() => resolve()));
      await auditWrite;
    },
    snapshot() {
      return {
        schemaVersion: REMOTE_GATEWAY_SCHEMA_VERSION,
        protocolVersion: REMOTE_GATEWAY_PROTOCOL_VERSION,
        sessions: [...sessions.values()].map(sessionPublicState),
        auditEvents: audit.length,
      };
    },
    audit(limit = 100) {
      return audit
        .slice(-Math.max(1, Math.min(500, limit)))
        .map((entry) => ({ ...entry }));
    },
  };
}

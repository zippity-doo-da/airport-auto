import { open, readFile } from "node:fs/promises";
import process from "node:process";

import { createRemoteGateway } from "./remoteGateway.mjs";
import {
  createConfiguredJsonProvider,
  createLiveDataService,
} from "./liveDataService.mjs";

function positiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function list(value) {
  return typeof value === "string"
    ? value
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean)
    : [];
}

async function loadTokenManifest() {
  const inlineManifest = process.env.AIRPORT_REMOTE_TOKENS;
  const manifestFile = process.env.AIRPORT_REMOTE_TOKEN_FILE;
  if (inlineManifest && manifestFile)
    throw new Error(
      "Set either AIRPORT_REMOTE_TOKENS or AIRPORT_REMOTE_TOKEN_FILE, not both.",
    );
  if (inlineManifest) return JSON.parse(inlineManifest);
  if (manifestFile) return JSON.parse(await readFile(manifestFile, "utf8"));
  throw new Error(
    "No credentials configured. Set AIRPORT_REMOTE_TOKEN_FILE or AIRPORT_REMOTE_TOKENS.",
  );
}

const host = process.env.AIRPORT_REMOTE_HOST || "127.0.0.1";
const port = positiveInteger(process.env.AIRPORT_REMOTE_PORT, 8787);
const allowedOrigins = list(process.env.AIRPORT_REMOTE_ORIGINS);
const tokens = await loadTokenManifest();
const auditFile = process.env.AIRPORT_REMOTE_AUDIT_FILE || null;
if (auditFile) {
  const auditHandle = await open(auditFile, "a");
  await auditHandle.close();
}
const liveDataEnabled = process.env.AIRPORT_LIVE_DATA_ENABLED === "1";
function configuredProvider(prefix) {
  const endpointTemplate = process.env[`${prefix}_URL_TEMPLATE`];
  if (!endpointTemplate) return null;
  return createConfiguredJsonProvider({
    endpointTemplate,
    token: process.env[`${prefix}_TOKEN`] || "",
    providerName: process.env[`${prefix}_PROVIDER`] || "Configured provider",
    license:
      process.env[`${prefix}_LICENSE`] ||
      "Operator-configured provider terms apply",
  });
}
const liveDataService = liveDataEnabled
  ? createLiveDataService({
      metarEnabled: process.env.AIRPORT_METAR_ENABLED !== "0",
      notamProvider: configuredProvider("AIRPORT_NOTAM"),
      trafficProvider: configuredProvider("AIRPORT_TRAFFIC"),
      userAgent:
        process.env.AIRPORT_LIVE_USER_AGENT ||
        "Airport-Auto/2.40 live-data gateway",
    })
  : null;
const gateway = createRemoteGateway({
  tokens,
  allowedOrigins,
  auditFile,
  commandTimeoutMs: positiveInteger(
    process.env.AIRPORT_REMOTE_COMMAND_TIMEOUT_MS,
    5_000,
  ),
  reconnectGraceMs: positiveInteger(
    process.env.AIRPORT_REMOTE_RECONNECT_GRACE_MS,
    20_000,
  ),
  commandRateLimit: {
    count: positiveInteger(process.env.AIRPORT_REMOTE_RATE_LIMIT_COUNT, 30),
    windowMs: positiveInteger(
      process.env.AIRPORT_REMOTE_RATE_LIMIT_WINDOW_MS,
      10_000,
    ),
  },
  maxConnectionsPerSession: positiveInteger(
    process.env.AIRPORT_REMOTE_MAX_CONNECTIONS_PER_SESSION,
    64,
  ),
  liveDataService,
});

const address = await gateway.listen({ host, port });
process.stdout.write(
  [
    `Airport Auto remote gateway ${gateway.protocolVersion}`,
    `Controller console: ${address.httpUrl}/console`,
    `WebSocket endpoint: ${address.webSocketUrl}`,
    allowedOrigins.length
      ? `Browser origins: ${allowedOrigins.join(", ")}`
      : "Browser origins: same-origin controller console only",
    liveDataEnabled
      ? `Live data: ${JSON.stringify(liveDataService.diagnostics().providers)}`
      : "Live data: disabled (set AIRPORT_LIVE_DATA_ENABLED=1 to opt in)",
    "Static Airport Auto clients remain disconnected until a host explicitly connects.",
  ].join("\n") + "\n",
);

let stopping = false;
async function stop(signal) {
  if (stopping) return;
  stopping = true;
  process.stdout.write(`Stopping after ${signal}.\n`);
  await gateway.close();
  process.exitCode = 0;
}

process.once("SIGINT", () => void stop("SIGINT"));
process.once("SIGTERM", () => void stop("SIGTERM"));

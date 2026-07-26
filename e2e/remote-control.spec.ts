import { randomBytes } from 'node:crypto';

import { expect, test } from '@playwright/test';
import { WebSocket } from 'ws';

import { createRemoteGateway } from '../server/remoteGateway.mjs';

class GatewayPeer {
  private readonly messages: Array<Record<string, unknown>> = [];
  private readonly waiters: Array<{
    predicate: (message: Record<string, unknown>) => boolean;
    resolve: (message: Record<string, unknown>) => void;
    timer: ReturnType<typeof setTimeout>;
  }> = [];

  constructor(readonly socket: WebSocket) {
    socket.on('message', (data) => {
      const message = JSON.parse(data.toString('utf8')) as Record<string, unknown>;
      const waiterIndex = this.waiters.findIndex((waiter) => waiter.predicate(message));
      if (waiterIndex < 0) {
        this.messages.push(message);
        return;
      }
      const [waiter] = this.waiters.splice(waiterIndex, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    });
  }

  send(message: unknown): void {
    this.socket.send(JSON.stringify(message));
  }

  waitFor(
    predicate: (message: Record<string, unknown>) => boolean,
    timeoutMs = 5_000,
  ): Promise<Record<string, unknown>> {
    const messageIndex = this.messages.findIndex(predicate);
    if (messageIndex >= 0) return Promise.resolve(this.messages.splice(messageIndex, 1)[0]);
    return new Promise((resolve, reject) => {
      const waiter = {
        predicate,
        resolve,
        timer: setTimeout(() => {
          const index = this.waiters.indexOf(waiter);
          if (index >= 0) this.waiters.splice(index, 1);
          reject(new Error('Timed out waiting for gateway message.'));
        }, timeoutMs),
      };
      this.waiters.push(waiter);
    });
  }

  async close(): Promise<void> {
    if (this.socket.readyState === WebSocket.CLOSED) return;
    await new Promise<void>((resolve) => {
      this.socket.once('close', () => resolve());
      this.socket.close(1000, 'browser validation complete');
    });
  }
}

async function openController(endpoint: string): Promise<GatewayPeer> {
  const socket = new WebSocket(endpoint, { origin: 'http://127.0.0.1:4178' });
  const peer = new GatewayPeer(socket);
  await new Promise<void>((resolve, reject) => {
    socket.once('open', () => resolve());
    socket.once('error', reject);
  });
  return peer;
}

test('opt-in browser host and external controller share the formal safety arbiter', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-chromium', 'The remote transport is viewport-independent.');
  test.setTimeout(120_000);
  const hostToken = randomBytes(32).toString('base64url');
  const controllerToken = randomBytes(32).toString('base64url');
  const sessionId = 'playwright-remote';
  const gateway = createRemoteGateway({
    allowedOrigins: ['http://127.0.0.1:4178'],
    tokens: [
      {
        id: 'browser-host',
        token: hostToken,
        roles: ['host'],
        sessions: [sessionId],
      },
      {
        id: 'supervisor-controller',
        token: controllerToken,
        roles: ['controller'],
        stations: ['supervisor'],
        sessions: [sessionId],
      },
    ],
  });
  const address = await gateway.listen({ port: 0, host: '127.0.0.1' });
  let controller: GatewayPeer | null = null;
  try {
    await page.goto('/?airport=ORD&mode=manual&station=supervisor&autostart=1&detail=low&renderFps=0.25');
    await page.waitForFunction(() => window.airportControl?.version === '2.32.0');
    const connected = await page.evaluate(
      ({ endpoint, session, token }) =>
        window.airportControl.remote.connect({ endpoint, sessionId: session, token }),
      { endpoint: address.webSocketUrl, session: sessionId, token: hostToken },
    );
    expect(connected).toMatchObject({
      configured: true,
      status: 'connected',
      connected: true,
      sessionId,
      gatewayProtocolVersion: '1.0.0',
    });
    expect(JSON.stringify(connected)).not.toContain(hostToken);
    await expect(page.locator('#remote-host-state')).toHaveText('Gateway connected');
    await expect(page.locator('#remote-host-disconnect')).toBeEnabled();

    controller = await openController(address.webSocketUrl);
    controller.send({
      type: 'hello',
      protocolVersion: '1.0.0',
      sessionId,
      clientId: 'playwright-supervisor',
      role: 'controller',
      token: controllerToken,
      station: 'supervisor',
    });
    const welcome = await controller.waitFor((message) => message.type === 'welcome');
    expect(welcome).toMatchObject({ role: 'controller', clientId: 'playwright-supervisor' });
    const claim = await controller.waitFor((message) => message.type === 'claim-result');
    expect(claim).toMatchObject({ accepted: true, station: 'supervisor' });
    const state = await controller.waitFor((message) => message.type === 'state');
    const compactSnapshot = state.snapshot as Record<string, unknown>;
    expect(compactSnapshot).toMatchObject({
      schemaVersion: 1,
      sourceSnapshotSchemaVersion: 34,
      airport: { code: 'ORD', navigationUse: false },
      mode: 'manual',
    });
    expect(compactSnapshot).toHaveProperty('flights');
    expect(compactSnapshot).not.toHaveProperty('surfaceGraph');
    expect(compactSnapshot).not.toHaveProperty('renderer');
    expect(compactSnapshot).not.toHaveProperty('input');

    controller.send({
      type: 'command',
      envelope: {
        protocolVersion: '1.2.0',
        requestId: 'playwright-remote-pause',
        source: 'page',
        authority: { station: 'approach', actorId: 'forged' },
        command: { action: 'pause' },
      },
    });
    const result = await controller.waitFor(
      (message) => message.type === 'command-result' && message.requestId === 'playwright-remote-pause',
    );
    expect(result).toMatchObject({ accepted: true, requestId: 'playwright-remote-pause' });
    const formalResult = result.result as Record<string, unknown>;
    expect(formalResult).toMatchObject({
      source: 'agent',
      clientId: 'playwright-supervisor',
      authority: {
        assertedStation: 'supervisor',
        actorId: 'playwright-supervisor',
        safetyArbiter: true,
        enforced: true,
      },
    });
    await expect.poll(() => page.evaluate(() => window.airportControl.snapshot().paused)).toBe(true);

    const snapshotResponse = await fetch(
      `${address.httpUrl}/v1/sessions/${sessionId}/snapshot`,
      { headers: { Authorization: `Bearer ${controllerToken}` } },
    );
    expect(snapshotResponse.status).toBe(200);
    const snapshotText = await snapshotResponse.text();
    expect(snapshotText).not.toContain(hostToken);
    expect(snapshotText).not.toContain(controllerToken);

    const disconnected = await page.evaluate(() => window.airportControl.remote.disconnect());
    expect(disconnected).toMatchObject({ configured: false, connected: false, status: 'disconnected' });
    expect(JSON.stringify(disconnected)).not.toContain('token');
    await expect(page.locator('#remote-host-state')).toHaveText('Disconnected');

    const rejectedHost = await page.evaluate(
      async ({ endpoint, session }) => {
        let reason = '';
        try {
          await window.airportControl.remote.connect({
            endpoint,
            sessionId: session,
            token: 'invalid-but-long-enough-browser-host-credential',
          });
        } catch (error) {
          reason = error instanceof Error ? error.message : String(error);
        }
        return { reason, state: window.airportControl.remote.state() };
      },
      { endpoint: address.webSocketUrl, session: sessionId },
    );
    expect(rejectedHost.reason).toContain('invalid');
    expect(rejectedHost.state).toMatchObject({
      configured: false,
      connected: false,
      status: 'error',
    });
    expect(JSON.stringify(rejectedHost.state)).not.toContain('credential');
  } finally {
    await controller?.close();
    await page.evaluate(() => window.airportControl?.remote.disconnect()).catch(() => undefined);
    await gateway.close();
  }
});

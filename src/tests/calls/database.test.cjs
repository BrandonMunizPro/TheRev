require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { Client } = require('pg');
const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const { LoggerFactory } = require('typeorm/logger/LoggerFactory');
const { AppDataSource } = require('../../data-source');
const { User } = require('../../entities/User');
const { Call, CallStatus } = require('../../entities/Call');
const { CallConnection } = require('../../entities/CallConnection');
const { CallSignal } = require('../../entities/CallSignal');
const { CallsModel } = require('../../models/calls.model');
const { CallResolver } = require('../../resolvers/Call');
const { CallSignalingService } = require('../../services/CallSignalingService');
const {
  SecureCalls1791800000000,
} = require('../../migrations/1791800000000-SecureCalls');
const { getUserFromRequest } = require('../../auth/getUserFromRequest');

function socketPeer(url) {
  const ws = new WebSocket(url);
  const messages = [],
    seen = [],
    waits = [];
  let isClosed = false;
  ws.on('error', () => {});
  ws.on('message', (data) => {
    const value = JSON.parse(data.toString());
    seen.push(value);
    messages.push(value);
    for (const waiter of [...waits]) {
      const index = messages.findIndex(waiter.match);
      if (index >= 0) {
        waits.splice(waits.indexOf(waiter), 1);
        clearTimeout(waiter.timer);
        waiter.resolve(messages.splice(index, 1)[0]);
      }
    }
  });
  const closed = new Promise((resolve) =>
    ws.once('close', () => {
      isClosed = true;
      resolve();
    })
  );
  return {
    ws,
    seen,
    closed,
    opened: new Promise((resolve) => ws.once('open', resolve)),
    send: (value) => ws.send(JSON.stringify(value)),
    wait(match) {
      const index = messages.findIndex(match);
      if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          match,
          resolve,
          timer: setTimeout(() => {
            waits.splice(waits.indexOf(waiter), 1);
            reject(new Error('WebSocket event timed out'));
          }, 5000),
        };
        waits.push(waiter);
      });
    },
    async close() {
      if (!isClosed) ws.close();
      await closed;
    },
  };
}
const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

test(
  'secure calls on real PostgreSQL and two signaling instances',
  { skip: process.env.RUN_CALL_DB_TESTS !== '1', timeout: 90000 },
  async (t) => {
    process.env.JWT_SECRET_KEY = 'isolated-call-test-secret';
    const schema = `calls_test_${Date.now()}_${process.pid}`;
    assert.match(schema, /^calls_test_\d+_\d+$/);
    const options = AppDataSource.options;
    const admin = new Client({
      host: options.host,
      port: options.port,
      user: options.username,
      password: options.password,
      database: options.database,
      ssl: options.ssl,
      connectionTimeoutMillis: 5000,
    });
    await admin.connect();
    const [snapshot] = (
      await admin.query(
        'SELECT (SELECT COUNT(*)::int FROM public.message) AS messages, (SELECT COUNT(*)::int FROM public."call") AS calls'
      )
    ).rows;
    await admin.query(`CREATE SCHEMA "${schema}"`);
    const model = new CallsModel(),
      one = new CallSignalingService(model),
      two = new CallSignalingService(model);
    const peers = [];
    let http;
    try {
      AppDataSource.setOptions({
        schema,
        entities: [User, Call, CallConnection, CallSignal],
        migrations: [],
        synchronize: true,
        installExtensions: false,
        logging: false,
        extra: { options: `-c search_path=${schema},public` },
      });
      AppDataSource.logger = new LoggerFactory().create(false);
      await AppDataSource.initialize();
      const runner = AppDataSource.createQueryRunner();
      await runner.connect();
      await new SecureCalls1791800000000().up(runner);
      await runner.release();
      const users = {};
      for (const name of [
        'alice',
        'bob',
        'eve',
        'offline',
        'browserCaller',
        'browserCallee',
        'expired',
      ])
        users[name] = await AppDataSource.getRepository(User).save({
          userName: name,
          firstName: name,
          lastName: 'Test',
          email: `${name}@example.invalid`,
          password: 'test-only',
        });
      const context = (name) => ({
        user: { userId: users[name].id, role: users[name].role },
      });
      const token = (name, expiresIn = '5m') =>
        jwt.sign(context(name).user, process.env.JWT_SECRET_KEY, { expiresIn });
      const port1 = await one.start(0),
        port2 = await two.start(0);
      const connect = async (name, port, resumeConnectionId) => {
        const peer = socketPeer(`ws://127.0.0.1:${port}`);
        peers.push(peer);
        await peer.opened;
        peer.send({
          type: 'auth',
          token: token(name),
          ...(resumeConnectionId ? { resumeConnectionId } : {}),
        });
        const ready = await peer.wait((message) => message.type === 'ready');
        peer.id = ready.connectionId;
        assert.equal(ready.userId, users[name].id);
        return peer;
      };
      let alice = await connect('alice', port1),
        bob = await connect('bob', port2),
        eve = await connect('eve', port1);
      let bobOther = await connect('bob', port1);
      const resolver = new CallResolver();
      const initiate = (video = false) =>
        resolver.initiateCall(
          { calleeId: users.bob.id, isVideo: video, connectionId: alice.id },
          context('alice')
        );

      await t.test(
        'WebSocket authentication rejects missing, invalid, expired, and impersonated identities',
        async () => {
          for (const frame of [
            { type: 'call:incoming', fromUserId: users.bob.id },
            { type: 'auth', token: 'invalid' },
            { type: 'auth', token: token('alice', -1) },
            { type: 'auth', token: token('alice'), fromUserId: users.bob.id },
            { type: 'auth', token: token('alice'), resumeConnectionId: bob.id },
          ]) {
            const peer = socketPeer(`ws://127.0.0.1:${port1}`);
            peers.push(peer);
            await peer.opened;
            peer.send(frame);
            assert.equal(
              (await peer.wait((m) => m.type === 'error')).type,
              'error'
            );
            await peer.closed;
            assert.equal(
              peer.seen.some((m) => m.type === 'ready'),
              false
            );
          }
        }
      );

      await t.test(
        'GraphQL rejects anonymous access and caller identity cannot be supplied in input',
        async () => {
          const { buildSchema } = require('type-graphql');
          const { graphql } = require('graphql');
          const api = await buildSchema({
            resolvers: [CallResolver],
            validate: false,
          });
          const denied = await graphql({
            schema: api,
            source: '{ getActiveCall { id } }',
            contextValue: {},
          });
          assert.match(denied.errors[0].message, /Authentication required/);
          const spoofed = await graphql({
            schema: api,
            source:
              'mutation($callee: ID!, $caller: ID!) { initiateCall(data: {calleeId: $callee, callerId: $caller}) { id } }',
            variableValues: { callee: users.bob.id, caller: users.alice.id },
            contextValue: context('eve'),
          });
          assert.match(spoofed.errors[0].message, /callerId/);
          const express = require('express');
          const app = express();
          app.use(require('cors')());
          app.use(express.json());
          app.post('/graphql', async (req, res) =>
            res.json(
              await graphql({
                schema: api,
                source: req.body.query,
                variableValues: req.body.variables,
                contextValue: { user: getUserFromRequest(req) },
              })
            )
          );
          http = await new Promise((resolve) => {
            const server = app.listen(0, '127.0.0.1', () => resolve(server));
          });
        }
      );

      await t.test(
        'ringing and cancellation reach both participants across instances without outsider delivery',
        async () => {
          const call = await initiate();
          assert.equal(call.status, 'RINGING');
          assert.equal(
            (
              await bob.wait(
                (m) => m.type === 'call:incoming' && m.call.id === call.id
              )
            ).call.callerId,
            users.alice.id
          );
          await bobOther.wait(
            (m) => m.type === 'call:incoming' && m.call.id === call.id
          );
          assert.equal(
            (await resolver.getPendingCallInvitation(context('bob'))).callId,
            call.id
          );
          for (const action of [
            () => resolver.acceptCall(call.id, context('alice'), alice.id),
            () => resolver.declineCall(call.id, context('alice')),
            () => resolver.cancelCall(call.id, context('bob')),
            () => resolver.endCall(call.id, context('alice')),
            () => resolver.acceptCall(call.id, context('eve'), eve.id),
            () => resolver.callById(call.id, context('eve')),
          ])
            await assert.rejects(action);
          await resolver.cancelCall(call.id, context('alice'));
          await bob.wait(
            (m) =>
              m.type === 'call:state' &&
              m.call.id === call.id &&
              m.call.status === 'CANCELLED'
          );
          await resolver.cancelCall(call.id, context('alice')); // Idempotent retry.
          await assert.rejects(
            () => resolver.acceptCall(call.id, context('bob'), bob.id),
            /lifecycle/
          );
          assert.equal(
            eve.seen.some((m) => m.call?.id === call.id),
            false
          );
        }
      );

      await t.test(
        'decline is terminal, self-calls and offline destinations fail',
        async () => {
          const call = await initiate();
          await resolver.declineCall(call.id, context('bob'));
          assert.equal(
            (await model.getCall(call.id, users.alice.id)).status,
            'DECLINED'
          );
          await assert.rejects(
            () => resolver.acceptCall(call.id, context('bob'), bob.id),
            /lifecycle/
          );
          await assert.rejects(
            () => model.initiateCall(users.alice.id, users.alice.id),
            /yourself/
          );
          await assert.rejects(
            () =>
              model.initiateCall(
                users.alice.id,
                users.offline.id,
                false,
                alice.id
              ),
            /signaling connection/
          );
          await assert.rejects(
            () =>
              model.initiateCall(users.alice.id, users.bob.id, false, eve.id),
            /signaling connection/
          );
        }
      );

      await t.test(
        'database locks prevent simultaneous reversed calls and cross-role busy conflicts',
        async () => {
          const results = await Promise.allSettled([
            model.initiateCall(users.alice.id, users.bob.id, false, alice.id),
            model.initiateCall(users.bob.id, users.alice.id, false, bob.id),
          ]);
          assert.equal(
            results.filter((r) => r.status === 'fulfilled').length,
            1
          );
          assert.match(
            results.find((r) => r.status === 'rejected').reason.message,
            /busy/
          );
          const call = results.find((r) => r.status === 'fulfilled').value;
          await assert.rejects(
            () => model.initiateCall(users.eve.id, users.bob.id, false, eve.id),
            /busy/
          );
          await assert.rejects(
            () =>
              model.initiateCall(users.alice.id, users.eve.id, false, alice.id),
            /busy/
          );
          await model.cancelCall(call.id, call.callerId);
        }
      );

      await t.test(
        'acceptance, controls, and hang-up enforce role and state',
        async () => {
          const call = await initiate(true);
          await assert.rejects(
            () => resolver.updateCallControls(call.id, context('alice'), true),
            /accepted/
          );
          await resolver.acceptCall(call.id, context('bob'), bob.id);
          await bob.wait(
            (m) =>
              m.type === 'call:state' &&
              m.call.id === call.id &&
              m.call.status === 'ACTIVE'
          );
          const changed = await resolver.updateCallControls(
            call.id,
            context('alice'),
            true,
            false
          );
          assert.equal(changed.callerMuted, true);
          assert.equal(changed.calleeMuted, false);
          assert.equal(changed.callerVideoEnabled, false);
          assert.equal(changed.calleeVideoEnabled, true);
          await assert.rejects(
            () => resolver.updateCallControls(call.id, context('eve'), false),
            /participant/
          );
          await assert.rejects(
            () => resolver.cancelCall(call.id, context('alice')),
            /lifecycle/
          );
          await resolver.endCall(call.id, context('bob'));
          const ended = await resolver.callById(call.id, context('alice'));
          assert.equal(ended.status, 'ENDED');
          assert.ok(ended.startedAt);
          assert.ok(ended.endedAt);
        }
      );

      await t.test(
        'offers, answers, and ICE are delivered only to the selected authenticated peer session',
        async () => {
          const call = await initiate();
          await assert.rejects(
            () =>
              model.sendSignal(
                call.id,
                users.alice.id,
                'call:offer',
                { sdp: 'before acceptance' },
                alice.id
              ),
            /accepted/
          );
          await model.acceptCall(call.id, users.bob.id, bob.id);
          const { buildSchema } = require('type-graphql');
          const { graphql } = require('graphql');
          const signalingApi = await buildSchema({ resolvers: [CallResolver], validate: false });
          const beforeSignals = await AppDataSource.getRepository(CallSignal).count({ where: { callId: call.id } });
          for (const source of [
            'mutation($id: ID!) { updateCallSdp(data: {callId: $id, sdp: "device-bypass", isOffer: true}) { id } }',
            'mutation($id: ID!) { updateIceCandidates(data: {callId: $id, candidates: "{\\\"candidate\\\":\\\"device-bypass\\\"}"}) }',
          ]) {
            const result = await graphql({ schema: signalingApi, source, variableValues: { id: call.id }, contextValue: context('alice') });
            assert.match(result.errors[0].message, /authenticated WebSocket connection/);
          }
          assert.equal((await model.getCall(call.id, users.alice.id)).offerSdp, null);
          assert.equal(await AppDataSource.getRepository(CallSignal).count({ where: { callId: call.id } }), beforeSignals);
          await assert.rejects(
            () =>
              model.sendSignal(
                call.id,
                users.bob.id,
                'call:answer',
                { sdp: 'no offer yet' },
                bob.id
              ),
            /pending offer/
          );
          eve.send({
            type: 'call:offer',
            callId: call.id,
            payload: { sdp: 'intrusion' },
          });
          assert.match(
            (await eve.wait((m) => m.type === 'error')).message,
            /participant/
          );
          alice.send({
            type: 'call:offer',
            callId: call.id,
            fromUserId: users.eve.id,
            payload: { sdp: 'spoof' },
          });
          assert.match(
            (await alice.wait((m) => m.type === 'error')).message,
            /identity/
          );
          alice.send({
            type: 'call:offer',
            callId: call.id,
            toUserId: users.eve.id,
            payload: { sdp: 'wrong destination' },
          });
          assert.match(
            (await alice.wait((m) => m.type === 'error')).message,
            /other call participant/
          );
          const largeSdp = 'sdp-for-transport-test-' + 'x'.repeat(20000);
          alice.send({
            type: 'call:offer',
            callId: call.id,
            payload: { sdp: largeSdp },
          });
          const offer = await bob.wait(
            (m) => m.type === 'call:offer' && m.callId === call.id
          );
          assert.equal(offer.payload.sdp, largeSdp);
          assert.equal(offer.fromUserId, users.alice.id);
          assert.equal(
            bobOther.seen.some((m) => m.signalId === offer.signalId),
            false
          );
          assert.equal(
            eve.seen.some((m) => m.signalId === offer.signalId),
            false
          );
          await assert.rejects(
            () => model.acknowledgeSignal(offer.signalId, users.eve.id, eve.id),
            /receiving session/
          );
          assert.ok(
            await AppDataSource.getRepository(CallSignal).findOneBy({
              id: offer.signalId,
            })
          );
          bob.send({ type: 'call:signal-ack', signalId: offer.signalId });
          bob.send({
            type: 'call:answer',
            callId: call.id,
            payload: { sdp: 'answer-for-transport-test' },
          });
          const answer = await alice.wait(
            (m) => m.type === 'call:answer' && m.callId === call.id
          );
          assert.equal(answer.payload.sdp, 'answer-for-transport-test');
          await assert.rejects(
            () =>
              model.sendSignal(
                call.id,
                users.bob.id,
                'call:ice-candidate',
                { candidate: 'candidate' },
                bobOther.id
              ),
            /selected/
          );
          bob.send({
            type: 'call:ice-candidate',
            callId: call.id,
            payload: {
              candidate: 'candidate-test',
              sdpMid: '0',
              sdpMLineIndex: 0,
            },
          });
          assert.equal(
            (
              await alice.wait(
                (m) => m.type === 'call:ice-candidate' && m.callId === call.id
              )
            ).payload.candidate,
            'candidate-test'
          );
          await model.endCall(call.id, users.alice.id);
          assert.equal(
            await AppDataSource.getRepository(CallSignal).count({
              where: { callId: call.id },
            }),
            0
          );
          await assert.rejects(
            () =>
              model.sendSignal(
                call.id,
                users.alice.id,
                'call:offer',
                { sdp: 'ended' },
                alice.id
              ),
            /accepted/
          );
        }
      );

      await t.test(
        'ringing timeouts cannot be accepted late and free busy state',
        async () => {
          const call = await initiate();
          await AppDataSource.getRepository(Call).update(call.id, {
            ringExpiresAt: new Date(Date.now() - 1),
          });
          await model.sweep();
          assert.equal(
            (await model.getCall(call.id, users.alice.id)).status,
            'TIMED_OUT'
          );
          await bob.wait(
            (m) => m.call?.id === call.id && m.call.status === 'TIMED_OUT'
          );
          await assert.rejects(
            () => model.acceptCall(call.id, users.bob.id, bob.id),
            /lifecycle/
          );
          const fresh = await initiate();
          await model.cancelCall(fresh.id, users.alice.id);
        }
      );

      await t.test(
        'periodic cleanup automatically times out unanswered ringing',
        async () => {
          const previous = process.env.CALL_RING_TIMEOUT_MS;
          process.env.CALL_RING_TIMEOUT_MS = '1000';
          try {
            const call = await initiate();
            await bob.wait(
              (m) => m.call?.id === call.id && m.call.status === 'TIMED_OUT'
            );
            assert.equal(
              (await model.getCall(call.id, users.alice.id)).status,
              'TIMED_OUT'
            );
          } finally {
            if (previous === undefined) delete process.env.CALL_RING_TIMEOUT_MS;
            else process.env.CALL_RING_TIMEOUT_MS = previous;
          }
        }
      );

      await t.test(
        'reconnect resumes an owned connection across instances; losing an unrelated device does not end the call',
        async () => {
          const call = await initiate();
          await model.acceptCall(call.id, users.bob.id, bob.id);
          const oldId = alice.id;
          await alice.close();
          for (let i = 0; i < 100; i++) {
            if (
              (
                await AppDataSource.getRepository(CallConnection).findOneBy({
                  id: oldId,
                })
              ).disconnectedAt
            )
              break;
            await delay(10);
          }
          alice = await connect('alice', port2, oldId);
          assert.equal(alice.id, oldId);
          assert.equal(
            (await model.getActiveCall(users.alice.id)).status,
            'ACTIVE'
          );
          await bobOther.close();
          await model.sweep();
          assert.equal(
            (await model.getCall(call.id, users.bob.id)).status,
            'ACTIVE'
          );
          await model.endCall(call.id, users.bob.id);
        }
      );

      await t.test(
        'expired owning connection leases disconnect calls and release both users',
        async () => {
          const call = await initiate();
          await model.acceptCall(call.id, users.bob.id, bob.id);
          await AppDataSource.getRepository(CallConnection).update(alice.id, {
            expiresAt: new Date(Date.now() - 1),
          });
          await model.sweep();
          assert.equal(
            (await model.getCall(call.id, users.bob.id)).status,
            'DISCONNECTED'
          );
          await bob.wait(
            (m) => m.call?.id === call.id && m.call.status === 'DISCONNECTED'
          );
          await alice.close();
          alice = await connect('alice', port1);
          const fresh = await initiate();
          await model.cancelCall(fresh.id, users.alice.id);
        }
      );

      await t.test(
        'closing the owning socket triggers disconnect cleanup without manual lifecycle operations',
        async () => {
          const previous = process.env.CALL_DISCONNECT_GRACE_MS;
          process.env.CALL_DISCONNECT_GRACE_MS = '0';
          try {
            const call = await initiate();
            await model.acceptCall(call.id, users.bob.id, bob.id);
            await alice.close();
            await bob.wait(
              (m) => m.call?.id === call.id && m.call.status === 'DISCONNECTED'
            );
            assert.equal(
              (await model.getCall(call.id, users.bob.id)).status,
              'DISCONNECTED'
            );
          } finally {
            if (previous === undefined)
              delete process.env.CALL_DISCONNECT_GRACE_MS;
            else process.env.CALL_DISCONNECT_GRACE_MS = previous;
          }
          alice = await connect('alice', port1);
        }
      );

      await t.test(
        'JWT expiry prevents further socket operations and closes the connection',
        async () => {
          const peer = socketPeer(`ws://127.0.0.1:${port1}`);
          peers.push(peer);
          await peer.opened;
          peer.send({ type: 'auth', token: token('expired', 1) });
          await peer.wait((m) => m.type === 'ready');
          await delay(1200);
          peer.send({ type: 'call:sync' });
          await peer.closed;
        }
      );

      await t.test(
        'real browser controls complete a lifecycle through GraphQL and authenticated sockets without media',
        async () => {
          const { chromium } = require('playwright');
          const browser = await chromium.launch({ headless: true });
          const ui = fs
            .readFileSync(
              path.resolve(
                __dirname,
                '../../electron/frontend/messaging/MessagingUI.js'
              ),
              'utf8'
            )
            .replace(/export /g, '');
          const controller = fs
            .readFileSync(
              path.resolve(
                __dirname,
                '../../electron/frontend/calls/CallController.js'
              ),
              'utf8'
            )
            .replace(/^import\s[\s\S]*?;\r?\n/m, '')
            .replace(/export /g, '');
          const apiUrl = `http://127.0.0.1:${http.address().port}/graphql`;
          const setup = async (name, port) => {
            const page = await browser.newPage();
            await page.setContent(
              '<div id="incoming-call-modal">Incoming</div><div id="active-call-modal">Active</div><span id="incoming-callername"></span><span id="incoming-call-type"></span><div id="incoming-call-avatar"></div><span id="active-call-title"></span><span id="call-status"></span><span id="call-partner-name"></span><span id="call-media-notice"></span><button id="mute-btn"><span id="call-mute-label"></span></button><button id="video-btn"><span id="call-video-label"></span></button><button id="call-end-btn"><span id="call-end-label"></span></button><button id="call-accept-btn"></button><button id="call-decline-btn"></button>'
            );
            await page.addScriptTag({ content: ui + '\n' + controller });
            await page.evaluate(
              async ({ user, token, apiUrl, port }) => {
                window.mediaCalls = 0;
                navigator.mediaDevices &&
                  (navigator.mediaDevices.getUserMedia = () => {
                    window.mediaCalls++;
                    throw new Error('Media is excluded');
                  });
                window.RTCPeerConnection = class {
                  constructor() {
                    window.mediaCalls++;
                    throw new Error('WebRTC media is excluded');
                  }
                };
                window.app = {
                  currentUser: user,
                  jwtToken: token,
                  notices: [],
                  showSpeechBubble(message) {
                    this.notices.push(message);
                  },
                };
                window.calls = new CallController(window.app, {
                  apiUrl,
                  signalingUrl: `ws://127.0.0.1:${port}`,
                });
                await window.calls.start();
                document.getElementById('call-accept-btn').onclick = () =>
                  calls.accept();
                document.getElementById('mute-btn').onclick = () =>
                  calls.toggleMute();
                document.getElementById('video-btn').onclick = () =>
                  calls.toggleVideo();
                document.getElementById('call-end-btn').onclick = () =>
                  calls.end();
              },
              { user: users[name], token: token(name), apiUrl, port }
            );
            return page;
          };
          try {
            const a = await setup('browserCaller', port1),
              b = await setup('browserCallee', port2);
            await a.evaluate(
              (id) => calls.initiate(id, true),
              users.browserCallee.id
            );
            await b.waitForFunction(() => calls.call?.status === 'RINGING');
            assert.equal(
              await b.locator('#incoming-call-modal').isVisible(),
              true
            );
            await b.locator('#call-accept-btn').click();
            await a.waitForFunction(() => calls.call?.status === 'ACTIVE');
            await a.locator('#mute-btn').click();
            await b.waitForFunction(() => calls.call?.callerMuted === true);
            await a.locator('#video-btn').click();
            await b.waitForFunction(
              () => calls.call?.callerVideoEnabled === false
            );
            assert.equal(
              await a.locator('#call-status').textContent(),
              'Accepted'
            );
            assert.equal(
              await a.locator('#call-media-notice').textContent(),
              'Audio and video are not connected yet.'
            );
            await a.locator('#call-end-btn').click();
            await b.waitForFunction(() => calls.call?.status === 'ENDED');
            assert.equal(await a.evaluate(() => window.mediaCalls), 0);
            assert.equal(await b.evaluate(() => window.mediaCalls), 0);
            await a.evaluate(() => calls.stop());
            await b.evaluate(() => calls.stop());
          } finally {
            await browser.close();
          }
        }
      );
    } finally {
      for (const peer of peers) peer.ws.terminate();
      await one.stop();
      await two.stop();
      if (http) await new Promise((resolve) => http.close(resolve));
      if (AppDataSource.isInitialized) await AppDataSource.destroy();
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`);
      const [after] = (
        await admin.query(
          'SELECT (SELECT COUNT(*)::int FROM public.message) AS messages, (SELECT COUNT(*)::int FROM public."call") AS calls'
        )
      ).rows;
      assert.deepEqual(
        after,
        snapshot,
        'Existing calls and messages must remain unchanged'
      );
      await admin.end();
    }
  }
);

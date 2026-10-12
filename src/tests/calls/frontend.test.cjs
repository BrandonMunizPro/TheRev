const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');

test(
  'existing call dialogs and Electron handlers use secure lifecycle controls',
  { timeout: 30000 },
  async (t) => {
    const browser = await chromium.launch({ headless: true });
    const page = await browser.newPage();
    try {
      const html = fs.readFileSync(
        path.join(root, 'src/electron/frontend/index.html'),
        'utf8'
      );
      await page.setContent('<main id="fixture"></main>');
      await page.evaluate((html) => {
        const doc = new DOMParser().parseFromString(html, 'text/html');
        const fixture = document.getElementById('fixture');
        for (const id of ['incoming-call-modal', 'active-call-modal'])
          fixture.append(doc.getElementById(id));
      }, html);
      const ui = fs
        .readFileSync(
          path.join(root, 'src/electron/frontend/messaging/MessagingUI.js'),
          'utf8'
        )
        .replace(/export /g, '');
      const controller = fs
        .readFileSync(
          path.join(root, 'src/electron/frontend/calls/CallController.js'),
          'utf8'
        )
        .replace(/^import\s[\s\S]*?;\r?\n/m, '')
        .replace(/export /g, '');
      const appSource = ts.createSourceFile(
        'app.js',
        fs.readFileSync(
          path.join(root, 'src/electron/frontend/app.js'),
          'utf8'
        ),
        ts.ScriptTarget.Latest,
        true,
        ts.ScriptKind.JS
      );
      const appClass = appSource.statements.find((node) =>
        ts.isClassDeclaration(node)
      );
      const names = [
        'initiateCall',
        'acceptCall',
        'declineCall',
        'endCall',
        'toggleMute',
        'toggleVideo',
      ];
      const methods = appClass.members
        .filter((node) => names.includes(node.name?.getText(appSource)))
        .map((node) => node.getText(appSource))
        .join(',\n');
      await page.addScriptTag({
        content:
          ui + '\n' + controller + '\nwindow.appMethods = {' + methods + '};',
      });

      await t.test(
        'remote endpoints require TLS and forbid URL credentials or tokens',
        async () => {
          const result = await page.evaluate(() => {
            const invalid = [
              'http://example.com/graphql',
              'https://user:password@example.com/graphql',
              'https://example.com/graphql?token=secret',
            ];
            return {
              rejected: invalid.map((url) => {
                try {
                  validateCallEndpoint(url);
                  return false;
                } catch {
                  return true;
                }
              }),
              secure: validateCallEndpoint('wss://example.com/calls', true),
              local: validateCallEndpoint('ws://127.0.0.1:4002', true),
            };
          });
          assert.deepEqual(result.rejected, [true, true, true]);
          assert.equal(result.secure, 'wss://example.com/calls');
          assert.equal(result.local, 'ws://127.0.0.1:4002/');
        }
      );

      await t.test(
        'socket authentication sends the JWT as the first frame, not in the URL',
        async () => {
          const result = await page.evaluate(async () => {
            const sockets = [];
            window.WebSocket = class extends EventTarget {
              constructor(url) {
                super();
                this.url = url;
                this.frames = [];
                sockets.push(this);
              }
              send(value) {
                this.frames.push(JSON.parse(value));
              }
              close() {
                this.dispatchEvent(new CloseEvent('close', { code: 1000 }));
              }
            };
            window.app = {
              ...appMethods,
              jwtToken: 'private-session-token',
              currentUser: { id: 'alice' },
              notices: [],
              showSpeechBubble(message) {
                this.notices.push(message);
              },
            };
            window.calls = new CallController(window.app);
            window.app._calls = window.calls;
            window.theRevApp = window.app;
            const starting = calls.start();
            sockets[0].dispatchEvent(new Event('open'));
            sockets[0].dispatchEvent(
              new MessageEvent('message', {
                data: JSON.stringify({
                  type: 'ready',
                  userId: 'alice',
                  connectionId: 'alice-connection',
                }),
              })
            );
            await starting;
            return { url: sockets[0].url, frame: sockets[0].frames[0] };
          });
          assert.equal(result.url.includes('private-session-token'), false);
          assert.deepEqual(result.frame, {
            type: 'auth',
            token: 'private-session-token',
          });
        }
      );

      await t.test(
        'caller names render safely and old revisions cannot resurrect ended calls',
        async () => {
          const result = await page.evaluate(() => {
            const base = {
              id: 'c',
              callerId: 'bob',
              calleeId: 'alice',
              callerName: '<img src=x onerror="window.xss=1">',
              calleeName: 'Alice',
              status: 'RINGING',
              isVideo: false,
              version: 1,
            };
            calls.apply(base);
            const incoming = document.getElementById('incoming-callername');
            const images = incoming.querySelectorAll('img').length,
              text = incoming.textContent;
            calls.apply({ ...base, status: 'ENDED', version: 3 });
            calls.apply({ ...base, version: 2 });
            return { images, text, status: calls.call.status };
          });
          assert.equal(result.images, 0);
          assert.ok(result.text.includes('<img'));
          assert.equal(result.status, 'ENDED');
        }
      );

      await t.test(
        'existing accept, mute, video, and hang-up buttons invoke backend operations without media',
        async () => {
          const result = await page.evaluate(async () => {
            const operations = [];
            let mediaRequests = 0;
            window.RTCPeerConnection = class {
              constructor() {
                mediaRequests++;
              }
            };
            const base = {
              id: 'buttons',
              callerId: 'bob',
              calleeId: 'alice',
              callerName: 'Bob',
              calleeName: 'Alice',
              status: 'RINGING',
              isVideo: true,
              version: 1,
              callerMuted: false,
              calleeMuted: false,
              callerVideoEnabled: true,
              calleeVideoEnabled: true,
              calleeConnectionId: 'alice-connection',
            };
            calls.apply(base);
            calls.request = async (query, variables) => {
              operations.push({ query, variables });
              if (query.includes('acceptCall('))
                return {
                  acceptCall: { ...base, status: 'ACTIVE', version: 2 },
                };
              if (query.includes('updateCallControls('))
                return {
                  updateCallControls: {
                    ...calls.call,
                    version: calls.call.version + 1,
                    calleeMuted: variables.muted ?? calls.call.calleeMuted,
                    calleeVideoEnabled:
                      variables.video ?? calls.call.calleeVideoEnabled,
                  },
                };
              if (query.includes('callById('))
                return {
                  callById: {
                    ...calls.call,
                    status: 'ENDED',
                    version: calls.call.version + 1,
                  },
                };
              return { endCall: true };
            };
            for (const id of [
              'call-accept-btn',
              'mute-btn',
              'video-btn',
              'call-end-btn',
            ]) {
              document.getElementById(id).click();
              while (calls.busy)
                await new Promise((resolve) => setTimeout(resolve, 0));
            }
            return {
              queries: operations.map((operation) => operation.query),
              status: calls.call.status,
              mediaRequests,
              muted: calls.call.calleeMuted,
              video: calls.call.calleeVideoEnabled,
            };
          });
          assert.ok(
            result.queries.some((query) => query.includes('acceptCall('))
          );
          assert.ok(
            result.queries.some((query) =>
              query.includes('updateCallControls(')
            )
          );
          assert.ok(result.queries.some((query) => query.includes('endCall(')));
          assert.equal(result.status, 'ENDED');
          assert.equal(result.mediaRequests, 0);
          assert.equal(result.muted, true);
          assert.equal(result.video, false);
        }
      );

      await t.test(
        'ringing hang-up cancels for callers and declines for recipients',
        async () => {
          const result = await page.evaluate(async () => {
            const operations = [];
            calls.request = async (query) => {
              operations.push(query);
              if (query.includes('callById('))
                return {
                  callById: { ...calls.call, status: 'CANCELLED', version: 2 },
                };
              return {};
            };
            calls.apply({
              id: 'outgoing',
              callerId: 'alice',
              calleeId: 'bob',
              status: 'RINGING',
              version: 1,
            });
            await app.endCall();
            calls.apply({
              id: 'incoming',
              callerId: 'bob',
              calleeId: 'alice',
              status: 'RINGING',
              version: 1,
            });
            await app.endCall();
            return operations;
          });
          assert.ok(result.some((query) => query.includes('cancelCall(')));
          assert.ok(result.some((query) => query.includes('declineCall(')));
        }
      );

      await t.test(
        'logout clears socket ownership, queued signals, and call dialogs',
        async () => {
          const result = await page.evaluate(() => {
            calls.signals.set('signal', {});
            calls.stop();
            return {
              active: calls.call,
              connection: calls.connectionId,
              resume: calls.resumeId,
              signals: calls.signals.size,
              incoming: document.getElementById('incoming-call-modal').style
                .display,
              activeModal:
                document.getElementById('active-call-modal').style.display,
            };
          });
          assert.deepEqual(result, {
            active: null,
            connection: null,
            resume: null,
            signals: 0,
            incoming: 'none',
            activeModal: 'none',
          });
        }
      );
    } finally {
      await browser.close();
    }
  }
);

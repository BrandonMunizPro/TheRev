const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { chromium } = require('playwright');
const root = path.resolve(__dirname, '../../..');
const ui = fs
  .readFileSync(
    path.join(root, 'src/electron/frontend/messaging/MessagingUI.js'),
    'utf8'
  )
  .replace(/export /g, '');
const controller = fs
  .readFileSync(
    path.join(root, 'src/electron/frontend/messaging/MessagingController.js'),
    'utf8'
  )
  .replace(/^import\s[\s\S]*?;\r?\n/m, '')
  .replace(/export /g, '');
const appSource = ts.createSourceFile(
  'app.js',
  fs.readFileSync(path.join(root, 'src/electron/frontend/app.js'), 'utf8'),
  ts.ScriptTarget.Latest,
  true,
  ts.ScriptKind.JS
);
const appClass = appSource.statements.find((node) =>
  ts.isClassDeclaration(node)
);
const selectedMethods = [
  'openDirectMessage',
  'selectServer',
  'selectChannel',
  'sendMessage',
  'renderConversationsList',
  'renderChannelsList',
  'renderServersList',
];
const methods = appClass.members
  .filter((node) => selectedMethods.includes(node.name?.getText(appSource)))
  .map((node) => node.getText(appSource))
  .join(',\n');

test('messaging browser behavior', { timeout: 30000 }, async (t) => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  try {
    await page.setContent(
      '<div id="channel-messages"></div><div id="servers-list"></div><div id="channels-list"></div><div id="conversations-list"></div><div id="messages-welcome"></div><div id="server-view"></div><div id="channels-sidebar"></div><div id="members-sidebar"></div><div id="server-name"></div><div id="channel-header"><span id="channel-name"></span></div><input id="message-input">'
    );
    await page.addScriptTag({
      content:
        ui + '\n' + controller + '\nwindow.testMethods = {' + methods + '};',
    });

    await t.test(
      'message HTML, names, reactions, and conversation previews cannot execute code',
      async () => {
        const result = await page.evaluate(() => {
          window.xss = 0;
          const payload =
            '<img src=x onerror="window.xss++"><script>window.xss++</script>';
          renderMessageList(
            document.getElementById('channel-messages'),
            [
              {
                id: 'm',
                content: payload + '\nhttps://example.com/path',
                senderId: 'alice',
                senderFirstName: payload,
                reactions: [{ emoji: payload, users: ['alice'] }],
                createdAt: new Date().toISOString(),
              },
            ],
            'bob'
          );
          const app = { ...testMethods };
          app.renderConversationsList([
            {
              odlFriendId: 'bob',
              odlFriendFirstName: payload,
              lastMessage: payload,
              unreadCount: 1,
            },
          ]);
          app.renderChannelsList([
            { id: 'channel', name: payload, type: 'TEXT', unreadCount: 2 },
          ]);
          app.renderServersList([
            {
              serverId: 'server',
              serverName: payload,
              iconUrl: 'javascript:window.xss++',
            },
          ]);
          const content = document.querySelector('.message-text');
          return {
            text: content.textContent,
            images: content.querySelectorAll('img').length,
            scripts: content.querySelectorAll('script').length,
            links: content.querySelectorAll('a').length,
            href: content.querySelector('a').href,
            previewImages: document.querySelectorAll(
              '.conversation-preview img'
            ).length,
            whiteSpace: content.style.whiteSpace,
            xss: window.xss,
          };
        });
        assert.equal(result.images, 0);
        assert.equal(result.scripts, 0);
        assert.equal(result.previewImages, 0);
        assert.equal(result.xss, 0);
        assert.equal(result.links, 1);
        assert.equal(result.href, 'https://example.com/path');
        assert.equal(result.whiteSpace, 'pre-wrap');
        assert.ok(result.text.includes('<script>'));
      }
    );

    await t.test(
      'switching server -> DM -> server never reuses a stale destination',
      async () => {
        const sent = await page.evaluate(async () => {
          const requests = [];
          window.fetch = async () => ({
            json: async () => ({
              data: { user: { userName: 'bob', firstName: 'Bob' } },
            }),
          });
          const app = (window.routingApp = {
            ...testMethods,
            currentUser: { id: 'alice' },
            jwtToken: 'token',
            currentServerId: 'old-server',
            currentChannelId: 'old-channel',
            currentDMUserId: null,
            loadConversations: async () => {},
            loadServerDetails: async () => {},
            showSpeechBubble: () => {},
            _messaging: {
              version: 0,
              select() {
                this.version++;
                return Promise.resolve();
              },
              refresh: async () => {},
              error: (error) => {
                throw error;
              },
              request: async (query, variables) => {
                requests.push(variables.data);
                return {};
              },
            },
          });
          await app.openDirectMessage('bob');
          document.getElementById('message-input').value = 'private';
          await app.sendMessage();
          await app.selectServer('new-server');
          await app.selectChannel('new-channel', 'general');
          document.getElementById('message-input').value = 'channel';
          await app.sendMessage();
          return requests;
        });
        assert.deepEqual(sent, [
          { content: 'private', recipientId: 'bob' },
          {
            content: 'channel',
            channelId: 'new-channel',
            serverId: 'new-server',
          },
        ]);
      }
    );

    await t.test(
      'DM lookup matches the real user schema and renders recipient call buttons',
      async () => {
        const result = await page.evaluate(async () => {
          const requests = [], calls = [];
          const app = {
            ...window.testMethods,
            jwtToken: 'dm-session',
            _messaging: {
              version: 0,
              select() { this.version++; return Promise.resolve(); },
            },
            initiateCall(id, video) { calls.push({ id, video }); },
          };
          window.fetch = async (url, options) => {
            requests.push({ ...JSON.parse(options.body), authorization: options.headers.Authorization });
            return { json: async () => ({ data: { user: { userName: 'bob', firstName: 'Bob' } } }) };
          };
          await app.openDirectMessage('recipient-id');
          const header = document.getElementById('channel-header');
          const buttons = [...header.querySelectorAll('button')];
          buttons.forEach(button => button.click());
          return { requests, header: header.textContent, labels: buttons.map(button => button.textContent), calls };
        });
        require('ts-node/register/transpile-only');
        const { buildSchema } = require('type-graphql');
        const { parse, validate } = require('graphql');
        const { UserResolver } = require('../../resolvers/User');
        const schema = await buildSchema({ resolvers: [UserResolver], validate: false });
        assert.deepEqual(validate(schema, parse(result.requests[0].query)), []);
        assert.deepEqual(result.requests[0].variables, { data: { id: 'recipient-id' } });
        assert.equal(result.requests[0].authorization, 'Bearer dm-session');
        assert.ok(result.header.includes('@bob'));
        assert.deepEqual(result.labels, ['Audio call', 'Video call']);
        assert.deepEqual(result.calls, [{ id: 'recipient-id', video: false }, { id: 'recipient-id', video: true }]);

        const fallback = await page.evaluate(async () => {
          window.fetch = async () => ({ json: async () => ({ errors: [{ message: 'Lookup failed' }] }) });
          const app = { ...window.testMethods, jwtToken: 'token', _messaging: { version: 0, select() { this.version++; return Promise.resolve(); } } };
          await app.openDirectMessage('missing');
          return document.getElementById('channel-header').textContent;
        });
        assert.equal(fallback, 'Direct Message');
      }
    );

    await t.test(
      'a late DM profile response cannot replace the new conversation header',
      async () => {
        const header = await page.evaluate(async () => {
          let resolve;
          window.fetch = () =>
            new Promise((done) => {
              resolve = done;
            });
          const app = window.routingApp;
          const opening = app.openDirectMessage('bob');
          await app.selectServer('server-after-dm');
          resolve({
            json: async () => ({
              data: { user: { userName: 'old-user', firstName: 'Old' } },
            }),
          });
          await opening;
          return document.getElementById('channel-header').textContent;
        });
        assert.equal(header.includes('old-user'), false);
      }
    );

    await t.test(
      'frontend ordering uses microseconds before UUID tie breaking',
      async () => {
        const result = await page.evaluate(() => {
          const cursor = (time, id) =>
            btoa(JSON.stringify({ v: 1, createdAt: time, id }))
              .replace(/=/g, '')
              .replace(/\+/g, '-')
              .replace(/\//g, '_');
          const first = {
            id: 'z',
            createdAt: '2026-01-01T00:00:00.100Z',
            cursor: cursor('2026-01-01T00:00:00.100001', 'z'),
          };
          const second = {
            id: 'a',
            createdAt: first.createdAt,
            cursor: cursor('2026-01-01T00:00:00.100002', 'a'),
          };
          return compareMessages(first, second);
        });
        assert.ok(result < 0);
      }
    );

    await t.test(
      'conversation history ignores late responses after selection changes',
      async () => {
        const result = await page.evaluate(async () => {
          const app = {
            currentUser: { id: 'alice' },
            jwtToken: 'token',
            currentSection: 'messages',
            showSpeechBubble() {},
            loadConversations: async () => {},
          };
          const controller = new MessagingController(app);
          controller.start = () => {};
          controller.markRead = async () => {};
          const requests = {};
          controller.page = (active) =>
            new Promise((resolve) => {
              requests[active.id] = resolve;
            });
          const old = controller.select({ type: 'dm', id: 'old' });
          const current = controller.select({ type: 'dm', id: 'current' });
          requests.current([
            {
              id: 'current-message',
              content: 'current',
              createdAt: new Date().toISOString(),
              senderId: 'alice',
            },
          ]);
          await current;
          requests.old([
            {
              id: 'old-message',
              content: 'private old',
              createdAt: new Date().toISOString(),
              senderId: 'alice',
            },
          ]);
          await old;
          return [...controller.messages.keys()];
        });
        assert.deepEqual(result, ['current-message']);
      }
    );

    await t.test(
      'opening a focused conversation sends its visible read boundary and refreshes unread counts',
      async () => {
        await page.bringToFront();
        const result = await page.evaluate(async () => {
          const requests = [];
          let conversations = 0;
          const app = {
            currentUser: { id: 'bob' },
            jwtToken: 'token',
            currentSection: 'messages',
            showSpeechBubble() {},
            loadConversations: async () => {
              conversations++;
            },
          };
          const controller = new MessagingController(app);
          controller.active = { type: 'dm', id: 'alice' };
          controller.messages.set('visible', {
            id: 'visible',
            createdAt: new Date().toISOString(),
          });
          controller.request = async (query, variables) => {
            requests.push(variables);
            return {};
          };
          await controller.markRead();
          await controller.markRead();
          return { requests, conversations, focused: document.hasFocus() };
        });
        assert.equal(result.focused, true);
        assert.deepEqual(result.requests, [
          { through: 'visible', channel: null, other: 'alice' },
        ]);
        assert.equal(result.conversations, 1);
      }
    );
    await t.test(
      'live client parses split frames and authenticates without URL tokens',
      async () => {
        const result = await page.evaluate(async () => {
          let writer,
            request,
            syncs = 0;
          const body = new ReadableStream({
            start(controller) {
              writer = controller;
            },
          });
          window.fetch = async (url, options) => {
            request = { url, authorization: options.headers.Authorization };
            return { ok: true, status: 200, body };
          };
          const app = {
            jwtToken: 'private-token',
            currentUser: { id: 'alice' },
            showSpeechBubble() {},
          };
          const controller = new MessagingController(app);
          controller.scheduleSync = () => {
            syncs++;
          };
          controller.start();
          const encoder = new TextEncoder();
          writer.enqueue(encoder.encode('event: rea'));
          writer.enqueue(
            encoder.encode(
              'dy\ndata: {}\n\nevent: message\ndata: {"kind":"created"}\n\n'
            )
          );
          await new Promise((resolve) => setTimeout(resolve, 0));
          controller.stop();
          writer.close();
          return { request, syncs };
        });
        assert.equal(result.syncs, 2);
        assert.equal(result.request.authorization, 'Bearer private-token');
        assert.equal(result.request.url.includes('private-token'), false);
      }
    );

    await t.test(
      'expired live sessions clear private state instead of reconnecting forever',
      async () => {
        const result = await page.evaluate(async () => {
          window.fetch = async () => ({ ok: false, status: 401 });
          let cleared = 0;
          const app = {
            jwtToken: 'expired',
            currentUser: { id: 'alice' },
            showSpeechBubble() {},
            clearAuthSession() {
              cleared++;
              controller.stop();
              this.jwtToken = null;
              this.currentUser = null;
            },
          };
          const controller = new MessagingController(app);
          controller.start();
          await new Promise((resolve) => setTimeout(resolve, 0));
          return {
            cleared,
            retry: controller.retry,
            active: controller.active,
          };
        });
        assert.deepEqual(result, { cleared: 1, retry: null, active: null });
      }
    );
  } finally {
    await browser.close();
  }
});

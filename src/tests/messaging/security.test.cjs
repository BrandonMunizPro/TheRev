require('ts-node/register/transpile-only');
const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
  messagingActor,
  MessagingAccess,
} = require('../../services/MessagingAccess');
const { MessagesModel } = require('../../models/messages.model');
const { MessageResolver } = require('../../resolvers/Message');
const { ServerResolver } = require('../../resolvers/Server');
const { MessageEventsService } = require('../../services/MessageEventsService');
const {
  encodeMessageCursor,
  decodeMessageCursor,
} = require('../../utils/messageCursor');
const ctx = { user: { userId: 'alice' } };

test('session identity rejects anonymous and impersonated actors', () => {
  assert.throws(() => messagingActor({}), /Authentication required/);
  assert.throws(() => messagingActor(ctx, 'bob'), /mismatch/);
  assert.equal(messagingActor(ctx, 'alice'), 'alice');
  assert.equal(messagingActor(ctx), 'alice');
});

test('every legacy message identity argument rejects impersonation before data access', async () => {
  const resolver = new MessageResolver();
  for (const operation of [
    () => resolver.getDirectMessages(ctx, 'bob', 'alice'),
    () => resolver.getConversations(ctx, 'bob'),
    () =>
      resolver.sendMessage(ctx, 'bob', {
        content: 'spoof',
        recipientId: 'alice',
      }),
    () => resolver.addReaction(ctx, 'bob', { messageId: 'm', emoji: 'x' }),
    () => resolver.removeReaction(ctx, 'bob', { messageId: 'm', emoji: 'x' }),
    () => resolver.markMessageAsRead(ctx, 'm', 'bob'),
    () => resolver.deleteMessage(ctx, 'm', 'bob'),
  ])
    await assert.rejects(operation, /mismatch/);
  await assert.rejects(
    () => resolver.getChannelMessages({}, 'channel'),
    /Authentication required/
  );
  await assert.rejects(
    () => resolver.editMessage({}, 'm', 'content'),
    /Authentication required/
  );
});

test('server and channel identity arguments reject impersonation', async () => {
  const resolver = new ServerResolver();
  for (const operation of [
    () => resolver.getServer(ctx, 'server', 'bob'),
    () => resolver.getUserServers(ctx, 'bob'),
    () => resolver.createServer(ctx, { name: 'spoof' }, 'bob'),
    () => resolver.createChannel(ctx, { serverId: 'server' }, 'bob'),
    () => resolver.deleteChannel(ctx, 'channel', 'bob'),
    () => resolver.joinServer(ctx, { serverId: 'server', userId: 'bob' }),
    () => resolver.leaveServer(ctx, 'server', 'bob'),
    () => resolver.deleteServer(ctx, 'server', 'bob'),
  ])
    await assert.rejects(operation, /mismatch/);
  await assert.rejects(
    () => resolver.getServers({}),
    /Authentication required/
  );
});

test('sending rejects ambiguous destinations and mismatched server/channel IDs', async () => {
  const model = new MessagesModel();
  for (const destination of [
    {},
    { serverId: 's' },
    { channelId: 'c', recipientId: 'bob' },
    { recipientId: 'bob', serverId: 's' },
  ]) {
    await assert.rejects(
      () => model.sendMessage('alice', 'hello', destination),
      /Choose exactly one/
    );
  }
  model.access.channel = async () => ({ serverId: 'real' });
  await assert.rejects(
    () =>
      model.sendMessage('alice', 'hello', { channelId: 'c', serverId: 'fake' }),
    /does not belong/
  );
  await assert.rejects(
    () => model.sendMessage('alice', ' '.repeat(5), { recipientId: 'bob' }),
    /characters/
  );
});

test('DM message access is restricted to participants; malformed server-only messages fail closed', async () => {
  const access = new MessagingAccess();
  const message = { senderId: 'alice', recipientId: 'bob' };
  await access.message('alice', message);
  await access.message('bob', message);
  await assert.rejects(() => access.message('eve', message), /participant/);
  await assert.rejects(
    () => access.message('alice', { ...message, serverId: 'server' }),
    /participant/
  );
});

test('history cursors preserve microseconds and reject invalid input', () => {
  const value = {
    createdAt: '2026-10-11T12:00:00.123456',
    id: '12345678-1234-1234-1234-123456789abc',
  };
  assert.deepEqual(
    decodeMessageCursor(encodeMessageCursor(value.createdAt, value.id)),
    value
  );
  for (const value of [
    'not-a-cursor',
    'x'.repeat(600),
    Buffer.from('{"v":1,"createdAt":"bad","id":"bad"}').toString('base64url'),
  ])
    assert.throws(() => decodeMessageCursor(value), /Invalid message/);
});

test('live events exclude unrelated DMs and recheck membership after revocation', async () => {
  const service = new MessageEventsService();
  assert.equal(
    await service.canReceive('eve', {
      kind: 'created',
      userIds: ['alice', 'bob'],
    }),
    false
  );
  assert.equal(
    await service.canReceive('bob', {
      kind: 'created',
      userIds: ['alice', 'bob'],
    }),
    true
  );
  service.access.channel = async () => ({ serverId: 'server' });
  assert.equal(
    await service.canReceive('alice', {
      kind: 'created',
      channelId: 'c',
      serverId: 'server',
    }),
    true
  );
  service.access.channel = async () => {
    throw new Error('revoked');
  };
  assert.equal(
    await service.canReceive('alice', {
      kind: 'created',
      channelId: 'c',
      serverId: 'server',
    }),
    false
  );
});
